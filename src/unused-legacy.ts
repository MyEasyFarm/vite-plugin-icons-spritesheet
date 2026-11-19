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
    collectUsedIcons(sourceFile, checker, ts, iconNameSet, usedIcons);
  }

  return options.allIconNames.filter((n) => !usedIcons.has(n));
}

/**
 * Walks the source file's AST and records every IconName-typed string usage
 * into `usedIcons` (mutated in place).
 */
function collectUsedIcons(
  sourceFile: import("typescript").SourceFile,
  checker: import("typescript").TypeChecker,
  ts: typeof import("typescript"),
  iconNameSet: Set<string>,
  usedIcons: Set<string>,
): void {
  const visit = (node: import("typescript").Node): void => {
    if (ts.isStringLiteral(node) && iconNameSet.has(node.text)) {
      const contextMatched = recordIfContextualMatch(node, checker, iconNameSet, usedIcons);
      if (!contextMatched) {
        const nodeType = checker.getTypeAtLocation(node);
        if (nodeType.isStringLiteral() && iconNameSet.has(nodeType.value) && node.parent) {
          recordIfBinaryComparison(node, node.parent, checker, iconNameSet, usedIcons, ts);
          recordIfCaseClause(node, node.parent, checker, iconNameSet, usedIcons, ts);
        }
      }
    }
    if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      recordTemplateMatches(node, checker, iconNameSet, usedIcons);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

/**
 * Primary path: if the string literal's contextual type is IconName-related,
 * record it as used.
 * @modifies usedIcons on match
 * @returns true iff the icon was recorded via this path (caller skips fallback).
 */
function recordIfContextualMatch(
  node: import("typescript").StringLiteral,
  checker: import("typescript").TypeChecker,
  iconNameSet: Set<string>,
  usedIcons: Set<string>,
): boolean {
  const contextualType = checker.getContextualType(node);
  if (contextualType && isIconNameRelated(contextualType, iconNameSet)) {
    usedIcons.add(node.text);
    return true;
  }
  return false;
}

/**
 * Fallback path: handles `icon === "Circle"` style comparisons by checking the
 * other operand's type.
 * @modifies usedIcons on match
 */
function recordIfBinaryComparison(
  node: import("typescript").StringLiteral,
  parent: import("typescript").Node,
  checker: import("typescript").TypeChecker,
  iconNameSet: Set<string>,
  usedIcons: Set<string>,
  ts: typeof import("typescript"),
): void {
  if (!ts.isBinaryExpression(parent)) return;
  const kind = parent.operatorToken.kind;
  const isComparison =
    kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
    kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
    kind === ts.SyntaxKind.EqualsEqualsToken ||
    kind === ts.SyntaxKind.ExclamationEqualsToken;
  if (!isComparison) return;
  const other = parent.left === node ? parent.right : parent.left;
  const otherType = checker.getTypeAtLocation(other);
  if (isIconNameRelated(otherType, iconNameSet)) {
    usedIcons.add(node.text);
  }
}

/**
 * Fallback path: handles `switch (x) { case "Circle": }` by checking the
 * switch expression's type.
 * @modifies usedIcons on match
 */
function recordIfCaseClause(
  node: import("typescript").StringLiteral,
  parent: import("typescript").Node,
  checker: import("typescript").TypeChecker,
  iconNameSet: Set<string>,
  usedIcons: Set<string>,
  ts: typeof import("typescript"),
): void {
  if (!ts.isCaseClause(parent) || !ts.isCaseBlock(parent.parent)) return;
  const switchStmt = parent.parent.parent;
  if (!ts.isSwitchStatement(switchStmt)) return;
  const switchType = checker.getTypeAtLocation(switchStmt.expression);
  if (isIconNameRelated(switchType, iconNameSet)) {
    usedIcons.add(node.text);
  }
}

/**
 * Records every icon-name literal contained in a template expression's
 * computed type (e.g. `` `Flag${Locale}` `` → `"FlagEn" | "FlagFr"`).
 * Uses getTypeAtLocation (computed type) not getContextualType (expected type),
 * because contextual type returns the full IconName union, marking everything used.
 * @modifies usedIcons on match
 */
function recordTemplateMatches(
  node: import("typescript").TemplateExpression | import("typescript").NoSubstitutionTemplateLiteral,
  checker: import("typescript").TypeChecker,
  iconNameSet: Set<string>,
  usedIcons: Set<string>,
): void {
  const type = checker.getTypeAtLocation(node);
  if (!type) return;
  for (const name of extractIconNames(type, iconNameSet)) {
    usedIcons.add(name);
  }
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
