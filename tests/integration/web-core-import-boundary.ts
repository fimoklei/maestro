// Finds the runtime edges to `@maestro/core` in one web source file — the edges
// ADR-0012 forbids web from having. A type-only `import type` or `export type
// ... from` is erased at build and allowed; anything else (named, default, bare
// side-effect, or a forwarding `export ... from`) pulls core's runtime into the
// browser bundle and is a violation.
//
// Parsed with the TypeScript compiler, not a regex, so comments, strings, and
// type-position `typeof import("...")` never register as runtime edges, while a
// forwarding re-export, a runtime `import("...")` call, and a CommonJS
// `require("...")` are caught the same as a static import. A relative specifier
// that climbs into packages/core (e.g. `../../core/src/index`) is the same edge
// wearing a different path, so it is rejected too when the file path is known.
// The convention enforced is architecture.md's literal one: "Write `import
// type`" — an inline `import { type X }` is not statement-level type-only and
// does not count.
//
// Scope: the guard catches the conventional module-loading forms an author
// reaches for by accident. Deliberate runtime evasion (eval, a computed
// specifier, globalThis tricks) is out of scope — no static check can close that
// and this guard does not pretend to.
// The parser is pinned to TypeScript 6 on purpose, independent of the compiler
// the repo builds with: 7.0 dropped the in-process JS parser, exposing the AST
// only through a spawned Go server (`typescript/unstable/*`, itself unstable).
import { dirname, resolve } from "node:path";
import ts from "typescript-6";

// core by package name, or any subpath. Anchored so `@maestro/core-ish` never
// matches.
const CORE_SPECIFIER = /^@maestro\/core(\/.*)?$/;

// A resolved absolute path sitting inside packages/core, either separator.
const CORE_PACKAGE_PATH = /[\\/]packages[\\/]core([\\/]|$)/;

// True when a module specifier reaches core — by package name, or by a relative
// path that resolves into packages/core (only checkable when the importing
// file's path is known).
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

// A runtime `import("...")` call — as opposed to `typeof import("...")`, which is
// an ImportTypeNode (a type), never a CallExpression, so it never reaches here.
const isDynamicImportCall = (node: ts.Node): node is ts.CallExpression =>
  ts.isCallExpression(node) &&
  node.expression.kind === ts.SyntaxKind.ImportKeyword;

// A CommonJS `require("...")` call — banned in web by code-standards, but it can
// still type-check via Node's types, so the guard rejects it explicitly.
const isRequireCall = (node: ts.Node): node is ts.CallExpression =>
  ts.isCallExpression(node) &&
  ts.isIdentifier(node.expression) &&
  node.expression.text === "require";

export function valueImportsFromCore(
  source: string,
  filePath?: string,
): string[] {
  // Parse in the file's own dialect: `<T>(x) => x` is a generic arrow in .ts but
  // a JSX error in .tsx, and a parse error can swallow later imports. Default to
  // .ts when the path is unknown (the unit fixtures carry no JSX).
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
