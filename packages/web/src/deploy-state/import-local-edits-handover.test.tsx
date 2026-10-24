import type { HarnessState } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  harnessRegion,
  RELEASED,
  row,
  withStages,
} from "../harness/harness-flow-fixture";
import { HarnessScreen } from "../harness/harness-screen";
import { jsonResponse, renderWithQuery, sentence } from "../test-utils";
import { ToastHost } from "../ui/toast";
import {
  importRoutes,
  landed,
  openPane,
  stubServer,
} from "./deploy-state-test-helpers";
import { DeployStateView } from "./deploy-state-view";
import { clearToasts } from "./remove-skill-row-test-helpers";

// Import local edits ends on Harness, which says what landed (#1660).

afterEach(() => {
  vi.unstubAllGlobals();
  clearToasts();
});

const REPO = "/Users/me/project";
const ROW = "…/me/project";

const edited = (names: string[]) => ({
  primitives: names.map((name) => ({
    type: "skill",
    name,
    version: "v0.3.5",
    copy: "local-edits",
  })),
  skipped: [],
});

const proposed = (names: string[]): HarnessState =>
  withStages(RELEASED, {
    proposal: names.map((name) =>
      row("pending-proposal", name, "not-yet-proposed"),
    ),
  });

// Harness answers every read once `harnessRead` resolves.
function stubImport(
  names: string[],
  run: (names: string[]) => Response | Promise<Response>,
  harnessRead: Promise<void> = Promise.resolve(),
) {
  const { other } = importRoutes(
    () =>
      jsonResponse({ skills: names.map((name) => ({ name, refusal: null })) }),
    run,
  );
  stubServer(() => ({
    repos: [REPO],
    repo: { [REPO]: edited(names) },
    other: async (url, init) => {
      if (url === "/api/harness" || url === "/api/harness/refresh") {
        await harnessRead;
        return jsonResponse(proposed(names));
      }
      return other(url, init);
    },
  }));
}

function Back() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      Back
    </button>
  );
}

function renderApp() {
  renderWithQuery(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<DeployStateView />} />
        <Route
          path="/harness"
          element={
            <>
              <HarnessScreen />
              <Link to="/elsewhere">Elsewhere</Link>
            </>
          }
        />
        <Route path="/elsewhere" element={<Back />} />
      </Routes>
      <ToastHost />
    </MemoryRouter>,
  );
}

async function importAll(count: number) {
  const pane = await openPane(ROW);
  await userEvent.click(
    within(pane).getByRole("button", { name: "Import local edits" }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: `Import local edits from ${ROW}`,
  });
  await userEvent.click(
    await within(dialog).findByRole("button", {
      name: count === 1 ? "Import 1 skill" : `Import ${count} skills`,
    }),
  );
}

describe("Import local edits — the result on Harness", () => {
  it("says one imported skill in Harness's region, with its pane open, no toast", async () => {
    stubImport(["tdd"], landed);
    renderApp();

    await importAll(1);

    await waitFor(() =>
      expect(harnessRegion()).toHaveTextContent("Imported tdd."),
    );
    expect(
      screen.getByRole("complementary", { name: "tdd detail" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(sentence("Imported tdd."))).toHaveLength(1);
  });

  it("counts several imported skills in a toast once Harness has read", async () => {
    let land = () => {};
    const held = new Promise<void>((resolve) => {
      land = resolve;
    });
    stubImport(["code-review", "tdd"], landed, held);
    renderApp();

    await importAll(2);
    await screen.findByRole("link", { name: "Elsewhere" });
    expect(screen.queryByText("Imported 2 skills.")).toBeNull();

    land();

    expect(await screen.findByText("Imported 2 skills.")).toBeInTheDocument();
    expect(harnessRegion()).not.toHaveTextContent("Imported 2 skills.");
  });

  it("does not say it again on a return to Harness", async () => {
    stubImport(["tdd"], landed);
    renderApp();
    await importAll(1);
    await waitFor(() =>
      expect(harnessRegion()).toHaveTextContent("Imported tdd."),
    );

    await userEvent.click(screen.getByRole("link", { name: "Elsewhere" }));
    await userEvent.click(screen.getByRole("button", { name: "Back" }));

    await screen.findByRole("complementary", { name: "tdd detail" });
    await waitFor(() =>
      expect(
        screen
          .getByRole("grid", { name: "Harness table" })
          .closest('[aria-busy="true"]'),
      ).toBeNull(),
    );
    expect(harnessRegion()).not.toHaveTextContent("Imported tdd.");
    expect(screen.queryByText(sentence("Imported tdd."))).toBeNull();
  });
});
