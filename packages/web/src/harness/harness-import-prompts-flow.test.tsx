import type {
  HarnessState,
  ImportPromptCheck,
  ImportPromptsAnswer,
  PromptImportDraft,
} from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  expectTooltipCause,
  jsonResponse,
  noCategories,
  renderWithQuery,
} from "../test-utils";
import { HarnessView } from "./harness-view";

const HARNESS: HarnessState = {
  origin: "github.com/fimoklei/agent-harness",
  releasedVersion: "v0.5.0",
  defaultBranch: "main",
  releaseState: "released",
  freshness: { outcome: "fetched", lastFetchedAt: "2026-08-03T11:56:00.000Z" },
  cloneSync: "current",
  localHeadCommit: "local-head",
  stages: {
    proposal: { outcome: "read", rows: [], bound: null },
    review: { outcome: "read", rows: [], bound: null },
    release: { outcome: "read", rows: [], bound: null },
  },
};

function stubServer(options: {
  /** Names the Harness already holds. */
  taken?: readonly string[];
  answer?: (prompts: PromptImportDraft[]) => unknown;
  status?: number;
}) {
  const imports: { prompts: PromptImportDraft[] }[] = [];
  let harnessReads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const categories = noCategories(input);
      if (categories !== null) return categories;
      if (url === "/api/harness/prompt/check") {
        const { name } = JSON.parse(String(init?.body)) as { name: string };
        return jsonResponse({
          mode: options.taken?.includes(name) ? "update" : "add",
          nameBlocker: null,
        } satisfies ImportPromptCheck);
      }
      if (url === "/api/harness/prompts/import") {
        const body = JSON.parse(String(init?.body)) as {
          prompts: PromptImportDraft[];
        };
        imports.push(body);
        return jsonResponse(
          options.answer?.(body.prompts) ??
            ({
              outcomes: body.prompts.map(({ name, replace }) => ({
                name,
                imported: true,
                mode: replace ? "update" : "add",
              })),
            } satisfies ImportPromptsAnswer),
          options.status,
        );
      }
      harnessReads += 1;
      return jsonResponse(HARNESS);
    }),
  );
  return { imports, harnessReads: () => harnessReads };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const promptFile = (description: string, text: string) =>
  `---\ndescription: ${description}\n---\n${text}`;

const RELEASE_NOTES = new File(
  [promptFile("Draft the release notes", "Draft the notes for $ARGUMENTS.\n")],
  "release-notes.md",
);
const STANDUP = new File(
  [promptFile("Run the standup", "List what changed since yesterday.\n")],
  "standup-notes.txt",
);
const COMMIT_TIPS = new File(
  [promptFile("Commit tips", "Write the subject in the imperative.\n")],
  "commit-tips.md",
);
const NO_DESCRIPTION = new File(["Welcome $ARGUMENTS.\n"], "onboarding.md");
// No name, no description and no text: the name is the one reason shown.
const BROKEN_EVERYWHERE = new File(["---\ndescription: \n---\n"], "_.md");
const NOT_TEXT = new File([new Uint8Array([0x52, 0xff, 0xfe])], "pairing.md");

async function openImportPrompts(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Import" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "Import prompts" }),
  );
  return screen.findByRole("dialog", { name: "Import prompts" });
}

// The browser's file input sits hidden behind Choose files; it has no role.
async function chooseFiles(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  files: File[],
) {
  const input = dialog.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error("no file input");
  expect(input).toHaveAttribute("multiple");
  expect(input).toHaveAttribute("accept", ".md,.txt");
  // The source switch has a Choose files segment too; it carries aria-pressed.
  const button = within(dialog)
    .getAllByRole("button", { name: "Choose files" })
    .find((each) => !each.hasAttribute("aria-pressed"));
  if (button === undefined) throw new Error("no Choose files button");
  await user.click(button);
  await user.upload(input, files);
}

const group = (dialog: HTMLElement, legend: RegExp) =>
  within(dialog).getByRole("group", { name: legend });

describe("Harness import prompts flow", () => {
  it("imports the chosen files in one call and reports each", async () => {
    const server = stubServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);
    const dialog = await openImportPrompts(user);

    await chooseFiles(user, dialog, [RELEASE_NOTES, STANDUP]);
    const ready = group(dialog, /Can be imported · 2/);
    expect(
      within(ready).getByRole("checkbox", { name: "release-notes" }),
    ).toBeChecked();
    expect(
      within(ready).getByRole("checkbox", { name: "standup-notes" }),
    ).toBeChecked();
    const reads = server.harnessReads();
    await user.click(
      within(dialog).getByRole("button", { name: "Import 2 prompts" }),
    );

    expect(
      await within(dialog).findByRole("heading", {
        name: "Imported 2 of 2 prompts",
      }),
    ).toBeVisible();
    expect(server.imports).toEqual([
      {
        prompts: [
          {
            name: "release-notes",
            frontmatter: "description: Draft the release notes",
            description: "Draft the release notes",
            text: "Draft the notes for $ARGUMENTS.\n",
            example: "",
            replace: false,
          },
          {
            name: "standup-notes",
            frontmatter: "description: Run the standup",
            description: "Run the standup",
            text: "List what changed since yesterday.\n",
            example: "",
            replace: false,
          },
        ],
      },
    ]);
    const imported = within(dialog).getByRole("region", {
      name: "Imported · 2",
    });
    expect(within(imported).getByText("release-notes")).toBeVisible();
    expect(within(imported).getAllByText("Added")).toHaveLength(2);
    // The rows land under Pending proposal: the Harness is read again.
    await waitFor(() => expect(server.harnessReads()).toBeGreaterThan(reads));
    await user.click(
      within(dialog).getAllByRole("button", { name: "Close" }).at(-1) ?? dialog,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("imports one chosen file as the file holds it, CRLF and example included, and shows the Report", async () => {
    const server = stubServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);
    const dialog = await openImportPrompts(user);

    await chooseFiles(user, dialog, [
      new File(
        [
          "---\r\ndescription: Review\r\nexample: |\r\n  Review #12.\r\n---\r\nRead the diff.\r\nBe brief.\r\n",
        ],
        "review-pr.md",
      ),
    ]);
    await user.click(
      within(dialog).getByRole("button", { name: "Import 1 prompt" }),
    );

    await within(dialog).findByRole("heading", {
      name: "Imported 1 of 1 prompt",
    });
    expect(server.imports[0]?.prompts).toMatchObject([
      {
        name: "review-pr",
        description: "Review",
        text: "Read the diff.\r\nBe brief.\r\n",
        example: "Review #12.\n",
      },
    ]);
  });

  it("lists each file that cannot be imported with one reason", async () => {
    const server = stubServer({ taken: ["commit-tips"] });
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);
    const dialog = await openImportPrompts(user);

    await chooseFiles(user, dialog, [
      RELEASE_NOTES,
      COMMIT_TIPS,
      NO_DESCRIPTION,
      BROKEN_EVERYWHERE,
      NOT_TEXT,
    ]);

    const refused = await waitFor(() =>
      group(dialog, /Cannot be imported · 3/),
    );
    const reason = (name: string) => {
      const box = within(refused).getByRole("checkbox", { name });
      expect(box).toHaveAttribute("aria-disabled", "true");
      return box;
    };
    expect(reason("onboarding")).toHaveAccessibleDescription(
      "The file has no description in its front matter. Add one, then select the file again.",
    );
    expect(reason("_.md")).toHaveAccessibleDescription(
      "The file name has no letters or digits. Rename the file, then select it again.",
    );
    expect(reason("pairing")).toHaveAccessibleDescription(
      "Maestro reads only UTF-8 text. Save the file as UTF-8, then select it again.",
    );
    expect(group(dialog, /Can be imported · 1/)).toBeVisible();

    await user.click(
      within(dialog).getByRole("button", { name: "Import 1 prompt" }),
    );
    await within(dialog).findByRole("heading", {
      name: "Imported 1 of 1 prompt",
    });
    expect(server.imports[0]?.prompts.map(({ name }) => name)).toEqual([
      "release-notes",
    ]);
  });

  it("lists a file whose prompt the Harness holds apart, unchecked, naming the prompt it replaces", async () => {
    stubServer({ taken: ["commit-tips"] });
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);
    const dialog = await openImportPrompts(user);

    await chooseFiles(user, dialog, [RELEASE_NOTES, COMMIT_TIPS]);

    const held = await waitFor(() =>
      group(dialog, /^⚠ Already in the Harness · 1$/),
    );
    const box = within(held).getByRole("checkbox", { name: "commit-tips" });
    expect(box).not.toBeChecked();
    expect(box).not.toHaveAttribute("aria-disabled");
    expect(box).toHaveAccessibleDescription("Replaces the one in the Harness");
    expect(
      within(dialog).getByRole("button", { name: "Import 1 prompt" }),
    ).toBeVisible();
  });

  it("replaces a held prompt only once its file is ticked, and reports it as Changed", async () => {
    const server = stubServer({ taken: ["commit-tips"] });
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);
    const dialog = await openImportPrompts(user);
    await chooseFiles(user, dialog, [RELEASE_NOTES, COMMIT_TIPS]);
    await waitFor(() => group(dialog, /Already in the Harness · 1/));

    await user.click(
      within(dialog).getByRole("checkbox", { name: "commit-tips" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Import 2 prompts" }),
    );

    await within(dialog).findByRole("heading", {
      name: "Imported 2 of 2 prompts",
    });
    expect(
      server.imports[0]?.prompts.map(({ name, replace }) => [name, replace]),
    ).toEqual([
      ["release-notes", false],
      ["commit-tips", true],
    ]);
    const imported = within(dialog).getByRole("region", {
      name: "Imported · 2",
    });
    expect(within(imported).getByText("Changed")).toBeVisible();
    expect(within(imported).getByText("Added")).toBeVisible();
  });

  it("sends only the checked files", async () => {
    const server = stubServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);
    const dialog = await openImportPrompts(user);
    await chooseFiles(user, dialog, [RELEASE_NOTES, STANDUP]);

    await user.click(
      within(dialog).getByRole("checkbox", { name: "standup-notes" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Import 1 prompt" }),
    );

    await within(dialog).findByRole("heading", {
      name: "Imported 1 of 1 prompt",
    });
    expect(server.imports[0]?.prompts.map(({ name }) => name)).toEqual([
      "release-notes",
    ]);
  });

  it("opens empty again after Cancel, with no chosen file left", async () => {
    stubServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);
    const first = await openImportPrompts(user);
    await chooseFiles(user, first, [RELEASE_NOTES, STANDUP]);
    await user.click(
      within(first).getByRole("checkbox", { name: "standup-notes" }),
    );
    await user.click(within(first).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const again = await openImportPrompts(user);
    expect(within(again).queryAllByRole("checkbox")).toEqual([]);
  });

  it("blocks the import until a file is chosen and checked", async () => {
    stubServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);
    const dialog = await openImportPrompts(user);

    await expectTooltipCause(
      within(dialog).getByRole("button", { name: "Import prompts" }),
      "Choose files.",
    );
    await chooseFiles(user, dialog, [RELEASE_NOTES]);
    await user.click(
      within(dialog).getByRole("checkbox", { name: "release-notes" }),
    );
    await expectTooltipCause(
      within(dialog).getByRole("button", { name: "Import prompts" }),
      "Check at least one prompt.",
    );
  });

  it("reports a file the import refused, beside the ones it wrote", async () => {
    stubServer({
      answer: (prompts) =>
        ({
          outcomes: prompts.map(({ name }) =>
            name === "standup-notes"
              ? { name, imported: false, refusal: "prompt-taken" }
              : { name, imported: true, mode: "add" },
          ),
        }) satisfies ImportPromptsAnswer,
    });
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);
    const dialog = await openImportPrompts(user);
    await chooseFiles(user, dialog, [RELEASE_NOTES, STANDUP]);

    await user.click(
      within(dialog).getByRole("button", { name: "Import 2 prompts" }),
    );

    await within(dialog).findByRole("heading", {
      name: "Imported 1 of 2 prompts",
    });
    const failed = within(dialog).getByRole("region", {
      name: "Not imported · 1",
    });
    expect(within(failed).getByText("standup-notes")).toBeVisible();
    expect(
      within(failed).getByText(
        "The Harness already contains a prompt with this name. To replace it, select Import prompts again. Choose the file, then check it under Already in the Harness.",
      ),
    ).toBeVisible();
  });

  it("keeps the files when the whole batch is refused", async () => {
    stubServer({
      status: 409,
      answer: () => ({ error: "import-in-progress" }),
    });
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);
    const dialog = await openImportPrompts(user);
    await chooseFiles(user, dialog, [RELEASE_NOTES]);

    await user.click(
      within(dialog).getByRole("button", { name: "Import 1 prompt" }),
    );

    expect(await within(dialog).findByText("Harness busy")).toBeVisible();
    expect(
      within(dialog).getByRole("checkbox", { name: "release-notes" }),
    ).toBeChecked();
  });

  it("reads the Harness again when the answer breaks, since some files may have landed", async () => {
    const server = stubServer({ status: 500, answer: () => ({}) });
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);
    const dialog = await openImportPrompts(user);
    await chooseFiles(user, dialog, [RELEASE_NOTES]);
    const reads = server.harnessReads();

    await user.click(
      within(dialog).getByRole("button", { name: "Import 1 prompt" }),
    );

    await waitFor(() => expect(server.harnessReads()).toBeGreaterThan(reads));
  });
});
