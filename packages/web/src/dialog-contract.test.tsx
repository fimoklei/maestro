import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { ImportLocalEditsDialog } from "./deploy-state/import-local-edits-dialog";
import { RemoveSkillDialog } from "./deploy-state/remove-skill-dialog";
import { UpdateTargetDialog } from "./deploy-state/update-target-dialog";
import { DeletionDialog } from "./harness/deletion-dialog";
import { ImportDialog } from "./harness/import-dialog";
import { ReleaseDialog } from "./harness/release-dialog";
import { RestoreDialog } from "./harness/restore-dialog";
import { WithdrawDialog } from "./harness/withdraw-dialog";
import { BulkDeployDialog } from "./inventory/bulk-deploy-dialog";
import { BulkRemoveDialog } from "./inventory/bulk-remove-dialog";
import { RegisterRepositoryDialog } from "./registry/register-repository-dialog";
import { UnregisterDialog } from "./registry/unregister-dialog";
import { SetLocationDialog } from "./settings/set-location-dialog";
import type { FolderChooser } from "./ui/use-folder-chooser";

// Proves each dialog runs on `Dialog`, not the contract itself.

type Row = {
  /** The dialog's source, from `packages/web/src`. */
  file: string;
  heading: string;
  render: (state: { running: boolean; onClose: () => void }) => ReactElement;
};

const NO_CHOOSER: FolderChooser = {
  available: false,
  busy: false,
  notice: null,
  browse: vi.fn(),
};

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
  },
  {
    file: "harness/release-dialog.tsx",
    heading: "Publish release for github.com/fimoklei/agent-harness",
    render: ({ running, onClose }) => (
      <ReleaseDialog
        origin="github.com/fimoklei/agent-harness"
        load={{ kind: "loading" }}
        onClose={onClose}
        onPublish={vi.fn()}
        publishing={running}
        publishError={null}
      />
    ),
  },
  {
    file: "harness/deletion-dialog.tsx",
    heading: "Delete research",
    render: ({ running, onClose }) => (
      <DeletionDialog
        skill="research"
        mode={{ kind: "local", folder: ".apm/skills/research" }}
        onClose={onClose}
        onConfirm={vi.fn()}
        deleting={running}
        deleteError={null}
      />
    ),
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
  },
  {
    file: "deploy-state/update-target-dialog.tsx",
    heading: "Update agent-harness",
    render: ({ running, onClose }) => (
      <UpdateTargetDialog
        targetName="agent-harness"
        preview={null}
        isLoading={false}
        error={null}
        isRunning={running}
        onCancel={onClose}
        onConfirm={vi.fn()}
      />
    ),
  },
  {
    file: "registry/register-repository-dialog.tsx",
    heading: "Register a repository",
    render: ({ running, onClose }) => (
      <RegisterRepositoryDialog
        path="/home/me/acme-web"
        onPathChange={vi.fn()}
        onPicked={vi.fn()}
        chooser={NO_CHOOSER}
        error={undefined}
        busy={running}
        onRegister={vi.fn()}
        onClose={onClose}
      />
    ),
  },
  {
    file: "registry/unregister-dialog.tsx",
    heading: "Unregister …/me/old-site",
    render: ({ running, onClose }) => (
      <UnregisterDialog
        name="…/me/old-site"
        busy={running}
        failure={null}
        onConfirm={vi.fn()}
        onClose={onClose}
      />
    ),
  },
  {
    file: "settings/set-location-dialog.tsx",
    heading: "Set Harness location",
    render: ({ running, onClose }) => (
      <SetLocationDialog
        path="/home/me/agent-harness"
        onPathChange={vi.fn()}
        chooser={NO_CHOOSER}
        notice={null}
        busy={running}
        onSet={vi.fn()}
        onClose={onClose}
      />
    ),
  },
  {
    file: "harness/import-dialog.tsx",
    heading: "Import a skill",
    render: ({ running, onClose }) => (
      <ImportDialog
        source="/home/me/incoming/release-notes"
        sourceText="/home/me/incoming/release-notes"
        onSourceChange={vi.fn()}
        onSourceCommit={vi.fn()}
        chooser={NO_CHOOSER}
        name="release-notes"
        load={{ kind: "loading" }}
        onNameChange={vi.fn()}
        onClose={onClose}
        onImport={vi.fn()}
        importing={running}
        importError={null}
      />
    ),
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
          cleanLine: "3 clean copies",
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
  },
  {
    file: "deploy-state/import-local-edits-dialog.tsx",
    heading: "Import local edits from …/me/project",
    render: ({ running, onClose }) => (
      <ImportLocalEditsDialog
        targetName="…/me/project"
        skills={[{ name: "tdd", refusal: null }]}
        checked={new Set(["tdd"])}
        checksChanged={false}
        onToggle={vi.fn()}
        isRunning={running}
        outcomes={null}
        failure={null}
        onCancel={onClose}
        onConfirm={vi.fn()}
      />
    ),
  },
];

const SRC = import.meta.dirname;

const sources = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .filter(
    (file) => /\.tsx?$/.test(file) && !/\.(test|stories)\.tsx?$/.test(file),
  )
  .sort()
  .map((file) => ({ file, text: readFileSync(join(SRC, file), "utf8") }));

// Only `Dialog` opens a modal layer.
const OPENS_A_DIALOG =
  /@radix-ui\/react-dialog|role="(alert)?dialog"|aria-modal|<dialog\b/;

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
  });
});
