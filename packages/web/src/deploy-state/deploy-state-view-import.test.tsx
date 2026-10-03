import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../test-utils";
import {
  findRow,
  importRoutes,
  landed,
  openPane,
  renderDeployState,
  stubServer,
} from "./deploy-state-test-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

const REPO = "/Users/me/project";
const ROW = "…/me/project";
const TARGET = { kind: "repo", repoPath: REPO };

const edited = (...names: string[]) => ({
  primitives: names.map((name) => ({
    type: "skill",
    name,
    version: "v0.3.5",
    copy: "local-edits",
  })),
  skipped: [],
});

// The check answers `skills`; the run answers `run`, and every body sent is kept.
function stubImport(
  names: string[],
  run: (names: string[]) => Response | Promise<Response>,
  check: () => Response | Promise<Response> = () =>
    jsonResponse({ skills: names.map((name) => ({ name, refusal: null })) }),
) {
  const { sent, other } = importRoutes(check, run);
  stubServer(() => ({
    repos: [REPO],
    repo: { [REPO]: edited(...names) },
    other,
  }));
  return sent;
}

async function openDialog() {
  const pane = await openPane(ROW);
  await userEvent.click(
    within(pane).getByRole("button", { name: "Import local edits" }),
  );
  return screen.findByRole("dialog", {
    name: `Import local edits from ${ROW}`,
  });
}

describe("Deploy-state — Import local edits on a repository", () => {
  it("leads the row's menu with Import local edits", async () => {
    stubImport(["tdd"], landed);
    renderDeployState();

    await userEvent.click(
      within(await findRow(ROW)).getByRole("button", {
        name: `Actions for ${ROW}`,
      }),
    );
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Import local edits",
      "Deploy skill",
    ]);
  });

  it("states the check while it runs", async () => {
    stubImport(["tdd"], landed, () => new Promise<Response>(() => {}));
    renderDeployState();

    const dialog = await openDialog();

    expect(
      within(dialog).getByText("Checking for local edits…"),
    ).toBeInTheDocument();
  });

  it("lists every eligible skill checked, and the confirm follows the checks", async () => {
    stubImport(["code-review", "tdd"], landed);
    renderDeployState();

    const dialog = await openDialog();
    const group = await within(dialog).findByRole("group", {
      name: "Can be imported · 2",
    });
    const boxes = within(group).getAllByRole("checkbox");
    expect(boxes.map((box) => (box as HTMLInputElement).checked)).toEqual([
      true,
      true,
    ]);
    expect(boxes[0]).toHaveFocus();
    expect(
      within(dialog).getByRole("button", { name: "Import 2 skills" }),
    ).toBeInTheDocument();

    await userEvent.click(within(group).getByRole("checkbox", { name: "tdd" }));
    expect(
      within(dialog).getByRole("button", { name: "Import 1 skill" }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(group).getByRole("checkbox", { name: "code-review" }),
    );
    expect(
      within(dialog).getByRole("button", {
        name: "Import skills — none selected",
      }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("ignores a click outside once a check has changed", async () => {
    stubImport(["code-review", "tdd"], landed);
    renderDeployState();

    const dialog = await openDialog();
    await userEvent.click(
      await within(dialog).findByRole("checkbox", { name: "tdd" }),
    );
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);

    expect(dialog).toBeInTheDocument();
  });

  it("imports the checked skills and opens the one that landed on the Harness screen", async () => {
    const sent = stubImport(["code-review", "tdd"], landed);
    renderDeployState();

    const dialog = await openDialog();
    const group = await within(dialog).findByRole("group", {
      name: "Can be imported · 2",
    });
    await userEvent.click(within(group).getByRole("checkbox", { name: "tdd" }));
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Import 1 skill" }),
    );

    expect(
      await screen.findByText("harness view code-review"),
    ).toBeInTheDocument();
    expect(sent).toEqual([
      { target: TARGET, names: ["code-review"], undo: [] },
    ]);
  });

  it("opens no skill and confirms several landed skills in a toast", async () => {
    stubImport(["code-review", "tdd"], landed);
    renderDeployState();

    const dialog = await openDialog();
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Import 2 skills" }),
    );

    expect(
      await screen.findByText("harness view with no skill open"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Imported 2 skills.")).toBeInTheDocument();
  });

  it("locks every close route while the import runs", async () => {
    stubImport(["tdd"], () => new Promise<Response>(() => {}));
    renderDeployState();

    const dialog = await openDialog();
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Import 1 skill" }),
    );

    expect(
      await within(dialog).findByRole("button", { name: "Importing…" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(dialog).toBeInTheDocument();
  });

  it("lists a refused skill disabled with its reason and leaves it out of the run", async () => {
    const sent = stubImport(["code-review", "tdd"], landed, () =>
      jsonResponse({
        skills: [
          { name: "code-review", refusal: null },
          { name: "tdd", refusal: "deployed-copy" },
        ],
      }),
    );
    renderDeployState();

    const dialog = await openDialog();
    const refused = await within(dialog).findByRole("group", {
      name: "✕ Cannot be imported · 1",
    });
    const box = within(refused).getByRole("checkbox", { name: "tdd" });
    expect(box).toHaveAttribute("aria-disabled", "true");
    expect(box).not.toBeChecked();
    expect(box).toHaveAccessibleDescription(
      "Deployed by another Harness. Make the change in that Harness.",
    );
    box.focus();
    expect(box).toHaveFocus();
    await userEvent.click(box);
    expect(box).not.toBeChecked();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Import 1 skill" }),
    );
    await screen.findByText("harness view code-review");
    expect(sent).toEqual([
      { target: TARGET, names: ["code-review"], undo: [] },
    ]);
  });

  it("lists a skill that undoes newer Harness changes unchecked, and sends it only once checked", async () => {
    const sent = stubImport(["code-review", "tdd"], landed, () =>
      jsonResponse({
        skills: [
          { name: "code-review", refusal: null },
          { name: "tdd", refusal: null, undoesNewerSince: "v0.3.5" },
        ],
      }),
    );
    renderDeployState();

    const dialog = await openDialog();
    const flagged = await within(dialog).findByRole("group", {
      name: "▲ Undoes newer Harness changes · 1",
    });
    const box = within(flagged).getByRole("checkbox", { name: "tdd" });
    expect(box).not.toBeChecked();
    expect(box).toHaveAccessibleDescription(
      "Deployed from release v0.3.5. Importing undoes newer Harness changes to this skill.",
    );
    expect(
      within(dialog).getByRole("group", { name: "Can be imported · 1" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Import 1 skill" }),
    ).toBeInTheDocument();

    await userEvent.click(box);
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: "Import 2 skills · 1 undoes newer changes",
      }),
    );

    await screen.findByText("harness view with no skill open");
    expect(sent).toEqual([
      { target: TARGET, names: ["code-review", "tdd"], undo: ["tdd"] },
    ]);
  });

  it("names both folders in mono where a skill's tool copies differ", async () => {
    stubImport(["code-review", "tdd"], landed, () =>
      jsonResponse({
        skills: [
          { name: "code-review", refusal: null },
          {
            name: "tdd",
            refusal: "copies-differ",
            folders: {
              claude: "~/.claude/skills/tdd",
              codex: "~/.agents/skills/tdd",
            },
          },
        ],
      }),
    );
    renderDeployState();

    const dialog = await openDialog();
    const refused = await within(dialog).findByRole("group", {
      name: "✕ Cannot be imported · 1",
    });

    const box = within(refused).getByRole("checkbox", { name: "tdd" });
    // textContent, not the computed description: jsdom pads a <code> with
    // spaces no browser adds.
    expect(
      document.getElementById(box.getAttribute("aria-describedby") ?? "")
        ?.textContent,
    ).toBe(
      "The Claude Code and Codex copies differ. Select Import skill… on the Harness screen and pick one: ~/.claude/skills/tdd or ~/.agents/skills/tdd.",
    );
    expect(
      within(refused)
        .getAllByRole("code")
        .map((path) => path.textContent),
    ).toEqual(["~/.claude/skills/tdd", "~/.agents/skills/tdd"]);
  });

  it("blocks the confirm when no skill qualifies", async () => {
    stubImport(["tdd"], landed, () =>
      jsonResponse({ skills: [{ name: "tdd", refusal: "unverified" }] }),
    );
    renderDeployState();

    const dialog = await openDialog();

    expect(
      await within(dialog).findByRole("button", {
        name: "Import skills — no skill qualifies",
      }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(within(dialog).getByRole("checkbox", { name: "tdd" })).toHaveFocus();
    expect(
      within(dialog).queryByRole("group", { name: /Can be imported/ }),
    ).toBeNull();
  });

  it("states no local edits when the check lists no skill", async () => {
    stubImport(["tdd"], landed, () => jsonResponse({ skills: [] }));
    renderDeployState();

    const dialog = await openDialog();

    expect(await within(dialog).findByText("No local edits")).toBeVisible();
    expect(
      within(dialog).getByText(`No skill on ${ROW} changed after deployment.`),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole("checkbox")).toBeNull();
  });

  it("states a failed check as nothing imported", async () => {
    stubImport(["tdd"], landed, () => jsonResponse({ error: "internal" }, 500));
    renderDeployState();

    const dialog = await openDialog();

    expect(
      await within(dialog).findByText("Local edits not checked"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Nothing was imported. Select Close, then Import local edits again.",
      ),
    ).toBeInTheDocument();
  });

  it("stays open with a Report naming each refused skill's reason", async () => {
    stubImport(["code-review", "tdd"], () =>
      jsonResponse({
        outcomes: [
          { name: "code-review", refusal: null },
          { name: "tdd", refusal: "harness-copy-uncommitted" },
        ],
      }),
    );
    renderDeployState();

    const dialog = await openDialog();
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Import 2 skills" }),
    );

    const refused = await within(dialog).findByRole("region", {
      name: "Not imported 1",
    });
    expect(
      within(refused).getByText(
        "The Harness clone has uncommitted changes to this skill. Undo them, or select Propose change, merge on GitHub and pull first.",
      ),
    ).toBeInTheDocument();
    const imported = within(dialog).getByRole("region", {
      name: "Imported 1",
    });
    expect(within(imported).getByText("code-review")).toBeInTheDocument();
    expect(
      within(imported).getByText(
        "Each is now a Pending proposal on the Harness screen. Select Propose change there.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(expect.arrayContaining(["Close"]));
    expect(
      within(dialog).queryByRole("button", { name: /^Import/ }),
    ).toBeNull();
  });

  it("states an unanswered run as possibly landed", async () => {
    stubImport(["tdd"], () => Promise.reject(new TypeError("fetch failed")));
    renderDeployState();

    const dialog = await openDialog();
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Import 1 skill" }),
    );

    expect(
      await within(dialog).findByText("Import not confirmed"),
    ).toBeInTheDocument();
  });

  it("states a held Harness lock and imports nothing", async () => {
    stubImport(["tdd"], () =>
      jsonResponse({ error: "import-in-progress" }, 409),
    );
    renderDeployState();

    const dialog = await openDialog();
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Import 1 skill" }),
    );

    expect(
      await within(dialog).findByText("Harness already changing"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Wait for that change to finish, then select Import local edits again.",
      ),
    ).toBeInTheDocument();
  });
});
