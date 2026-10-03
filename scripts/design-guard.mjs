// `pnpm design-guard [root]`: prints `file:line: message` wherever feature code
// in packages/web/src bypasses a shared ui module; the message names it.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript-6";

const STATUS =
  'role="status" outside ui: report through the table screen\'s region (useWriteAction, useScreenReport), useScreenStatus (ui/screen-status) in Settings, or StatusLine (ui/status-line)';
const REGION =
  "generic status region outside ui: report through the table screen's region (useWriteAction, useScreenReport), or useScreenStatus (ui/screen-status) in Settings";
const TOAST =
  'toast called directly: declare show: "toast" on useWriteAction (ui/use-write-action)';
const CHECKBOX =
  "raw checkbox outside ui: list checkable rows with GroupedList (ui/grouped-list)";
const COLOUR =
  "colour class outside ui: pass a status family to STATUS_TOKENS (ui/status-family); a focus ring is FOCUS_RING (ui/focus-ring)";
const ICON =
  "icon styled by hand: use Icon (ui/icon) for the standard size and stroke";

const GENERIC_REGION = /(?:^|\/)ui\/(?:use-)?status-region$/;
const COLOUR_CLASS = /(?:^|\s|:)[a-z]+(?:-[a-z]+)*-(?:red|amber|green|blue)-\d/;
const SIZE_CLASS = /(?:^|\s|:)(?:size|w|h)-\d/;
const NOT_FEATURE =
  /\.(?:test|stories)\.tsx?$|test-helpers|test-utils|-fixture\.|(?:^|\/)node_modules\//;

function attribute(element, name) {
  return element.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.text === name,
  );
}

function literalValue(attr) {
  const init = attr?.initializer;
  if (init === undefined) return null;
  if (ts.isStringLiteral(init)) return init.text;
  if (
    ts.isJsxExpression(init) &&
    init.expression !== undefined &&
    ts.isStringLiteralLike(init.expression)
  ) {
    return init.expression.text;
  }
  return null;
}

function stringsIn(node) {
  const found = [];
  const visit = (child) => {
    if (ts.isStringLiteralLike(child)) found.push(child.text);
    child.forEachChild(visit);
  };
  visit(node);
  return found;
}

function* offencesIn(path, text) {
  const source = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lineOf = (node) =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const icons = new Set(["Icon"]);
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const from = statement.moduleSpecifier.text;
    const named = statement.importClause?.namedBindings;
    const names =
      named !== undefined && ts.isNamedImports(named)
        ? named.elements.map((element) => element.name.text)
        : [];
    if (from === "lucide-react") for (const name of names) icons.add(name);
    if (GENERIC_REGION.test(from)) {
      yield { line: lineOf(statement), message: REGION };
    }
    if (
      from === "sonner" ||
      (from.endsWith("toast") && names.includes("showSuccess"))
    ) {
      yield { line: lineOf(statement), message: TOAST };
    }
  }

  const stack = [source];
  while (stack.length > 0) {
    const node = stack.pop();
    stack.push(...node.getChildren(source));
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      if (literalValue(attribute(node, "role")) === "status") {
        yield { line: lineOf(node), message: STATUS };
      }
      if (
        tag === "input" &&
        literalValue(attribute(node, "type")) === "checkbox"
      ) {
        yield { line: lineOf(node), message: CHECKBOX };
      }
      const className = attribute(node, "className");
      if (
        icons.has(tag) &&
        (attribute(node, "size") !== undefined ||
          (className !== undefined &&
            stringsIn(className).some((s) => SIZE_CLASS.test(s))))
      ) {
        yield { line: lineOf(node), message: ICON };
      }
    } else if (
      (ts.isJsxAttribute(node) || ts.isPropertyAssignment(node)) &&
      node.name.getText(source) === "strokeWidth"
    ) {
      yield { line: lineOf(node), message: ICON };
    } else if (ts.isStringLiteralLike(node) && COLOUR_CLASS.test(node.text)) {
      yield { line: lineOf(node), message: COLOUR };
    }
  }
}

function findOffenders(root) {
  const web = join(root, "packages", "web", "src");
  let paths;
  try {
    paths = readdirSync(web, { recursive: true });
  } catch {
    return [];
  }
  const offenders = [];
  for (const entry of paths) {
    const inWeb = entry.split(sep).join("/");
    if (
      !/\.tsx?$/.test(inWeb) ||
      inWeb.startsWith("ui/") ||
      NOT_FEATURE.test(inWeb)
    ) {
      continue;
    }
    const path = join(web, entry);
    const file = relative(root, path).split(sep).join("/");
    for (const { line, message } of offencesIn(
      path,
      readFileSync(path, "utf8"),
    )) {
      offenders.push({ file, line, message });
    }
  }
  return [
    ...new Set(
      offenders
        .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
        .map(({ file, line, message }) => `${file}:${line}: ${message}`),
    ),
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(
    process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."),
  );
  const offenders = findOffenders(root);
  for (const offender of offenders) console.log(offender);
  if (offenders.length > 0) {
    console.error(
      `design-guard: ${offenders.length} bypasses of a shared ui module`,
    );
    process.exitCode = 1;
  }
}
