import { describe, expect, it } from "vitest";
import type { CategoryRecord } from "./category-section";
import { copyHarnessCategories } from "./copy-harness-categories";
import type { HeldItems } from "./held-items";

const skill = (name: string, category: string) =>
  ({ type: "skill", name, category }) as const;
const prompt = (name: string, category: string) =>
  ({ type: "prompt", name, category }) as const;

const record = (
  names: string[],
  assignments: CategoryRecord["assignments"] = [],
): CategoryRecord => ({ names, assignments });

// The facts of a copy that moves, respells and clears nothing.
const nothingTaken = {
  added: [],
  deleted: [],
  unchanged: [],
  respelled: [],
  moved: { skills: 0, prompts: 0 },
  uncategorised: { skills: 0, prompts: 0 },
};

// Holds every item but the named ones.
const heldBut = (...lacking: string[]): HeldItems => ({
  holds: (ref) => !lacking.includes(ref.name),
});

describe("copyHarnessCategories with Add", () => {
  it("copies the Harness list whole into an empty list", () => {
    const harness = record(
      ["Review", "Planning"],
      [skill("tdd", "Planning"), prompt("notes", "Review")],
    );

    expect(
      copyHarnessCategories({
        own: record([]),
        harness,
        mode: "add",
        held: heldBut(),
      }),
    ).toEqual({
      record: harness,
      facts: { ...nothingTaken, added: ["Planning", "Review"] },
    });
  });

  it("adds the names the operator lacks and sorts only items without a category", () => {
    const own = record(["Drafts", "Review"], [skill("tdd", "Review")]);
    const harness = record(
      ["Review", "Planning"],
      [skill("tdd", "Planning"), skill("idea", "Planning")],
    );

    expect(
      copyHarnessCategories({ own, harness, mode: "add", held: heldBut() }),
    ).toEqual({
      record: record(
        ["Drafts", "Review", "Planning"],
        [skill("tdd", "Review"), skill("idea", "Planning")],
      ),
      facts: {
        ...nothingTaken,
        added: ["Planning"],
        unchanged: ["Drafts", "Review"],
      },
    });
  });

  it("keeps the operator's spelling of a name equal ignoring case, and sorts into it", () => {
    const own = record(["code review"]);
    const harness = record(["Code Review"], [skill("tdd", "Code Review")]);

    expect(
      copyHarnessCategories({ own, harness, mode: "add", held: heldBut() }),
    ).toEqual({
      record: record(["code review"], [skill("tdd", "code review")]),
      facts: { ...nothingTaken, unchanged: ["code review"] },
    });
  });

  it("skips an assignment for an item Inventory lacks", () => {
    const harness = record(
      ["Planning"],
      [skill("tdd", "Planning"), skill("gone", "Planning")],
    );

    expect(
      copyHarnessCategories({
        own: record([]),
        harness,
        mode: "add",
        held: heldBut("gone"),
      }).record,
    ).toEqual(record(["Planning"], [skill("tdd", "Planning")]));
  });

  it("drops the operator's own assignment for an item Inventory lacks, so the Harness sorts nothing into it", () => {
    const own = record(["Review"], [skill("gone", "Review")]);
    const harness = record(["Review"], []);

    expect(
      copyHarnessCategories({
        own,
        harness,
        mode: "add",
        held: heldBut("gone"),
      }).record,
    ).toEqual(record(["Review"], []));
  });

  it("keeps every assignment when what Inventory holds could not be read", () => {
    const harness = record(["Planning"], [skill("tdd", "Planning")]);

    expect(
      copyHarnessCategories({
        own: record([]),
        harness,
        mode: "add",
        held: null,
      }).record,
    ).toEqual(harness);
  });
});

describe("copyHarnessCategories with Replace", () => {
  // The worked example of #1892.
  it("makes the list the Harness list and states what it deletes", () => {
    const own = record(
      ["Review", "Drafts"],
      [
        skill("tdd", "Review"),
        skill("notes", "Drafts"),
        prompt("idea", "Drafts"),
      ],
    );
    const harness = record(
      ["Review", "Planning"],
      [skill("tdd", "Planning"), skill("notes", "Planning")],
    );

    expect(
      copyHarnessCategories({ own, harness, mode: "replace", held: heldBut() }),
    ).toEqual({
      record: harness,
      facts: {
        added: ["Planning"],
        deleted: ["Drafts"],
        unchanged: ["Review"],
        respelled: [],
        moved: { skills: 2, prompts: 0 },
        uncategorised: { skills: 0, prompts: 1 },
      },
    });
  });

  it("takes the Harness spelling of a name equal ignoring case, and states how the operator spelled it", () => {
    const own = record(["code review"], [skill("tdd", "code review")]);
    const harness = record(["Code Review"], [skill("tdd", "Code Review")]);

    expect(
      copyHarnessCategories({ own, harness, mode: "replace", held: heldBut() }),
    ).toEqual({
      record: harness,
      facts: {
        ...nothingTaken,
        unchanged: ["Code Review"],
        respelled: [{ name: "Code Review", was: "code review" }],
      },
    });
  });

  it("gives an item without a category its Harness category without counting it", () => {
    const own = record(["Review"]);
    const harness = record(["Review"], [prompt("notes", "Review")]);

    expect(
      copyHarnessCategories({ own, harness, mode: "replace", held: heldBut() })
        .facts,
    ).toEqual({ ...nothingTaken, unchanged: ["Review"] });
  });

  it("counts an item moved out of a category both lists have", () => {
    const own = record(
      ["Review", "Planning"],
      [skill("tdd", "Review"), prompt("notes", "Review")],
    );
    const harness = record(["Review", "Planning"], [skill("tdd", "Planning")]);

    expect(
      copyHarnessCategories({ own, harness, mode: "replace", held: heldBut() })
        .facts,
    ).toMatchObject({
      deleted: [],
      moved: { skills: 1, prompts: 0 },
      uncategorised: { skills: 0, prompts: 1 },
    });
  });

  it("counts no item Inventory lacks", () => {
    const own = record(["Drafts"], [skill("gone", "Drafts")]);
    const harness = record(["Review"]);

    expect(
      copyHarnessCategories({
        own,
        harness,
        mode: "replace",
        held: heldBut("gone"),
      }).facts,
    ).toMatchObject({
      deleted: ["Drafts"],
      uncategorised: { skills: 0, prompts: 0 },
    });
  });

  it("takes nothing from a list equal to the Harness list", () => {
    const own = record(["Review"], [skill("tdd", "Review")]);

    expect(
      copyHarnessCategories({
        own,
        harness: own,
        mode: "replace",
        held: heldBut(),
      }).facts,
    ).toEqual({ ...nothingTaken, unchanged: ["Review"] });
  });
});
