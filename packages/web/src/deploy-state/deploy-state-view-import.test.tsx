import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../test-utils";
import {
  findRow,
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
  const sent: unknown[] = [];
  stubServer(() => ({
    repos: [REPO],
    repo: { [REPO]: edited(...names) },
    other: (url, init) => {
      if (url === "/api/deploy/import-local-edits/check") {
        return check();
      }
      if (url === "/api/deploy/import-local-edits") {
        const body = JSON.parse(String(init?.body)) as { names: string[] };
        sent.push(body);
        return run(body.names);
      }
      throw new Error(`unexpected request ${url}`);
    },
  }));
  return sent;
}

const landed = (names: string[]) =>
  jsonResponse({ outcomes: names.map((name) => ({ name, refusal: null })) });

async function openDialog() {
  const pane = await openPane(ROW);
  await userEvent.click(
    within(pane).getByRole("button", { name: "Import local edits…" }),
  );
  return screen.findByRole("dialog", {
    name: `Import local edits from ${ROW}`,
  });
}

describe("Deploy-state — Import local edits… on a repository", () => {
  it("leads the row's menu with Import local edits…", async () => {
    stubImport(["tdd"], landed);
    renderDeployState();

    await userEvent.click(
      within(await findRow(ROW)).getByRole("button", {
        name: `Actions for ${ROW}`,
      }),
    );
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Import local edits…",
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
    expect(sent).toEqual([{ target: TARGET, names: ["code-review"] }]);
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
        "Wait for that change to finish, then select Import local edits… again.",
      ),
    ).toBeInTheDocument();
  });
});
