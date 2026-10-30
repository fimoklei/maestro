// The operator's own category list for the connected Harness: every rule lives
// here, and every change runs one path: read, validate, apply, write.
import type { HarnessPrimitiveType } from "../harness/harness-primitive";
import type { ConfigStore } from "../registry/config-store";
import { applyChange, type CategoryChange } from "./apply-change";
import { compareCategoryNames } from "./category-name";
import {
  type CategoryRecord,
  type HarnessKey,
  readCategorySection,
  recordOf,
  withRecord,
} from "./category-section";

export type { CategoryChange } from "./apply-change";

export type CategoryList = {
  categories: { name: string; skills: number; prompts: number }[];
  assignments: { type: HarnessPrimitiveType; name: string; category: string }[];
};

export type CategoryError =
  | "not-configured"
  | "categories-unreadable"
  | "name-invalid"
  | "name-exists";

export type CategoryResult =
  | { ok: true; list: CategoryList; added?: string }
  | { ok: false; error: "name-exists"; existing: string }
  // `configPath`: the file the operator repairs by hand.
  | { ok: false; error: "categories-unreadable"; configPath: string }
  | { ok: false; error: "not-configured" | "name-invalid" };

const listOf = (record: CategoryRecord): CategoryList => ({
  categories: [...record.names].sort(compareCategoryNames).map((name) => {
    const carried = record.assignments.filter((each) => each.category === name);
    return {
      name,
      skills: carried.filter((each) => each.type === "skill").length,
      prompts: carried.filter((each) => each.type === "prompt").length,
    };
  }),
  assignments: record.assignments,
});

export class Categories {
  private readonly store: ConfigStore;
  private readonly harness: () => Promise<HarnessKey | null>;
  private readonly configPath: () => string;

  constructor(deps: {
    store: ConfigStore;
    harness: () => Promise<HarnessKey | null>;
    configPath: () => string;
  }) {
    this.store = deps.store;
    this.harness = deps.harness;
    this.configPath = deps.configPath;
  }

  async read(): Promise<CategoryResult> {
    const harness = await this.harness();
    if (harness === null) return { ok: false, error: "not-configured" };
    const section = readCategorySection((await this.store.read()).categories);
    if (section === null) return this.unreadable();
    return { ok: true, list: listOf(recordOf(section, harness)) };
  }

  async change(change: CategoryChange): Promise<CategoryResult> {
    const harness = await this.harness();
    if (harness === null) return { ok: false, error: "not-configured" };
    return this.store.update<CategoryResult>((config) => {
      const section = readCategorySection(config.categories);
      // Never written over: the operator repairs a broken section by hand.
      if (section === null) return { result: this.unreadable() };
      const applied = applyChange(recordOf(section, harness), change);
      if (!applied.ok) return { result: applied };
      return {
        config: {
          ...config,
          categories: withRecord(section, harness, applied.record),
        },
        result: {
          ok: true,
          list: listOf(applied.record),
          ...(applied.added === undefined ? {} : { added: applied.added }),
        },
      };
    });
  }

  private unreadable(): CategoryResult {
    return {
      ok: false,
      error: "categories-unreadable",
      configPath: this.configPath(),
    };
  }
}
