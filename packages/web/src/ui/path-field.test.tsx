import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { PathField } from "./path-field";
import { useFolderChooser } from "./use-folder-chooser";

// PathField is a Field plus **Browse**, which asks the server to open the
// system folder chooser (ADR-0032). The server is stubbed at fetch.

type ChooserReply = { status?: number; body: unknown };

function stubServer(available: boolean, reply?: () => Promise<ChooserReply>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/folder-chooser" && init?.method === "POST") {
      const { status, body } = reply
        ? await reply()
        : { status: 200, body: { path: null } };
      return jsonResponse(body, status);
    }
    if (url === "/api/folder-chooser") {
      return jsonResponse({ available });
    }
    throw new Error(`unexpected ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const posts = () =>
    fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
  return { posts };
}

function Harness({
  initial = "",
  onPicked,
}: {
  initial?: string;
  onPicked?: (path: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <PathField
      label="Folder path"
      value={value}
      onChange={setValue}
      onPicked={onPicked}
      chooser={useFolderChooser()}
    />
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PathField", () => {
  it("opens the chooser on the folder already in the field and fills in the pick", async () => {
    const { posts } = stubServer(true, async () => ({
      body: { path: "/Users/me/Work" },
    }));
    const onPicked = vi.fn();
    renderWithQuery(<Harness initial="/Users/me" onPicked={onPicked} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Browse" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Folder path" })).toHaveValue(
        "/Users/me/Work",
      ),
    );
    expect(JSON.parse(String(posts()[0]?.[1]?.body))).toEqual({
      path: "/Users/me",
    });
    // The caller checks the folder right after the pick.
    expect(onPicked).toHaveBeenCalledWith("/Users/me/Work");
  });

  it("renders no Browse where the computer has no chooser", async () => {
    stubServer(false);
    renderWithQuery(<Harness />);

    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "/api/folder-chooser",
        expect.anything(),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("button", { name: "Browse" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Folder path" })).toBeVisible();
  });

  it("leaves the field unchanged and says nothing when the chooser is cancelled", async () => {
    stubServer(true, async () => ({ body: { path: null } }));
    const onPicked = vi.fn();
    renderWithQuery(<Harness initial="/Users/me" onPicked={onPicked} />);

    const browse = await screen.findByRole("button", { name: "Browse" });
    await userEvent.click(browse);

    await waitFor(() => expect(browse).not.toHaveAttribute("aria-busy"));
    expect(screen.getByRole("textbox")).toHaveValue("/Users/me");
    expect(onPicked).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("locks Browse while the chooser is open and keeps the field typeable", async () => {
    let answer: (reply: ChooserReply) => void = () => {};
    const { posts } = stubServer(
      true,
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    renderWithQuery(<Harness />);

    const browse = await screen.findByRole("button", { name: "Browse" });
    await userEvent.click(browse);

    expect(browse).toHaveAttribute("aria-busy", "true");
    expect(browse).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(browse);
    expect(posts()).toHaveLength(1);
    await userEvent.type(screen.getByRole("textbox"), "/typed");
    expect(screen.getByRole("textbox")).toHaveValue("/typed");

    answer({ body: { path: null } });
    await waitFor(() => expect(browse).not.toHaveAttribute("aria-busy"));
  });

  it("states a failed chooser under the field and leaves the field unchanged", async () => {
    stubServer(true, async () => ({
      status: 502,
      body: { error: "chooser-failed" },
    }));
    renderWithQuery(<Harness initial="/Users/me" />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Browse" }),
    );

    expect(
      await screen.findByText("Folder chooser did not work"),
    ).toBeVisible();
    const field = screen.getByRole("textbox");
    expect(field).toHaveValue("/Users/me");
    expect(field).toHaveAccessibleDescription(/Folder chooser did not work/);
  });
});
