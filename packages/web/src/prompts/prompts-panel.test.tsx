import type { HarnessState, InventoryPrimitive } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery, sentence } from "../test-utils";
import { ToastHost } from "../ui/toast";
import { PromptsPanel } from "./prompts-panel";

const PR_REVIEW = {
  type: "prompt",
  name: "pr-review",
  description: "Review a pull request.",
  path: ".maestro/prompts/pr-review.md",
  text: "Review the pull request at [PR LINK].\n\n$ARGUMENTS\n",
  nameValid: true,
} satisfies InventoryPrimitive;

const STANDUP = {
  type: "prompt",
  name: "standup",
  description: "Summarise yesterday.",
  path: ".maestro/prompts/standup.md",
  text: "Summarise $1.",
  nameValid: true,
} satisfies InventoryPrimitive;

const TDD = {
  type: "skill",
  name: "tdd",
  description: "Test first.",
  path: ".apm/skills/tdd",
} satisfies InventoryPrimitive;

const BADLY_NAMED = {
  type: "prompt",
  name: "Review_PR",
  description: "",
  path: ".maestro/prompts/Review_PR.md",
  text: "Check the pull request at [PR LINK].",
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

// `failing` names the reads that answer 503.
function stubApi(
  primitives: readonly InventoryPrimitive[],
  failing: readonly string[] = [],
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (failing.some((path) => url.startsWith(path)))
        return jsonResponse({ error: "unreadable" }, 503);
      if (url === "/api/harness") return jsonResponse(HARNESS);
      return jsonResponse({ primitives });
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
    ]);
    const text = pane.getByRole("region", { name: "Prompt" });
    expect(
      within(text).getByRole("heading", { name: "Prompt" }),
    ).toBeInTheDocument();
    expect(text.querySelector("pre")?.textContent).toBe(PR_REVIEW.text);
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
        "The browser blocked the clipboard. Highlight the text in the Prompt box. Then copy it yourself.",
      ),
    ).toBeInTheDocument();
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

    await userEvent.hover(within(cell).getByText("Review_PR"));

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
