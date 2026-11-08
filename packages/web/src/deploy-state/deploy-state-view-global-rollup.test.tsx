import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hoverOpen, sentence } from "../test-utils";
import {
  cellsOf,
  factValue,
  findRow,
  globalAnswer,
  openPane,
  RECENT,
  renderDeployState,
  rowOf,
  stubServer,
} from "./deploy-state-test-helpers";

// Global's one Status when its folders deviate in more than one way (#1811).

afterEach(() => {
  vi.unstubAllGlobals();
});

const skill = (name: string, version = "v0.4.1", copy?: string) => ({
  type: "skill",
  name,
  version,
  ...(copy ? { copy } : {}),
});

const head = (latestRelease: string) => ({
  release: "v0.4.1",
  latestRelease,
  changed: 1,
  changedSkills: ["show-me"],
  selection: ["workflow-commit", "workflow-ship", "show-me", "tdd"],
  selected: 4,
  comparedAt: RECENT(),
});

type Deviations = {
  missing: boolean;
  notUpdated: boolean;
  behind: boolean;
};

// Where `edits`, every copy of workflow-commit and workflow-ship holds local edits.
function globalWith({ missing, notUpdated, behind }: Deviations, edits = true) {
  const copy = edits ? "local-edits" : undefined;
  const edited = [
    skill("workflow-commit", "v0.4.1", copy),
    skill("workflow-ship", "v0.4.1", copy),
  ];
  const answer = globalAnswer(
    {
      claude: [...edited, skill("show-me"), skill("tdd")],
      codex: [...edited, ...(missing ? [] : [skill("show-me")]), skill("tdd")],
    },
    { releaseHead: head(behind ? "v0.4.3" : "v0.4.1") },
  );
  const [claude, agents] = answer.folders;
  return {
    ...answer,
    folders: [
      claude,
      {
        ...agents,
        ...(missing ? { missing: ["show-me"] } : {}),
        ...(notUpdated
          ? { notUpdated: [{ name: "tdd", stillAt: "v0.4.0" }] }
          : {}),
      },
    ],
  };
}

const COMBINATIONS: Deviations[] = [false, true].flatMap((missing) =>
  [false, true].flatMap((notUpdated) =>
    [false, true].map((behind) => ({ missing, notUpdated, behind })),
  ),
);

describe("Deploy-state — Global roll-up", () => {
  it.each(COMBINATIONS)(
    "reads Local edits where a copy holds work (missing $missing, not updated $notUpdated, behind $behind)",
    async (deviations) => {
      stubServer(() => ({ global: globalWith(deviations) }));
      renderDeployState();
      await findRow("Global");

      await waitFor(() => expect(cellsOf("Global")[1]).toBe("Local edits"));
      // Behind keeps its own axis in the Release column.
      expect(cellsOf("Global")[2]).toBe(
        deviations.behind ? "v0.4.1 → v0.4.3" : "v0.4.1",
      );
    },
  );

  it("marks a folder that holds local edits, lacks a skill and lags as Local edits", async () => {
    stubServer(() => ({
      global: globalWith({ missing: true, notUpdated: true, behind: false }),
    }));
    renderDeployState();
    const pane = await openPane("Global");

    const folders = within(pane).getByRole("list", { name: "Global folders" });
    await waitFor(() =>
      // Each row's glyph and word, before its path.
      expect(
        within(folders)
          .getAllByRole("listitem")
          .map((item) => item.textContent?.split("~")[0]),
      ).toEqual(["⚠Local edits", "⚠Local edits"]),
    );
  });
});

describe("Deploy-state — band with a Global that reads Local edits", () => {
  it("counts Global's top reading only, so no Skills missing chip shows", async () => {
    stubServer(() => ({
      global: globalWith({ missing: true, notUpdated: true, behind: true }),
    }));
    renderDeployState();
    await waitFor(() => expect(cellsOf("Global")[1]).toBe("Local edits"));

    const chips = screen
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("data-count"))
      .map((chip) => chip.textContent);
    expect(chips).toEqual(["Local edits 1"]);
  });

  it("leaves Global out of the Skills missing status filter", async () => {
    stubServer(() => ({
      global: globalWith({ missing: true, notUpdated: false, behind: false }),
    }));
    renderDeployState();
    await waitFor(() => expect(cellsOf("Global")[1]).toBe("Local edits"));

    await userEvent.click(screen.getByRole("button", { name: /^Filter/ }));
    await userEvent.click(
      await screen.findByRole("menuitemcheckbox", { name: "Skills missing" }),
    );
    await userEvent.keyboard("{Escape}");

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "No targets match the filters",
      }),
    ).toBeInTheDocument();
  });
});

// The pane paragraph's lines, found by the one it must hold.
function paragraphLines(pane: HTMLElement, first: string) {
  const line = within(pane).getByText(sentence(first));
  return Array.from(
    (line.closest("p") as HTMLElement).children,
    (each) => each.textContent,
  );
}

const KEEP_BEFORE_UPDATE =
  "2 skills have changes that are not in the latest release. To keep them, select Import local edits before you update.";
const KEEP_THEM =
  "2 skills have changes that are not in the latest release. Select Import local edits to keep them.";

describe("Deploy-state — Global pane paragraph", () => {
  it("says to import before you update where Global is behind, naming no folder or skill", async () => {
    stubServer(() => ({
      global: globalWith({ missing: true, notUpdated: true, behind: true }),
    }));
    renderDeployState();
    const pane = await openPane("Global");

    await waitFor(() =>
      expect(paragraphLines(pane, KEEP_BEFORE_UPDATE)).toEqual([
        KEEP_BEFORE_UPDATE,
      ]),
    );
    expect(within(pane).queryByText(/missing in|still at/)).toBeNull();
  });

  it("says to import to keep them where Global is not behind", async () => {
    stubServer(() => ({
      global: globalWith({ missing: true, notUpdated: true, behind: false }),
    }));
    renderDeployState();
    const pane = await openPane("Global");

    await waitFor(() =>
      expect(paragraphLines(pane, KEEP_THEM)).toEqual([KEEP_THEM]),
    );
  });

  it("takes the not-behind form where the update check did not run", async () => {
    const answer = globalWith({
      missing: false,
      notUpdated: false,
      behind: false,
    });
    stubServer(() => ({
      global: {
        ...answer,
        releaseHead: { ...head("v0.4.1"), latestRelease: null },
      },
    }));
    renderDeployState();
    const pane = await openPane("Global");

    await waitFor(() =>
      expect(paragraphLines(pane, KEEP_THEM)).toEqual([KEEP_THEM]),
    );
  });

  it("shows the Behind line and no primary in the foot where no copy holds local edits", async () => {
    stubServer(() => ({
      global: globalWith(
        { missing: true, notUpdated: true, behind: true },
        false,
      ),
    }));
    renderDeployState();
    await waitFor(() => expect(cellsOf("Global")[1]).toBe("Skills missing"));
    const pane = await openPane("Global");

    const behindLine =
      "1 of 4 deployed skills changed in v0.4.3. Select Update target to move this target to v0.4.3.";
    expect(paragraphLines(pane, behindLine)).toEqual([behindLine]);
    // Update target sits beside the Latest release fact, not in the foot.
    const foot = within(pane)
      .getByRole("button", { name: "Actions for Global" })
      .closest("div") as HTMLElement;
    expect(
      within(foot)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["⋯"]);
    expect(
      within(factValue(pane, "Latest release") as HTMLElement).getByRole(
        "button",
        { name: "Update target Global" },
      ),
    ).toBeInTheDocument();
  });

  it("shows no paragraph on a Global that is not behind and holds no local edits", async () => {
    stubServer(() => ({
      global: globalWith(
        { missing: true, notUpdated: true, behind: false },
        false,
      ),
    }));
    renderDeployState();
    await waitFor(() => expect(cellsOf("Global")[1]).toBe("Skills missing"));
    const pane = await openPane("Global");

    expect(
      within(pane).queryByText(/missing in|still at|changed in|changes/),
    ).toBeNull();
  });
});

// The card's lines: one reason, then the read age.
async function statusCardLines(word: string) {
  await waitFor(() => expect(cellsOf("Global")[1]).toBe(word));
  await hoverOpen(within(rowOf("Global")).getByText(word));
  const age = await screen.findByText("Read just now");
  return Array.from(
    (age.parentElement as HTMLElement).querySelectorAll("p"),
    (line) => line.textContent,
  );
}

describe("Deploy-state — Global's Status hover card while behind", () => {
  it("names the newer release to import before, where Local edits wins", async () => {
    stubServer(() => ({
      global: globalWith({ missing: true, notUpdated: false, behind: true }),
    }));
    renderDeployState();

    expect(await statusCardLines("Local edits")).toEqual([
      "2 skills have changes that are not in the latest release: workflow-commit and workflow-ship. To keep them, select Import local edits before you update to v0.4.3.",
      "Read just now",
    ]);
  });

  it("adds that Global is also behind, where Skills missing wins", async () => {
    stubServer(() => ({
      global: globalWith(
        { missing: true, notUpdated: false, behind: true },
        false,
      ),
    }));
    renderDeployState();

    expect(await statusCardLines("Skills missing")).toEqual([
      "1 of 4 deployed skills is missing in ~/.agents/skills. Global is also behind: 1 of 4 deployed skills changed in v0.4.3.",
      "Read just now",
    ]);
  });
});
