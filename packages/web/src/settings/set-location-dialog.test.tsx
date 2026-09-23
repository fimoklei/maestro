import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../test-utils";
import { renderPage, stubServer } from "./harness-location-test-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openDialog() {
  await userEvent.click(
    await screen.findByRole("button", { name: "Change Harness location" }),
  );
  return screen.getByRole("dialog", { name: "Set Harness location" });
}

async function typePath(path: string) {
  const field = screen.getByLabelText("Folder path");
  await userEvent.clear(field);
  await userEvent.type(field, path);
  return field;
}

const setButton = () =>
  screen.getByRole("button", { name: /^(Set Harness location|Setting…)$/ });

describe("Set Harness location", () => {
  it("opens on the current location, the field's rule stated before it", async () => {
    stubServer();
    renderPage();
    await screen.findByText("/home/me/agent-harness");

    const dialog = await openDialog();

    expect(
      within(dialog).getByRole("heading", { name: "Set Harness location" }),
    ).toBeInTheDocument();
    const field = within(dialog).getByLabelText("Folder path");
    expect(field).toHaveValue("/home/me/agent-harness");
    expect(field).toHaveAccessibleDescription(
      expect.stringContaining("Must be a local Harness clone."),
    );
    expect(
      await within(dialog).findByRole("button", { name: "Browse" }),
    ).toBeInTheDocument();
    const footer = within(dialog)
      .getAllByRole("button")
      .map((button) => button.textContent)
      .slice(-2);
    expect(footer).toEqual(["Cancel", "Set Harness location"]);
  });

  it("sets the typed folder, closes, and shows and announces the new location", async () => {
    const { posts } = stubServer();
    renderPage();
    await openDialog();

    await typePath("/home/me/other-harness");
    await userEvent.click(setButton());

    expect(
      await screen.findByText("/home/me/other-harness"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(posts("/api/inventory/connect")).toEqual([
      { path: "/home/me/other-harness", localOnly: true },
    ]);
    expect(screen.getByText("Set …/me/other-harness.")).toBeInTheDocument();
  });

  it("reads the release again for the new location", async () => {
    const { fetchMock } = stubServer();
    renderPage();
    await screen.findByText("v1.4.0 · 2 skills");
    const harnessReads = () =>
      fetchMock.mock.calls.filter(([url]) => String(url) === "/api/harness")
        .length;
    const before = harnessReads();
    await openDialog();

    await typePath("/home/me/other-harness");
    await userEvent.click(setButton());

    await waitFor(() => expect(harnessReads()).toBeGreaterThan(before));
  });

  it("fills the field from Browse", async () => {
    stubServer({ pick: "/home/me/picked-harness" });
    renderPage();
    const dialog = await openDialog();

    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Browse" }),
    );

    await waitFor(() =>
      expect(within(dialog).getByLabelText("Folder path")).toHaveValue(
        "/home/me/picked-harness",
      ),
    );
  });

  it("states a refusal under the field, keeps the dialog open and hands focus back", async () => {
    stubServer({
      connect: () => jsonResponse({ error: "not-an-inventory" }, 400),
    });
    renderPage();
    const dialog = await openDialog();

    const field = await typePath("/home/me/Projects/maestro");
    await userEvent.click(setButton());

    const notice = await within(dialog).findByRole("alert");
    expect(notice).toHaveTextContent("Not a Harness");
    expect(notice).toHaveTextContent("The folder has no apm.yml.");
    expect(notice).toHaveTextContent("Choose a folder that holds a Harness.");
    expect(notice).not.toHaveTextContent(/URL/);
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveFocus();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("clears the refusal once the field changes", async () => {
    stubServer({
      connect: () => jsonResponse({ error: "not-an-inventory" }, 400),
    });
    renderPage();
    const dialog = await openDialog();

    await typePath("/home/me/Projects/maestro");
    await userEvent.click(setButton());
    await within(dialog).findByText("Not a Harness");

    await userEvent.type(within(dialog).getByLabelText("Folder path"), "x");

    expect(within(dialog).queryByText("Not a Harness")).not.toBeInTheDocument();
  });

  it("never clones: it asks for a local clone only and states the refusal of a URL", async () => {
    const { posts } = stubServer({
      connect: () => jsonResponse({ error: "not-a-folder-path" }, 400),
    });
    renderPage();
    const dialog = await openDialog();

    await typePath("https://github.com/fimoklei/agent-harness");
    await userEvent.click(setButton());

    expect(
      await within(dialog).findByText("Not a folder path"),
    ).toBeInTheDocument();
    expect(posts("/api/inventory/connect")).toEqual([
      { path: "https://github.com/fimoklei/agent-harness", localOnly: true },
    ]);
  });

  it("shows Setting… in the pressed control and cannot be closed while it runs", async () => {
    let answer: (response: Response) => void = () => {};
    stubServer({
      connect: () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    });
    renderPage();
    await openDialog();

    await typePath("/home/me/other-harness");
    await userEvent.click(setButton());

    expect(
      await screen.findByRole("button", { name: "Setting…" }),
    ).toBeInTheDocument();
    // The status region states the write while it runs (design.md → Keyboard).
    expect(
      screen.getByText("Setting…", { selector: "[role=status]" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    answer(
      jsonResponse({
        outcome: "connected",
        inventoryPath: "/home/me/other-harness",
        primitiveCount: 1,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("offers the scaffold for an empty repository and closes once it is done", async () => {
    const { posts } = stubServer({
      connect: () =>
        jsonResponse(
          { error: "scaffoldable", path: "/home/me/empty-repo" },
          409,
        ),
      scaffold: (path) =>
        jsonResponse({
          outcome: "scaffolded",
          inventoryPath: path,
          primitiveCount: 0,
        }),
    });
    renderPage();
    const dialog = await openDialog();

    await typePath("/home/me/empty-repo");
    await userEvent.click(setButton());
    expect(
      await within(dialog).findByText("Harness scaffold available"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Maestro would scaffold it into /home/me/empty-repo.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Scaffold the Harness" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(posts("/api/harness/scaffold")).toEqual([
      { path: "/home/me/empty-repo" },
    ]);
  });

  it("closes on Cancel and sets nothing", async () => {
    const { posts } = stubServer();
    renderPage();
    await openDialog();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(posts("/api/inventory/connect")).toEqual([]);
    expect(screen.getByText("/home/me/agent-harness")).toBeInTheDocument();
  });
});
