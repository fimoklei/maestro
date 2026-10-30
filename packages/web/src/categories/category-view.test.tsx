import type { CategoryList, InventoryPrimitive } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation, useNavigationType } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PromptsPanel } from "../prompts/prompts-panel";
import { SkillsPanel } from "../skills/skills-panel";
import { jsonResponse, renderWithQuery } from "../test-utils";

// Filter, Display and the Category column on Skills and Prompts, over a
// stubbed server, opened from a URL as a Settings count link opens them.

afterEach(() => {
  vi.unstubAllGlobals();
});

type Assignment = CategoryList["assignments"][number];

const skill = (name: string): InventoryPrimitive => ({
  type: "skill",
  name,
  description: "A skill.",
  path: `.apm/skills/${name}`,
  pendingRelease: null,
});

const prompt = (name: string): InventoryPrimitive => ({
  type: "prompt",
  name,
  description: "A prompt.",
  path: `.maestro/prompts/${name}.md`,
  pendingRelease: null,
  text: "Do it.",
  nameValid: true,
});

const NAMES = ["Code review", "Planning", "Writing"];

const ASSIGNMENTS: Assignment[] = [
  { type: "skill", name: "tdd", category: "Planning" },
  { type: "skill", name: "grill", category: "Planning" },
  { type: "skill", name: "review", category: "Code review" },
  { type: "prompt", name: "standup", category: "Planning" },
  { type: "prompt", name: "pr-check", category: "Code review" },
];

const listOf = (names: string[], assignments: Assignment[]): CategoryList => ({
  categories: names.map((name) => ({
    name,
    skills: assignments.filter(
      (each) => each.type === "skill" && each.category === name,
    ).length,
    prompts: assignments.filter(
      (each) => each.type === "prompt" && each.category === name,
    ).length,
  })),
  assignments,
});

function stubServer({
  names = NAMES,
  assignments = ASSIGNMENTS,
  categories,
}: {
  names?: string[];
  assignments?: Assignment[];
  /** Answers the category read; by default at once. */
  categories?: () => Promise<Response>;
} = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/categories") {
        return categories
          ? categories()
          : jsonResponse(listOf(names, assignments));
      }
      if (url.startsWith("/api/registry")) return jsonResponse({ repos: [] });
      if (url.startsWith("/api/harness")) {
        return jsonResponse({ error: "not-configured" }, 409);
      }
      return jsonResponse({
        primitives: [
          ...["tdd", "grill", "review", "research"].map(skill),
          ...["standup", "pr-check", "notes"].map(prompt),
        ],
        unreadTypes: [],
      });
    }),
  );
}

type Screen = {
  name: string;
  path: string;
  panel: ReactNode;
  rows: string[];
  /** The Filter's radio items: Category's, then any other one-of filter's. */
  filter: string[];
  /** Rows and group headers when grouped by category. */
  grouped: string[];
  planning: string[];
};

const SCREENS: Screen[] = [
  {
    name: "Skills",
    path: "/inventory/skills",
    panel: <SkillsPanel />,
    rows: ["tdd", "grill", "review", "research"],
    filter: ["All", "Code review", "Planning", "Writing", "No category"],
    grouped: [
      "Code review 1",
      "review",
      "Planning 2",
      "tdd",
      "grill",
      "No category 1",
      "research",
    ],
    planning: ["tdd", "grill"],
  },
  {
    name: "Prompts",
    path: "/inventory/prompts",
    panel: <PromptsPanel />,
    rows: ["standup", "pr-check", "notes"],
    filter: [
      "All",
      "Code review",
      "Planning",
      "Writing",
      "No category",
      "All",
      "Name not valid",
    ],
    grouped: [
      "Code review 1",
      "pr-check",
      "Planning 1",
      "standup",
      "No category 1",
      "notes",
    ],
    planning: ["standup"],
  },
];

const renderAt = (entry: string, panel: ReactNode) =>
  renderWithQuery(
    <MemoryRouter initialEntries={[entry]}>{panel}</MemoryRouter>,
  );

// The path with its query, and how the router got there.
function LocationProbe() {
  const { pathname, search } = useLocation();
  return (
    <output data-testid="location">
      {`${pathname}${search} ${useNavigationType()}`}
    </output>
  );
}

// The table's lines in order: a group header as its words and count, a row
// as its name.
function lines(names: readonly string[]): string[] {
  const grid = screen.getByRole("grid");
  return [...grid.querySelectorAll("tbody tr")].flatMap((row) => {
    const fold = within(row as HTMLElement).queryByRole("button", {
      name: /^(Collapse|Expand) /,
    });
    if (fold !== null) {
      return [row.textContent ?? ""];
    }
    const name = names.find((each) =>
      within(row as HTMLElement).queryByRole("gridcell", { name: each }),
    );
    return name === undefined ? [] : [name];
  });
}

async function openMenu(name: RegExp) {
  await userEvent.click(screen.getByRole("button", { name }));
  return screen.findByRole("menu");
}

describe.each(SCREENS)("Category on $name", (each) => {
  it("narrows the list with Filter's Category section", async () => {
    stubServer();
    renderAt(each.path, each.panel);
    await screen.findByRole("gridcell", { name: each.rows[0] });

    const menu = await openMenu(/^Filter/);
    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((item) => item.textContent?.replace("●", "")),
    ).toEqual(each.filter);
    await userEvent.click(
      within(menu).getByRole("menuitemradio", { name: "Planning" }),
    );
    await userEvent.keyboard("{Escape}");

    await waitFor(() =>
      expect(lines(each.rows)).toEqual([
        `Planning ${each.planning.length}`,
        ...each.planning,
      ]),
    );
    expect(
      screen.getByRole("button", { name: "Filter, 1 active" }),
    ).toBeInTheDocument();
  });

  it("opens grouped by category, each header counted and No category last", async () => {
    stubServer();
    renderAt(each.path, each.panel);

    await waitFor(() => expect(lines(each.rows)).toEqual(each.grouped));
    const menu = await openMenu(/^Display/);
    expect(
      within(menu).getByRole("menuitemradio", { name: "Category" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("opens ungrouped while no category exists", async () => {
    stubServer({ names: [], assignments: [] });
    renderAt(each.path, each.panel);
    await screen.findByRole("gridcell", { name: each.rows[0] });

    expect(lines(each.rows)).toEqual(each.rows);
    const menu = await openMenu(/^Filter/);
    expect(
      within(menu).queryByRole("menuitemradio", { name: "No category" }),
    ).toBeNull();
  });

  it("opens ungrouped, never as one No category group, while none of its rows has a category", async () => {
    stubServer({ assignments: [] });
    renderAt(each.path, each.panel);
    await screen.findByRole("gridcell", { name: each.rows[0] });

    expect(lines(each.rows)).toEqual(each.rows);
  });

  it("groups by category once the list arrives after the rows", async () => {
    let answer: (response: Response) => void = () => {};
    stubServer({
      categories: () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    });
    renderAt(each.path, each.panel);
    await screen.findByRole("gridcell", { name: each.rows[0] });
    expect(lines(each.rows)).toEqual(each.rows);

    answer(jsonResponse(listOf(NAMES, ASSIGNMENTS)));

    await waitFor(() => expect(lines(each.rows)).toEqual(each.grouped));
  });

  it("opens filtered to the category its URL names", async () => {
    stubServer();
    renderAt(`${each.path}?category=Planning`, each.panel);

    await waitFor(() =>
      expect(lines(each.rows)).toEqual([
        `Planning ${each.planning.length}`,
        ...each.planning,
      ]),
    );
    const menu = await openMenu(/^Filter, 1 active/);
    expect(
      within(menu).getByRole("menuitemradio", { name: "Planning" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("takes the category out of the URL once read, in place, and keeps the filter", async () => {
    stubServer();
    renderAt(
      `${each.path}?category=Planning`,
      <>
        {each.panel}
        <LocationProbe />
      </>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        `${each.path} REPLACE`,
      ),
    );
    await waitFor(() =>
      expect(lines(each.rows)).toEqual([
        `Planning ${each.planning.length}`,
        ...each.planning,
      ]),
    );
  });

  it("reads a URL category that matches no category as All", async () => {
    stubServer();
    renderAt(`${each.path}?category=Gone`, each.panel);

    await waitFor(() => expect(lines(each.rows)).toEqual(each.grouped));
    expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();
  });

  it("offers a Category column, off until Display switches it on, empty for No category", async () => {
    stubServer();
    renderAt(each.path, each.panel);
    await screen.findByRole("gridcell", { name: each.rows[0] });
    const grid = screen.getByRole("grid");
    expect(
      within(grid).queryByRole("columnheader", { name: /^Category/ }),
    ).toBeNull();

    const menu = await openMenu(/^Display/);
    await userEvent.click(
      within(menu).getByRole("menuitemcheckbox", { name: "Category" }),
    );
    await userEvent.keyboard("{Escape}");

    const header = within(grid).getByRole("columnheader", {
      name: /^Category/,
    });
    const column = [...(header.parentElement?.children ?? [])].indexOf(header);
    const cellOf = (name: string) =>
      screen.getByRole("gridcell", { name }).closest("tr")?.children[column];
    expect(cellOf(each.planning[0] ?? "")).toHaveTextContent("Planning");
    expect(cellOf(each.rows[each.rows.length - 1] ?? "")).toHaveTextContent(
      /^$/,
    );
  });
});
