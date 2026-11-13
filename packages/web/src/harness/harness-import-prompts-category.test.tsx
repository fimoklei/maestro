import type {
  CategoryList,
  ImportPromptCheck,
  ImportPromptsAnswer,
  PromptImportDraft,
} from "@maestro/core";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery, sentence } from "../test-utils";
import { chooseFilesSource, RELEASED } from "./harness-flow-fixture";
import { HarnessView } from "./harness-view";

// Each row's Category in Import prompts, over a server that keeps its own
// category list and lands every prompt it is sent.

type Assignment = CategoryList["assignments"][number];

const listOf = (names: string[], assignments: Assignment[]): CategoryList => ({
  categories: names.map((name) => ({
    name,
    skills: 0,
    prompts: assignments.filter((each) => each.category === name).length,
  })),
  assignments,
});

function stubServer({
  taken = [],
  names = ["Code review", "Docs"],
  assignments = [],
  assign,
}: {
  taken?: string[];
  names?: string[];
  assignments?: Assignment[];
  assign?: () => Response;
}) {
  const assigned: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body =
        init?.method === "POST" ? JSON.parse(String(init.body)) : null;
      if (url === "/api/harness/prompt/check") {
        return jsonResponse({
          mode: taken.includes(body.name) ? "update" : "add",
          nameBlocker: null,
        } satisfies ImportPromptCheck);
      }
      if (url === "/api/harness/prompts/import") {
        return jsonResponse({
          outcomes: (body.prompts as PromptImportDraft[]).map(
            ({ name, replace }) => ({
              name,
              imported: true,
              mode: replace ? "update" : "add",
            }),
          ),
        } satisfies ImportPromptsAnswer);
      }
      if (url === "/api/categories/assign") {
        assigned.push(body);
        return assign ? assign() : jsonResponse(listOf(names, assignments));
      }
      if (url === "/api/categories") {
        return jsonResponse(listOf(names, assignments));
      }
      return jsonResponse(RELEASED);
    }),
  );
  return { assigned };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const promptFile = (fileName: string, category: string | null = null) =>
  new File(
    [
      `---\ndescription: The ${fileName} prompt\n${
        category === null ? "" : `metadata:\n  category: ${category}\n`
      }---\nRun ${fileName}.\n`,
    ],
    fileName,
  );

async function openWithFiles(
  user: ReturnType<typeof userEvent.setup>,
  files: File[],
) {
  renderWithQuery(<HarnessView openPrimitive={null} written={null} />);
  await user.click(await screen.findByRole("button", { name: "Import" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "Import prompts" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Import prompts" });
  await chooseFilesSource(user, dialog);
  const input = dialog.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error("no file input");
  await user.upload(input, files);
  await within(dialog).findAllByRole("checkbox");
  return within(dialog);
}

const categoryOf = (dialog: ReturnType<typeof within>, name: string) =>
  dialog.getByRole("button", { name: `Set category for ${name}` });

describe("Import prompts' Category per row", () => {
  it("starts a new row on the category its front matter names when the list holds it, and saves it after the import", async () => {
    const { assigned } = stubServer({});
    const user = userEvent.setup();
    const dialog = await openWithFiles(user, [
      promptFile("release-notes.md", "DOCS"),
      promptFile("standup.md"),
    ]);

    expect(await dialog.findByText("Docs")).toBeInTheDocument();
    expect(categoryOf(dialog, "release-notes")).toHaveTextContent("Docs");
    expect(categoryOf(dialog, "standup")).toHaveTextContent("No category");

    await user.click(dialog.getByRole("button", { name: "Import 2 prompts" }));

    await dialog.findByRole("heading", { name: "Imported 2 of 2 prompts" });
    expect(assigned).toEqual([
      { items: [{ type: "prompt", name: "release-notes" }], category: "Docs" },
    ]);
  });

  it("leaves a row on No category when the list lacks its file's category, with that name waiting in the menu search", async () => {
    const { assigned } = stubServer({});
    const user = userEvent.setup();
    const dialog = await openWithFiles(user, [
      promptFile("standup.md", "Rituals"),
    ]);

    const control = categoryOf(dialog, "standup");
    expect(control).toHaveTextContent("No category");
    await user.click(control);
    expect(
      screen.getByRole("combobox", { name: "Search categories" }),
    ).toHaveValue("Rituals");
    expect(
      screen.getByRole("option", { name: "Add category Rituals" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(dialog.getByRole("button", { name: "Import prompt" }));

    await dialog.findByRole("heading", { name: "Imported 1 of 1 prompt" });
    expect(assigned).toEqual([]);
  });

  it("starts a held row on the held prompt's category, and saves the one picked when it is replaced", async () => {
    const { assigned } = stubServer({
      taken: ["standup"],
      assignments: [{ type: "prompt", name: "standup", category: "Docs" }],
    });
    const user = userEvent.setup();
    const dialog = await openWithFiles(user, [
      promptFile("standup.md", "Code review"),
    ]);

    const held = await dialog.findByRole("group", {
      name: /Already in the Harness · 1/,
    });
    await within(held).findByText("Docs");
    expect(categoryOf(dialog, "standup")).toHaveTextContent("Docs");
    await user.click(categoryOf(dialog, "standup"));
    await user.click(screen.getByRole("option", { name: "Code review" }));
    await user.click(dialog.getByRole("checkbox", { name: "standup" }));
    await user.click(dialog.getByRole("button", { name: "Import prompt" }));

    await dialog.findByRole("heading", { name: "Imported 1 of 1 prompt" });
    expect(assigned).toEqual([
      { items: [{ type: "prompt", name: "standup" }], category: "Code review" },
    ]);
  });

  it("states a category not saved in the Report, and still lists the imported prompt", async () => {
    stubServer({ assign: () => jsonResponse({ error: "other" }, 500) });
    const user = userEvent.setup();
    const dialog = await openWithFiles(user, [
      promptFile("release-notes.md", "Docs"),
    ]);
    await dialog.findByText("Docs");

    await user.click(dialog.getByRole("button", { name: "Import prompt" }));

    const failed = await dialog.findByRole("region", {
      name: "Category not set · 1",
    });
    expect(
      within(failed).getByText(
        sentence(
          "release-notes was imported. Select Close, then select Set category on Prompts.",
        ),
      ),
    ).toBeInTheDocument();
    const landed = dialog.getByRole("region", { name: "Imported · 1" });
    expect(within(landed).getByText("release-notes")).toBeInTheDocument();
  });

  it("shows no category menu on a row that cannot be imported", async () => {
    stubServer({});
    const user = userEvent.setup();
    const dialog = await openWithFiles(user, [
      promptFile("standup.md", "Docs"),
      new File(["Welcome $ARGUMENTS.\n"], "onboarding.md"),
    ]);

    expect(categoryOf(dialog, "standup")).toBeInTheDocument();
    expect(
      dialog.queryByRole("button", { name: "Set category for onboarding" }),
    ).not.toBeInTheDocument();
  });
});
