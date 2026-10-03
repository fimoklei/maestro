import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../test-utils";
import {
  importRoutes,
  landed,
  openPane,
  renderDeployState,
  type ServerState,
  stubServer,
} from "./deploy-state-test-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

const REPO = "/Users/me/project";
const ROW = "…/me/project";

const skill = (name: string, copy?: "local-edits") => ({
  type: "skill",
  name,
  version: "v0.3.5",
  ...(copy ? { copy } : {}),
});

const PENDING = { kind: "update", release: "v0.3.5", desired: ["tdd"] };

async function openSkillMenu(pane: HTMLElement, name: string) {
  await userEvent.click(
    within(pane).getByRole("button", { name: `Actions for ${name}` }),
  );
  return (await screen.findAllByRole("menuitem")).map(
    (item) => item.textContent,
  );
}

function stubRepo(target: object, other?: ServerState["other"]) {
  stubServer(() => ({ repos: [REPO], repo: { [REPO]: target }, other }));
}

const TWO_EDITED = {
  primitives: [
    skill("code-review", "local-edits"),
    skill("tdd", "local-edits"),
  ],
  skipped: [],
};

const checked =
  (...skills: object[]) =>
  () =>
    jsonResponse({ skills });

// A repository with two edited skills, its pane open.
async function openEditedPane(other: ServerState["other"]) {
  stubRepo(TWO_EDITED, other);
  renderDeployState();
  return openPane(ROW);
}

async function openSkillDialog(pane: HTMLElement, name: string, title: string) {
  await openSkillMenu(pane, name);
  await userEvent.click(
    screen.getByRole("menuitem", { name: "Import local edits" }),
  );
  return screen.findByRole("dialog", {
    name: `Import local edits from ${title}`,
  });
}

describe("Deploy-state — Import local edits on a skill row", () => {
  it("offers Import local edits above Remove skill on a skill with local edits", async () => {
    stubRepo({
      primitives: [skill("code-review"), skill("tdd", "local-edits")],
      skipped: [],
    });
    renderDeployState();
    const pane = await openPane(ROW);

    expect(await openSkillMenu(pane, "tdd")).toEqual([
      "Import local edits",
      "Remove skill",
    ]);
    await userEvent.keyboard("{Escape}");
    expect(await openSkillMenu(pane, "code-review")).toEqual(["Remove skill"]);
  });

  it("omits Import local edits while an unfinished operation stands", async () => {
    stubRepo({
      primitives: [skill("tdd", "local-edits")],
      skipped: [],
      pendingOperation: PENDING,
    });
    renderDeployState();
    const pane = await openPane(ROW);

    expect(await openSkillMenu(pane, "tdd")).toEqual(["Remove skill"]);
  });

  it("lists only the row's skill, checked, and opens it on the Harness screen once it lands", async () => {
    const { sent, other } = importRoutes(
      checked(
        { name: "code-review", refusal: null },
        { name: "tdd", refusal: null },
      ),
      landed,
    );
    const pane = await openEditedPane(other);

    const dialog = await openSkillDialog(pane, "tdd", ROW);
    const group = await within(dialog).findByRole("group", {
      name: "Can be imported · 1",
    });
    expect(within(group).getByRole("checkbox", { name: "tdd" })).toBeChecked();
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(1);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Import 1 skill" }),
    );

    expect(await screen.findByText("harness view tdd")).toBeInTheDocument();
    expect(sent).toEqual([
      { target: { kind: "repo", repoPath: REPO }, names: ["tdd"], undo: [] },
    ]);
  });

  it("starts a skill that undoes newer Harness changes unchecked", async () => {
    const { other } = importRoutes(
      checked({ name: "tdd", refusal: null, undoesNewerSince: "v0.3.5" }),
      landed,
    );
    const pane = await openEditedPane(other);

    const dialog = await openSkillDialog(pane, "tdd", ROW);
    const flagged = await within(dialog).findByRole("group", {
      name: "▲ Undoes newer Harness changes · 1",
    });

    expect(
      within(flagged).getByRole("checkbox", { name: "tdd" }),
    ).not.toBeChecked();
    expect(
      within(dialog).getByRole("button", {
        name: "Import skills — none selected",
      }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("shows a refused skill disabled with its sentence, and blocks the confirm", async () => {
    const { other } = importRoutes(
      checked(
        { name: "code-review", refusal: null },
        { name: "tdd", refusal: "deployed-copy" },
      ),
      landed,
    );
    const pane = await openEditedPane(other);

    const dialog = await openSkillDialog(pane, "tdd", ROW);
    const box = await within(dialog).findByRole("checkbox", { name: "tdd" });

    expect(box).toHaveAttribute("aria-disabled", "true");
    expect(box).toHaveAccessibleDescription(
      "Deployed by another Harness. Make the change in that Harness.",
    );
    expect(
      within(dialog).getByRole("button", {
        name: "Import skills — no skill qualifies",
      }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("stays open with its Report when the import refuses the skill", async () => {
    const { other } = importRoutes(
      checked({ name: "tdd", refusal: null }),
      () =>
        jsonResponse({
          outcomes: [{ name: "tdd", refusal: "harness-copy-uncommitted" }],
        }),
    );
    const pane = await openEditedPane(other);

    const dialog = await openSkillDialog(pane, "tdd", ROW);
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Import 1 skill" }),
    );

    const refused = await within(dialog).findByRole("region", {
      name: "Not imported 1",
    });
    expect(within(refused).getByText("tdd")).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
  });

  it("imports one skill from the global target", async () => {
    const { sent, other } = importRoutes(
      checked(
        { name: "code-review", refusal: null },
        { name: "tdd", refusal: null },
      ),
      landed,
    );
    stubServer(() => ({
      global: {
        tools: [{ tool: "claude", primitives: TWO_EDITED.primitives }],
        skipped: [],
      },
      other,
    }));
    renderDeployState();
    const pane = await openPane("Claude Code");

    const dialog = await openSkillDialog(pane, "code-review", "Claude Code");
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Import 1 skill" }),
    );

    expect(
      await screen.findByText("harness view code-review"),
    ).toBeInTheDocument();
    expect(sent).toEqual([
      { target: { kind: "global" }, names: ["code-review"], undo: [] },
    ]);
  });
});
