import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { ConnectView } from "./connect-view";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubApi({
  connect,
  picked = "/home/me/agent-harness",
  configuredPath = null,
}: {
  connect?: () => Response;
  /** What the system folder chooser returns; null is a cancel. */
  picked?: string | null;
  configuredPath?: string | null;
} = {}) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/inventory/config")) {
        return jsonResponse({ inventoryPath: configuredPath }, 200);
      }
      if (url.startsWith("/api/folder-chooser")) {
        return init?.method === "POST"
          ? jsonResponse({ path: picked }, 200)
          : jsonResponse({ available: true }, 200);
      }
      return connect
        ? connect()
        : jsonResponse(
            {
              outcome: "found",
              inventoryPath: "/home/me/agent-harness",
              primitiveCount: 7,
            },
            200,
          );
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderView() {
  return renderWithQuery(
    <MemoryRouter initialEntries={["/welcome/connect"]}>
      <Routes>
        <Route path="/welcome/connect" element={<ConnectView />} />
        <Route path="/inventory" element={<div>inventory-landed</div>} />
        <Route path="/" element={<div>deploy-state-landed</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ConnectView", () => {
  it("opens the document outline with a real h1", async () => {
    stubApi();
    renderView();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Connect a Harness",
      }),
    ).toBeInTheDocument();
  });

  it("shows the confirmation with the item count after a successful connect", async () => {
    stubApi();
    renderView();

    await userEvent.type(
      await screen.findByLabelText("Harness folder or GitHub URL"),
      "/home/me/agent-harness",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Connect Harness" }),
    );

    expect(await screen.findByText("Harness connected")).toBeInTheDocument();
    expect(
      screen.getByText("7 items are ready in the Inventory."),
    ).toBeInTheDocument();
  });

  it("names the connected source on the confirmation, beyond its basename", async () => {
    // The path tail is visible, the whole path on hover (#211).
    stubApi();
    renderView();

    await userEvent.type(
      await screen.findByLabelText("Harness folder or GitHub URL"),
      "/home/me/agent-harness",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Connect Harness" }),
    );

    const source = await screen.findByText("…/me/agent-harness");
    expect(source).toHaveAttribute("title", "/home/me/agent-harness");
  });

  it("lands on Inventory once the user continues past the confirmation", async () => {
    stubApi();
    renderView();

    await userEvent.type(
      await screen.findByLabelText("Harness folder or GitHub URL"),
      "/home/me/agent-harness",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Connect Harness" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /continue/i }),
    );

    expect(await screen.findByText("inventory-landed")).toBeInTheDocument();
  });

  it("shows a readable error for an invalid path and stays on the step", async () => {
    stubApi({
      connect: () =>
        jsonResponse(
          {
            error: "not-an-inventory",
            message:
              "That directory has no apm.yml, so it is not an inventory.",
          },
          422,
        ),
    });
    renderView();

    await userEvent.type(
      await screen.findByLabelText("Harness folder or GitHub URL"),
      "/home/me/not-a-clone",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Connect Harness" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/no apm\.yml/i);
    expect(screen.queryByText("deploy-state-landed")).not.toBeInTheDocument();
    // A plain refusal carries no action: neither the offer nor a recovery.
    expect(
      screen.queryByRole("button", { name: "Scaffold the Harness" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /choose another/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the no-usable-origin notice and opens the folder chooser from its action", async () => {
    stubApi({
      connect: () =>
        jsonResponse(
          {
            error: "no-usable-origin",
            message:
              "That folder has an apm.yml, but its git origin is missing, unreadable, or in a form apm cannot resolve.",
          },
          422,
        ),
    });
    renderView();

    await userEvent.type(
      await screen.findByLabelText("Harness folder or GitHub URL"),
      "/home/me/skills-only-folder",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Connect Harness" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /No GitHub origin/i,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Choose another clone" }),
    );
    expect(
      await screen.findByLabelText("Harness folder or GitHub URL"),
    ).toHaveValue("/home/me/agent-harness");
  });

  it("fills the path field from a folder picked in the system chooser", async () => {
    stubApi();
    renderView();

    await userEvent.click(
      await screen.findByRole("button", { name: "Browse" }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Harness folder or GitHub URL")).toHaveValue(
        "/home/me/agent-harness",
      ),
    );
  });

  it("leaves the field as it was when the chooser is cancelled", async () => {
    stubApi({ picked: null });
    renderView();

    await userEvent.type(
      await screen.findByLabelText("Harness folder or GitHub URL"),
      "/home/me/typed",
    );
    await userEvent.click(screen.getByRole("button", { name: "Browse" }));

    expect(screen.getByLabelText("Harness folder or GitHub URL")).toHaveValue(
      "/home/me/typed",
    );
  });

  // A clone folder set for a URL does not ride along once the path is local:
  // the reader can no longer see it, so its refusal would have no field.
  it("sends no clone folder for a local path", async () => {
    const fetchMock = stubApi({ picked: "/home/me/Work" });
    renderView();

    const path = await screen.findByLabelText("Harness folder or GitHub URL");
    await userEvent.type(path, "https://github.com/fimoklei/agent-harness");
    await userEvent.click(
      screen.getByRole("button", { name: "Change folder…" }),
    );
    await userEvent.type(
      screen.getByLabelText("Folder for the Harness"),
      "/home/me/Work",
    );
    await userEvent.clear(path);
    await userEvent.type(path, "/home/me/agent-harness");
    await userEvent.click(
      screen.getByRole("button", { name: "Connect Harness" }),
    );

    await screen.findByText("7 items are ready in the Inventory.");
    const connectCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).startsWith("/api/inventory/connect"),
    );
    expect(JSON.parse(String(connectCall?.[1]?.body))).toEqual({
      path: "/home/me/agent-harness",
    });
  });

  it("redirects an already-configured user away instead of showing the connect form", async () => {
    stubApi({ configuredPath: "/home/me/agent-harness" });
    renderView();

    // Checked before config resolves: the form must not flash while pending.
    expect(
      screen.queryByLabelText("Harness folder or GitHub URL"),
    ).not.toBeInTheDocument();

    expect(await screen.findByText("deploy-state-landed")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Harness folder or GitHub URL"),
    ).not.toBeInTheDocument();
  });
});
