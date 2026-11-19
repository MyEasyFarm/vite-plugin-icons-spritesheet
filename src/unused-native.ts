import { existsSync } from "node:fs";
import path from "node:path";
import {
  isBinaryExpression,
  isCaseBlock,
  isCaseClause,
  isNoSubstitutionTemplateLiteral,
  isStringLiteral,
  isSwitchStatement,
  isTemplateExpression,
  isTypeAliasDeclaration,
  type Node,
  type NoSubstitutionTemplateLiteral,
  type SourceFile,
  type StringLiteral,
  SyntaxKind,
  type TemplateExpression,
} from "typescript/ast";
import { API, type Checker, type Type } from "typescript/sync";
import type { UnusedIconsOptions } from "./unused.ts";

/**
 * TypeScript 7.1+ API: a synchronous IPC client to the native compiler, so
 * every checker call is a round trip and the server must be closed afterwards.
 */
export function findUnusedIconsNative(options: UnusedIconsOptions): string[] {
  const configPath = findConfigFile(options.cwd);
  if (!configPath) {
    console.warn("⚠️  No tsconfig.json found — skipping unused icon detection");
    return [];
  }

  const api = new API({ cwd: options.cwd });
  try {
    const configFile = api.readConfigFile(configPath);
    if (configFile.error) {
      console.warn("⚠️  Could not parse tsconfig.json — skipping unused icon detection");
      return [];
    }
    const parsed = api.parseJsonConfigFileContent(configFile.config, { configFileName: configPath });

    const fileNames: string[] = [...parsed.fileNames];
    const typesFilePath = path.resolve(options.typesFile);
    if (!fileNames.includes(typesFilePath)) {
      fileNames.push(typesFilePath);
    }

    const snapshot = api.createSnapshot({
      createPrograms: [{ rootFiles: fileNames, compilerOptions: parsed.options }],
    });
    const program = snapshot.operation.createdPrograms[0];
    const checker = snapshot.getProject(program.id)?.checker;
    const typesSourceFile = program.getSourceFile(typesFilePath);
    if (!checker || !typesSourceFile) {
      console.warn("⚠️  Could not load types file in TS program — skipping unused icon detection");
      return [];
    }

    let iconNameType: Type | undefined;
    typesSourceFile.forEachChild((node) => {
      if (isTypeAliasDeclaration(node) && node.name.text === "IconName") {
        iconNameType = checker.getTypeAtLocation(node);
      }
    });

    if (!iconNameType) {
      console.warn("⚠️  Could not resolve IconName type — skipping unused icon detection");
      return [];
    }

    const iconNameSet = new Set(options.allIconNames);
    const usedIcons = new Set<string>();

    for (const fileName of program.getSourceFileNames()) {
      if (fileName.includes("/node_modules/") || fileName === typesFilePath) continue;
      const sourceFile = program.getSourceFile(fileName);
      if (!sourceFile || sourceFile.isDeclarationFile) continue;
      collectUsedIcons(sourceFile, checker, iconNameSet, usedIcons);
    }

    return options.allIconNames.filter((n) => !usedIcons.has(n));
  } finally {
    api.close();
  }
}

/** Same lookup as `ts.findConfigFile`, which TypeScript 7 no longer exposes. */
function findConfigFile(dir: string): string | undefined {
  for (let current = path.resolve(dir); ; current = path.dirname(current)) {
    const candidate = path.join(current, "tsconfig.json");
    if (existsSync(candidate)) return candidate;
    if (path.dirname(current) === current) return undefined;
  }
}

/**
 * Walks the source file's AST and records every IconName-typed string usage
 * into `usedIcons` (mutated in place).
 */
function collectUsedIcons(
  sourceFile: SourceFile,
  checker: Checker,
  iconNameSet: Set<string>,
  usedIcons: Set<string>,
): void {
  const visit = (node: Node): void => {
    if (isStringLiteral(node) && iconNameSet.has(node.text)) {
      const contextMatched = recordIfContextualMatch(node, checker, iconNameSet, usedIcons);
      if (!contextMatched) {
        const nodeType = checker.getTypeAtLocation(node);
        if (nodeType.isStringLiteralType() && iconNameSet.has(nodeType.value) && node.parent) {
          recordIfBinaryComparison(node, node.parent, checker, iconNameSet, usedIcons);
          recordIfCaseClause(node, node.parent, checker, iconNameSet, usedIcons);
        }
      }
    }
    if (isTemplateExpression(node) || isNoSubstitutionTemplateLiteral(node)) {
      recordTemplateMatches(node, checker, iconNameSet, usedIcons);
    }
    node.forEachChild(visit);
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
  node: StringLiteral,
  checker: Checker,
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
  node: StringLiteral,
  parent: Node,
  checker: Checker,
  iconNameSet: Set<string>,
  usedIcons: Set<string>,
): void {
  if (!isBinaryExpression(parent)) return;
  const kind = parent.operatorToken.kind;
  const isComparison =
    kind === SyntaxKind.EqualsEqualsEqualsToken ||
    kind === SyntaxKind.ExclamationEqualsEqualsToken ||
    kind === SyntaxKind.EqualsEqualsToken ||
    kind === SyntaxKind.ExclamationEqualsToken;
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
  node: StringLiteral,
  parent: Node,
  checker: Checker,
  iconNameSet: Set<string>,
  usedIcons: Set<string>,
): void {
  if (!isCaseClause(parent) || !isCaseBlock(parent.parent)) return;
  const switchStmt = parent.parent.parent;
  if (!isSwitchStatement(switchStmt)) return;
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
  node: TemplateExpression | NoSubstitutionTemplateLiteral,
  checker: Checker,
  iconNameSet: Set<string>,
  usedIcons: Set<string>,
): void {
  for (const name of extractIconNames(checker.getTypeAtLocation(node), iconNameSet)) {
    usedIcons.add(name);
  }
}

function extractIconNames(type: Type, iconNameSet: Set<string>): string[] {
  const members = type.isUnionType() ? (type.getTypes() ?? []) : [type];
  const found: string[] = [];
  for (const t of members) {
    if (t.isStringLiteralType() && iconNameSet.has(t.value)) {
      found.push(t.value);
    }
  }
  return found;
}

function isIconNameRelated(type: Type, iconNameSet: Set<string>): boolean {
  return extractIconNames(type, iconNameSet).length > 0;
}
