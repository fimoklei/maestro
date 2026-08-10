import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RegistrationOutcome } from "../registry/use-register-repos";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { BrowseDialog } from "./browse-dialog";

// Confirming a register-mode selection turns the picker into a per-repo
// report (#175). Kept apart from browse-dialog.test.tsx (navigating/selecting).

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const homeResponse = {
  requestedPath: "/home/me",
  path: "/home/me",
  breadcrumbs: [{ name: "~", path: "/home/me" }],
  entries: [] as { name: string; path: string }[],
};

function renderDialog({
  mode = "connect" as "connect" | "register",
  onSelect = vi.fn(),
  onClose = vi.fn(),
  outcomes = undefined as RegistrationOutcome[] | undefined,
  isRegistering = undefined as boolean | undefined,
} = {}) {
  const dialog = (props: {
    outcomes?: RegistrationOutcome[];
    isRegistering?: boolean;
  }) => (
    <BrowseDialog
      mode={mode}
      onSelect={onSelect}
      onClose={onClose}
      outcomes={props.outcomes}
      isRegistering={props.isRegistering}
    />
  );
  const { rerender } = renderWithQuery(dialog({ outcomes, isRegistering }));
  return {
    onSelect,
    onClose,
    // Re-renders the same dialog with a later state of the host's run, which
    // is how the run's progress reaches it in production too.
    update: (props: {
      outcomes?: RegistrationOutcome[];
      isRegistering?: boolean;
    }) => rerender(dialog(props)),
  };
}

describe("registration reporting (issue #175)", () => {
  function stubListing() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            ...homeResponse,
            entries: [
              {
                name: "acme-web",
                path: "/home/me/acme-web",
                facts: { isGitRepo: true, hasApmManifest: false },
              },
            ],
          },
          200,
        ),
      ),
    );
  }

  const registered: RegistrationOutcome = {
    requestedPath: "/home/me/acme-web",
    path: "/home/me/acme-web",
    ok: true,
    reason: "registered",
  };
  const skipped: RegistrationOutcome = {
    requestedPath: "/home/me/acme-api",
    path: "/home/me/acme-api",
    ok: false,
    reason: "skipped · not a directory",
  };

  it("drops the write promise once the run has started, there being nothing left to promise", async () => {
    stubListing();
    renderDialog({ mode: "register", isRegistering: true, outcomes: [] });

    await screen.findByRole("list", { name: /result/i });
    expect(screen.queryByText(/writes nothing/i)).not.toBeInTheDocument();
  });

  it("replaces the listing, breadcrumbs and filter with the run's report", async () => {
    stubListing();
    renderDialog({ mode: "register", isRegistering: true, outcomes: [] });

    expect(
      await screen.findByRole("list", { name: /result/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "acme-web" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /filter/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /up$/i }),
    ).not.toBeInTheDocument();
  });

  it("appends each outcome as the run produces it, in selection order", async () => {
    stubListing();
    const { update } = renderDialog({
      mode: "register",
      isRegistering: true,
      outcomes: [skipped],
    });

    await screen.findByRole("list", { name: /result/i });
    // Named the way the sidebar names a target (#211), so the assertion is on
    // the repo, not on the prefix the label drops.
    expect(screen.getByTitle("/home/me/acme-api")).toBeInTheDocument();
    expect(screen.queryByTitle("/home/me/acme-web")).not.toBeInTheDocument();

    update({ isRegistering: false, outcomes: [skipped, registered] });

    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("acme-api");
    expect(rows[1]).toHaveTextContent("acme-web");
  });

  it("reports each outcome's own reason", async () => {
    stubListing();
    renderDialog({
      mode: "register",
      isRegistering: false,
      outcomes: [registered, skipped],
    });

    await screen.findByRole("list", { name: /result/i });
    expect(screen.getByText("registered")).toBeInTheDocument();
    expect(screen.getByText("skipped · not a directory")).toBeInTheDocument();
  });

  it("renames itself for the run, so the heading never contradicts what is under it", async () => {
    stubListing();
    renderDialog({
      mode: "register",
      isRegistering: false,
      outcomes: [registered],
    });

    expect(
      await screen.findByRole("heading", { name: /registration result/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /select repos to register/i }),
    ).not.toBeInTheDocument();
  });

  it("gives a row to each selection that resolved to the same repo", async () => {
    // A symlink and the directory it points at both canonicalize to one stored
    // path, so the report has two outcomes naming the same repo. Each was a
    // separate thing the user picked, so each keeps its own line.
    stubListing();
    renderDialog({
      mode: "register",
      isRegistering: false,
      outcomes: [
        {
          requestedPath: "/home/me/link-to-acme",
          path: "/home/me/acme-web",
          ok: true,
          reason: "registered",
        },
        {
          requestedPath: "/home/me/acme-web",
          path: "/home/me/acme-web",
          ok: true,
          reason: "registered",
        },
      ],
    });

    const rows = within(
      await screen.findByRole("list", { name: /result/i }),
    ).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
  });

  it("offers one disabled close action while the run is registering", async () => {
    stubListing();
    const { onClose } = renderDialog({
      mode: "register",
      isRegistering: true,
      outcomes: [],
    });

    await screen.findByRole("list", { name: /result/i });
    expect(screen.getAllByRole("button", { name: /close/i })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /close/i })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("offers one close action once the run ends", async () => {
    stubListing();
    const { onClose, update } = renderDialog({
      mode: "register",
      isRegistering: true,
      outcomes: [],
    });

    await screen.findByRole("list", { name: /result/i });
    update({ isRegistering: false, outcomes: [registered] });

    const close = screen.getByRole("button", { name: /close/i });
    expect(screen.getAllByRole("button", { name: /close/i })).toHaveLength(1);
    expect(close).toBeEnabled();
    await userEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps browsing while the host hands it no run, so connect never reports", async () => {
    stubListing();
    renderDialog({ mode: "connect" });

    expect(
      await screen.findByRole("button", { name: "acme-web" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: /result/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /use this folder/i }),
    ).toBeInTheDocument();
  });
});
