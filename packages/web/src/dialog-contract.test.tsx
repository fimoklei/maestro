import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReleasePlan, UpdatePreview } from "@maestro/core";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportLocalEditsDialog } from "./deploy-state/import-local-edits-dialog";
import { RemoveSkillDialog } from "./deploy-state/remove-skill-dialog";
import { UpdateTargetDialog } from "./deploy-state/update-target-dialog";
import { DeletionDialog, type DeletionMode } from "./harness/deletion-dialog";
import { DiscardDialog } from "./harness/discard-dialog";
import { ImportDialog } from "./harness/import-dialog";
import { ReleaseDialog, type ReleasePlanLoad } from "./harness/release-dialog";
import { RestoreDialog } from "./harness/restore-dialog";
import { WithdrawDialog } from "./harness/withdraw-dialog";
import { BulkDeployDialog } from "./inventory/bulk-deploy-dialog";
import { BulkRemoveDialog } from "./inventory/bulk-remove-dialog";
import { RegisterRepositoryDialog } from "./registry/register-repository-dialog";
import {
  renderRepositories,
  stubRegistry,
} from "./registry/repositories-test-helpers";
import { UnregisterDialog } from "./registry/unregister-dialog";
import { SetLocationDialog } from "./settings/set-location-dialog";
import { htmlElement } from "./test-utils";
import type { NoticeContent } from "./ui/notice";
import type { FolderChooser } from "./ui/use-folder-chooser";

// Proves each dialog runs on `Dialog`, and keeps the parts of the dialog rules
// each dialog decides for itself.

type Row = {
  /** The dialog's source, from `packages/web/src`. */
  file: string;
  heading: string;
  render: (state: { running: boolean; onClose: () => void }) => ReactElement;
  /** Renders the dialog and changes a field; null where it has no field. */
  changed: null | ((onClose: () => void) => Promise<void>);
  /** Opens on an empty text field; null where it has none. */
  emptyForm: null | {
    submit: string;
    render: (onRun: () => void) => ReactElement;
  };
  /** Shows its read under way; null where it reads nothing. */
  loading: null | { line: string; render: () => ReactElement };
  /** Shows its read failed; null where it reads nothing that can fail. */
  loadFailed: null | (() => ReactElement);
  /** Each notice the body can show, by its heading. */
  notices: { label: string; render: () => ReactElement }[];
};

const NO_CHOOSER: FolderChooser = {
  available: false,
  busy: false,
  notice: null,
  browse: vi.fn(),
};

const FAILED: NoticeContent = {
  level: "error",
  label: "Read failed",
  message: "Select Close.",
};

const PLAN: ReleasePlan = {
  delta: [{ kind: "changed", name: "tdd", author: "Ada" }],
  previousTag: "v1.2.3",
  previousTagCommit: "fedcba9876543210fedcba9876543210fedcba98",
  proposedStep: "minor",
  reason: "A skill changed.",
  versions: { major: "v2.0.0", minor: "v1.3.0", patch: "v1.2.4" },
  revision: "0123456789abcdef0123456789abcdef01234567",
  defaultBranch: "main",
  findings: [],
};

const PREVIEW: UpdatePreview = {
  release: "v0.3.2",
  chosenRelease: "v0.3.4",
  counts: { changed: 1, removed: 0, unchanged: 0 },
  addedByThisDeploy: [],
  changed: [{ name: "tdd", url: null }],
  removed: [],
  unchanged: [],
  newInRelease: [],
  localEdits: { discard: [{ name: "tdd", tool: null }], unverified: [] },
  selection: { current: ["tdd"], desired: ["tdd"] },
  copyReceipt: "b".repeat(64),
  token: "a".repeat(64),
};

const CHECK = {
  mode: "add" as const,
  name: "release-notes",
  sourceBlocker: null,
  nameBlocker: null,
  advisories: [],
};

type Options = {
  running?: boolean;
  onClose?: () => void;
  onRun?: () => void;
};

const releaseDialog = (
  load: ReleasePlanLoad,
  { running = false, onClose = vi.fn() }: Options = {},
) => (
  <ReleaseDialog
    origin="github.com/fimoklei/agent-harness"
    load={load}
    onClose={onClose}
    onPublish={vi.fn()}
    publishing={running}
    publishError={null}
  />
);

const LOCAL_DELETION: DeletionMode = {
  kind: "local",
  origin: "fimoklei/harness",
  screen: "harness",
  folder: ".apm/skills/research",
  check: "ready",
  localOnly: false,
  uncommitted: false,
};

const deletionDialog = (
  mode: DeletionMode,
  {
    running = false,
    onClose = vi.fn(),
    deleteError = null,
  }: Options & { deleteError?: NoticeContent | null } = {},
) => (
  <DeletionDialog
    skill="research"
    mode={mode}
    onClose={onClose}
    onConfirm={vi.fn()}
    deleting={running}
    deleteError={deleteError}
  />
);

const updateDialog = (
  props: Partial<ComponentProps<typeof UpdateTargetDialog>>,
) => (
  <UpdateTargetDialog
    targetName="agent-harness"
    preview={null}
    isLoading={false}
    error={null}
    isRunning={false}
    onCancel={vi.fn()}
    onConfirm={vi.fn()}
    {...props}
  />
);

const importDialog = (props: Partial<ComponentProps<typeof ImportDialog>>) => (
  <ImportDialog
    source={null}
    sourceText=""
    sourceError={undefined}
    onSourceChange={vi.fn()}
    onSourceCommit={vi.fn()}
    chooser={NO_CHOOSER}
    name=""
    load={{ kind: "idle" }}
    onNameChange={vi.fn()}
    onClose={vi.fn()}
    onImport={vi.fn()}
    importing={false}
    importError={null}
    {...props}
  />
);

const importLocalEditsDialog = (
  props: Partial<ComponentProps<typeof ImportLocalEditsDialog>>,
) => (
  <ImportLocalEditsDialog
    targetName="…/me/project"
    skills={[{ name: "tdd", refusal: null }]}
    checked={new Set(["tdd"])}
    checksChanged={false}
    onToggle={vi.fn()}
    isRunning={false}
    outcomes={null}
    failure={null}
    onCancel={vi.fn()}
    onConfirm={vi.fn()}
    {...props}
  />
);

const registerDialog = (
  path: string,
  { running = false, onClose = vi.fn(), onRun = vi.fn() }: Options = {},
) => (
  <RegisterRepositoryDialog
    path={path}
    onPathChange={vi.fn()}
    onPicked={vi.fn()}
    chooser={NO_CHOOSER}
    error={undefined}
    phase={running ? "running" : "idle"}
    onRegister={onRun}
    onClose={onClose}
  />
);

const setLocationDialog = (
  path: string,
  { running = false, onClose = vi.fn(), onRun = vi.fn() }: Options = {},
) => (
  <SetLocationDialog
    path={path}
    onPathChange={vi.fn()}
    chooser={NO_CHOOSER}
    notice={null}
    busy={running}
    onSet={onRun}
    onClose={onClose}
  />
);

const ON_DIALOG: Row[] = [
  {
    file: "deploy-state/remove-skill-dialog.tsx",
    heading: "Remove tdd v0.5.0",
    render: ({ running, onClose }) => (
      <RemoveSkillDialog
        skillName="tdd"
        version="v0.5.0"
        target={{ kind: "repo", repoPath: "/Users/me/project" }}
        isRemoving={running}
        preflight={{
          kind: "offered",
          check: { kind: "repo", warning: "none" },
          reclaim: [],
        }}
        error={null}
        restated={null}
        outcome={null}
        onCancel={onClose}
        onConfirm={vi.fn()}
      />
    ),
    changed: null,
    emptyForm: null,
    loading: null,
    loadFailed: null,
    notices: [
      {
        label: "Removal costs more",
        render: () => (
          <RemoveSkillDialog
            skillName="tdd"
            version="v0.5.0"
            target={{ kind: "repo", repoPath: "/Users/me/project" }}
            isRemoving={false}
            preflight={{
              kind: "offered",
              check: { kind: "repo", warning: "none" },
              reclaim: [],
            }}
            error={null}
            restated={{ label: "Removal costs more", message: "Read again." }}
            outcome={null}
            onCancel={vi.fn()}
            onConfirm={vi.fn()}
          />
        ),
      },
    ],
  },
  {
    file: "harness/release-dialog.tsx",
    heading: "Publish release for github.com/fimoklei/agent-harness",
    render: ({ running, onClose }) =>
      releaseDialog({ kind: "loading" }, { running, onClose }),
    changed: async (onClose) => {
      render(releaseDialog({ kind: "ready", plan: PLAN }, { onClose }));
      await userEvent.click(screen.getByRole("button", { name: "Major" }));
    },
    emptyForm: null,
    loading: {
      line: "Loading the release plan…",
      render: () => releaseDialog({ kind: "loading" }),
    },
    loadFailed: () => releaseDialog({ kind: "error", notice: FAILED }),
    notices: [
      {
        label: "Skill checks found issues",
        render: () =>
          releaseDialog({
            kind: "ready",
            plan: {
              ...PLAN,
              findings: [{ skill: "broken", problem: "missing-manifest" }],
            },
          }),
      },
    ],
  },
  {
    file: "harness/deletion-dialog.tsx",
    heading: "Delete research",
    render: ({ running, onClose }) =>
      deletionDialog(LOCAL_DELETION, { running, onClose }),
    changed: null,
    emptyForm: null,
    loading: {
      line: "Checking for uncommitted changes…",
      render: () => deletionDialog({ ...LOCAL_DELETION, check: "checking" }),
    },
    loadFailed: () =>
      deletionDialog(
        { ...LOCAL_DELETION, check: "failed" },
        { deleteError: FAILED },
      ),
    notices: [
      {
        label: "Pull request #45 will delete research instead",
        render: () =>
          deletionDialog({
            kind: "propose",
            origin: "fimoklei/harness",
            seenRemoteTree: "0123456789abcdef0123456789abcdef01234567",
            openRequest: { number: 45, author: "Grace" },
          }),
      },
      {
        label: "Uncommitted changes in research",
        render: () => deletionDialog({ ...LOCAL_DELETION, uncommitted: true }),
      },
    ],
  },
  {
    file: "harness/restore-dialog.tsx",
    heading: "Restore research",
    render: ({ running, onClose }) => (
      <RestoreDialog
        skill="research"
        folder=".apm/skills/research"
        commit="0123456789abcdef0123456789abcdef01234567"
        hasRequest={false}
        onClose={onClose}
        onConfirm={vi.fn()}
        restoring={running}
        restoreError={null}
      />
    ),
    changed: null,
    emptyForm: null,
    loading: null,
    loadFailed: null,
    notices: [],
  },
  {
    file: "harness/discard-dialog.tsx",
    heading: "Discard change for research",
    render: ({ running, onClose }) => (
      <DiscardDialog
        skill="research"
        folder=".apm/skills/research"
        defaultBranch="main"
        onClose={onClose}
        onConfirm={vi.fn()}
        discarding={running}
        discardError={null}
      />
    ),
    changed: null,
    emptyForm: null,
    loading: null,
    loadFailed: null,
    notices: [],
  },
  {
    file: "inventory/bulk-deploy-dialog.tsx",
    heading: "Deploy 2 skills",
    render: ({ running, onClose }) => (
      <BulkDeployDialog
        count={2}
        targets={[{ value: "global", label: "Global (Claude Code)" }]}
        selected="global"
        onSelect={vi.fn()}
        unavailable={null}
        fieldsChanged={false}
        busy={running}
        failure={null}
        report={null}
        reportFailure={null}
        onDeploy={vi.fn()}
        onClose={onClose}
      />
    ),
    // The host says whether its target was picked.
    changed: async (onClose) => {
      render(
        <BulkDeployDialog
          count={2}
          targets={[{ value: "global", label: "Global (Claude Code)" }]}
          selected="global"
          onSelect={vi.fn()}
          unavailable={null}
          fieldsChanged={true}
          busy={false}
          failure={null}
          report={null}
          reportFailure={null}
          onDeploy={vi.fn()}
          onClose={onClose}
        />,
      );
    },
    emptyForm: null,
    loading: null,
    loadFailed: null,
    notices: [],
  },
  {
    file: "harness/withdraw-dialog.tsx",
    heading: "Withdraw proposal for research",
    render: ({ running, onClose }) => (
      <WithdrawDialog
        skill="research"
        number={45}
        onClose={onClose}
        onConfirm={vi.fn()}
        withdrawing={running}
        withdrawError={null}
      />
    ),
    changed: null,
    emptyForm: null,
    loading: null,
    loadFailed: null,
    notices: [],
  },
  {
    file: "deploy-state/update-target-dialog.tsx",
    heading: "Update agent-harness",
    render: ({ running, onClose }) =>
      updateDialog({ isRunning: running, onCancel: onClose }),
    changed: async (onClose) => {
      render(updateDialog({ preview: PREVIEW, onCancel: onClose }));
      await userEvent.click(
        screen.getByRole("checkbox", { name: /Discard local edits for tdd/ }),
      );
    },
    emptyForm: null,
    loading: {
      line: "Loading the update preview…",
      render: () => updateDialog({ isLoading: true }),
    },
    loadFailed: () => updateDialog({ error: FAILED }),
    notices: [],
  },
  {
    file: "registry/register-repository-dialog.tsx",
    heading: "Register a repository",
    render: ({ running, onClose }) =>
      registerDialog("/home/me/acme-web", { running, onClose }),
    changed: async (onClose) => {
      render(registerDialog("/home/me/acme-web", { onClose }));
    },
    emptyForm: {
      submit: "Register repository",
      render: (onRun) => registerDialog("", { onRun }),
    },
    loading: null,
    loadFailed: null,
    notices: [],
  },
  {
    file: "registry/unregister-dialog.tsx",
    heading: "Unregister …/me/old-site",
    render: ({ running, onClose }) => (
      <UnregisterDialog
        name="…/me/old-site"
        phase={running ? "running" : "idle"}
        failure={null}
        onConfirm={vi.fn()}
        onClose={onClose}
      />
    ),
    changed: null,
    emptyForm: null,
    loading: null,
    loadFailed: null,
    notices: [],
  },
  {
    file: "settings/set-location-dialog.tsx",
    heading: "Set Harness location",
    render: ({ running, onClose }) =>
      setLocationDialog("/home/me/agent-harness", { running, onClose }),
    changed: async (onClose) => {
      const { rerender } = render(
        setLocationDialog("/home/me/agent-harness", { onClose }),
      );
      rerender(setLocationDialog("/home/me/other-harness", { onClose }));
    },
    emptyForm: {
      submit: "Set Harness location",
      render: (onRun) => setLocationDialog("", { onRun }),
    },
    loading: null,
    loadFailed: null,
    notices: [],
  },
  {
    file: "harness/import-dialog.tsx",
    heading: "Import a skill",
    render: ({ running, onClose }) =>
      importDialog({
        source: "/home/me/incoming/release-notes",
        sourceText: "/home/me/incoming/release-notes",
        name: "release-notes",
        load: { kind: "loading" },
        importing: running,
        onClose,
      }),
    // A typed path is work too, not only a typed name.
    changed: async (onClose) => {
      render(
        importDialog({
          sourceText: "/home/me/incoming/release-notes",
          onClose,
        }),
      );
    },
    emptyForm: {
      submit: "Import skill",
      render: (onRun) => importDialog({ onImport: onRun }),
    },
    loading: null,
    loadFailed: null,
    notices: [
      {
        label: "Skill checks found issues",
        render: () =>
          importDialog({
            source: "/home/me/incoming/release-notes",
            sourceText: "/home/me/incoming/release-notes",
            name: "release-notes",
            load: {
              kind: "ready",
              check: { ...CHECK, advisories: ["long-manifest"] },
            },
          }),
      },
    ],
  },
  {
    file: "inventory/bulk-remove-dialog.tsx",
    heading: "Remove tdd from 3 targets",
    render: ({ running, onClose }) => (
      <BulkRemoveDialog
        skillName="tdd"
        targetCount={3}
        view={{
          kind: "grouped",
          clean: {
            label: "3 clean copies",
            message: "Only the deployed files are removed.",
          },
          cost: [],
          refused: [],
          removableCount: 3,
          confirmLabel: "Remove from 3 targets",
        }}
        isRemoving={running}
        report={null}
        onCancel={onClose}
        onConfirm={vi.fn()}
      />
    ),
    changed: null,
    emptyForm: null,
    loading: {
      line: "Checking 3 targets…",
      render: () => (
        <BulkRemoveDialog
          skillName="tdd"
          targetCount={3}
          view={{ kind: "checking", line: "Checking 3 targets…" }}
          isRemoving={false}
          report={null}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
        />
      ),
    },
    loadFailed: null,
    notices: [
      {
        // Beside a cost and a refusal, so the notice's place is really checked.
        label: "3 clean copies",
        render: () => (
          <BulkRemoveDialog
            skillName="tdd"
            targetCount={5}
            view={{
              kind: "grouped",
              clean: {
                label: "3 clean copies",
                message: "Only the deployed files are removed.",
              },
              cost: [
                {
                  label: "/dev/acme-api",
                  version: "v1.0.0",
                  reason: "Nothing recorded — may lose work",
                },
              ],
              refused: [
                {
                  label: "/dev/legacy-etl",
                  reason: "Repository not registered",
                },
              ],
              removableCount: 4,
              confirmLabel: "Remove from 4 targets · 1 may lose work",
            }}
            isRemoving={false}
            report={null}
            onCancel={vi.fn()}
            onConfirm={vi.fn()}
          />
        ),
      },
    ],
  },
  {
    file: "deploy-state/import-local-edits-dialog.tsx",
    heading: "Import local edits from …/me/project",
    render: ({ running, onClose }) =>
      importLocalEditsDialog({ isRunning: running, onCancel: onClose }),
    // The host says whether a check moved.
    changed: async (onClose) => {
      render(
        importLocalEditsDialog({ checksChanged: true, onCancel: onClose }),
      );
    },
    emptyForm: null,
    loading: {
      line: "Checking for local edits…",
      render: () => importLocalEditsDialog({ skills: null }),
    },
    loadFailed: () => importLocalEditsDialog({ skills: null, failure: FAILED }),
    notices: [],
  },
];

const SRC = import.meta.dirname;

const sources = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .filter(
    (file) => /\.tsx?$/.test(file) && !/\.(test|stories)\.tsx?$/.test(file),
  )
  .sort()
  .map((file) => ({ file, text: readFileSync(join(SRC, file), "utf8") }));

const sourceOf = (file: string) =>
  sources.find((source) => source.file === file)?.text ?? "";

// Only `Dialog` opens a modal layer.
const OPENS_A_DIALOG =
  /@radix-ui\/react-dialog|role="(alert)?dialog"|aria-modal|<dialog\b/;

// What the reader can change in a dialog.
const RENDERS_A_FIELD =
  /<(PathField|Field|Select|SegmentedControl)\b|checklist=\{\{/;
const RENDERS_A_TEXT_FIELD = /<(PathField|Field)\b/;
// Only a Report or a checklist needs the wide dialog.
const SHOWS_REPORT_OR_CHECKLIST = /from "\.\.\/ui\/report"|checklist=\{\{/;

// Radix registers its outside listener on the next tick, and dismisses on
// pointerdown.
const clickOutside = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  fireEvent.pointerDown(document.body);
  fireEvent.click(document.body);
};

// The words that follow `element` in the dialog's body, leaving out other
// notices and status lines and the footer.
function bodyTextAfter(element: Element): string[] {
  const footer = screen
    .getAllByRole("button", { name: /^(Cancel|Close)$/ })
    .at(-1)?.parentElement;
  const walker = document.createTreeWalker(
    screen.getByRole("dialog"),
    NodeFilter.SHOW_TEXT,
  );
  const after: string[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node.textContent?.trim() ?? "";
    if (
      text === "" ||
      element.contains(node) ||
      footer?.contains(node) === true ||
      !(
        element.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING
      )
    ) {
      continue;
    }
    if (node.parentElement?.closest('[role="alert"], [role="status"]')) {
      continue;
    }
    after.push(text);
  }
  return after;
}

describe("every dialog", () => {
  it("is in the guard table", () => {
    const dialogs = sources
      .filter(
        ({ file, text }) =>
          !file.startsWith("ui/") && /from "(\.\.\/)+ui\/dialog"/.test(text),
      )
      .map(({ file }) => file);

    expect(dialogs).toEqual(ON_DIALOG.map((row) => row.file).sort());
  });

  it("opens only through Dialog", () => {
    const openers = sources
      .filter(({ text }) => OPENS_A_DIALOG.test(text))
      .map(({ file }) => file);

    expect(openers).toEqual(["ui/dialog.tsx"]);
  });

  it("declares a changed state for each dialog with a field", () => {
    const withField = ON_DIALOG.filter((row) =>
      RENDERS_A_FIELD.test(sourceOf(row.file)),
    ).map((row) => row.file);

    expect(
      ON_DIALOG.filter((row) => row.changed !== null).map((row) => row.file),
    ).toEqual(withField);
  });

  it("declares an empty form for each dialog with a text field", () => {
    const withTextField = ON_DIALOG.filter((row) =>
      RENDERS_A_TEXT_FIELD.test(sourceOf(row.file)),
    ).map((row) => row.file);

    expect(
      ON_DIALOG.filter((row) => row.emptyForm !== null).map((row) => row.file),
    ).toEqual(withTextField);
  });

  it("declares the notices of each dialog whose body shows one", () => {
    const withNotice = ON_DIALOG.filter((row) =>
      /<Notice\b/.test(sourceOf(row.file)),
    ).map((row) => row.file);

    expect(
      ON_DIALOG.filter((row) => row.notices.length > 0).map((row) => row.file),
    ).toEqual(withNotice);
  });

  it("opens at 640px only where a Report or a checklist can show", () => {
    const widths = ON_DIALOG.map((row) => ({
      file: row.file,
      width: /width=\{(\d+)\}/.exec(sourceOf(row.file))?.[1],
    }));

    expect(widths).toEqual(
      ON_DIALOG.map((row) => ({
        file: row.file,
        width: SHOWS_REPORT_OR_CHECKLIST.test(sourceOf(row.file))
          ? "640"
          : "480",
      })),
    );
  });

  describe.each(ON_DIALOG)("$file", (row) => {
    it("has a heading and a ✕ Close", async () => {
      const onClose = vi.fn();
      render(row.render({ running: false, onClose }));

      expect(
        screen.getByRole("heading", { level: 2, name: row.heading }),
      ).toBeInTheDocument();
      await userEvent.click(
        screen.getAllByRole("button", { name: "Close" })[0] as HTMLElement,
      );

      expect(onClose).toHaveBeenCalledOnce();
    });

    it("does not close on Escape while its action runs", async () => {
      const onClose = vi.fn();
      render(row.render({ running: true, onClose }));

      await userEvent.keyboard("{Escape}");

      expect(onClose).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", { name: "Close — action still running" }),
      ).toBeInTheDocument();
    });

    it.runIf(/tone: "danger"/.test(sourceOf(row.file)))(
      "opens its focus on Cancel",
      async () => {
        render(row.render({ running: false, onClose: vi.fn() }));

        await waitFor(() =>
          expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(),
        );
      },
    );

    it.runIf(row.changed !== null)(
      "ignores a click outside once a field changed",
      async () => {
        const onClose = vi.fn();
        await row.changed?.(onClose);

        await clickOutside();

        expect(onClose).not.toHaveBeenCalled();
      },
    );

    it.runIf(row.emptyForm !== null)(
      "keeps its submit enabled on an empty field, and submits",
      async () => {
        const onRun = vi.fn();
        const form = row.emptyForm;
        if (form === null) return;
        render(form.render(onRun));

        const submit = screen.getByRole("button", { name: form.submit });
        expect(submit).not.toHaveAttribute("aria-disabled");
        await userEvent.click(submit);

        expect(onRun).toHaveBeenCalledOnce();
      },
    );

    it.runIf(row.loading !== null)(
      "states its read under way as a status line",
      () => {
        const loading = row.loading;
        if (loading === null) return;
        render(loading.render());

        expect(screen.getByText(loading.line)).toHaveAttribute(
          "role",
          "status",
        );
      },
    );

    it.runIf(row.loadFailed !== null)(
      "offers Close, not Cancel, once its read failed",
      () => {
        if (row.loadFailed === null) throw new Error("runIf skips this row");
        render(row.loadFailed());

        expect(
          screen.queryByRole("button", { name: "Cancel" }),
        ).not.toBeInTheDocument();
        expect(
          screen.getAllByRole("button", { name: "Close" }).at(-1),
        ).toHaveTextContent("Close");
      },
    );

    it.each(row.notices)(
      "states the $label notice above the footer",
      ({ label, render: renderNotice }) => {
        render(renderNotice());

        const notice = screen
          .getByText(label)
          .closest('[role="alert"], [role="status"]');
        expect(notice).not.toBeNull();
        expect(bodyTextAfter(htmlElement(notice))).toEqual([]);
      },
    );
  });
});

/** A dialog that adds a row, run on its screen up to a successful add. */
type AddsARow = {
  file: string;
  add: () => Promise<void>;
  /** Text the new row shows. */
  row: string;
};

// Import skill opens the new row's pane, which its flow test proves; a screen
// without a pane focuses the row itself.
const ADDS_A_ROW: AddsARow[] = [
  {
    file: "registry/register-repository-dialog.tsx",
    add: async () => {
      stubRegistry({
        repos: [{ path: "/home/me/payments-api", status: "ready" }],
      });
      renderRepositories();
      const [band1] = await screen.findAllByRole("button", {
        name: "Register repository",
      });
      await userEvent.click(htmlElement(band1));
      const dialog = await screen.findByRole("dialog");
      await userEvent.type(
        within(dialog).getByRole("textbox", { name: "Folder path" }),
        "/home/me/acme-web{Enter}",
      );
    },
    row: "/home/me/acme-web",
  },
];

describe.each(ADDS_A_ROW)("$file", ({ add, row }) => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("selects and focuses the new row once the add succeeds", async () => {
    await add();

    await waitFor(() => {
      const grid = screen.getByRole("grid");
      expect(grid).toHaveFocus();
      expect(
        document.getElementById(
          grid.getAttribute("aria-activedescendant") ?? "",
        ),
      ).toHaveTextContent(row);
    });
  });
});
