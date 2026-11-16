import { describe, expect, it } from "vitest";
import type { CategoryRecord } from "./category-section";
import {
  readHarnessCategoriesFile,
  writeHarnessCategoriesFile,
} from "./harness-categories-file";

const text = (body: string) => ({ kind: "text", text: body }) as const;

describe("readHarnessCategoriesFile", () => {
  it("reads a Harness without the file as no file", () => {
    expect(readHarnessCategoriesFile({ kind: "absent" })).toEqual({
      kind: "absent",
    });
  });

  it("reads the names and the assignments of a valid file", () => {
    const file = text(
      [
        "version: 1",
        "categories:",
        "  - Planning",
        "  - Writing",
        "assignments:",
        "  - { type: skill, name: tdd, category: Planning }",
        "  - { type: prompt, name: pr-review, category: Writing }",
        "",
      ].join("\n"),
    );

    expect(readHarnessCategoriesFile(file)).toEqual({
      kind: "valid",
      record: {
        names: ["Planning", "Writing"],
        assignments: [
          { type: "skill", name: "tdd", category: "Planning" },
          { type: "prompt", name: "pr-review", category: "Writing" },
        ],
      },
      skipped: 0,
    });
  });

  describe("a fault in the whole file", () => {
    const names = (count: number) =>
      Array.from({ length: count }, (_, at) => `  - Category ${at}`);

    it.each([
      ["invalid YAML", "version: 1\ncategories: [Planning\n"],
      ["a list at the top", "- Planning\n"],
      ["categories that are not a list", file({ categories: "Planning" })],
      ["no assignments key", "version: 1\ncategories: []\n"],
      ["version 2", file({ version: "2" })],
      ["a version in quotes", file({ version: '"1"' })],
      ["no version", "categories: []\nassignments: []\n"],
      ["a custom tag", file({ categories: "!secret [Planning]" })],
      ["a key named twice", `${file({})}categories: []\n`],
      [
        "over 200 categories",
        `version: 1\ncategories:\n${names(201).join("\n")}\nassignments: []\n`,
      ],
    ])("reads %s as a file with an error", (_, body) => {
      expect(readHarnessCategoriesFile(text(body))).toEqual({
        kind: "faulty",
      });
    });

    it("reads exactly 200 categories", () => {
      const body = `version: 1\ncategories:\n${names(200).join("\n")}\nassignments: []\n`;

      const read = readHarnessCategoriesFile(text(body));

      expect(read.kind === "valid" && read.record.names.length).toBe(200);
    });

    it("refuses a file the git read found over 256 KB without its text", () => {
      expect(readHarnessCategoriesFile({ kind: "too-large" })).toEqual({
        kind: "faulty",
      });
    });

    it("refuses text over 256 KB", () => {
      const padding = `# ${"x".repeat(256 * 1024)}\n`;

      expect(readHarnessCategoriesFile(text(padding + file({})))).toEqual({
        kind: "faulty",
      });
    });
  });

  describe("a fault in one entry", () => {
    const read = (categories: string, assignments: string) =>
      readHarnessCategoriesFile(text(file({ categories, assignments })));

    it("trims a name before the name rules apply", () => {
      expect(read('["  Planning  "]', "[]")).toEqual({
        kind: "valid",
        record: { names: ["Planning"], assignments: [] },
        skipped: 0,
      });
    });

    it("skips and counts an invalid name together with its assignments", () => {
      expect(
        read(
          '[Planning, "", "No category", 42, "Two\\nlines"]',
          '[{ type: skill, name: tdd, category: "No category" }]',
        ),
      ).toEqual({
        kind: "valid",
        record: { names: ["Planning"], assignments: [] },
        skipped: 5,
      });
    });

    it("keeps the first spelling of names equal ignoring case", () => {
      expect(
        read(
          "[Code review, code REVIEW]",
          "[{ type: skill, name: tdd, category: code REVIEW }]",
        ),
      ).toEqual({
        kind: "valid",
        record: {
          names: ["Code review"],
          assignments: [
            { type: "skill", name: "tdd", category: "Code review" },
          ],
        },
        skipped: 1,
      });
    });

    it("skips and counts an assignment to an unlisted category", () => {
      expect(
        read("[Planning]", "[{ type: skill, name: tdd, category: Writing }]"),
      ).toEqual({
        kind: "valid",
        record: { names: ["Planning"], assignments: [] },
        skipped: 1,
      });
    });

    it("skips and counts an assignment that lacks a field", () => {
      expect(
        read(
          "[Planning]",
          [
            "[{ type: skill, name: tdd },",
            "{ type: skill, category: Planning },",
            '{ type: skill, name: "", category: Planning },',
            "{ name: tdd, category: Planning },",
            "Planning]",
          ].join(" "),
        ),
      ).toEqual({
        kind: "valid",
        record: { names: ["Planning"], assignments: [] },
        skipped: 5,
      });
    });

    it("keeps the first assignment of an item named twice", () => {
      expect(
        read(
          "[Planning, Writing]",
          [
            "[{ type: skill, name: tdd, category: Planning },",
            "{ type: skill, name: tdd, category: Writing },",
            "{ type: prompt, name: tdd, category: Writing }]",
          ].join(" "),
        ),
      ).toEqual({
        kind: "valid",
        record: {
          names: ["Planning", "Writing"],
          assignments: [
            { type: "skill", name: "tdd", category: "Planning" },
            { type: "prompt", name: "tdd", category: "Writing" },
          ],
        },
        skipped: 1,
      });
    });

    it("skips an unknown type without a count", () => {
      expect(
        read("[Planning]", "[{ type: hook, name: lint, category: Planning }]"),
      ).toEqual({
        kind: "valid",
        record: { names: ["Planning"], assignments: [] },
        skipped: 0,
      });
    });
  });
});

describe("writeHarnessCategoriesFile", () => {
  it("writes version 1, the names and the assignments", () => {
    expect(
      writeHarnessCategoriesFile({
        names: ["Planning"],
        assignments: [{ type: "skill", name: "tdd", category: "Planning" }],
      }),
    ).toBe(
      [
        "version: 1",
        "categories:",
        "  - Planning",
        "assignments:",
        "  - type: skill",
        "    name: tdd",
        "    category: Planning",
        "",
      ].join("\n"),
    );
  });

  it.each<[string, CategoryRecord]>([
    ["an empty list", { names: [], assignments: [] }],
    ["an empty category", { names: ["Release notes"], assignments: [] }],
    [
      "names YAML would read as other values",
      {
        names: ["true", "1.0", "null", "~", "- dash", "#hash", "a: b", "'q'"],
        assignments: [
          { type: "skill", name: "yes", category: "true" },
          { type: "prompt", name: "007", category: "1.0" },
        ],
      },
    ],
    [
      "names with quotes, colons and non-ASCII letters",
      {
        names: [
          'Say "hi"',
          "Ops: deploy",
          "Überblick",
          "日本語",
          "x".repeat(64),
        ],
        assignments: [{ type: "skill", name: "tdd", category: "Überblick" }],
      },
    ],
    [
      "200 categories",
      {
        names: Array.from({ length: 200 }, (_, at) => `Category ${at}`),
        assignments: [],
      },
    ],
  ])("writes %s so it reads back clean", (_, record) => {
    const written = writeHarnessCategoriesFile(record);

    expect(readHarnessCategoriesFile({ kind: "text", text: written })).toEqual({
      kind: "valid",
      record,
      skipped: 0,
    });
  });
});

function file({
  version = "1",
  categories = "[]",
  assignments = "[]",
}: {
  version?: string;
  categories?: string;
  assignments?: string;
}): string {
  return `version: ${version}\ncategories: ${categories}\nassignments: ${assignments}\n`;
}
