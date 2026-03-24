import path from "node:path";

export async function findUnusedIcons(options: {
  typesFile: string;
  allIconNames: string[];
  cwd: string;
}): Promise<string[]> {
  let ts: typeof import("typescript");
  try {
    ts = await import("typescript");
  } catch {
    console.warn("⚠️  `icons-unused` requires `typescript` to be installed — skipping detection");
    return [];
  }

  const configPath = ts.findConfigFile(options.cwd, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) {
    console.warn("⚠️  No tsconfig.json found — skipping unused icon detection");
    return [];
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    console.warn("⚠️  Could not parse tsconfig.json — skipping unused icon detection");
    return [];
  }
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));

  const fileNames = [...parsed.fileNames];
  const typesFilePath = path.resolve(options.typesFile);
  if (!fileNames.includes(typesFilePath)) {
    fileNames.push(typesFilePath);
  }

  const program = ts.createProgram(fileNames, parsed.options);
  const checker = program.getTypeChecker();

  // Resolve the IconName type from the types file
  const typesSourceFile = program.getSourceFile(typesFilePath);
  if (!typesSourceFile) {
    console.warn("⚠️  Could not load types file in TS program — skipping unused icon detection");
    return [];
  }

  let iconNameType: import("typescript").Type | undefined;
  ts.forEachChild(typesSourceFile, (node) => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === "IconName") {
      iconNameType = checker.getTypeAtLocation(node);
    }
  });

  if (!iconNameType) {
    console.warn("⚠️  Could not resolve IconName type — skipping unused icon detection");
    return [];
  }

  const iconNameSet = new Set(options.allIconNames);
  const usedIcons = new Set<string>();

  for (const sourceFile of program.getSourceFiles()) {
    if (
      sourceFile.isDeclarationFile ||
      sourceFile.fileName.includes("/node_modules/") ||
      sourceFile === typesSourceFile
    ) {
      continue;
    }

    // Walk all string literals and check contextual type, with fallback to widened type
    const walk = (node: import("typescript").Node) => {
      if (ts.isStringLiteral(node) && iconNameSet.has(node.text)) {
        // Primary: contextual type (typed assignments, function args, JSX props)
        const contextualType = checker.getContextualType(node);
        if (contextualType && isIconNameRelated(contextualType, iconNameSet)) {
          usedIcons.add(node.text);
        } else {
          // Fallback: check the actual type of the literal node itself.
          // When a string literal appears in a context where TS narrows it to
          // a member of the IconName union (comparisons, switch/case, generics),
          // getTypeAtLocation returns the narrow literal type whose parent union
          // we can trace back to IconName.
          const nodeType = checker.getTypeAtLocation(node);
          if (nodeType.isStringLiteral() && iconNameSet.has(nodeType.value)) {
            // Verify the parent expression expects an IconName-related type
            const parent = node.parent;
            if (parent) {
              // For comparison expressions like `icon === "Circle"`, check the other operand
              if (
                ts.isBinaryExpression(parent) &&
                (parent.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
                  parent.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
                  parent.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken ||
                  parent.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken)
              ) {
                const other = parent.left === node ? parent.right : parent.left;
                const otherType = checker.getTypeAtLocation(other);
                if (isIconNameRelated(otherType, iconNameSet)) {
                  usedIcons.add(node.text);
                }
              }
              // For case clauses: switch(x) { case "Circle": } — check the switch expression
              if (ts.isCaseClause(parent) && ts.isCaseBlock(parent.parent)) {
                const switchStmt = parent.parent.parent;
                if (ts.isSwitchStatement(switchStmt)) {
                  const switchType = checker.getTypeAtLocation(switchStmt.expression);
                  if (isIconNameRelated(switchType, iconNameSet)) {
                    usedIcons.add(node.text);
                  }
                }
              }
            }
          }
        }
      }
      // Check template expressions: `Flag${capitalize(locale)}` resolves to "FlagEn" | "FlagFr" | ...
      // Use getTypeAtLocation (computed type) not getContextualType (expected type),
      // because contextual type returns the full IconName union, marking everything used.
      if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const type = checker.getTypeAtLocation(node);
        if (type) {
          for (const name of extractIconNames(type, iconNameSet)) {
            usedIcons.add(name);
          }
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(sourceFile);
  }

  return options.allIconNames.filter((n) => !usedIcons.has(n));
}

function extractIconNames(type: import("typescript").Type, iconNameSet: Set<string>): string[] {
  const found: string[] = [];
  if (type.isUnion()) {
    for (const t of type.types) {
      if (t.isStringLiteral() && iconNameSet.has(t.value)) {
        found.push(t.value);
      }
    }
  } else if (type.isStringLiteral() && iconNameSet.has(type.value)) {
    found.push(type.value);
  }
  return found;
}

function isIconNameRelated(type: import("typescript").Type, iconNameSet: Set<string>): boolean {
  // Check if it's a union type containing icon name literals
  if (type.isUnion()) {
    return type.types.some((t) => {
      if (t.isStringLiteral()) {
        return iconNameSet.has(t.value);
      }
      return false;
    });
  }
  // Check if it's a single string literal type matching an icon name
  if (type.isStringLiteral()) {
    return iconNameSet.has(type.value);
  }
  return false;
}
