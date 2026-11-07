import type { LocalEditsSkill } from "@maestro/core";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectTooltipCause, jsonResponse, sentence } from "../test-utils";
import {
  globalAnswer,
  importRoutes,
  landed,
  openPane,
  renderDeployState,
  stubServer,
} from "./deploy-state-test-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

const CLAUDE_COPY = "~/.claude/skills/code-review";
const CODEX_COPY = "~/.agents/skills/code-review";

const edited = (name: string) => ({
  type: "skill",
  name,
  version: "v0.3.5",
  copy: "local-edits",
});

// code-review's two Global copies carry local edits and differ; tdd's do not.
function stubDifferingCopies(
  run: (names: string[]) => Response | Promise<Response> = landed,
) {
  const skills = [
    {
      name: "code-review",
      refusal: null,
      folders: [CLAUDE_COPY, CODEX_COPY],
    },
    { name: "tdd", refusal: null },
  ] satisfies LocalEditsSkill[];
  const { sent, other } = importRoutes(() => jsonResponse({ skills }), run);
  const copies = [edited("code-review"), edited("tdd")];
  stubServer(() => ({
    global: {
      ...globalAnswer({ claude: copies, codex: copies }),
      skipped: [],
    },
    other,
  }));
  return sent;
}

async function openDialog() {
  const pane = await openPane("Global");
  await userEvent.click(
    within(pane).getByRole("button", { name: "Import local edits" }),
  );
  return screen.findByRole("dialog", {
    name: "Import local edits from Global",
  });
}

describe("Deploy-state — Import local edits where Global copies differ", () => {
  it("offers each differing copy by path with none selected, and blocks the confirm", async () => {
    stubDifferingCopies();
    renderDeployState();

    const dialog = await openDialog();
    const block = await within(dialog).findByRole("group", {
      name: "⚠ Copies differ · 1",
    });
    expect(
      within(block).getByText("The copies differ. Select one to import."),
    ).toBeInTheDocument();
    const radios = within(
      within(block).getByRole("radiogroup", { name: "Copy to import" }),
    ).getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("value"))).toEqual([
      CLAUDE_COPY,
      CODEX_COPY,
    ]);
    expect(radios.some((radio) => (radio as HTMLInputElement).checked)).toBe(
      false,
    );
    expect(
      within(block).getByRole("radio", { name: CODEX_COPY }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "To keep all edits, merge them into one folder yourself. Then select Close, select Re-read Deploy-state, then select Import local edits again.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Copies you do not select stay as they are. Update target replaces them only if you check Discard local edits.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("group", { name: "Can be imported · 1" }),
    ).toBeInTheDocument();
    expectTooltipCause(
      within(dialog).getByRole("button", { name: "Import 2 skills" }),
      "Select a copy.",
    );
  });

  it("imports the selected copy's folder with the other skills", async () => {
    const sent = stubDifferingCopies();
    renderDeployState();

    const dialog = await openDialog();
    await userEvent.click(
      await within(dialog).findByRole("radio", { name: CODEX_COPY }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Import 2 skills" }),
    );

    await screen.findByText("harness view with no skill open");
    expect(sent).toEqual([
      {
        target: { kind: "global" },
        names: ["code-review", "tdd"],
        undo: [],
        selected: [{ name: "code-review", folder: CODEX_COPY }],
      },
    ]);
  });

  it("states a selection the copies no longer match in the Report", async () => {
    stubDifferingCopies(() =>
      jsonResponse({
        outcomes: [
          { name: "code-review", refusal: "copy-not-offered" },
          { name: "tdd", refusal: null },
        ],
      }),
    );
    renderDeployState();

    const dialog = await openDialog();
    await userEvent.click(
      await within(dialog).findByRole("radio", { name: CLAUDE_COPY }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Import 2 skills" }),
    );

    const refused = await within(dialog).findByRole("region", {
      name: "Not imported 1",
    });
    expect(
      within(refused).getByText(
        "The copies changed after the check, so this skill was not imported. Select Import local edits again to check them.",
      ),
    ).toBeInTheDocument();
  });

  it("names the folders whose copies differ in the Global pane", async () => {
    stubDifferingCopies();
    renderDeployState();

    const pane = await openPane("Global");

    expect(
      await within(pane).findByText(
        sentence(
          "The copies in ~/.claude/skills and ~/.agents/skills differ. Select Import local edits to import one.",
        ),
      ),
    ).toBeInTheDocument();
  });
});
