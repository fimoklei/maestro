import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import type { ComponentProps, ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { ImportLocalEditsDialog } from "./deploy-state/import-local-edits-dialog";
import { UpdateTargetDialog } from "./deploy-state/update-target-dialog";
import { DeletionDialog } from "./harness/deletion-dialog";
import { ReleaseDialog } from "./harness/release-dialog";

// A name inside a visible sentence is set apart from the words around it, so
// every template that interpolates a name is either a `phrase` or listed here
// with the reason it stays plain text.

const SRC = join(import.meta.dirname);

const PLAIN: Record<string, Record<string, string>> = {
  "deploy-state/import-local-edits-copy.ts": {
    "`Import local edits from ${target}`": "dialog title",
  },
  "deploy-state/notice-copy.ts": {
    "`${name} still incomplete`": "notice heading",
    "`${name} outcome unknown`": "notice heading",
  },
  "deploy-state/remove-ledger-rows.ts": {
    "`target:${name}`": "key",
  },
  "deploy-state/remove-skill-dialog.tsx": {
    "`Remove ${skillName}`": "dialog title",
  },
  "deploy-state/selected-skills.tsx": {
    "`Actions for ${primitive.name}`": "menu label",
  },
  "deploy-state/target-menu.ts": {
    "`${UPDATE_TARGET} ${row.updateName}`": "menu item",
    "`Update ${row.updateName}`": "control label",
  },
  "deploy-state/update-target-copy.ts": {
    "`Update ${target}`": "dialog title",
    "`${row.name} in ${toolDisplayName(row.tool)}`": "checkbox label",
  },
  "deploy-state/update-target-dialog.tsx": {
    '`${row.name}:${row.tool ?? ""}`': "key",
    "`${DISCARD_LOCAL_EDITS} for ${consentRowName(row)}`": "checkbox label",
    "`${OVERWRITE_UNVERIFIED} for ${consentRowName(row)}`": "checkbox label",
  },
  "deploy-state/use-deploy-state.ts": {
    "`/api/deploy-state?repo=${encodeURIComponent(repo)}`": "request URL",
  },
  "deploy-state/use-global-deploy-state.ts": {
    "`${primitive.name}@${primitive.version}`": "key",
  },
  "drift/use-drift.ts": {
    "`/api/drift?repo=${encodeURIComponent(repo)}`": "request URL",
  },
  "harness/deletion-dialog.tsx": {
    "`Delete ${skill}`": "dialog title",
    "`Uncommitted changes in ${skill}`": "notice heading",
    "`maestro/${skill}`": "branch, a machine value in a fact",
    "`Pull request #${request.number} will delete ${skill} instead`":
      "notice heading",
  },
  "harness/discard-dialog.tsx": {
    "`Discard change for ${skill}`": "dialog title",
  },
  "harness/harness-columns.tsx": {
    "`${row.stage}:${row.skill}`": "key",
    "`Actions for ${row.skill} in ${STAGE_NAMES[row.stage]}`": "menu label",
  },
  "harness/harness-dialogs.tsx": {
    "`${SKILLS_DIR}/${props.restoring.skill}`": "folder path",
    "`${SKILLS_DIR}/${props.discarding.name}`": "folder path",
    "`${SKILLS_DIR}/${skill}`": "folder path",
  },
  "harness/release-delta.tsx": {
    "`${row.original.previousName} → ${row.original.name}`": "table cell",
    "`${movement.kind}:${movement.name}`": "key",
  },
  "harness/release-dialog.tsx": {
    "`Publish release for ${origin}`": "dialog title",
  },
  "harness/restore-dialog.tsx": {
    "`Restore ${skill}`": "dialog title",
  },
  "harness/withdraw-dialog.tsx": {
    "`Withdraw proposal for ${skill}`": "dialog title",
    "`maestro/${skill}`": "branch, a machine value in a fact",
  },
  "inventory/bulk-deploy-report-view.ts": {
    '`Deployed ${deployed + skipped} of ${total} ${total === 1 ? "skill" : "skills"} to ${input.targetLabel}`':
      "report heading",
    "`Deploy ${name} again`": "button label",
  },
  "inventory/bulk-remove-dialog.tsx": {
    "`Remove ${skillName} from ${targetCount} targets`": "dialog title",
  },
  "inventory/inventory-copy.ts": {
    "`Select ${name} for bulk deploy`": "checkbox label",
    "`Deploy to ${target} did not run`": "notice heading",
    '`Global (${tools.map(toolDisplayName).join(" + ")})`': "target label",
    "`Actions for ${name}`": "menu label",
  },
  "registry/repositories-copy.ts": {
    "`${UNREGISTER} ${name}`": "dialog title",
  },
  "ui/busy-copy.ts": {
    "`Loading the ${screenName}…`": "screen name, not a thing named",
    "`${screenName} loaded.`": "screen name, not a thing named",
  },
  "ui/github-link-copy.ts": {
    "`View ${name} on GitHub`": "link label",
  },
  "ui/table-screen.tsx": {
    "`Re-read ${state.name}`": "button label",
    "`${state.name} table`": "accessible name",
  },
  "ui/use-table-screen.ts": {
    "`Re-read ${name}`": "button label",
  },
};

// The same rule for a version, tag, branch, path, ref, hash or command. The
// scan knows a value by its identifier's words only: a release held in a
// variable named `latest`, or a file name written into the words, escapes it.
const PLAIN_MACHINE: Record<string, Record<string, string>> = {
  "deploy-state/selected-skills.tsx": {
    "`${primitive.version} → ${latest}`": "sub-list value, set in mono",
  },
  "deploy-state/skipped-entry-text.ts": {
    "`${entry.reason}:${entry.virtualPath ?? index}`": "key",
  },
  "deploy-state/target-rows.ts": {
    "`repo:${repoPath}`": "key",
  },
  "deploy-state/use-global-deploy-state.ts": {
    "`${primitive.name}@${primitive.version}`": "key",
  },
  "ui/dialog.tsx": {
    "`${title} ${version}`": "accessible name",
  },
};

const NAME =
  /\b(\w*Name|name|names|skill|target|targetLabel|repo|bundle|origin|origins|author|scope)\b/;

type Template = { source: string; tagged: boolean; exprs: string[] };

// Every template literal in `text`, with its top-level `${…}` expressions.
function templates(text: string): Template[] {
  const found: Template[] = [];
  let open = text.indexOf("`");
  while (open !== -1) {
    const tagged = /(phrase|machine\()\s*$/.test(
      text.slice(Math.max(0, open - 9), open),
    );
    const exprs: string[] = [];
    let at = open + 1;
    for (; at < text.length && text[at] !== "`"; at++) {
      if (text[at] === "\\") at++;
      else if (text.startsWith("${", at)) {
        const end = closingBrace(text, at + 2);
        exprs.push(text.slice(at + 2, end));
        at = end;
      }
    }
    found.push({ source: text.slice(open, at + 1), tagged, exprs });
    open = text.indexOf("`", at + 1);
  }
  return found;
}

function closingBrace(text: string, from: number): number {
  let depth = 1;
  let at = from;
  for (; at < text.length; at++) {
    const char = text[at];
    if (char === "`") at = skipTemplate(text, at);
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) break;
  }
  return at;
}

function skipTemplate(text: string, open: number): number {
  let at = open + 1;
  for (; at < text.length && text[at] !== "`"; at++) {
    if (text[at] === "\\") at++;
    else if (text.startsWith("${", at)) at = closingBrace(text, at + 2);
  }
  return at;
}

const withoutLiterals = (expr: string) =>
  expr.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "");

const sources = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .filter(
    (file) =>
      /\.tsx?$/.test(file) &&
      !/\.(test|stories)\.tsx?$|fixture|test-helpers|test-utils/.test(file),
  )
  .sort();

const plainNames = sources.flatMap((file) =>
  templates(readFileSync(join(SRC, file), "utf8"))
    .filter(
      ({ tagged, exprs }) =>
        !tagged && exprs.some((expr) => NAME.test(withoutLiterals(expr))),
    )
    .map(({ source }) => ({ file, source: source.replace(/\n\s*/g, " ") })),
);

const MACHINE_WORDS = new Set(
  "release releases released tag version versions branch path ref hash commit command".split(
    " ",
  ),
);

// True when a word of an identifier, split at camelCase, names a machine value.
const machineShaped = (expr: string) =>
  (withoutLiterals(expr).match(/[A-Za-z]+/g) ?? [])
    .flatMap((word) => word.split(/(?=[A-Z])/))
    .some((word) => MACHINE_WORDS.has(word.toLowerCase()));

const plainMachineValues = sources.flatMap((file) =>
  templates(readFileSync(join(SRC, file), "utf8"))
    .filter(({ tagged, exprs }) => !tagged && exprs.some(machineShaped))
    .map(({ source }) => ({ file, source: source.replace(/\n\s*/g, " ") })),
);

// Each `{…}` JSX child that sits between words and holds a name or a machine
// value, outside `InlineName` and `InlineMachineValue`. A child alone on its
// line, as a heading, label or cell holds it, is not a sentence and stays.
function bareJsxValues(text: string): string[] {
  return [...text.matchAll(/\{([^{}\s][^{}]*)\}/g)]
    .filter((match) => {
      const [whole, expr = ""] = match;
      const start = match.index;
      const line = text.slice(text.lastIndexOf("\n", start) + 1, start);
      const after = text.slice(start + whole.length);
      const wordBefore = /[A-Za-z,.;:!?)] $/.test(line);
      const wordAfter =
        /^( [a-z]|[.,;:](\s|$))/.test(after) && /(^\s*|>)$/.test(line);
      return (
        !expr.startsWith("...") &&
        (wordBefore || wordAfter) &&
        (NAME.test(withoutLiterals(expr)) || machineShaped(expr))
      );
    })
    .map(([whole]) => whole);
}

describe("a machine value in a visible sentence", () => {
  it("is a phrase, or plain text for a listed reason", () => {
    const unlisted = plainMachineValues.filter(
      ({ file, source }) => PLAIN_MACHINE[file]?.[source] === undefined,
    );

    expect(unlisted).toEqual([]);
  });

  it("lists no plain text that is gone", () => {
    const listed = Object.entries(PLAIN_MACHINE).flatMap(([file, rows]) =>
      Object.keys(rows).map((source) => ({ file, source })),
    );
    const stale = listed.filter(
      (row) =>
        !plainMachineValues.some(
          ({ file, source }) => file === row.file && source === row.source,
        ),
    );

    expect(stale).toEqual([]);
  });
});

describe("a name in a visible sentence", () => {
  it("is a phrase, or plain text for a listed reason", () => {
    const unlisted = plainNames.filter(
      ({ file, source }) => PLAIN[file]?.[source] === undefined,
    );

    expect(unlisted).toEqual([]);
  });

  it("lists no plain text that is gone", () => {
    const listed = Object.entries(PLAIN).flatMap(([file, rows]) =>
      Object.keys(rows).map((source) => ({ file, source })),
    );
    const stale = listed.filter(
      (row) =>
        !plainNames.some(
          ({ file, source }) => file === row.file && source === row.source,
        ),
    );

    expect(stale).toEqual([]);
  });
});

describe("a name or machine value written straight into JSX text", () => {
  it("is found by the scan", () => {
    expect(
      bareJsxValues(
        "<p>\n  This removes the {skill} folder on {branch}.\n  {skill} exists.\n</p>",
      ),
    ).toEqual(["{skill}", "{branch}", "{skill}"]);
  });

  it("leaves set-apart values, attributes and spreads alone", () => {
    expect(
      bareJsxValues(
        '<p className="x">\n  Removes <InlineName>{skill}</InlineName> from <InlineMachineValue>{branch}</InlineMachineValue>.\n  <Row {...skill} />\n  <Fact label="Skill" value={skill} />\n</p>',
      ),
    ).toEqual([]);
  });

  it("is never bare in a visible sentence", () => {
    const bare = sources
      .filter((file) => file.endsWith(".tsx"))
      .flatMap((file) =>
        bareJsxValues(readFileSync(join(SRC, file), "utf8")).map(
          (expr) => `${file}: ${expr}`,
        ),
      );

    expect(bare).toEqual([]);
  });
});

const deletionDialog = (
  mode: ComponentProps<typeof DeletionDialog>["mode"],
) => (
  <DeletionDialog
    skill="research"
    mode={mode}
    onClose={vi.fn()}
    onConfirm={vi.fn()}
    deleting={false}
    deleteError={null}
  />
);

// Each dialog that names a thing in its body, rendered with sample names.
const SURFACES: {
  surface: string;
  names: string[];
  render: () => ReactElement;
}[] = [
  {
    surface: "Update target: what each copy at risk costs",
    names: ["tdd", "jobs"],
    render: () => (
      <UpdateTargetDialog
        targetName="agent-harness"
        preview={{
          release: "v0.3.2",
          chosenRelease: "v0.3.4",
          counts: { changed: 0, removed: 0, unchanged: 2 },
          addedByThisDeploy: [],
          changed: [],
          removed: [],
          unchanged: ["tdd", "jobs"],
          newInRelease: [],
          localEdits: {
            discard: [{ name: "tdd", tool: null }],
            unverified: [{ name: "jobs", tool: null }],
          },
          selection: { current: ["tdd", "jobs"], desired: ["tdd", "jobs"] },
          copyReceipt: "b".repeat(64),
          token: "a".repeat(64),
        }}
        isLoading={false}
        error={null}
        isRunning={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    ),
  },
  {
    surface: "Import local edits: an empty target",
    names: ["…/me/project"],
    render: () => (
      <ImportLocalEditsDialog
        targetName="…/me/project"
        skills={[]}
        checked={new Set()}
        checksChanged={false}
        onToggle={vi.fn()}
        isRunning={false}
        outcomes={null}
        failure={null}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    ),
  },
  {
    surface: "Delete skill: a skill on the default branch",
    names: ["research", "fimoklei/harness"],
    render: () =>
      deletionDialog({
        kind: "local",
        origin: "fimoklei/harness",
        screen: "harness",
        folder: ".apm/skills/research",
        check: "ready",
        localOnly: false,
        uncommitted: true,
      }),
  },
  {
    surface: "Delete skill: a skill that exists nowhere else",
    names: ["research"],
    render: () =>
      deletionDialog({
        kind: "local",
        origin: "fimoklei/harness",
        screen: "harness",
        folder: ".apm/skills/research",
        check: "ready",
        localOnly: true,
        uncommitted: false,
      }),
  },
  {
    surface: "Delete skill: over an open pull request",
    names: ["app/renovate", "research"],
    render: () =>
      deletionDialog({
        kind: "propose",
        origin: "fimoklei/harness",
        seenRemoteTree: "0123456789abcdef0123456789abcdef01234567",
        openRequest: { number: 45, author: "app/renovate" },
      }),
  },
  {
    surface: "Delete skill: proposing the deletion",
    names: ["fimoklei/harness"],
    render: () =>
      deletionDialog({
        kind: "propose",
        origin: "fimoklei/harness",
        seenRemoteTree: "0123456789abcdef0123456789abcdef01234567",
        openRequest: null,
      }),
  },
  {
    surface: "Publish release: a skill check finding",
    names: ["broken"],
    render: () => (
      <ReleaseDialog
        origin="github.com/fimoklei/agent-harness"
        load={{
          kind: "ready",
          plan: {
            delta: [{ kind: "added", name: "research", author: "Grace" }],
            previousTag: "v1.2.3",
            previousTagCommit: "fedcba9876543210fedcba9876543210fedcba98",
            proposedStep: "minor",
            reason: "A skill was added.",
            versions: { major: "v2.0.0", minor: "v1.3.0", patch: "v1.2.4" },
            revision: "0123456789abcdef0123456789abcdef01234567",
            defaultBranch: "main",
            findings: [{ skill: "broken", problem: "missing-manifest" }],
          },
        }}
        onClose={vi.fn()}
        onPublish={vi.fn()}
        publishing={false}
        publishError={null}
      />
    ),
  },
];

describe.each(SURFACES)("$surface", ({ names, render: ui }) => {
  it("sets every name in its sentences apart", () => {
    render(ui());
    const dialog = screen.getByRole("dialog");

    for (const name of names) {
      const inSentences = within(dialog)
        .getAllByText(name, { exact: true })
        .filter((element) => element.tagName === "B");
      expect(inSentences.length, name).toBeGreaterThan(0);
    }
  });
});
