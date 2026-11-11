import type { HarnessState, SkillFolder, SkillFolderScan } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  expectDescription,
  jsonResponse,
  renderWithQuery,
} from "../test-utils";
import { RELEASED } from "./harness-flow-fixture";
import { HarnessView } from "./harness-view";

const FOLDER = "/home/me/.claude/skills";

const SCAN = {
  folderBlocker: null,
  folders: [
    {
      entry: "code-review",
      name: "code-review",
      refusal: null,
      replaces: false,
    },
    {
      entry: "notes-helper",
      name: "notes-helper",
      refusal: "empty-description",
      replaces: false,
    },
    { entry: "review", name: "review", refusal: null, replaces: true },
    { entry: "tdd", name: "tdd", refusal: null, replaces: false },
  ],
} satisfies SkillFolderScan;

// The harness read, the folder chooser, the scan and the import.
function stubServer(options: {
  scan?: SkillFolderScan;
  outcomes?: SkillFolder[];
  harness?: HarnessState;
}) {
  const imports: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/folder-chooser") {
        return jsonResponse(
          init?.method === "POST" ? { path: FOLDER } : { available: true },
        );
      }
      if (url === "/api/harness/import/skills/check") {
        return jsonResponse(options.scan ?? SCAN);
      }
      if (url === "/api/harness/import/skills") {
        imports.push(JSON.parse(String(init?.body)));
        return jsonResponse({ outcomes: options.outcomes ?? [] });
      }
      return jsonResponse(options.harness ?? RELEASED);
    }),
  );
  return { imports };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openImportSkills(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Import" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "Import skills" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Import skills" });
  await user.click(within(dialog).getByRole("button", { name: "Browse" }));
  await within(dialog).findByRole("checkbox", { name: "code-review" });
  return dialog;
}

describe("Harness import of several skills", () => {
  it("lists the folders inside the chosen one, with what cannot be imported apart", async () => {
    stubServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);

    const dialog = await openImportSkills(user);

    const ready = within(dialog).getByRole("group", {
      name: "Can be imported · 2",
    });
    expect(
      within(ready).getByRole("checkbox", { name: "code-review" }),
    ).toBeChecked();
    expect(within(ready).getByRole("checkbox", { name: "tdd" })).toBeChecked();
    const refused = within(dialog).getByRole("group", {
      name: "✕ Cannot be imported · 1",
    });
    const broken = within(refused).getByRole("checkbox", {
      name: "notes-helper",
    });
    expect(broken).toHaveAttribute("aria-disabled", "true");
    expectDescription(
      broken,
      "SKILL.md has an empty description. Add one, then choose the folder again.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Import 2 skills" }),
    ).toBeInTheDocument();
  });

  it("lists a folder the Harness holds apart, unchecked, naming the skill it replaces", async () => {
    stubServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);

    const dialog = await openImportSkills(user);

    const held = within(dialog).getByRole("group", {
      name: "⚠ Already in the Harness · 1",
    });
    const review = within(held).getByRole("checkbox", { name: "review" });
    expect(review).not.toBeChecked();
    expect(review).not.toHaveAttribute("aria-disabled");
    expectDescription(review, "Replaces review in the Harness.");
  });

  it("replaces a held skill only once its folder is ticked, and reports it as Changed", async () => {
    const { imports } = stubServer({
      outcomes: [
        {
          entry: "code-review",
          name: "code-review",
          refusal: null,
          replaces: false,
        },
        { entry: "review", name: "review", refusal: null, replaces: true },
      ],
    });
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);
    const dialog = await openImportSkills(user);

    await user.click(within(dialog).getByRole("checkbox", { name: "tdd" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "review" }));
    await user.click(
      within(dialog).getByRole("button", { name: "Import 2 skills" }),
    );

    await within(dialog).findByRole("heading", {
      name: "Imported 2 of 2 skills",
    });
    expect(imports).toEqual([
      {
        source: FOLDER,
        entries: [
          { entry: "code-review", replace: false },
          { entry: "review", replace: true },
        ],
      },
    ]);
    const landed = within(dialog).getByRole("region", { name: "Imported · 2" });
    expect(within(landed).getByText("Changed")).toBeInTheDocument();
    expect(within(landed).getByText("Added")).toBeInTheDocument();
  });

  it("imports the ticked folders and reports what landed and what was refused", async () => {
    const { imports } = stubServer({
      outcomes: [
        {
          entry: "code-review",
          name: "code-review",
          refusal: null,
          replaces: false,
        },
        {
          entry: "tdd",
          name: "tdd",
          refusal: "source-changed",
          replaces: false,
        },
      ],
    });
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);
    const dialog = await openImportSkills(user);

    await user.click(within(dialog).getByRole("checkbox", { name: "tdd" }));
    expect(
      within(dialog).getByRole("button", { name: "Import 1 skill" }),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("checkbox", { name: "tdd" }));
    await user.click(
      within(dialog).getByRole("button", { name: "Import 2 skills" }),
    );

    await within(dialog).findByRole("heading", {
      name: "Imported 1 of 2 skills",
    });
    expect(imports).toEqual([
      {
        source: FOLDER,
        entries: [
          { entry: "code-review", replace: false },
          { entry: "tdd", replace: false },
        ],
      },
    ]);
    const failed = within(dialog).getByRole("region", {
      name: "Not imported · 1",
    });
    expect(within(failed).getByText("tdd")).toBeInTheDocument();
    expect(
      within(failed).getByText(
        "The folder changed during the import. Wait for the change to finish, then select Import skills again.",
      ),
    ).toBeInTheDocument();
    const landed = within(dialog).getByRole("region", { name: "Imported · 1" });
    expect(within(landed).getByText("code-review")).toBeInTheDocument();
    // The footer's Close, after the header's.
    const close = within(dialog)
      .getAllByRole("button", { name: "Close" })
      .at(-1);
    if (close === undefined) throw new Error("No Close in the footer.");
    await user.click(close);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("states the empty Folder path on submit, and lists a typed folder on the next", async () => {
    stubServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);
    await user.click(await screen.findByRole("button", { name: "Import" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Import skills" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Import skills" });

    await user.click(
      within(dialog).getByRole("button", { name: "Import skills" }),
    );
    expect(
      within(dialog).getByText(
        "Enter the absolute path of the folder that contains your skills.",
      ),
    ).toBeInTheDocument();

    await user.type(
      within(dialog).getByRole("textbox", { name: "Folder path" }),
      FOLDER,
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Import skills" }),
    );
    expect(
      await within(dialog).findByRole("checkbox", { name: "tdd" }),
    ).toBeChecked();
  });

  it("blocks the import while nothing is ticked", async () => {
    const { imports } = stubServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);
    const dialog = await openImportSkills(user);

    await user.click(
      within(dialog).getByRole("checkbox", { name: "code-review" }),
    );
    await user.click(within(dialog).getByRole("checkbox", { name: "tdd" }));
    const confirm = within(dialog).getByRole("button", {
      name: "Import skills",
    });
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    await user.click(confirm);
    expect(imports).toEqual([]);
  });
});
