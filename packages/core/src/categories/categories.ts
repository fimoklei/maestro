import type {
  HarnessPrimitiveType,
  PrimitiveRef,
} from "../harness/harness-primitive";
import type { ConfigStore } from "../registry/config-store";
import { applyChange, type CategoryChange, withoutStale } from "./apply-change";
import { compareCategoryNames, sameCategoryName } from "./category-name";
import {
  type CategoryRecord,
  type HarnessKey,
  itemCount,
  readCategorySection,
  recordOf,
  seenOf,
  withRecord,
  withSeen,
} from "./category-section";
import {
  type CopyFacts,
  type CopyMode,
  copyHarnessCategories,
} from "./copy-harness-categories";
import type { ReadHeldItems } from "./held-items";
import { newSinceSeen, ownEqualsHarness, sameCategories } from "./last-seen";
import {
  type ReleasedCategoriesGitPort,
  type ReleasedHarnessCategories,
  readReleasedHarnessCategories,
} from "./released-harness-categories";

export type { CategoryChange } from "./apply-change";

export type HarnessCategories =
  | { kind: "none" }
  | { kind: "unread" }
  | { kind: "faulty"; tag: string }
  | {
      kind: "listed";
      tag: string;
      count: number;
      changed: boolean;
    };

export type HarnessCategoriesResult =
  | { ok: true; harness: HarnessCategories }
  | { ok: false; error: "not-configured" };

export type CategoryList = {
  categories: { name: string; skills: number; prompts: number }[];
  assignments: { type: HarnessPrimitiveType; name: string; category: string }[];
};

type CopyRefusal = "harness-categories-unread" | "no-harness-categories";

export type CategoryError =
  | "not-configured"
  | "categories-unreadable"
  | "name-invalid"
  | "name-exists"
  | "category-not-found"
  | "item-not-found"
  | CopyRefusal;

type Refused =
  | { ok: false; error: "name-exists"; existing: string }
  | { ok: false; error: "categories-unreadable"; configPath: string }
  | {
      ok: false;
      error:
        | "not-configured"
        | "name-invalid"
        | "category-not-found"
        | "item-not-found"
        | CopyRefusal;
    };

export type CategoryResult =
  | { ok: true; list: CategoryList; added?: string }
  | Refused;

export type CopyPreview = {
  tag: string;
  count: number;
  skipped: number;
  choice: boolean;
  modes: Record<CopyMode, CopyFacts>;
  fresh: string[];
};

export type CopyPreviewResult = { ok: true; preview: CopyPreview } | Refused;

const listOf = (record: CategoryRecord): CategoryList => ({
  categories: [...record.names].sort(compareCategoryNames).map((name) => ({
    name,
    ...itemCount(record.assignments.filter((each) => each.category === name)),
  })),
  assignments: record.assignments,
});

export class Categories {
  private readonly store: ConfigStore;
  private readonly harness: () => Promise<HarnessKey | null>;
  private readonly configPath: () => string;
  private readonly held: ReadHeldItems;
  private readonly git: ReleasedCategoriesGitPort;

  constructor(deps: {
    store: ConfigStore;
    harness: () => Promise<HarnessKey | null>;
    configPath: () => string;
    held: ReadHeldItems;
    git: ReleasedCategoriesGitPort;
  }) {
    this.store = deps.store;
    this.harness = deps.harness;
    this.configPath = deps.configPath;
    this.held = deps.held;
    this.git = deps.git;
  }

  async readHarness(): Promise<HarnessCategoriesResult> {
    const read = await this.releasedList();
    if (!read.listed) return read.result;
    const { harness, released } = read;
    return {
      ok: true,
      harness: {
        kind: "listed",
        tag: released.tag,
        count: released.record.names.length,
        changed: await this.changedSinceSeen(harness, released.record),
      },
    };
  }

  async markHarnessSeen(): Promise<HarnessCategoriesResult> {
    const read = await this.releasedList();
    if (!read.listed) return read.result;
    const { harness, released } = read;
    await this.store.update<undefined>((config) => {
      const section = readCategorySection(config.categories);
      if (section === null) return { result: undefined };
      return {
        config: {
          ...config,
          categories: withSeen(section, harness, released.record),
        },
        result: undefined,
      };
    });
    return {
      ok: true,
      harness: {
        kind: "listed",
        tag: released.tag,
        count: released.record.names.length,
        changed: false,
      },
    };
  }

  private async releasedList(): Promise<
    | { listed: false; result: HarnessCategoriesResult }
    | {
        listed: true;
        harness: HarnessKey;
        released: Extract<ReleasedHarnessCategories, { kind: "listed" }>;
      }
  > {
    const harness = await this.harness();
    if (harness === null) {
      return { listed: false, result: { ok: false, error: "not-configured" } };
    }
    const released = await readReleasedHarnessCategories(
      this.git,
      harness.root,
    );
    return released.kind === "listed"
      ? { listed: true, harness, released }
      : { listed: false, result: { ok: true, harness: released } };
  }

  private async changedSinceSeen(
    harness: HarnessKey,
    released: CategoryRecord,
  ): Promise<boolean> {
    const before = readCategorySection((await this.store.read()).categories);
    if (before === null) return false;
    const seen = seenOf(before, harness);
    if (seen !== null && sameCategories(seen, released)) return false;
    const held = await this.held(harness.root, [
      ...recordOf(before, harness).assignments,
      ...released.assignments,
    ]);
    return this.store.update<boolean>((config) => {
      const section = readCategorySection(config.categories);
      if (section === null) return { result: false };
      if (!ownEqualsHarness(recordOf(section, harness), released, held)) {
        return { result: true };
      }
      return {
        config: {
          ...config,
          categories: withSeen(section, harness, released),
        },
        result: false,
      };
    });
  }

  async read(): Promise<CategoryResult> {
    const harness = await this.harness();
    if (harness === null) return { ok: false, error: "not-configured" };
    const section = readCategorySection((await this.store.read()).categories);
    if (section === null) return this.unreadable();
    const record = recordOf(section, harness);
    const held = await this.held(harness.root, record.assignments);
    return { ok: true, list: listOf(withoutStale(record, held)) };
  }

  async change(change: CategoryChange): Promise<CategoryResult> {
    const harness = await this.harness();
    if (harness === null) return { ok: false, error: "not-configured" };
    // Read before the update, so no other config write waits on git.
    const before = readCategorySection((await this.store.read()).categories);
    const asked: PrimitiveRef[] = [
      ...(before === null ? [] : recordOf(before, harness).assignments),
      ...(change.kind === "assign" ? change.items : []),
    ];
    const held = await this.held(harness.root, asked);
    return this.store.update<CategoryResult>((config) => {
      const section = readCategorySection(config.categories);
      if (section === null) return { result: this.unreadable() };
      const applied = applyChange(
        withoutStale(recordOf(section, harness), held),
        change,
        held,
      );
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

  // Reads fresh and marks seen in one config update, so no mark loses the fact.
  async previewCopy(): Promise<CopyPreviewResult> {
    const source = await this.copySource();
    if (!source.ok) return source;
    const { harness, released, held } = source;
    return this.store.update<CopyPreviewResult>((config) => {
      const section = readCategorySection(config.categories);
      if (section === null) return { result: this.unreadable() };
      const own = recordOf(section, harness);
      const facts = (mode: CopyMode) =>
        copyHarnessCategories({ own, harness: released.record, mode, held })
          .facts;
      const modes = { add: facts("add"), replace: facts("replace") };
      const fresh = newSinceSeen(released.record, seenOf(section, harness));
      const rows = new Set(
        Object.values(modes).flatMap(({ added, unchanged }) => [
          ...added,
          ...unchanged,
        ]),
      );
      return {
        config: {
          ...config,
          categories: withSeen(section, harness, released.record),
        },
        result: {
          ok: true,
          preview: {
            tag: released.tag,
            count: released.record.names.length,
            skipped: released.skipped,
            choice: own.names.length > 0,
            modes,
            fresh: [...rows]
              .filter((row) =>
                fresh.some((name) => sameCategoryName(name, row)),
              )
              .sort(compareCategoryNames),
          },
        },
      };
    });
  }

  async copyFromHarness(mode: CopyMode): Promise<CategoryResult> {
    const source = await this.copySource();
    if (!source.ok) return source;
    const { harness, released, held } = source;
    return this.store.update<CategoryResult>((config) => {
      const section = readCategorySection(config.categories);
      if (section === null) return { result: this.unreadable() };
      const { record } = copyHarnessCategories({
        own: recordOf(section, harness),
        harness: released.record,
        mode,
        held,
      });
      return {
        config: {
          ...config,
          categories: withSeen(
            withRecord(section, harness, record),
            harness,
            released.record,
          ),
        },
        result: { ok: true, list: listOf(record) },
      };
    });
  }

  // Read before any update, so no other config write waits on git.
  private async copySource() {
    const harness = await this.harness();
    if (harness === null) {
      return { ok: false, error: "not-configured" } as const;
    }
    const released = await readReleasedHarnessCategories(
      this.git,
      harness.root,
    );
    if (released.kind === "unread") {
      return { ok: false, error: "harness-categories-unread" } as const;
    }
    if (released.kind !== "listed") {
      return { ok: false, error: "no-harness-categories" } as const;
    }
    const section = readCategorySection((await this.store.read()).categories);
    if (section === null) return this.unreadable();
    const own = recordOf(section, harness);
    const held = await this.held(harness.root, [
      ...own.assignments,
      ...released.record.assignments,
    ]);
    return { ok: true, harness, released, held } as const;
  }

  private unreadable(): Refused {
    return {
      ok: false,
      error: "categories-unreadable",
      configPath: this.configPath(),
    };
  }
}
