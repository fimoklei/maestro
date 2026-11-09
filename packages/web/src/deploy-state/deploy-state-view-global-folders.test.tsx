import { waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  globalAnswer,
  openPane,
  RECENT,
  renderDeployState,
  stubServer,
} from "./deploy-state-test-helpers";

// Each Global folder row in the Global pane: its word and its counts (#1811).

afterEach(() => {
  vi.unstubAllGlobals();
});

const skill = (name: string, copy?: string) => ({
  type: "skill",
  name,
  version: "v0.4.1",
  ...(copy ? { copy } : {}),
});

const head = (latestRelease: string) => ({
  release: "v0.4.1",
  latestRelease,
  changed: latestRelease === "v0.4.1" ? 0 : 1,
  changedSkills: latestRelease === "v0.4.1" ? [] : ["tdd"],
  selection: ["workflow-commit", "workflow-ship", "show-me", "tdd"],
  selected: 4,
  comparedAt: RECENT(),
});

const CLAUDE_READERS = "Read by Claude Code, Cursor and OpenCode";
const CODEX_READERS =
  "Read by Codex, Copilot CLI, Cursor, Gemini CLI and others";

// Each folder row as read: its glyph and word, its path, its meta line.
async function folderRows() {
  const pane = await openPane("Global");
  const list = within(pane).getByRole("list", { name: "Global folders" });
  return () =>
    within(list)
      .getAllByRole("listitem")
      .map((item) => item.textContent);
}

describe("Deploy-state pane — Global folder rows", () => {
  it("shows each folder's word and counts its skills per reading", async () => {
    const edited = [
      skill("workflow-commit", "local-edits"),
      skill("workflow-ship", "local-edits"),
    ];
    const answer = globalAnswer(
      {
        claude: [...edited, skill("show-me"), skill("tdd")],
        codex: [...edited, skill("tdd")],
      },
      { releaseHead: head("v0.4.1") },
    );
    const [claude, agents] = answer.folders;
    stubServer(() => ({
      global: {
        ...answer,
        folders: [
          claude,
          {
            ...agents,
            missing: ["show-me"],
            notUpdated: [{ name: "tdd", stillAt: "v0.4.0" }],
          },
        ],
      },
    }));
    renderDeployState();
    const rows = await folderRows();

    await waitFor(() =>
      expect(rows()).toEqual([
        `⚠Local edits~/.claude/skills${CLAUDE_READERS} · 2 with local edits`,
        `⚠Local edits~/.agents/skills${CODEX_READERS} · 1 missing · 1 not updated · 2 with local edits`,
      ]),
    );
  });

  it("reads a folder that lacks a skill and lags as Skills missing", async () => {
    const answer = globalAnswer(
      {
        claude: [skill("show-me"), skill("tdd")],
        codex: [skill("tdd")],
      },
      { releaseHead: head("v0.4.3") },
    );
    const [claude, agents] = answer.folders;
    stubServer(() => ({
      global: {
        ...answer,
        folders: [
          claude,
          {
            ...agents,
            missing: ["show-me"],
            notUpdated: [{ name: "tdd", stillAt: "v0.4.0" }],
          },
        ],
      },
    }));
    renderDeployState();
    const rows = await folderRows();

    // Behind is Global's own: a clean folder of a behind Global is Up to date.
    await waitFor(() =>
      expect(rows()).toEqual([
        `✓Up to date~/.claude/skills${CLAUDE_READERS}`,
        `⚠Skills missing~/.agents/skills${CODEX_READERS} · 1 missing · 1 not updated`,
      ]),
    );
  });

  it("reads a clean folder as Up to date, with its readers alone", async () => {
    stubServer(() => ({
      global: globalAnswer(
        { claude: [skill("tdd")], codex: [skill("tdd")] },
        { releaseHead: head("v0.4.1") },
      ),
    }));
    renderDeployState();
    const rows = await folderRows();

    await waitFor(() =>
      expect(rows()).toEqual([
        `✓Up to date~/.claude/skills${CLAUDE_READERS}`,
        `✓Up to date~/.agents/skills${CODEX_READERS}`,
      ]),
    );
  });

  it("changes no folder count for a copy in a folder whose tool is not detected", async () => {
    const answer = globalAnswer(
      { claude: [skill("tdd", "local-edits")] },
      { releaseHead: head("v0.4.1") },
    );
    const [claude, agents] = answer.folders;
    stubServer(() => ({
      global: {
        ...answer,
        folders: [
          claude,
          {
            ...agents,
            primitives: [skill("tdd", "local-edits")],
            missing: ["tdd"],
            strayCopies: [{ name: "tdd", atRelease: false }],
          },
        ],
      },
    }));
    renderDeployState();
    const rows = await folderRows();

    await waitFor(() =>
      expect(rows()).toEqual([
        `⚠Local edits~/.claude/skills${CLAUDE_READERS} · 1 with local edits`,
      ]),
    );
  });
});
