import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  globalAnswer,
  openPane,
  RECENT,
  renderDeployState,
  stubServer,
} from "./deploy-state-test-helpers";

// When Deployed skills does not fit the pane, the rows Up to date in every
// folder fold into one closed group (#1811).

afterEach(() => {
  vi.unstubAllGlobals();
});

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
  selection: [],
  selected: 0,
  comparedAt: RECENT(),
};

const CLEAN = Array.from({ length: 11 }, (_, index) => skill(`clean-${index}`));

/** Global with 14 skills: one edited, one missing in the second folder, one not updated there. */
function fourteen() {
  const copies = [
    ...CLEAN,
    skill("workflow-commit", "local-edits"),
    skill("show-me"),
    skill("jobs"),
  ];
  const answer = globalAnswer(
    {
      claude: copies,
      codex: copies.filter((each) => each.name !== "show-me"),
    },
    { releaseHead: HEAD },
  );
  return {
    ...answer,
    folders: answer.folders.map((folder) =>
      folder.path === AGENTS
        ? {
            ...folder,
            missing: ["show-me"],
            notUpdated: [{ name: "jobs", stillAt: "v0.4.0" }],
          }
        : folder,
    ),
  };
}

function deployedList(pane: HTMLElement): HTMLElement {
  const heading = within(pane).getByRole("heading", {
    level: 3,
    name: /Deployed skills/,
  });
  return heading.closest("section")?.querySelector("ul") as HTMLElement;
}

/** The skill rows shown in the list, top to bottom, group rows included once open. */
const shownSkills = (list: HTMLElement) =>
  within(list)
    .queryAllByRole("button", { name: /^Actions for / })
    .map((menu) =>
      (menu.getAttribute("aria-label") ?? "").replace("Actions for ", ""),
    );

describe("Deploy-state pane — Deployed skills fold", () => {
  it("shows every row and no group when the list fits", async () => {
    stubServer(() => ({ global: fourteen() }));
    renderDeployState(undefined, { fits: true });
    const pane = await openPane("Global");

    await waitFor(() =>
      expect(shownSkills(deployedList(pane))).toHaveLength(14),
    );
    expect(
      within(pane).queryByRole("button", { name: /^Up to date/ }),
    ).toBeNull();
  });

  it("folds only the rows Up to date in every folder into one closed group", async () => {
    stubServer(() => ({ global: fourteen() }));
    renderDeployState(undefined, { fits: false });
    const pane = await openPane("Global");

    const group = await within(pane).findByRole("button", {
      name: "Up to date, 11",
    });
    expect(group).toHaveAttribute("aria-expanded", "false");
    const list = deployedList(pane);
    expect(list).toContainElement(group);
    expect(shownSkills(list)).toEqual(["workflow-commit", "show-me", "jobs"]);
  });

  it("opens the group by keyboard, its rows inside the same list under a heading that counts all 14", async () => {
    stubServer(() => ({ global: fourteen() }));
    renderDeployState(undefined, { fits: false });
    const pane = await openPane("Global");
    const group = await within(pane).findByRole("button", {
      name: "Up to date, 11",
    });

    group.focus();
    await userEvent.keyboard("{Enter}");

    expect(group).toHaveAttribute("aria-expanded", "true");
    expect(group).toHaveAccessibleName("Up to date, 11");
    expect(shownSkills(deployedList(pane))).toHaveLength(14);
    expect(
      within(pane).getByRole("heading", {
        level: 3,
        name: "Deployed skills 14",
      }),
    ).toBeInTheDocument();
  });

  it("keeps an opened group open across a Re-read", async () => {
    stubServer(() => ({ global: fourteen() }));
    const { queryClient } = renderDeployState(undefined, { fits: false });
    const pane = await openPane("Global");
    const group = await within(pane).findByRole("button", {
      name: "Up to date, 11",
    });
    await userEvent.click(group);

    await queryClient.refetchQueries();

    await waitFor(() =>
      expect(
        within(pane).getByRole("button", { name: "Up to date, 11" }),
      ).toHaveAttribute("aria-expanded", "true"),
    );
    expect(screen.getByRole("complementary", { name: "Global detail" })).toBe(
      pane,
    );
  });

  it("folds a repository's clean rows the same way", async () => {
    stubServer(() => ({
      repos: ["/Users/me/project"],
      repo: {
        "/Users/me/project": {
          primitives: [
            skill("tdd"),
            skill("ship", "local-edits"),
            skill("jobs"),
          ],
          skipped: [],
        },
      },
    }));
    renderDeployState(undefined, { fits: false });
    const pane = await openPane("…/me/project");

    await within(pane).findByRole("button", { name: "Up to date, 2" });
    expect(shownSkills(deployedList(pane))).toEqual(["ship"]);
  });
});
