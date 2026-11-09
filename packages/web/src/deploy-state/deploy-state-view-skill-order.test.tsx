import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../test-utils";
import {
  globalAnswer,
  openPane,
  RECENT,
  renderDeployState,
  type ServerState,
  stubServer,
} from "./deploy-state-test-helpers";

// Deployed skills lists the rows that need work first, worst first (#1811).

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

/** Global with the given copies in both folders, `missing` lacking from the second. */
function global(copies: ReturnType<typeof skill>[], missing: string[] = []) {
  const answer = globalAnswer(
    {
      claude: copies,
      codex: copies.filter((each) => !missing.includes(each.name)),
    },
    { releaseHead: HEAD },
  );
  return {
    ...answer,
    folders: answer.folders.map((folder) =>
      folder.path === AGENTS ? { ...folder, missing } : folder,
    ),
  };
}

/** The skill names in Deployed skills, top to bottom. */
function deployedSkills(pane: HTMLElement): string[] {
  const heading = within(pane).getByRole("heading", {
    level: 3,
    name: /Deployed skills/,
  });
  const list = heading.closest("section")?.querySelector("ul") as HTMLElement;
  return within(list)
    .getAllByRole("listitem")
    .map(
      (item) => item.querySelector("li > span:nth-child(2)")?.textContent ?? "",
    );
}

describe("Deploy-state pane — Deployed skills order", () => {
  it("lists Global's rows that need work first, worst first, then the clean rows", async () => {
    stubServer(() => ({
      global: global(
        [
          skill("tdd"),
          skill("show-me"),
          skill("jobs"),
          skill("workflow-commit", "local-edits"),
        ],
        ["show-me"],
      ),
    }));
    renderDeployState();
    const pane = await openPane("Global");

    await waitFor(() =>
      expect(deployedSkills(pane)).toEqual([
        "workflow-commit",
        "show-me",
        "tdd",
        "jobs",
      ]),
    );
  });

  it("lists a repository's rows that need work first", async () => {
    stubServer(() => ({
      repos: ["/Users/me/project"],
      repo: {
        "/Users/me/project": {
          primitives: [
            skill("tdd"),
            skill("jobs", "unverified"),
            skill("ship", "local-edits"),
          ],
          skipped: [],
        },
      },
    }));
    renderDeployState();
    const pane = await openPane("…/me/project");

    await waitFor(() =>
      expect(deployedSkills(pane)).toEqual(["ship", "jobs", "tdd"]),
    );
  });

  it("keeps the rows in their order until the first update check answers", async () => {
    stubServer(() => ({
      global: global([skill("tdd"), skill("show-me")], ["show-me"]),
      drift: { global: new Promise(() => {}) },
    }));
    renderDeployState();
    const pane = await openPane("Global");

    await within(pane).findByRole("img", { name: "Missing" });
    expect(deployedSkills(pane)).toEqual(["tdd", "show-me"]);
  });

  it("orders again after a read, and not before it answers", async () => {
    let state: ServerState = {
      global: global([skill("tdd"), skill("show-me")], ["show-me"]),
    };
    stubServer(() => state);
    renderDeployState();
    const pane = await openPane("Global");
    await waitFor(() =>
      expect(deployedSkills(pane)).toEqual(["show-me", "tdd"]),
    );

    let answer: (response: unknown) => void = () => {};
    const fixed = global([skill("tdd", "local-edits"), skill("show-me")]);
    state = {
      global: new Promise((resolve) => {
        answer = resolve;
      }).then(() => jsonResponse(fixed)),
    };
    // By keyboard: a press outside the pane would close it.
    screen.getByRole("button", { name: "Re-read Deploy-state" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(pane).toBeInTheDocument();
    expect(deployedSkills(pane)).toEqual(["show-me", "tdd"]);

    answer(null);
    await waitFor(() =>
      expect(deployedSkills(pane)).toEqual(["tdd", "show-me"]),
    );
  });
});
