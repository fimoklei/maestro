// Finds runtime edges to `@maestro/core` in one web source file: only a
// statement-level `import type` or `export type ... from` is allowed.
import { dirname, resolve } from "node:path";
import ts from "typescript-6";

// Anchored so `@maestro/core-ish` never matches.
const CORE_SPECIFIER = /^@maestro\/core(\/.*)?$/;

const CORE_PACKAGE_PATH = /[\\/]packages[\\/]core([\\/]|$)/;

const reachesCore = (
  specifier: string,
  filePath: string | undefined,
): boolean =>
  CORE_SPECIFIER.test(specifier) ||
  (filePath !== undefined &&
    specifier.startsWith(".") &&
    CORE_PACKAGE_PATH.test(resolve(dirname(filePath), specifier)));

const specifierText = (expr: ts.Expression | undefined): string | undefined =>
  expr !== undefined &&
  (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr))
    ? expr.text
    : undefined;

// `typeof import("...")` is an ImportTypeNode, so it never reaches here.
const isDynamicImportCall = (node: ts.Node): node is ts.CallExpression =>
  ts.isCallExpression(node) &&
  node.expression.kind === ts.SyntaxKind.ImportKeyword;

const isRequireCall = (node: ts.Node): node is ts.CallExpression =>
  ts.isCallExpression(node) &&
  ts.isIdentifier(node.expression) &&
  node.expression.text === "require";

export function valueImportsFromCore(
  source: string,
  filePath?: string,
): string[] {
  // Parse in the file's own dialect: `<T>(x) => x` is a JSX error in .tsx,
  // and a parse error can swallow later imports.
  const isTsx = filePath?.endsWith(".tsx") ?? false;
  const tree = ts.createSourceFile(
    isTsx ? "web-source.tsx" : "web-source.ts",
    source,
    ts.ScriptTarget.ESNext,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const violations: string[] = [];
  const flagIfCore = (specifier: string | undefined, node: ts.Node): void => {
    if (specifier !== undefined && reachesCore(specifier, filePath)) {
      violations.push(node.getText(tree).trim());
    }
  };
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      node.importClause?.isTypeOnly !== true
    ) {
      flagIfCore(specifierText(node.moduleSpecifier), node);
    } else if (ts.isExportDeclaration(node) && !node.isTypeOnly) {
      flagIfCore(specifierText(node.moduleSpecifier), node);
    } else if (isDynamicImportCall(node) || isRequireCall(node)) {
      flagIfCore(specifierText(node.arguments[0]), node);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return violations;
}
