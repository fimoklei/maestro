import { waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectDescription } from "../test-utils";
import {
  globalAnswer,
  openPane,
  RECENT,
  renderDeployState,
  stubServer,
} from "./deploy-state-test-helpers";

// Each skill row in the Global pane: its worst reading across Global's
// written folders, and the folder that deviates (#1811).

afterEach(() => {
  vi.unstubAllGlobals();
});

const CLAUDE = "~/.claude/skills";
const AGENTS = "~/.agents/skills";

const skill = (name: string, copy?: string) => ({
  type: "skill",
  name,
  version: "v0.4.1",
  ...(copy ? { copy } : {}),
});

const HEAD = {
  release: "v0.4.1",
  latestRelease: "v0.4.1",
  changed: 0,
  changedSkills: [],
  selection: ["workflow-commit", "show-me", "tdd"],
  selected: 3,
  comparedAt: RECENT(),
};

type Folder = ReturnType<typeof globalAnswer>["folders"][number] &
  Record<string, unknown>;

// A third written folder: only two tools ship, but the row counts any number.
const THIRD = "~/.third/skills";
const third = (
  primitives: ReturnType<typeof skill>[],
  facts: Record<string, unknown> = {},
): Folder => ({
  path: THIRD,
  tool: "codex",
  detected: true,
  primitives,
  ...facts,
});

/** Global's answer with each folder's own facts laid over its copies. */
function stubGlobal(
  copies: Parameters<typeof globalAnswer>[0],
  facts: Partial<Record<string, Record<string, unknown>>> = {},
  extraFolders: Folder[] = [],
) {
  const answer = globalAnswer(copies, { releaseHead: HEAD });
  stubServer(() => ({
    global: {
      ...answer,
      folders: [
        ...answer.folders.map((folder) => ({
          ...folder,
          ...facts[folder.path],
        })),
        ...extraFolders,
      ],
    },
  }));
}

/** A skill row as the reader sees it: its mark, its name and its value. */
async function skillRow(name: string) {
  const pane = await openPane("Global");
  const heading = within(pane).getByRole("heading", {
    level: 3,
    name: /Deployed skills/,
  });
  const list = heading.closest("section")?.querySelector("ul") as HTMLElement;
  const find = () => {
    const item = within(list)
      .getAllByRole("listitem")
      .find((each) => within(each).queryByText(name, { exact: true }));
    if (item === undefined) throw new Error(`no skill row for ${name}`);
    return item;
  };
  return {
    mark: () => within(find()).getByRole("img"),
    value: () => find().textContent?.split(name)[1] ?? "",
    /** Whether the value is set as a machine value, in mono. */
    valueIsMachine: () =>
      find().querySelector("li > span:nth-child(3) .font-mono") !== null,
  };
}

describe("Deploy-state pane — Global skill rows", () => {
  it("reads Local edits with Both folders for a skill missing in one folder and edited in the other", async () => {
    stubGlobal(
      {
        claude: [skill("show-me", "local-edits"), skill("tdd")],
        codex: [skill("tdd")],
      },
      { [AGENTS]: { missing: ["show-me"] } },
    );
    renderDeployState();
    const row = await skillRow("show-me");

    await waitFor(() => expect(row.mark()).toHaveAccessibleName("Local edits"));
    expect(row.value()).toBe("Both folders");
    expect(row.valueIsMachine()).toBe(false);
    expectDescription(row.mark(), `In ${CLAUDE} and ${AGENTS}.`);
  });

  it("counts some of three folders as {n} folders and lists them in the hover", async () => {
    stubGlobal(
      {
        claude: [skill("tdd", "local-edits")],
        codex: [skill("tdd", "local-edits")],
      },
      {},
      [third([skill("tdd")])],
    );
    renderDeployState();
    const row = await skillRow("tdd");

    await waitFor(() => expect(row.mark()).toHaveAccessibleName("Local edits"));
    expect(row.value()).toBe("2 folders");
    expectDescription(row.mark(), `In ${CLAUDE} and ${AGENTS}.`);
  });

  it("counts all of three folders as All {n} folders and lists them in the hover", async () => {
    stubGlobal(
      {
        claude: [skill("tdd", "local-edits")],
        codex: [skill("tdd")],
      },
      { [AGENTS]: { notUpdated: [{ name: "tdd", stillAt: "v0.4.0" }] } },
      [third([skill("tdd")], { missing: ["tdd"] })],
    );
    renderDeployState();
    const row = await skillRow("tdd");

    await waitFor(() => expect(row.mark()).toHaveAccessibleName("Local edits"));
    expect(row.value()).toBe("All 3 folders");
    expectDescription(row.mark(), `In ${CLAUDE}, ${AGENTS} and ${THIRD}.`);
  });

  it("reads Missing with the folder that lacks the skill", async () => {
    stubGlobal(
      { claude: [skill("show-me"), skill("tdd")], codex: [skill("tdd")] },
      { [AGENTS]: { missing: ["show-me"] } },
    );
    renderDeployState();
    const row = await skillRow("show-me");

    await waitFor(() => expect(row.mark()).toHaveAccessibleName("Missing"));
    expect(row.value()).toBe(AGENTS);
    expect(row.valueIsMachine()).toBe(true);
    expectDescription(row.mark(), `No copy in ${AGENTS}.`);
  });

  it("reads Not updated with the release its one copy is still at", async () => {
    stubGlobal(
      { claude: [skill("tdd")], codex: [skill("tdd")] },
      { [AGENTS]: { notUpdated: [{ name: "tdd", stillAt: "v0.4.0" }] } },
    );
    renderDeployState();
    const row = await skillRow("tdd");

    await waitFor(() => expect(row.mark()).toHaveAccessibleName("Not updated"));
    expect(row.value()).toBe(AGENTS);
    expectDescription(
      row.mark(),
      `tdd in ${AGENTS} is still at v0.4.0, but the Target release is v0.4.1.`,
    );
  });

  it("reads Not updated with no older release where none matches", async () => {
    stubGlobal(
      { claude: [skill("tdd")], codex: [skill("tdd")] },
      { [AGENTS]: { notUpdated: [{ name: "tdd", stillAt: null }] } },
    );
    renderDeployState();
    const row = await skillRow("tdd");

    await waitFor(() => expect(row.mark()).toHaveAccessibleName("Not updated"));
    expectDescription(
      row.mark(),
      `tdd in ${AGENTS} is not at the Target release v0.4.1.`,
    );
  });

  it("keeps a clean skill's version and its Up to date mark", async () => {
    stubGlobal({ claude: [skill("tdd")], codex: [skill("tdd")] });
    renderDeployState();
    const row = await skillRow("tdd");

    await waitFor(() => expect(row.mark()).toHaveAccessibleName("Up to date"));
    expect(row.value()).toBe("v0.4.1");
  });

  it("changes no skill row for a copy in a folder whose tool is not detected", async () => {
    stubGlobal(
      { claude: [skill("tdd", "local-edits")] },
      {
        [AGENTS]: {
          primitives: [skill("tdd", "local-edits")],
          missing: ["tdd"],
          notUpdated: [{ name: "tdd", stillAt: "v0.4.0" }],
          strayCopies: [{ name: "tdd", atRelease: false }],
        },
      },
    );
    renderDeployState();
    const row = await skillRow("tdd");

    await waitFor(() => expect(row.mark()).toHaveAccessibleName("Local edits"));
    expect(row.value()).toBe(CLAUDE);
    expectDescription(row.mark(), `In ${CLAUDE}.`);
  });
});
