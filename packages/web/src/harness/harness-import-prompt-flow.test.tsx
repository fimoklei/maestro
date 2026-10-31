import type {
  CategoryList,
  HarnessStageRow,
  HarnessState,
  ImportPromptCheck,
} from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  htmlElement,
  jsonResponse,
  renderWithQuery,
  sentence,
} from "../test-utils";
import { harnessRegion } from "./harness-flow-fixture";
import { HarnessView } from "./harness-view";
import { pullRequest } from "./stage-row-fixture";

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

const IMPORTED_ROW: HarnessStageRow = {
  stage: "pending-proposal",
  type: "prompt",
  name: "review-pr",
  path: ".maestro/prompts/review-pr.md",
  branch: "maestro/prompt.review-pr",
  status: "not-yet-proposed",
  change: "addition",
  requests: [],
  reviewers: [],
  comparison: { kind: "default-branch" },
  alsoIn: [],
  concurrentChange: false,
  waitingOn: null,
  localOnly: true,
  remoteTree: null,
  restorable: false,
  onDisk: true,
  ownsBranch: false,
  previousName: null,
  openRequests: [],
  mergedRequest: null,
};

const IMPORTED_HARNESS: HarnessState = {
  ...HARNESS,
  stages: {
    ...HARNESS.stages,
    proposal: { outcome: "read", bound: null, rows: [IMPORTED_ROW] },
  },
};

function stubPromptServer(options: {
  importStatus?: number;
  importBody?: unknown;
  taken?: readonly string[];
  /** The Harness read once an import succeeded. */
  imported?: HarnessState;
}) {
  const calls: string[] = [];
  const imports: unknown[] = [];
  const checks: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      // Import reads the categories for its Category field.
      if (url === "/api/categories") {
        return jsonResponse({
          categories: [],
          assignments: [],
        } satisfies CategoryList);
      }
      if (url === "/api/harness/prompt/check") {
        const { name } = JSON.parse(String(init?.body)) as { name: string };
        checks.push({ name });
        return jsonResponse({
          mode: options.taken?.includes(name) ? "update" : "add",
          nameBlocker: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)
            ? null
            : "invalid-name",
        } satisfies ImportPromptCheck);
      }
      if (url === "/api/harness/prompt/import") {
        imports.push(JSON.parse(String(init?.body)));
        return jsonResponse(
          options.importBody ?? { mode: "add", name: "review-pr" },
          options.importStatus,
        );
      }
      return jsonResponse(
        imports.length === 0 || options.importStatus !== undefined
          ? HARNESS
          : (options.imported ?? IMPORTED_HARNESS),
      );
    }),
  );
  return { calls, imports, checks };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const PASTED = [
  "---",
  "description: Review the open pull request",
  "model: opus",
  "---",
  "Review $ARGUMENTS.",
  "Use $1 as the focus.",
  "",
].join("\n");

async function openImportPrompt(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Import" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "Import prompt" }),
  );
  return screen.findByRole("dialog", { name: "Import a prompt" });
}

const field = (dialog: HTMLElement, name: string) =>
  within(dialog).getByRole("textbox", { name });

// 2,440 bytes: shown as 2.4 KB.
const REVIEW_PR_BODY = `Review pull request $ARGUMENTS.\n${"Note each change the spec did not ask for.\n".repeat(54)}`;

const REVIEW_PR_FILE = [
  "---",
  "description: >-",
  "  Review the open pull request",
  "  against the spec",
  "model: opus",
  "---",
  REVIEW_PR_BODY,
].join("\n");

// The browser's file input sits hidden behind Choose file; it has no role.
const fileInput = (dialog: HTMLElement): HTMLInputElement => {
  const input = dialog.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error("no file input");
  return input;
};

// Choose file opens the browser's file chooser; upload stands in for the pick.
async function chooseFile(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  file: File,
) {
  await user.click(within(dialog).getByRole("button", { name: "Choose file" }));
  await user.upload(fileInput(dialog), file);
}

describe("Harness import prompt flow", () => {
  it.each([
    ["Enter", "{Enter}"],
    ["Space", " "],
    ["Down Arrow", "{ArrowDown}"],
  ])("opens the Import menu with %s on its first item", async (_, key) => {
    stubPromptServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);

    const trigger = await screen.findByRole("button", { name: "Import" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    htmlElement(trigger).focus();
    await user.keyboard(key);

    const first = await screen.findByRole("menuitem", {
      name: "Import skill",
    });
    await waitFor(() => expect(first).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("menuitem", { name: "Import prompt" }),
    ).toHaveFocus();
  });

  it("opens Import a skill from the menu", async () => {
    stubPromptServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);

    await user.click(await screen.findByRole("button", { name: "Import" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Import skill" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Import a skill" }),
    ).toBeInTheDocument();
  });

  it.each([
    [
      "a paste over the whole text",
      async (user: ReturnType<typeof userEvent.setup>, text: HTMLElement) => {
        await user.click(text);
        await user.keyboard("{Control>}a{/Control}");
        await user.paste("Read the diff.");
      },
    ],
    [
      "clearing the text, then typing",
      async (user: ReturnType<typeof userEvent.setup>, text: HTMLElement) => {
        await user.clear(text);
        await user.type(text, "Read the diff.");
      },
    ],
  ])(
    "drops the pasted front matter after %s without one",
    async (_, replace) => {
      const { imports } = stubPromptServer({});
      const user = userEvent.setup();
      renderWithQuery(<HarnessView openPrimitive={null} written={null} />);

      const dialog = await openImportPrompt(user);
      const text = field(dialog, "Prompt text");
      await user.click(text);
      await user.paste(PASTED);
      await replace(user, text);
      expect(text).toHaveValue("Read the diff.");

      await user.type(field(dialog, "Name"), "review-pr");
      await user.click(
        within(dialog).getByRole("button", { name: "Import prompt" }),
      );

      await waitFor(() =>
        expect(imports).toEqual([
          {
            name: "review-pr",
            frontmatter: "",
            description: "Review the open pull request",
            text: "Read the diff.",
          },
        ]),
      );
    },
  );

  it("imports pasted text, moving its description out of the text", async () => {
    const { imports } = stubPromptServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);

    const dialog = await openImportPrompt(user);
    const text = field(dialog, "Prompt text");
    expect(text).not.toHaveAttribute("placeholder");
    expect(
      within(dialog).getByText(
        sentence("Maestro uses this as the file name in .maestro/prompts."),
      ),
    ).toBeInTheDocument();
    expect(field(dialog, "Description")).toHaveAccessibleDescription(
      "One line, shown in the Prompts table.",
    );
    expect(text).toHaveAccessibleDescription("Saved exactly as you enter it.");

    await user.click(text);
    await user.paste(PASTED);

    expect(field(dialog, "Description")).toHaveValue(
      "Review the open pull request",
    );
    expect(text).toHaveValue("Review $ARGUMENTS.\nUse $1 as the focus.\n");
    // No name is guessed from pasted text.
    expect(field(dialog, "Name")).toHaveValue("");

    await user.type(field(dialog, "Name"), "review-pr");
    await user.type(text, "Be brief.");
    await user.click(
      within(dialog).getByRole("button", { name: "Import prompt" }),
    );

    await waitFor(() =>
      expect(imports).toEqual([
        {
          name: "review-pr",
          frontmatter: "description: Review the open pull request\nmodel: opus",
          description: "Review the open pull request",
          text: "Review $ARGUMENTS.\nUse $1 as the focus.\nBe brief.",
        },
      ]),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const pane = await screen.findByRole("complementary", {
      name: "review-pr detail",
    });
    expect(within(pane).getByText("Pending proposal")).toBeInTheDocument();
    expect(within(pane).getByText("Added")).toBeInTheDocument();
    expect(harnessRegion()).toHaveTextContent("Imported review-pr.");
  });

  it("shows field errors only after an empty submit, and clears each once valid", async () => {
    const { calls } = stubPromptServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);

    const dialog = await openImportPrompt(user);
    const name = field(dialog, "Name");
    const description = field(dialog, "Description");
    const text = field(dialog, "Prompt text");
    expect(name).toBeValid();
    await user.click(name);
    await user.tab();
    expect(name).toBeValid();

    await user.click(
      within(dialog).getByRole("button", { name: "Import prompt" }),
    );

    expect(name).toBeInvalid();
    expect(name).toHaveAccessibleDescription(/Enter a name\./);
    expect(description).toHaveAccessibleDescription(/Enter a description\./);
    expect(text).toHaveAccessibleDescription(/Enter the prompt text\./);
    expect(calls.filter((call) => call.includes("/prompt/import"))).toEqual([]);

    await user.type(name, "Review");
    expect(name).toHaveAccessibleDescription(
      /A prompt name uses lowercase letters, digits and single hyphens, like pr-review\./,
    );
    await user.clear(name);
    await user.type(name, "review-pr");
    expect(name).toBeValid();
    await user.type(description, "Review");
    expect(description).toBeValid();
    await user.type(text, "Go.");
    expect(text).toBeValid();
  });

  it("refuses a text over 100 KB without a request", async () => {
    const { calls } = stubPromptServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);

    const dialog = await openImportPrompt(user);
    await user.type(field(dialog, "Name"), "review-pr");
    await user.type(field(dialog, "Description"), "Review");
    await user.click(field(dialog, "Prompt text"));
    await user.paste("é".repeat(60_000));
    await user.click(
      within(dialog).getByRole("button", { name: "Import prompt" }),
    );

    expect(
      await within(dialog).findByText("Prompt over 100 KB"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Shorten the text to 100 KB or less. Then select Import prompt.",
      ),
    ).toBeInTheDocument();
    expect(calls.filter((call) => call.includes("/prompt/import"))).toEqual([]);
  });

  it("refuses a pasted front matter and text past 100 KB together without a request", async () => {
    const { calls } = stubPromptServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);

    const dialog = await openImportPrompt(user);
    await user.type(field(dialog, "Name"), "review-pr");
    await user.click(field(dialog, "Prompt text"));
    await user.paste(
      `---\ndescription: Review\nnotes: ${"n".repeat(60_000)}\n---\n${"t".repeat(60_000)}`,
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Import prompt" }),
    );

    expect(
      await within(dialog).findByText("Prompt over 100 KB"),
    ).toBeInTheDocument();
    expect(calls.filter((call) => call.includes("/prompt/import"))).toEqual([]);
  });

  it("keeps the dialog open with Harness busy when the lock is held", async () => {
    stubPromptServer({
      importStatus: 409,
      importBody: { error: "import-in-progress" },
    });
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);

    const dialog = await openImportPrompt(user);
    await user.type(field(dialog, "Name"), "review-pr");
    await user.type(field(dialog, "Description"), "Review");
    await user.type(field(dialog, "Prompt text"), "Go.");
    await user.click(
      within(dialog).getByRole("button", { name: "Import prompt" }),
    );

    expect(await within(dialog).findByText("Harness busy")).toBeInTheDocument();
  });

  it("closes on Cancel without a write", async () => {
    const { calls } = stubPromptServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);

    const dialog = await openImportPrompt(user);
    await user.type(field(dialog, "Prompt text"), "Go.");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls.filter((call) => call.includes("/prompt/import"))).toEqual([]);
  });

  it("switches to update mode when the name left is taken", async () => {
    const { checks, imports } = stubPromptServer({ taken: ["review-pr"] });
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);

    const dialog = await openImportPrompt(user);
    const name = field(dialog, "Name");
    await user.type(name, "review-pr");
    await user.tab();

    const updating = await screen.findByRole("dialog", {
      name: "Update a prompt",
    });
    expect(
      within(updating).getByRole("button", { name: "Update prompt" }),
    ).toBeInTheDocument();
    expect(name).toBeValid();
    expect(name).toHaveAccessibleDescription(
      /Prompt already in the Harness.*Select Update prompt to replace its text and description\..*To keep it, pick another name\./,
    );
    expect(checks).toEqual([{ name: "review-pr" }]);

    await user.type(field(dialog, "Description"), "Review");
    await user.type(field(dialog, "Prompt text"), "Go.");
    await user.click(
      within(updating).getByRole("button", { name: "Update prompt" }),
    );
    await waitFor(() => expect(imports).toHaveLength(1));
  });

  it("shows an updated prompt with an open pull request under Pending proposal, ready for Update proposal", async () => {
    const request = {
      ...pullRequest(45),
      headBranch: "maestro/prompt.review-pr",
    };
    stubPromptServer({
      taken: ["review-pr"],
      importBody: { mode: "update", name: "review-pr" },
      imported: {
        ...HARNESS,
        stages: {
          ...HARNESS.stages,
          proposal: {
            outcome: "read",
            bound: null,
            rows: [
              {
                ...IMPORTED_ROW,
                status: "new-local-work",
                change: "edit",
                requests: [request],
                comparison: { kind: "proposal", number: 45 },
              },
            ],
          },
          review: {
            outcome: "read",
            bound: null,
            rows: [
              {
                ...IMPORTED_ROW,
                stage: "pending-review",
                status: "waiting-for-review",
                change: "edit",
                requests: [request],
                comparison: null,
              },
            ],
          },
        },
      },
    });
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);

    const dialog = await openImportPrompt(user);
    await user.type(field(dialog, "Name"), "review-pr");
    await user.tab();
    await screen.findByRole("dialog", { name: "Update a prompt" });
    await user.type(field(dialog, "Description"), "Review");
    await user.type(field(dialog, "Prompt text"), "Go.");
    await user.click(
      within(dialog).getByRole("button", { name: "Update prompt" }),
    );

    const pane = await screen.findByRole("complementary", {
      name: "review-pr detail",
    });
    expect(within(pane).getByText("Pending proposal")).toBeInTheDocument();
    expect(within(pane).getByText("Changed")).toBeInTheDocument();
    expect(
      within(pane).getByRole("button", { name: "Update proposal" }),
    ).toBeInTheDocument();
  });

  it("leaves nothing selected and states no error when Update prompt restores the default-branch text", async () => {
    const { imports } = stubPromptServer({
      taken: ["review-pr"],
      importBody: { mode: "update", name: "review-pr" },
      imported: HARNESS,
    });
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);

    const dialog = await openImportPrompt(user);
    await user.type(field(dialog, "Name"), "review-pr");
    await user.tab();
    await screen.findByRole("dialog", { name: "Update a prompt" });
    await user.type(field(dialog, "Description"), "Review");
    await user.type(field(dialog, "Prompt text"), "Go.");
    await user.click(
      within(dialog).getByRole("button", { name: "Update prompt" }),
    );

    await waitFor(() => expect(imports).toHaveLength(1));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(harnessRegion()).not.toHaveTextContent(/not|failed/i);
  });

  it("returns to Import a prompt when a taken name changes to a free one", async () => {
    stubPromptServer({ taken: ["review-pr"] });
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);

    const dialog = await openImportPrompt(user);
    const name = field(dialog, "Name");
    await user.type(name, "review-pr");
    await user.tab();
    await screen.findByRole("dialog", { name: "Update a prompt" });

    await user.clear(name);
    await user.type(name, "review-code");
    await user.tab();

    await screen.findByRole("dialog", { name: "Import a prompt" });
    expect(
      within(dialog).getByRole("button", { name: "Import prompt" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText("Prompt already in the Harness"),
    ).toBeNull();
  });

  it("shows no field error when an invalid name is left", async () => {
    stubPromptServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);

    const dialog = await openImportPrompt(user);
    const name = field(dialog, "Name");
    await user.type(name, "Review");
    await user.tab();

    expect(name).toBeValid();
    expect(
      within(dialog).getByRole("button", { name: "Import prompt" }),
    ).toBeInTheDocument();
  });

  it("fills the fields from a chosen file, then checks the suggested name", async () => {
    const { checks } = stubPromptServer({ taken: ["review-pr"] });
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);

    const dialog = await openImportPrompt(user);
    const sources = within(dialog).getByRole("group", {
      name: "Prompt source",
    });
    expect(
      within(sources).getByRole("button", { name: "Paste text" }),
    ).toHaveAttribute("aria-pressed", "true");
    await user.click(
      within(dialog).getByRole("button", { name: "Choose file" }),
    );
    expect(
      within(dialog).getByRole("button", {
        name: "Choose file",
        pressed: true,
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Use a .md or .txt file of 100 KB or less."),
    ).toBeInTheDocument();
    expect(fileInput(dialog)).toHaveAttribute("accept", ".md,.txt");

    await chooseFile(
      user,
      dialog,
      new File([REVIEW_PR_FILE], "review-pr.prompt.md"),
    );

    await waitFor(() => expect(field(dialog, "Name")).toHaveValue("review-pr"));
    expect(field(dialog, "Description")).toHaveValue(
      "Review the open pull request against the spec",
    );
    expect(field(dialog, "Prompt text")).toHaveValue(REVIEW_PR_BODY);
    expect(dialog).toHaveTextContent("review-pr.prompt.md · 2.4 KB");
    expect(
      within(dialog).getByRole("button", { name: "Choose another file" }),
    ).toBeInTheDocument();
    expect(checks).toEqual([{ name: "review-pr" }]);
    expect(
      await screen.findByRole("dialog", { name: "Update a prompt" }),
    ).toBeInTheDocument();
  });

  it("refuses a file that is not UTF-8 without a request", async () => {
    const { calls } = stubPromptServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);

    const dialog = await openImportPrompt(user);
    await chooseFile(
      user,
      dialog,
      new File([new Uint8Array([0x52, 0x65, 0xff, 0xfe, 0x0a])], "notes.md"),
    );

    expect(
      await within(dialog).findByText("Not a text file"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Maestro reads only UTF-8 text. Choose another file.",
      ),
    ).toBeInTheDocument();
    // Rounded up: a file of a few bytes never reads as 0.0 KB.
    expect(dialog).toHaveTextContent("notes.md · 0.1 KB");
    expect(field(dialog, "Name")).toHaveValue("");
    expect(field(dialog, "Prompt text")).toHaveValue("");
    expect(
      calls.filter((call) => call.includes("/api/harness/prompt/")),
    ).toEqual([]);
  });

  it("imports pasted CRLF text with LF line endings", async () => {
    const { imports } = stubPromptServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);

    const dialog = await openImportPrompt(user);
    await user.click(field(dialog, "Prompt text"));
    await user.paste(
      "---\r\ndescription: Review\r\n---\r\nRead the diff.\r\nBe brief.\r",
    );
    await user.type(field(dialog, "Name"), "review-pr");
    await user.click(
      within(dialog).getByRole("button", { name: "Import prompt" }),
    );

    await waitFor(() =>
      expect(imports).toEqual([
        {
          name: "review-pr",
          frontmatter: "description: Review",
          description: "Review",
          text: "Read the diff.\nBe brief.\n",
        },
      ]),
    );
  });

  it("imports a chosen file's CRLF text as the file holds it", async () => {
    const { imports } = stubPromptServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);

    const dialog = await openImportPrompt(user);
    await chooseFile(
      user,
      dialog,
      new File(
        [
          "---\r\ndescription: Review\r\n---\r\nRead the diff.\r\nBe brief.\r\n",
        ],
        "review-pr.md",
      ),
    );
    await waitFor(() => expect(field(dialog, "Name")).toHaveValue("review-pr"));
    await user.click(
      within(dialog).getByRole("button", { name: "Import prompt" }),
    );

    await waitFor(() =>
      expect(imports).toEqual([
        {
          name: "review-pr",
          frontmatter: "description: Review",
          description: "Review",
          text: "Read the diff.\r\nBe brief.\r\n",
        },
      ]),
    );
  });

  it("names Update prompt in the over-100 KB notice in update mode", async () => {
    stubPromptServer({ taken: ["review-pr"] });
    const user = userEvent.setup();
    renderWithQuery(<HarnessView openPrimitive={null} written={null} />);

    const dialog = await openImportPrompt(user);
    await user.type(field(dialog, "Name"), "review-pr");
    await user.tab();
    await screen.findByRole("dialog", { name: "Update a prompt" });
    await user.type(field(dialog, "Description"), "Review");
    await user.click(field(dialog, "Prompt text"));
    await user.paste("é".repeat(60_000));
    await user.click(
      within(dialog).getByRole("button", { name: "Update prompt" }),
    );

    expect(
      await within(dialog).findByText(
        "Shorten the text to 100 KB or less. Then select Update prompt.",
      ),
    ).toBeInTheDocument();
  });
});
