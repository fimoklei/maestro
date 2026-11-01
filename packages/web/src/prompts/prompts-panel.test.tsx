import type { HarnessState, InventoryPrimitive } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  expectTooltipCause,
  hoverOpen,
  jsonResponse,
  noCategories,
  renderWithQuery,
  sentence,
} from "../test-utils";
import { ToastHost } from "../ui/toast";
import { PromptsPanel } from "./prompts-panel";

const PR_REVIEW = {
  type: "prompt",
  name: "pr-review",
  description: "Review a pull request.",
  path: ".maestro/prompts/pr-review.md",
  pendingRelease: null,
  text: "Review the pull request at [PR LINK].\n\n$ARGUMENTS\n",
  example: "",
  nameValid: true,
} satisfies InventoryPrimitive;

const STANDUP = {
  type: "prompt",
  name: "standup",
  description: "Summarise yesterday.",
  path: ".maestro/prompts/standup.md",
  pendingRelease: null,
  text: "Summarise $1.",
  example: "",
  nameValid: true,
} satisfies InventoryPrimitive;

const WITH_EXAMPLE = {
  type: "prompt",
  name: "bug-report",
  description: "Turn a bug into steps.",
  path: ".maestro/prompts/bug-report.md",
  pendingRelease: null,
  text: "Turn [BUG] into steps.\n",
  example: "Turn the login loop into steps.\n\n  Start on Safari.\n",
  nameValid: true,
} satisfies InventoryPrimitive;

const TDD = {
  type: "skill",
  name: "tdd",
  description: "Test first.",
  path: ".apm/skills/tdd",
  pendingRelease: null,
} satisfies InventoryPrimitive;

const BADLY_NAMED = {
  type: "prompt",
  name: "Review_PR",
  description: "",
  path: ".maestro/prompts/Review_PR.md",
  pendingRelease: null,
  text: "Check the pull request at [PR LINK].",
  example: "",
  nameValid: false,
} satisfies InventoryPrimitive;

const HARNESS = {
  origin: "github.com/acme/harness",
  github: { kind: "link", url: "https://github.com/acme/harness" },
  releasedVersion: "v1.4.0",
} satisfies Partial<HarnessState>;

afterEach(() => {
  vi.unstubAllGlobals();
});

// `failing` names the reads that answer 503; `unreadTypes` the types the
// Inventory read could not read.
function stubApi(
  primitives: readonly InventoryPrimitive[],
  failing: readonly string[] = [],
  unreadTypes: readonly InventoryPrimitive["type"][] = [],
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const none = noCategories(input);
      if (none) return none;
      if (failing.some((path) => url.startsWith(path)))
        return jsonResponse({ error: "unreadable" }, 503);
      if (url === "/api/harness") return jsonResponse(HARNESS);
      // No prompt in the clone, so Delete prompt stays out of these tests.
      if (url === "/api/harness/primitive/delete/check")
        return jsonResponse({ skill: {}, prompt: {} });
      return jsonResponse({ primitives, unreadTypes });
    }),
  );
}

function renderPanel() {
  return renderWithQuery(
    <MemoryRouter initialEntries={["/inventory/prompts"]}>
      <PromptsPanel />
      <ToastHost />
    </MemoryRouter>,
  );
}

// Band 2's value beside a fact's label.
const factValue = (label: string) =>
  screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;

describe("PromptsPanel", () => {
  it("lists the released prompts by Name and Description, and no skill", async () => {
    stubApi([TDD, PR_REVIEW, STANDUP]);
    renderPanel();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Prompts" }),
    ).toBeInTheDocument();
    const table = await screen.findByRole("grid", { name: /prompts/i });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(expect.arrayContaining(["Name", "Description"]));
    expect(
      await within(table).findByRole("gridcell", { name: "pr-review" }),
    ).toBeInTheDocument();
    expect(within(table).getByText("Summarise yesterday.")).toBeInTheDocument();
    expect(within(table).queryByText("tdd")).toBeNull();
  });

  it("starts band 2 with Origin, Release and Prompts while the read is current, and ends with the read age", async () => {
    stubApi([TDD, PR_REVIEW, STANDUP]);
    renderPanel();

    expect(await screen.findByText("just now")).toBeInTheDocument();
    await waitFor(() => expect(factValue("Release")).toBe("v1.4.0"));
    expect(factValue("Origin")).toBe("acme/harness");
    expect(factValue("Prompts")).toBe("2");
    expect(screen.queryByText("Not read yet")).toBeNull();
    expect(screen.queryByText("Up to date")).toBeNull();
  });

  it("starts band 2 with Read failed when the Inventory read fails", async () => {
    stubApi([], ["/api/inventory"]);
    renderPanel();

    expect(await screen.findByText("Read failed")).toBeInTheDocument();
  });

  it("starts band 2 with Read failed when the prompt files could not be read", async () => {
    stubApi([TDD], [], ["prompt"]);
    renderPanel();

    expect(await screen.findByText("Read failed")).toBeInTheDocument();
    expect(screen.getByText("Inventory not read")).toBeInTheDocument();
  });

  it("states the empty screen when the latest release holds no prompt", async () => {
    stubApi([TDD]);
    renderPanel();

    expect(
      await screen.findByRole("heading", { name: "No released prompts yet" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Prompts from the latest release appear here."),
    ).toBeInTheDocument();
  });

  it("gives Filter and Display the empty state's heading when there are no prompts", async () => {
    stubApi([TDD]);
    renderPanel();

    await screen.findByRole("heading", { name: "No released prompts yet" });
    for (const name of ["Filter", "Display"]) {
      expectTooltipCause(
        screen.getByRole("button", { name }),
        "No released prompts yet",
      );
    }
  });

  it("gives Filter and Display the failed-read notice's heading when the read failed", async () => {
    stubApi([], ["/api/inventory"]);
    renderPanel();

    await screen.findByText("Read failed");
    for (const name of ["Filter", "Display"]) {
      expectTooltipCause(screen.getByRole("button", { name }), /not read/);
    }
  });
});

describe("PromptsPanel — Copy prompt", () => {
  const grid = () => screen.getByRole("grid", { name: "Prompts table" });

  // The clipboard user-event attaches to the window, read back as a paste would.
  const clipboard = () => navigator.clipboard.readText();

  async function openPane(name: string) {
    await userEvent.click(
      await within(await screen.findByRole("grid")).findByRole("gridcell", {
        name,
      }),
    );
    return within(await screen.findByRole("complementary"));
  }

  it("copies the released text, placeholders unchanged, from the first row-menu item", async () => {
    const user = userEvent.setup();
    stubApi([PR_REVIEW, STANDUP]);
    renderPanel();

    await user.click(
      await screen.findByRole("button", { name: "Actions for pr-review" }),
    );
    const items = screen.getAllByRole("menuitem");
    expect(items[0]).toHaveTextContent("Copy prompt");
    await user.click(items[0] as HTMLElement);

    expect(await clipboard()).toBe(PR_REVIEW.text);
    expect(
      await screen.findByText(sentence("Copied pr-review.")),
    ).toBeInTheDocument();
  });

  it("shows Type, Latest release and Path, then the text under Prompt", async () => {
    stubApi([PR_REVIEW]);
    renderPanel();
    await waitFor(() => expect(factValue("Release")).toBe("v1.4.0"));

    const pane = await openPane("pr-review");

    const facts = pane
      .getAllByRole("term")
      .map((term) => [term.textContent, term.nextElementSibling?.textContent]);
    expect(facts).toEqual([
      ["Type", "Prompt"],
      ["Latest release", "v1.4.0"],
      ["Path", ".maestro/prompts/pr-review.md"],
      ["Category", "No category"],
    ]);
    const text = pane.getByRole("region", { name: "Prompt" });
    expect(
      within(text).getByRole("heading", { name: "Prompt" }),
    ).toBeInTheDocument();
    expect(text.querySelector("pre")?.textContent).toBe(PR_REVIEW.text);
  });

  it("shows no Prompt or example switch on a prompt without an example", async () => {
    stubApi([PR_REVIEW]);
    renderPanel();

    const pane = await openPane("pr-review");

    expect(
      pane.queryByRole("group", { name: "Prompt or example" }),
    ).not.toBeInTheDocument();
    expect(
      pane.queryByRole("button", { name: "Example" }),
    ).not.toBeInTheDocument();
  });

  it("switches the block between the prompt and its example, as written", async () => {
    const user = userEvent.setup();
    stubApi([WITH_EXAMPLE]);
    renderPanel();

    const pane = await openPane("bug-report");
    const block = pane.getByRole("region", { name: "Prompt or example" });
    const toggle = within(block).getByRole("group", {
      name: "Prompt or example",
    });
    expect(
      within(toggle).getByRole("button", { name: "Prompt" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(block.querySelector("pre")?.textContent).toBe(WITH_EXAMPLE.text);

    await user.click(within(toggle).getByRole("button", { name: "Example" }));

    expect(
      within(toggle).getByRole("button", { name: "Example" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(block.querySelector("pre")?.textContent).toBe(WITH_EXAMPLE.example);
  });

  it("shows the prompt again when another prompt is selected", async () => {
    const user = userEvent.setup();
    const OTHER = { ...WITH_EXAMPLE, name: "bug-triage", text: "Triage $1." };
    stubApi([WITH_EXAMPLE, OTHER]);
    renderPanel();

    const pane = await openPane("bug-report");
    await user.click(pane.getByRole("button", { name: "Example" }));
    await user.click(
      await within(grid()).findByRole("gridcell", { name: "bug-triage" }),
    );

    const block = within(screen.getByRole("complementary")).getByRole(
      "region",
      { name: "Prompt or example" },
    );
    expect(
      within(block).getByRole("button", { name: "Prompt" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(block.querySelector("pre")?.textContent).toBe(OTHER.text);
  });

  it("copies from the pane's primary button and from the Copy prompt text icon", async () => {
    const user = userEvent.setup();
    stubApi([PR_REVIEW, STANDUP]);
    renderPanel();

    const pane = await openPane("standup");
    const primary = pane.getByRole("button", { name: "Copy prompt" });
    expect(primary).toHaveClass("bg-gray-12");
    await user.click(primary);
    expect(await clipboard()).toBe(STANDUP.text);

    await user.click(
      await within(grid()).findByRole("gridcell", { name: "pr-review" }),
    );
    await user.click(
      within(screen.getByRole("complementary")).getByRole("button", {
        name: "Copy prompt text",
      }),
    );
    expect(await clipboard()).toBe(PR_REVIEW.text);
  });

  it("says so in the pane when the browser refuses the clipboard", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("denied"),
    );
    stubApi([PR_REVIEW]);
    renderPanel();

    await user.click(
      await screen.findByRole("button", { name: "Actions for pr-review" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Copy prompt" }));

    const pane = within(await screen.findByRole("complementary"));
    expect(await pane.findByText("Prompt not copied")).toBeInTheDocument();
    expect(
      pane.getByText(
        "The browser blocked the clipboard. Highlight the prompt text. Then copy it yourself.",
      ),
    ).toBeInTheDocument();
  });
});

describe("PromptsPanel — Copy example", () => {
  const clipboard = () => navigator.clipboard.readText();

  async function openPane(name: string) {
    await userEvent.click(
      await within(await screen.findByRole("grid")).findByRole("gridcell", {
        name,
      }),
    );
    return within(await screen.findByRole("complementary"));
  }

  async function openRowMenu(
    user: ReturnType<typeof userEvent.setup>,
    name: string,
  ) {
    await user.click(
      await screen.findByRole("button", { name: `Actions for ${name}` }),
    );
    return screen.getAllByRole("menuitem").map((item) => item.textContent);
  }

  it("offers Copy example right after Copy prompt in the row's ⋮, only with an example", async () => {
    const user = userEvent.setup();
    stubApi([WITH_EXAMPLE, PR_REVIEW]);
    renderPanel();

    const withExample = await openRowMenu(user, "bug-report");
    expect(withExample.slice(0, 2)).toEqual(["Copy prompt", "Copy example"]);
    await user.keyboard("{Escape}");

    const without = await openRowMenu(user, "pr-review");
    expect(without).not.toContain("Copy example");
  });

  it("copies the example from the row's ⋮ and names it in the toast", async () => {
    const user = userEvent.setup();
    stubApi([WITH_EXAMPLE]);
    renderPanel();

    await user.click(
      await screen.findByRole("button", { name: "Actions for bug-report" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Copy example" }));

    expect(await clipboard()).toBe(WITH_EXAMPLE.example);
    expect(
      await screen.findByText(sentence("Copied example of bug-report.")),
    ).toBeInTheDocument();
  });

  it("keeps Copy prompt on the prompt text while the block shows the example", async () => {
    const user = userEvent.setup();
    stubApi([WITH_EXAMPLE]);
    renderPanel();

    const pane = await openPane("bug-report");
    await user.click(pane.getByRole("button", { name: "Example" }));
    await user.click(pane.getByRole("button", { name: "Copy prompt" }));

    expect(await clipboard()).toBe(WITH_EXAMPLE.text);
    expect(
      await screen.findByText(sentence("Copied bug-report.")),
    ).toBeInTheDocument();
  });

  it("copies the text on show from the block's icon, named for it", async () => {
    const user = userEvent.setup();
    stubApi([WITH_EXAMPLE]);
    renderPanel();

    const pane = await openPane("bug-report");
    await user.click(pane.getByRole("button", { name: "Copy prompt text" }));
    expect(await clipboard()).toBe(WITH_EXAMPLE.text);

    await user.click(pane.getByRole("button", { name: "Example" }));
    expect(
      pane.queryByRole("button", { name: "Copy prompt text" }),
    ).not.toBeInTheDocument();
    await user.click(pane.getByRole("button", { name: "Copy example text" }));
    expect(await clipboard()).toBe(WITH_EXAMPLE.example);
  });

  it("puts Copy example behind the pane foot's ⋯, only with an example", async () => {
    const user = userEvent.setup();
    stubApi([WITH_EXAMPLE, PR_REVIEW]);
    renderPanel();

    const pane = await openPane("bug-report");
    expect(
      pane.queryByRole("button", { name: "Copy example" }),
    ).not.toBeInTheDocument();
    await user.click(
      pane.getByRole("button", { name: "Actions for bug-report" }),
    );
    expect(screen.getAllByRole("menuitem")[0]).toHaveTextContent(
      "Copy example",
    );
    await user.click(screen.getByRole("menuitem", { name: "Copy example" }));
    expect(await clipboard()).toBe(WITH_EXAMPLE.example);

    await user.click(
      await within(screen.getByRole("grid")).findByRole("gridcell", {
        name: "pr-review",
      }),
    );
    const other = within(screen.getByRole("complementary"));
    await user.click(
      await other.findByRole("button", { name: "Actions for pr-review" }),
    );
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Set category"]);
  });

  it("shows only the Example notice when the browser refuses the example", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("denied"),
    );
    stubApi([WITH_EXAMPLE]);
    renderPanel();

    await user.click(
      await screen.findByRole("button", { name: "Actions for bug-report" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Copy prompt" }));
    const pane = within(await screen.findByRole("complementary"));
    expect(await pane.findByText("Prompt not copied")).toBeInTheDocument();

    await user.click(pane.getByRole("button", { name: "Example" }));
    await user.click(pane.getByRole("button", { name: "Copy example text" }));

    expect(await pane.findByText("Example not copied")).toBeInTheDocument();
    expect(
      pane.getByText(
        "The browser blocked the clipboard. Highlight the example text. Then copy it yourself.",
      ),
    ).toBeInTheDocument();
    expect(pane.queryByText("Prompt not copied")).not.toBeInTheDocument();
  });
});

describe("PromptsPanel — Name not valid", () => {
  it("marks a badly named file with ⚠ before its name, and its hover card states the rule", async () => {
    stubApi([PR_REVIEW, BADLY_NAMED]);
    renderPanel();

    const cell = await screen.findByRole("gridcell", {
      name: "Name not valid Review_PR",
    });
    expect(within(cell).getByRole("img")).toHaveTextContent("⚠");
    expect(
      screen.getByRole("gridcell", { name: "pr-review" }),
    ).toBeInTheDocument();

    await hoverOpen(within(cell).getByText("Review_PR"));

    const rule = await screen.findByText(
      sentence(
        "A prompt name uses lowercase letters, digits and single hyphens, like pr-review.",
      ),
    );
    const card = within(
      rule.closest("[data-radix-popper-content-wrapper]") as HTMLElement,
    );
    expect(card.getByText("Name not valid")).toBeInTheDocument();
    expect(card.getByText("Review_PR.md")).toBeInTheDocument();
  });

  it("warns in the pane, and Copy prompt still works", async () => {
    const user = userEvent.setup();
    stubApi([BADLY_NAMED]);
    renderPanel();

    await user.click(
      await screen.findByRole("gridcell", { name: "Name not valid Review_PR" }),
    );
    const pane = within(await screen.findByRole("complementary"));
    expect(pane.getByText("Prompt name not valid")).toBeInTheDocument();
    expect(
      pane.getByText(
        sentence(
          "Rename Review_PR in your clone. Use lowercase letters, digits and single hyphens, like pr-review. Copy prompt still works.",
        ),
      ),
    ).toBeInTheDocument();

    await user.click(pane.getByRole("button", { name: "Copy prompt" }));
    expect(await navigator.clipboard.readText()).toBe(BADLY_NAMED.text);
  });

  it("narrows the table to badly named files with Filter", async () => {
    const user = userEvent.setup();
    stubApi([PR_REVIEW, BADLY_NAMED]);
    renderPanel();
    await screen.findByRole("gridcell", { name: "pr-review" });

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(
      await screen.findByRole("menuitemradio", { name: "Name not valid" }),
    );
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("gridcell", { name: "pr-review" })).toBeNull(),
    );
    expect(
      screen.getByRole("gridcell", { name: "Name not valid Review_PR" }),
    ).toBeInTheDocument();
    expect(factValue("Prompts")).toBe("1 of 2");
  });
});
