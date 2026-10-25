import type {
  HarnessPrimitiveType,
  HarnessState,
  InventoryPrimitive,
  PrimitiveDeletionCheck,
} from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RELEASED, row, withStages } from "../harness/harness-flow-fixture";
import { HarnessScreen } from "../harness/harness-screen";
import {
  jsonResponse,
  openFootMenu,
  renderWithQuery,
  sentence,
} from "../test-utils";
import { PromptsPanel } from "./prompts-panel";

// Delete prompt starts on Prompts and lands on the Harness view (#1602).

const PR_REVIEW = {
  type: "prompt",
  name: "pr-review",
  description: "Review a pull request.",
  path: ".maestro/prompts/pr-review.md",
  pendingRelease: null,
  text: "Review the pull request at [PR LINK].",
  nameValid: true,
} satisfies InventoryPrimitive;

// A file the listing keeps although every write refuses its name.
const BAD_NAME = {
  ...PR_REVIEW,
  name: "PR_Review",
  path: ".maestro/prompts/PR_Review.md",
  nameValid: false,
} satisfies InventoryPrimitive;

const DELETED: HarnessState = withStages(RELEASED, {
  proposal: [
    row("pending-proposal", "pr-review", "not-yet-proposed", {
      type: "prompt",
      path: PR_REVIEW.path,
      branch: "maestro/prompt.pr-review",
      change: "deletion",
    }),
  ],
});

const IN_CLONE = {
  skill: {},
  prompt: {
    PR_Review: {
      inClone: true,
      path: BAD_NAME.path,
      workingTree: "blob-2",
      uncommitted: false,
      localOnly: false,
    },
    "pr-review": {
      inClone: true,
      path: PR_REVIEW.path,
      workingTree: "blob-1",
      uncommitted: false,
      localOnly: false,
    },
  },
} satisfies Record<
  HarnessPrimitiveType,
  Record<string, PrimitiveDeletionCheck>
>;

type Answer = { body: unknown; status?: number; heldUntil?: Promise<void> };

function stubServer(options: { harness?: Answer; check?: Answer }) {
  const deletions: unknown[] = [];
  let deleted = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/inventory/primitives")) {
        return jsonResponse({
          primitives: [PR_REVIEW, BAD_NAME],
          unreadTypes: [],
        });
      }
      if (url === "/api/harness/primitive/delete/check") {
        const check = options.check ?? { body: IN_CLONE };
        await check.heldUntil;
        return jsonResponse(check.body, check.status);
      }
      if (url === "/api/harness/primitive/delete") {
        deletions.push(JSON.parse(String(init?.body)));
        deleted = true;
        return jsonResponse({ name: "pr-review" });
      }
      if (url.startsWith("/api/harness")) {
        const harness = options.harness ?? {
          body: deleted ? DELETED : RELEASED,
        };
        return jsonResponse(harness.body, harness.status);
      }
      return jsonResponse({}, 404);
    }),
  );
  return deletions;
}

function renderPrompts() {
  renderWithQuery(
    <MemoryRouter initialEntries={["/inventory/prompts"]}>
      <Routes>
        <Route path="inventory/prompts" element={<PromptsPanel />} />
        <Route path="harness" element={<HarnessScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openRowMenu(name = "pr-review") {
  await userEvent.click(
    await screen.findByRole("button", { name: `Actions for ${name}` }),
  );
  return within(await screen.findByRole("menu"));
}

async function openPane(name = "pr-review") {
  // A bad name's cell also carries its ⚠ mark.
  await userEvent.click(await screen.findByText(name, { selector: "td *" }));
  return screen.findByRole("complementary", { name: `${name} detail` });
}

const menuLabels = (menu: ReturnType<typeof within>) =>
  menu.getAllByRole("menuitem").map((item: HTMLElement) => item.textContent);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Prompts — Delete prompt", () => {
  it("lists Delete prompt last in the row menu, behind a divider", async () => {
    stubServer({});
    renderPrompts();
    const menu = await openRowMenu();

    await waitFor(() =>
      expect(
        menu.getAllByRole("menuitem").map((item) => item.textContent),
      ).toEqual(["Copy prompt", "Edit prompt", "Delete prompt"]),
    );
    expect(menu.getAllByRole("separator")).toHaveLength(1);
  });

  it("offers Delete prompt at the pane's foot", async () => {
    stubServer({});
    renderPrompts();

    const foot = await openFootMenu(await openPane(), "pr-review");
    await waitFor(() =>
      expect(
        foot.getByRole("menuitem", { name: "Delete prompt" }),
      ).not.toHaveAttribute("aria-disabled"),
    );
  });

  // Every write refuses an invalid name; the pane's warning says to rename it.
  it("leaves Delete prompt off a badly named prompt's row menu", async () => {
    stubServer({});
    renderPrompts();
    const valid = await openRowMenu();
    await waitFor(() => expect(menuLabels(valid)).toContain("Delete prompt"));
    await userEvent.keyboard("{Escape}");

    const menu = await openRowMenu("PR_Review");
    expect(menuLabels(menu)).toEqual(["Copy prompt"]);
    expect(menu.queryByRole("separator")).toBeNull();
  });

  it("leaves no ⋯ at a badly named prompt's pane foot", async () => {
    stubServer({});
    renderPrompts();
    await openFootMenu(await openPane(), "pr-review");
    await userEvent.keyboard("{Escape}");

    const pane = await openPane("PR_Review");
    expect(
      within(pane).queryByRole("button", { name: "Actions for PR_Review" }),
    ).toBeNull();
  });

  it("opens the Harness view with the Deleted row once step 1 lands", async () => {
    const deletions = stubServer({});
    renderPrompts();
    const menu = await openRowMenu();
    await userEvent.click(
      await menu.findByRole("menuitem", { name: "Delete prompt" }),
    );
    const dialog = within(
      await screen.findByRole("dialog", { name: "Delete pr-review" }),
    );
    expect(
      dialog.getByText(
        sentence(
          "Delete prompt removes the pr-review file from your clone of fimoklei/agent-harness. The prompt stays in fimoklei/agent-harness.",
        ),
      ),
    ).toBeInTheDocument();
    expect(dialog.getByText("Prompt")).toBeInTheDocument();
    expect(dialog.getByText("File")).toBeInTheDocument();
    // The sentence a dialog opened from Harness leaves out.
    expect(
      dialog.getByText(
        sentence(
          "To also delete it from fimoklei/agent-harness, go to the Harness screen and select Propose change.",
        ),
      ),
    ).toBeInTheDocument();
    const confirm = dialog.getByRole("button", { name: /^delete prompt/i });
    await waitFor(() => expect(confirm).not.toHaveAttribute("aria-disabled"));
    await userEvent.click(confirm);

    const pane = await screen.findByRole("complementary", {
      name: "pr-review detail",
    });
    expect(within(pane).getByText("Deleted")).toBeInTheDocument();
    expect(within(pane).getByText("Not yet proposed")).toBeInTheDocument();
    expect(deletions).toEqual([
      { type: "prompt", name: "pr-review", seenWorkingTree: "blob-1" },
    ]);
  });

  const never = new Promise<void>(() => {});
  it.each([
    [
      "while the clone is read",
      { check: { body: IN_CLONE, heldUntil: never } },
    ],
    [
      "when the clone could not be read",
      { check: { body: { error: "no-answer" }, status: 409 } },
    ],
  ])(
    "dims Delete prompt %s, in the row menu and the pane foot",
    async (_when, answers) => {
      stubServer(answers);
      renderPrompts();

      const menu = await openRowMenu();
      const item = await menu.findByRole("menuitem", { name: "Delete prompt" });
      expect(item).toHaveAttribute("aria-disabled", "true");
      await userEvent.click(item);
      await userEvent.keyboard("{Escape}");

      const foot = await openFootMenu(await openPane(), "pr-review");
      const footItem = foot.getByRole("menuitem", { name: "Delete prompt" });
      expect(footItem).toHaveAttribute("aria-disabled", "true");
      await userEvent.click(footItem);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );

  it.each([
    [
      "where no Harness is connected",
      { harness: { body: { error: "not-configured" }, status: 409 } },
    ],
    [
      "where the prompt is not in the clone",
      {
        check: {
          body: { skill: {}, prompt: { "pr-review": { inClone: false } } },
        },
      },
    ],
  ])(
    "omits Delete prompt %s, from the row menu and the pane foot",
    async (_where, answers) => {
      stubServer(answers);
      renderPrompts();

      const menu = await openRowMenu();
      await waitFor(() =>
        expect(
          menu.getAllByRole("menuitem").map((item) => item.textContent),
        ).toEqual(["Copy prompt", "Edit prompt"]),
      );
      await userEvent.keyboard("{Escape}");

      const pane = within(await openPane());
      expect(
        pane.queryByRole("button", { name: "Actions for pr-review" }),
      ).not.toBeInTheDocument();
    },
  );
});
