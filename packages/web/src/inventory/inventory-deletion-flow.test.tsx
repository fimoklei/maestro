import type { HarnessState } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RELEASED, row, withStages } from "../harness/harness-flow-fixture";
import { HarnessView } from "../harness/harness-view";
import { jsonResponse, renderWithQuery, sentence } from "../test-utils";
import { InventoryPanel } from "./inventory-panel";

// Delete skill starts in Inventory and lands on the Harness view (#1385).

const DELETED: HarnessState = withStages(RELEASED, {
  proposal: [
    row("pending-proposal", "tdd", "not-yet-proposed", { change: "deletion" }),
  ],
});

const IN_CLONE = {
  skills: {
    tdd: {
      inClone: true,
      workingTree: "tree-1",
      uncommitted: false,
      localOnly: false,
    },
  },
};

type Answer = { body: unknown; status?: number; heldUntil?: Promise<void> };

function stubServer(options: { harness?: Answer; check?: Answer }) {
  const deletions: unknown[] = [];
  let deleted = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/registry")) {
        return jsonResponse({ repos: [] });
      }
      if (url.startsWith("/api/inventory/primitives")) {
        return jsonResponse({
          primitives: [{ type: "skill", name: "tdd", description: "TDD loop" }],
        });
      }
      if (url === "/api/harness/skill/delete/check") {
        const check = options.check ?? { body: IN_CLONE };
        await check.heldUntil;
        return jsonResponse(check.body, check.status);
      }
      if (url === "/api/harness/skill/delete") {
        deletions.push(JSON.parse(String(init?.body)));
        deleted = true;
        return jsonResponse({ name: "tdd" });
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

function HarnessScreen() {
  const state = useLocation().state as { openSkill?: string } | null;
  return <HarnessView openSkill={state?.openSkill ?? null} />;
}

function renderInventory() {
  renderWithQuery(
    <MemoryRouter initialEntries={["/inventory"]}>
      <Routes>
        <Route path="inventory" element={<InventoryPanel />} />
        <Route path="harness" element={<HarnessScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openRowMenu() {
  await userEvent.click(
    await screen.findByRole("button", { name: "Actions for tdd" }),
  );
  return within(await screen.findByRole("menu"));
}

async function openPane() {
  await userEvent.click(await screen.findByRole("gridcell", { name: "tdd" }));
  return within(await screen.findByRole("complementary"));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Inventory — Delete skill", () => {
  it("lists Delete skill last in the row menu, as a danger item", async () => {
    stubServer({});
    renderInventory();
    const menu = await openRowMenu();

    await waitFor(() =>
      expect(
        menu.getAllByRole("menuitem").map((item) => item.textContent),
      ).toEqual(["Deploy skill", "Delete skill"]),
    );
  });

  it("opens the Harness view with the Deletion row once step 1 lands", async () => {
    const deletions = stubServer({});
    renderInventory();
    const menu = await openRowMenu();
    await userEvent.click(
      await menu.findByRole("menuitem", { name: "Delete skill" }),
    );
    const dialog = within(
      await screen.findByRole("dialog", { name: "Delete tdd" }),
    );
    expect(
      dialog.getByText(
        sentence(
          "Delete skill removes the tdd folder from your clone of fimoklei/agent-harness. The skill stays in fimoklei/agent-harness and in your targets.",
        ),
      ),
    ).toBeInTheDocument();
    expect(
      dialog.getByText(
        sentence(
          "To also delete it from fimoklei/agent-harness, go to the Harness screen and select Propose change.",
        ),
      ),
    ).toBeInTheDocument();
    const confirm = dialog.getByRole("button", { name: /^delete skill/i });
    await waitFor(() => expect(confirm).not.toHaveAttribute("aria-disabled"));
    await userEvent.click(confirm);

    const pane = await screen.findByRole("complementary", {
      name: "tdd detail",
    });
    expect(within(pane).getByText("Deletion")).toBeInTheDocument();
    expect(within(pane).getByText("Not yet proposed")).toBeInTheDocument();
    expect(deletions).toEqual([{ name: "tdd", seenWorkingTree: "tree-1" }]);
  });

  const never = new Promise<void>(() => {});
  it.each([
    [
      "no Harness connected",
      { harness: { body: { error: "not-configured" }, status: 409 } },
    ],
    [
      "not in your clone",
      { check: { body: { skills: { tdd: { inClone: false } } } } },
    ],
    ["checking your clone", { check: { body: IN_CLONE, heldUntil: never } }],
    [
      "clone not read",
      { check: { body: { error: "no-answer" }, status: 409 } },
    ],
  ])(
    "blocks Delete skill — %s in the row menu and the pane foot",
    async (reason, answers) => {
      stubServer(answers);
      renderInventory();
      const label = `Delete skill — ${reason}`;

      const menu = await openRowMenu();
      const item = await menu.findByRole("menuitem", { name: label });
      expect(item).toHaveAttribute("aria-disabled", "true");
      await userEvent.click(item);
      await userEvent.keyboard("{Escape}");

      const pane = await openPane();
      const button = pane.getByRole("button", { name: label });
      expect(button).toHaveAttribute("aria-disabled", "true");
      await userEvent.click(button);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );
});
