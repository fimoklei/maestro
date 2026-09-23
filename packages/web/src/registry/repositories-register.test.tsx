import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type FakeRegistry,
  REGISTER,
  renderRepositories,
  statusRegion,
  stubRegistry,
} from "./repositories-test-helpers";

// Registering is one folder per dialog (#1009): a folder field plus Browse,
// every refusal under the field right after the pick.

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openDialog() {
  const [band1] = await screen.findAllByRole("button", { name: REGISTER });
  await userEvent.click(band1 as HTMLElement);
  return screen.findByRole("dialog", { name: "Register a repository" });
}

const field = () => screen.getByRole("textbox", { name: "Folder path" });
const confirm = (dialog: HTMLElement) =>
  within(dialog).getByRole("button", { name: REGISTER });

describe("Register repository", () => {
  it("opens a dialog with one folder field, its rule stated before the pick", async () => {
    stubRegistry({ repos: [] });
    renderRepositories();

    const dialog = await openDialog();

    expect(
      within(dialog).getByRole("heading", {
        level: 2,
        name: "Register a repository",
      }),
    ).toBeInTheDocument();
    expect(field()).toHaveAccessibleDescription(
      expect.stringContaining("Must be a Git repository."),
    );
    expect(
      await within(dialog).findByRole("button", { name: "Browse" }),
    ).toBeInTheDocument();
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(1);
  });

  // ADR-0015 point 5: the write promise sits at the registration action.
  it("promises at the confirm that registering changes no files", async () => {
    stubRegistry({ repos: [] });
    renderRepositories();

    const dialog = await openDialog();

    expect(confirm(dialog)).toHaveAccessibleDescription(
      "Registering changes no files. Files change only when you deploy.",
    );
  });

  it.each([
    ["already-registered", "Already registered."],
    ["not-a-git-repo", "Not a Git repository. Register a valid repository."],
    [
      "central-inventory",
      "This is the Harness, not a valid target. Register a repository.",
    ],
    ["not-found", "Not a valid path. Pick another folder."],
    ["not-a-directory", "Not a valid path. Pick another folder."],
  ])(
    "states a %s pick under the field right after the pick",
    async (code, sentence) => {
      const { calls } = stubRegistry({
        repos: [],
        pick: "/home/me/picked",
        refusals: { "/home/me/picked": code },
      });
      renderRepositories();
      const dialog = await openDialog();

      await userEvent.click(
        await within(dialog).findByRole("button", { name: "Browse" }),
      );

      expect(await within(dialog).findByText(sentence)).toBeInTheDocument();
      expect(field()).toHaveValue("/home/me/picked");
      expect(field()).toHaveAttribute("aria-invalid", "true");
      expect(field()).toHaveAccessibleDescription(
        expect.stringContaining(sentence),
      );
      // Checked, never registered: the confirm has not been pressed.
      expect(calls("/api/registry/repos", "POST")).toEqual([]);
    },
  );

  it("states only the latest pick's answer, clearing a refusal the folder since shed", async () => {
    const state: FakeRegistry = {
      repos: [],
      pick: "/home/me/picked",
      refusals: { "/home/me/picked": "not-a-git-repo" },
    };
    stubRegistry(state);
    renderRepositories();
    const dialog = await openDialog();
    const browse = await within(dialog).findByRole("button", {
      name: "Browse",
    });
    await userEvent.click(browse);
    await within(dialog).findByText(
      "Not a Git repository. Register a valid repository.",
    );

    // The reader ran `git init` there and picks the same folder again.
    state.refusals = {};
    await userEvent.click(browse);

    await waitFor(() =>
      expect(
        within(dialog).queryByText(
          "Not a Git repository. Register a valid repository.",
        ),
      ).not.toBeInTheDocument(),
    );
    expect(field()).not.toHaveAttribute("aria-invalid");
  });

  it("registers the picked folder, closes, and announces it by its label", async () => {
    const { calls } = stubRegistry({
      repos: [{ path: "/home/me/payments-api", status: "ready" }],
      pick: "/home/me/acme-web",
    });
    renderRepositories();
    const dialog = await openDialog();
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Browse" }),
    );
    await waitFor(() => expect(field()).toHaveValue("/home/me/acme-web"));
    expect(calls("/api/registry/repos/check", "POST")).toEqual([
      { path: "/home/me/acme-web" },
    ]);

    await userEvent.click(confirm(dialog));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(calls("/api/registry/repos", "POST")).toEqual([
      { path: "/home/me/acme-web" },
    ]);
    expect(await screen.findByText("/home/me/acme-web")).toBeInTheDocument();
    expect(statusRegion()).toHaveTextContent("Registered …/me/acme-web.");
  });

  it("registers a typed path, the chooser never opened", async () => {
    const { calls } = stubRegistry({ repos: [] });
    renderRepositories();
    const dialog = await openDialog();

    await userEvent.type(field(), "/home/me/acme-web{Enter}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(calls("/api/registry/repos", "POST")).toEqual([
      { path: "/home/me/acme-web" },
    ]);
    expect(dialog).not.toBeInTheDocument();
  });

  it("states a refused registration under the field and keeps the dialog open", async () => {
    stubRegistry({
      repos: [{ path: "/home/me/payments-api", status: "ready" }],
      refusals: { "/home/me/notes": "not-a-git-repo" },
    });
    renderRepositories();
    const dialog = await openDialog();

    await userEvent.type(field(), "/home/me/notes");
    await userEvent.click(confirm(dialog));

    expect(
      await within(dialog).findByText(
        "Not a Git repository. Register a valid repository.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("/home/me/notes")).not.toBeInTheDocument();
    expect(statusRegion()).not.toHaveTextContent("Registered");
  });

  it("clears the refusal once the field changes", async () => {
    stubRegistry({
      repos: [],
      refusals: { "/home/me/notes": "not-a-git-repo" },
    });
    renderRepositories();
    const dialog = await openDialog();
    await userEvent.type(field(), "/home/me/notes");
    await userEvent.click(confirm(dialog));
    await within(dialog).findByText(
      "Not a Git repository. Register a valid repository.",
    );

    await userEvent.type(field(), "-app");

    expect(
      within(dialog).queryByText(
        "Not a Git repository. Register a valid repository.",
      ),
    ).not.toBeInTheDocument();
    expect(field()).not.toHaveAttribute("aria-invalid");
  });

  it("shows Registering… in the pressed control and cannot be closed while it runs", async () => {
    let release = () => {};
    const state: FakeRegistry = {
      repos: [],
      holdRegister: new Promise<void>((resolve) => {
        release = resolve;
      }),
    };
    stubRegistry(state);
    renderRepositories();
    const dialog = await openDialog();
    await userEvent.type(field(), "/home/me/acme-web");

    await userEvent.click(confirm(dialog));

    expect(
      await within(dialog).findByRole("button", { name: "Registering…" }),
    ).toBeInTheDocument();
    expect(statusRegion()).toHaveTextContent("Registering…");
    await userEvent.keyboard("{Escape}");
    fireEvent.pointerDown(document.body);
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^Close/ }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    release();
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("closes from its header's Close control", async () => {
    stubRegistry({ repos: [] });
    renderRepositories();
    const dialog = await openDialog();

    await userEvent.click(
      within(dialog).getByRole("button", { name: /^Close/ }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Cancel and registers nothing", async () => {
    const { calls } = stubRegistry({ repos: [] });
    renderRepositories();
    const dialog = await openDialog();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls("/api/registry/repos", "POST")).toEqual([]);
  });

  it("opens from the empty state's own Register repository", async () => {
    stubRegistry({ repos: [] });
    renderRepositories();
    await screen.findByText("No repositories yet");

    const buttons = screen.getAllByRole("button", { name: REGISTER });
    await userEvent.click(buttons[buttons.length - 1] as HTMLElement);

    expect(
      await screen.findByRole("dialog", { name: "Register a repository" }),
    ).toBeInTheDocument();
  });
});
