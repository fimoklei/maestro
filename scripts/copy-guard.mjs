// `pnpm copy-guard [root]`: prints `file:line: word` for every retired screen
// word in a string or JSX text the cockpit ships.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript-6";

const RETIRED = [
  /\bInventory source\b/i,
  /\brefresh(?:es|ed|ing)?\b/i,
  /\bRetry check\b/i,
  /\bPlan release\b/i,
  /\bfetch(?:es|ed|ing)?\b/i,
  /\bOlder tag\b/i,
  /\bDeprecated\b/i,
  /\bdrift\b/i,
  /\bUndo deletion\b/i,
  /\bnot loaded\b/i,
  /\bsymlink(?:s|ed)?\b/i,
  /\bpicker\b/i,
  /\bReinstall fresh\b/i,
  /\bRe-?deploy\b/i,
  /\bUp-to-date\b/i,
  /\bcolou?r scheme\b/i,
  /\bStaged for bulk deploy\b/i,
  /\bconsuming repo/i,
  /\bprimitives?\b/i,
  /\bRelease head\b/i,
  /\bMixed releases\b/i,
  /\breload the view\b/i,
  /\bslugs?\b/i,
  /\bImport local edits…/i,
  /\bImport skill…/i,
  /\bSelected skills\b/i,
  // A status states where a change stands; the Change column names it (#1399).
  /\bDeleted locally\b/i,
  /\bDeletion (?:in draft|waiting for review|changes requested|approved|merged)\b/i,
  // One word per concept (#1461): a folder is chosen, a Harness with no
  // release is not released yet, a remove waits on checking for local edits.
  /\bpick (?:the|a|it|one)\b/i,
  /\bNone yet\b/i,
  /\bNothing released yet\b/i,
  /\bchecks still running\b/i,
  /\brepositories registered yet\b/i,
  // A control is selected: never clicked or tapped, never `Press Close`.
  /\b(?:click|tap)(?:s|ped|ping|ed|ing)?\b/i,
  /\b(?:[Pp]ress|[Hh]it) [A-Z]\w*/,
  // A failed read is `{the thing} not read`; a deploy never installs; a running
  // operation reads Target busy or Harness busy (#1459).
  /\bCould not read\b/,
  /\bNothing was installed\b/i,
  /\bTarget held by another operation\b/i,
  /\bAnother change is running\b/i,
  /\bHarness already changing\b/i,
  // Copy is level: no promotional words, no chat phrases, no exclamation.
  /\b(?:seamless|effortless|supercharge|powerful|magic|unlock|leverage|AI-powered|intelligent|smartly|empower|robust|Oops|Whoops|Let's)/i,
  /!(?=\s|$)/,
];
const SCANNED = [
  join("packages", "web", "src"),
  join("packages", "server", "src"),
];
const NOT_SHIPPED =
  /\.(?:test|stories)\.tsx?$|test-helpers|test-utils|-fixture\./;
const SKIPPED_DIRS = new Set(["node_modules", "dist", "coverage"]);

function* filesUnder(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)) {
      yield* filesUnder(path);
    } else if (entry.isFile()) {
      yield path;
    }
  }
}

const PASSED_ON = new Set([
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
]);

const DISPLAY_KEYS = new Set([
  "label",
  "title",
  "message",
  "detail",
  "hint",
  "text",
  "heading",
  "body",
  "description",
  "placeholder",
]);

// A hyphen, underscore, slash, dot or colon marks a code, route or key.
const CODE_SHAPE = /[-_/.:]/;

// Returned or held in a const, a plain word is a value that may be shown.
function heldAsValue(parent, child, node) {
  if (CODE_SHAPE.test(node.text)) return false;
  return (
    ts.isReturnStatement(parent) ||
    (ts.isArrowFunction(parent) && parent.body === child) ||
    (ts.isVariableDeclaration(parent) && parent.initializer === child)
  );
}

const shownAsProperty = (parent, child) =>
  ts.isPropertyAssignment(parent) &&
  parent.initializer === child &&
  ts.isIdentifier(parent.name) &&
  DISPLAY_KEYS.has(parent.name.text);

// A one-word literal is shown when its value lands in a template, a JSX
// expression or a display property, or is returned or held as a plain word;
// compared, keyed or passed on, it stays a code.
function reachesSentence(node) {
  let child = node;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      ts.isTemplateSpan(parent) ||
      ts.isJsxExpression(parent) ||
      shownAsProperty(parent, child) ||
      heldAsValue(parent, child, node)
    ) {
      return true;
    }
    const passesValueOn =
      ts.isParenthesizedExpression(parent) ||
      (ts.isConditionalExpression(parent) && parent.condition !== child) ||
      (ts.isBinaryExpression(parent) &&
        PASSED_ON.has(parent.operatorToken.kind));
    if (!passesValueOn) return false;
    child = parent;
  }
  return false;
}

/** Each piece of text a reader could see, with its 1-based line. */
function* textsOf(path, text) {
  const source = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lineOf = (node) =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const stack = [source];
  while (stack.length > 0) {
    const node = stack.pop();
    if (ts.isJsxText(node)) {
      yield { line: lineOf(node), text: node.text };
    } else if (
      (ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)) &&
      // A code, route or key has no space and starts lowercase.
      (/\s|^[A-Z]/.test(node.text) || reachesSentence(node))
    ) {
      yield { line: lineOf(node), text: node.text };
    }
    stack.push(...node.getChildren(source));
  }
}

function findOffenders(root) {
  const offenders = [];
  for (const dir of SCANNED) {
    for (const path of filesUnder(join(root, dir))) {
      if (!/\.tsx?$/.test(path) || NOT_SHIPPED.test(path)) continue;
      const file = relative(root, path).split(sep).join("/");
      for (const { line, text } of textsOf(path, readFileSync(path, "utf8"))) {
        for (const pattern of RETIRED) {
          const match = text.match(pattern);
          if (match) offenders.push({ file, line, word: match[0] });
        }
      }
    }
  }
  return offenders
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
    .map(({ file, line, word }) => `${file}:${line}: ${word}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(
    process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."),
  );
  const offenders = findOffenders(root);
  for (const offender of offenders) console.log(offender);
  if (offenders.length > 0) {
    console.error(`copy-guard: ${offenders.length} retired screen words`);
    process.exitCode = 1;
  }
}
