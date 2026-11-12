import type { ImportPromptCheck, SkillFolderScan } from "@maestro/core";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { RELEASED } from "./harness-flow-fixture";
import { HarnessView } from "./harness-view";

const SCAN = {
  folderBlocker: null,
  folders: [
    {
      entry: "code-review",
      name: "code-review",
      refusal: null,
      replaces: false,
    },
    { entry: "tdd", name: "tdd", refusal: null, replaces: false },
  ],
} satisfies SkillFolderScan;

// The harness read, the folder chooser, both scans and the prompt name check.
function stubServer() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/folder-chooser") {
        return jsonResponse(
          init?.method === "POST"
            ? { path: "/home/me/.claude/skills" }
            : { available: true },
        );
      }
      if (url === "/api/harness/import/skills/check") return jsonResponse(SCAN);
      if (url === "/api/harness/prompt/check") {
        return jsonResponse({
          mode: "add",
          nameBlocker: null,
        } satisfies ImportPromptCheck);
      }
      return jsonResponse(RELEASED);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openImport(
  user: ReturnType<typeof userEvent.setup>,
  item: string,
) {
  await user.click(await screen.findByRole("button", { name: "Import" }));
  await user.click(await screen.findByRole("menuitem", { name: item }));
  return screen.findByRole("dialog", { name: item });
}

const promptFile = (name: string) =>
  new File([`---\ndescription: ${name}\n---\nText.\n`], `${name}.md`);

describe("Harness import checklist", () => {
  it("checks every new skill folder again once another folder is chosen", async () => {
    stubServer();
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);
    const dialog = await openImport(user, "Import skills");
    await user.click(within(dialog).getByRole("button", { name: "Browse" }));
    await user.click(
      await within(dialog).findByRole("checkbox", { name: "tdd" }),
    );
    expect(
      within(dialog).getByRole("checkbox", { name: "tdd" }),
    ).not.toBeChecked();

    const field = within(dialog).getByRole("textbox", { name: "Folder path" });
    await user.clear(field);
    await user.type(field, "/home/me/other-skills");
    await user.tab();

    expect(
      await within(dialog).findByRole("checkbox", {
        name: "tdd",
        checked: true,
      }),
    ).toBeInTheDocument();
  });

  it("checks every new prompt file again once files are chosen anew", async () => {
    stubServer();
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);
    const dialog = await openImport(user, "Import prompts");
    const input = dialog.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error("no file input");
    const files = [promptFile("release-notes"), promptFile("standup")];
    await user.upload(input, files);
    await user.click(
      await within(dialog).findByRole("checkbox", { name: "standup" }),
    );
    expect(
      within(dialog).getByRole("checkbox", { name: "standup" }),
    ).not.toBeChecked();

    await user.upload(input, files);

    expect(
      await within(dialog).findByRole("checkbox", {
        name: "standup",
        checked: true,
      }),
    ).toBeInTheDocument();
  });
});
