import type {
  CategoryList,
  SkillFolder,
  SkillFolderOutcome,
  SkillFolderScan,
} from "@maestro/core";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery, sentence } from "../test-utils";
import { RELEASED } from "./harness-flow-fixture";
import { HarnessView } from "./harness-view";

// Each row's Category in Import skills, over a server that keeps its own
// category list and lands every folder it is sent.

const FOLDER = "/home/me/.claude/skills";

type Assignment = CategoryList["assignments"][number];

const folder = (
  entry: string,
  change: Partial<SkillFolder> = {},
): SkillFolder => ({
  entry,
  name: entry,
  refusal: null,
  replaces: false,
  category: null,
  ...change,
});

const listOf = (names: string[], assignments: Assignment[]): CategoryList => ({
  categories: names.map((name) => ({
    name,
    skills: assignments.filter((each) => each.category === name).length,
    prompts: 0,
  })),
  assignments,
});

function stubServer({
  folders,
  names = ["Code review", "Docs"],
  assignments = [],
  assign,
}: {
  folders: SkillFolder[];
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
      if (url === "/api/folder-chooser") {
        return jsonResponse(
          init?.method === "POST" ? { path: FOLDER } : { available: true },
        );
      }
      if (url === "/api/harness/import/skills/check") {
        return jsonResponse({
          folderBlocker: null,
          folder: FOLDER,
          folders,
        } satisfies SkillFolderScan);
      }
      if (url === "/api/harness/import/skills") {
        const outcomes = body.entries.map(
          ({ entry, replace }: { entry: string; replace: boolean }) => ({
            entry,
            name: entry,
            refusal: null,
            replaces: replace,
          }),
        ) satisfies SkillFolderOutcome[];
        return jsonResponse({ outcomes });
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

async function openImportSkills(user: ReturnType<typeof userEvent.setup>) {
  renderWithQuery(<HarnessView openPrimitive={null} written={null} />);
  await user.click(await screen.findByRole("button", { name: "Import" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "Import skills" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Import skills" });
  await user.click(within(dialog).getByRole("button", { name: "Browse" }));
  await within(dialog).findAllByRole("checkbox");
  return within(dialog);
}

const categoryOf = (dialog: ReturnType<typeof within>, name: string) =>
  dialog.getByRole("button", { name: `Set category for ${name}` });

describe("Import skills' Category per row", () => {
  it("starts a new row on the category its SKILL.md names when the list holds it, and saves it after the import", async () => {
    const { assigned } = stubServer({
      folders: [
        folder("code-review", { category: "code REVIEW" }),
        folder("tdd"),
      ],
    });
    const user = userEvent.setup();
    const dialog = await openImportSkills(user);

    expect(await dialog.findByText("Code review")).toBeInTheDocument();
    expect(categoryOf(dialog, "code-review")).toHaveTextContent("Code review");
    expect(categoryOf(dialog, "tdd")).toHaveTextContent("No category");

    await user.click(dialog.getByRole("button", { name: "Import 2 skills" }));

    await dialog.findByRole("heading", { name: "Imported 2 of 2 skills" });
    expect(assigned).toEqual([
      {
        items: [{ type: "skill", name: "code-review" }],
        category: "Code review",
      },
    ]);
  });

  it("leaves a row on No category when the list lacks its file's category, with that name waiting in the menu search", async () => {
    const { assigned } = stubServer({
      folders: [folder("tdd", { category: "Testing" })],
    });
    const user = userEvent.setup();
    const dialog = await openImportSkills(user);

    const control = categoryOf(dialog, "tdd");
    expect(control).toHaveTextContent("No category");
    await user.click(control);
    expect(
      screen.getByRole("combobox", { name: "Search categories" }),
    ).toHaveValue("Testing");
    expect(
      screen.getByRole("option", { name: "Add category Testing" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(dialog.getByRole("button", { name: "Import 1 skill" }));

    await dialog.findByRole("heading", { name: "Imported 1 of 1 skill" });
    expect(assigned).toEqual([]);
  });

  it("starts a held row on the held skill's category, and writes nothing while it stays", async () => {
    const { assigned } = stubServer({
      folders: [folder("review", { replaces: true, category: "Code review" })],
      assignments: [{ type: "skill", name: "review", category: "Docs" }],
    });
    const user = userEvent.setup();
    const dialog = await openImportSkills(user);

    expect(await dialog.findByText("Docs")).toBeInTheDocument();
    expect(categoryOf(dialog, "review")).toHaveTextContent("Docs");
    await user.click(dialog.getByRole("checkbox", { name: "review" }));
    await user.click(dialog.getByRole("button", { name: "Import 1 skill" }));

    await dialog.findByRole("heading", { name: "Imported 1 of 1 skill" });
    expect(assigned).toEqual([]);
  });

  it("saves one category write for the rows that share a picked category", async () => {
    const { assigned } = stubServer({
      folders: [folder("code-review"), folder("tdd"), folder("write-spec")],
    });
    const user = userEvent.setup();
    const dialog = await openImportSkills(user);

    for (const name of ["code-review", "tdd"]) {
      await user.click(categoryOf(dialog, name));
      await user.click(screen.getByRole("option", { name: "Docs" }));
    }
    expect(categoryOf(dialog, "tdd")).toHaveTextContent("Docs");
    await user.click(dialog.getByRole("button", { name: "Import 3 skills" }));

    await dialog.findByRole("heading", { name: "Imported 3 of 3 skills" });
    expect(assigned).toEqual([
      {
        items: [
          { type: "skill", name: "code-review" },
          { type: "skill", name: "tdd" },
        ],
        category: "Docs",
      },
    ]);
  });

  it("states a category not saved in the Report, and still lists the imported skill", async () => {
    stubServer({
      folders: [folder("code-review", { category: "Docs" })],
      assign: () => jsonResponse({ error: "other" }, 500),
    });
    const user = userEvent.setup();
    const dialog = await openImportSkills(user);
    await dialog.findByText("Docs");

    await user.click(dialog.getByRole("button", { name: "Import 1 skill" }));

    const failed = await dialog.findByRole("region", {
      name: "Category not set · 1",
    });
    expect(
      within(failed).getByText(
        sentence(
          "code-review was imported. Select Close, then select Set category on Skills.",
        ),
      ),
    ).toBeInTheDocument();
    const landed = dialog.getByRole("region", { name: "Imported · 1" });
    expect(within(landed).getByText("code-review")).toBeInTheDocument();
  });

  it("shows no category menu on a row that cannot be imported", async () => {
    stubServer({
      folders: [
        folder("code-review"),
        folder("notes-helper", { refusal: "empty-description" }),
      ],
    });
    const user = userEvent.setup();
    const dialog = await openImportSkills(user);

    expect(categoryOf(dialog, "code-review")).toBeInTheDocument();
    expect(
      dialog.queryByRole("button", { name: "Set category for notes-helper" }),
    ).not.toBeInTheDocument();
  });
});
