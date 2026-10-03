import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  renderDeployState,
  stubServer,
} from "./deploy-state/deploy-state-test-helpers";
import {
  renderRepositories,
  stubRegistry,
} from "./registry/repositories-test-helpers";

// Proves each table screen runs on `TableScreen`, not the module itself.

type Row = {
  /** The screen's source, from `packages/web/src`. */
  file: string;
  name: string;
  render: () => void;
};

const ON_TABLE_SCREEN: Row[] = [
  {
    file: "deploy-state/deploy-state-view.tsx",
    name: "Deploy-state",
    render: () => {
      stubServer(() => ({ repos: ["/Users/me/a"] }));
      renderDeployState();
    },
  },
  {
    file: "registry/repositories-view.tsx",
    name: "Repositories",
    render: () => {
      stubRegistry({ repos: [{ path: "/home/me/acme-web", status: "ready" }] });
      renderRepositories();
    },
  },
];

// Still wiring the frame by hand; each leaves with its own move (#1350–#1352).
const NOT_YET = ["harness/harness-view.tsx", "inventory/inventory-view.tsx"];

const SRC = import.meta.dirname;

const sources = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .filter(
    (file) => /\.tsx?$/.test(file) && !/\.(test|stories)\.tsx?$/.test(file),
  )
  .sort()
  .map((file) => ({ file, text: readFileSync(join(SRC, file), "utf8") }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("every table screen", () => {
  it("is in the guard table", () => {
    const screens = sources
      .filter(
        ({ file, text }) =>
          !file.startsWith("ui/") && /<TableScreen\b/.test(text),
      )
      .map(({ file }) => file);

    expect(screens).toEqual(ON_TABLE_SCREEN.map((row) => row.file).sort());
  });

  // A table in a dialog is not a screen; a table in a panel is.
  it("puts a table in a panel only through TableScreen", () => {
    const byHand = sources
      .filter(
        ({ file, text }) =>
          !file.startsWith("ui/") &&
          /<Panel\b/.test(text) &&
          /<DataTable\b/.test(text),
      )
      .map(({ file }) => file);

    expect(byHand).toEqual(NOT_YET);
  });

  describe.each(ON_TABLE_SCREEN)("$file", (row) => {
    it("has one Re-read control in band 2 and one status region", async () => {
      row.render();

      expect(
        screen.getByRole("heading", { level: 1, name: row.name }),
      ).toBeInTheDocument();
      const reread = await screen.findByRole("button", {
        name: `Re-read ${row.name}`,
      });
      expect(reread.closest("[data-band='2']")).not.toBeNull();
      expect(
        screen
          .getAllByRole("status")
          .filter((region) => region.classList.contains("sr-only")),
      ).toHaveLength(1);
    });
  });
});
