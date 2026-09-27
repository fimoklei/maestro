import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { RestoreDialog } from "./harness/restore-dialog";

// The thin guard over every dialog: it proves each one runs on `Dialog`. The
// contract itself is tested once, in `ui/dialog.test.tsx`.

type Row = {
  /** The dialog's source, from `packages/web/src`. */
  file: string;
  heading: string;
  render: (state: { running: boolean; onClose: () => void }) => ReactElement;
};

const ON_DIALOG: Row[] = [
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
];

// Still assembled from the old parts; each moves onto `Dialog` under #1226 and
// then joins ON_DIALOG.
const NOT_YET_ON_DIALOG = [
  "deploy-state/remove-skill-dialog.tsx",
  "deploy-state/update-target-dialog.tsx",
  "harness/deletion-dialog.tsx",
  "harness/import-dialog.tsx",
  "harness/release-dialog.tsx",
  "harness/withdraw-dialog.tsx",
  "inventory/bulk-deploy-dialog.tsx",
  "inventory/bulk-remove-dialog.tsx",
  "registry/register-repository-dialog.tsx",
  "registry/unregister-dialog.tsx",
  "settings/set-location-dialog.tsx",
];

const SRC = import.meta.dirname;

// A dialog is any source outside `ui/` that imports the shell or `Dialog`.
function dialogSources(): string[] {
  const files = readdirSync(SRC, { recursive: true, encoding: "utf8" });
  return files
    .filter(
      (file) =>
        file.endsWith(".tsx") &&
        !file.startsWith("ui/") &&
        !/\.(test|stories)\.tsx$/.test(file),
    )
    .filter((file) =>
      /from "\.\.\/ui\/dialog(-shell)?"/.test(
        readFileSync(join(SRC, file), "utf8"),
      ),
    )
    .sort();
}

describe("every dialog", () => {
  it("is in the guard table, or listed as not yet on Dialog", () => {
    expect(dialogSources()).toEqual(
      [...ON_DIALOG.map((row) => row.file), ...NOT_YET_ON_DIALOG].sort(),
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
  });
});
