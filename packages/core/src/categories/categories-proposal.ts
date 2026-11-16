// The categories pull request: the row on Categories in Settings, the
// dialog's difference against the next release, and Create pull request. The
// file is built on the fetched default-branch tip from the operator's list in
// the config, never from the clone's working tree.
import type { GitOrigin } from "../deploy/git-origin";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import type { HarnessFetchGate } from "../harness/harness-fetch-gate";
import {
  type HarnessPrimitiveType,
  PROPOSAL_REFS,
  type PrimitiveRef,
  primitiveKey,
} from "../harness/harness-primitive";
import type { PrimitiveEntryFs } from "../harness/harness-primitive-dir";
import {
  type HarnessReviewPort,
  isOthers,
  matchesProposal,
  type ReviewRequest,
  type ViewerRead,
} from "../harness/harness-review-port";
import { listReviewRow } from "../harness/harness-stages";
import {
  type PullRequestOutcome,
  readOriginFacts,
} from "../harness/proposal-request";
import {
  CATEGORIES_SUBJECT,
  subjectBranch,
  subjectBranchLeaf,
} from "../harness/proposal-subject";
import type { HarnessGitPort } from "../harness/read-harness-state";
import type { ConfigStore } from "../registry/config-store";
import { compareCategoryNames } from "./category-name";
import {
  type CategoryRecord,
  type HarnessKey,
  readCategorySection,
  recordOf,
} from "./category-section";
import {
  HARNESS_CATEGORIES_MAX_BYTES,
  HARNESS_CATEGORIES_MAX_COUNT,
  type HarnessCategoriesFile,
  writeHarnessCategoriesFile,
} from "./harness-categories-file";
import { heldBeside } from "./held-items";
import { readHarnessCategoriesAt } from "./released-harness-categories";

const SUBJECT = CATEGORIES_SUBJECT;
// The pull request's title and the commit's subject.
const TITLE = "Set Harness categories";
const BODY = "Proposed from the Maestro cockpit.";
const REQUEST_REF = `${PROPOSAL_REFS}/${subjectBranchLeaf(SUBJECT)}`;
const EMPTY: CategoryRecord = { names: [], assignments: [] };

// A file with an error compares as no categories; the caller says so.
const recordIn = (file: HarnessCategoriesFile): CategoryRecord =>
  file.kind === "valid" ? file.record : EMPTY;

/** What the row Pull request to the Harness states; first match wins. */
export type CategoriesProposalRow =
  // The Harness or GitHub could not be read.
  | { state: "unread" }
  | { state: "waiting-on-other"; author: string; number: number; url: string }
  | {
      state: "own-open";
      status: "waiting-for-review" | "changes-requested";
      number: number;
      url: string;
      // The operator's list against the file on the pull request's branch.
      list: OwnListAgainstRequest;
    }
  // The branch is pushed and no pull request opens it.
  | { state: "pull-request-missing" }
  | { state: "empty" }
  // Over the categories file's limits.
  | { state: "over-limits" }
  | { state: "start" };

/** `empty` and `over-limits` block Update pull request as they block Create. */
type OwnListAgainstRequest = "same" | "differs" | "empty" | "over-limits";

/** A category and the skills and prompts the difference counts in it. */
export type CategoryCount = { name: string; skills: number; prompts: number };

/** An item the pull request gives another category; null is none. */
export type MovedItem = {
  type: HarnessPrimitiveType;
  name: string;
  category: string | null;
};

/**
 * The operator's list against a categories file. `deleted` counts the items
 * that end without a category; `uncompared`: the file has an error.
 */
export type CategoriesDifference =
  | {
      kind: "changes";
      added: CategoryCount[];
      deleted: CategoryCount[];
      moved: MovedItem[];
    }
  | { kind: "unchanged" }
  | { kind: "uncompared" };

/**
 * Create pull request compares with the next release. Update pull request
 * compares with the file on the open pull request's branch; its `deleted`
 * still counts against the next release.
 */
export type CategoriesProposalPreview =
  | CategoriesDifference
  | {
      kind: "update";
      number: number;
      difference: CategoriesDifference;
      deleted: CategoryCount[];
    };

export type CategoriesProposalError =
  | "not-configured"
  | "categories-unreadable"
  | "no-usable-origin"
  | "no-answer"
  | "list-empty"
  | "list-too-large"
  | "list-unchanged"
  | "proposed-by-other"
  // Update pull request: the list equals the file on its branch.
  | "request-unchanged"
  | "push-elsewhere"
  | "promote-failed"
  | "promote-in-progress";

type Refused = { ok: false; error: CategoriesProposalError };

export type CategoriesProposalRowResult =
  | { ok: true; row: CategoriesProposalRow }
  | { ok: false; error: "not-configured" | "categories-unreadable" };

export type CategoriesProposalPreviewResult =
  | { ok: true; preview: CategoriesProposalPreview }
  | Refused;

/** What Create or Update pull request answers once the branch is pushed. */
export type CategoriesProposalCreated = { pullRequest: PullRequestOutcome };

export type CategoriesProposalSubmitResult =
  | ({ ok: true } & CategoriesProposalCreated)
  | Refused;

type ReviewReads = Pick<HarnessReviewPort, "readReviews" | "readViewer">;

type Assessed = {
  row: CategoriesProposalRow;
  origin: GitOrigin;
  base: string;
  head: string;
  record: CategoryRecord;
  preview: CategoriesProposalPreview;
};

const LIST_REFUSAL = {
  empty: "list-empty",
  "over-limits": "list-too-large",
} as const satisfies Partial<Record<string, CategoriesProposalError>>;

// The dialog may still open on a list equal to the pull request: it says so.
const rowRefusal = (
  row: CategoriesProposalRow,
): CategoriesProposalError | null => {
  switch (row.state) {
    case "unread":
      return "no-answer";
    case "waiting-on-other":
      return "proposed-by-other";
    case "empty":
    case "over-limits":
      return LIST_REFUSAL[row.state];
    case "own-open":
      return row.list === "empty" || row.list === "over-limits"
        ? LIST_REFUSAL[row.list]
        : null;
    case "pull-request-missing":
    case "start":
      return null;
  }
};

const byteLength = (text: string): number =>
  new TextEncoder().encode(text).byteLength;

type OwnOpen = Extract<CategoriesProposalRow, { state: "own-open" }>;

// Another contributor's open request outranks the operator's own.
const requestRow = (
  requests: readonly ReviewRequest[],
  viewer: ViewerRead,
):
  | Extract<CategoriesProposalRow, { state: "waiting-on-other" }>
  | Omit<OwnOpen, "list">
  | null => {
  const open = requests
    .filter((request) => request.state === "open")
    .sort((a, b) => b.number - a.number);
  const other = open.find((request) => isOthers(request, viewer));
  if (other !== undefined) {
    const { author, number, url } = other;
    return { state: "waiting-on-other", author, number, url };
  }
  const [own] = open;
  return own === undefined
    ? null
    : {
        state: "own-open",
        status:
          own.decision === "changes-requested"
            ? "changes-requested"
            : "waiting-for-review",
        number: own.number,
        url: own.url,
      };
};

const sameItem = (a: PrimitiveRef) => (b: PrimitiveRef) =>
  a.type === b.type && a.name === b.name;

const categoryIn = (record: CategoryRecord, item: PrimitiveRef) =>
  record.assignments.find(sameItem(item))?.category ?? null;

const counted = (
  name: string,
  items: readonly { type: HarnessPrimitiveType }[],
): CategoryCount => ({
  name,
  skills: items.filter((item) => item.type === "skill").length,
  prompts: items.filter((item) => item.type === "prompt").length,
});

const byName = (a: { name: string }, b: { name: string }) =>
  compareCategoryNames(a.name, b.name);

/** The difference a pull request with `own` makes to `next`. */
const differenceOf = (
  own: CategoryRecord,
  next: CategoryRecord,
): CategoriesDifference => {
  const addedNames = own.names.filter((name) => !next.names.includes(name));
  const deletedNames = next.names.filter((name) => !own.names.includes(name));
  const added = addedNames.map((name) =>
    counted(
      name,
      own.assignments.filter((each) => each.category === name),
    ),
  );
  const deleted = deletedNames.map((name) =>
    counted(
      name,
      next.assignments.filter(
        (each) => each.category === name && categoryIn(own, each) === null,
      ),
    ),
  );
  const items = new Map<string, PrimitiveRef>();
  for (const { type, name } of [...next.assignments, ...own.assignments]) {
    items.set(primitiveKey({ type, name }), { type, name });
  }
  const moved: MovedItem[] = [...items.values()].flatMap((item) => {
    const from = categoryIn(next, item);
    const to = categoryIn(own, item);
    // Counted under its added or deleted category instead.
    const counts =
      (from === null && to !== null && addedNames.includes(to)) ||
      (to === null && from !== null && deletedNames.includes(from));
    return from === to || counts ? [] : [{ ...item, category: to }];
  });
  if (added.length + deleted.length + moved.length === 0) {
    return { kind: "unchanged" };
  }
  return {
    kind: "changes",
    added: added.sort(byName),
    deleted: deleted.sort(byName),
    moved: moved.sort(byName),
  };
};

export class CategoriesProposal {
  private readonly deps: {
    store: ConfigStore;
    harness: () => Promise<HarnessKey | null>;
    git: HarnessGitPort;
    fs: PrimitiveEntryFs;
    fetchGate: Pick<
      HarnessFetchGate,
      "fetchFresh" | "fetchRecent" | "invalidate"
    >;
    // The row may reuse a recent read; the dialog and the write read fresh.
    reads: ReviewReads;
    review: HarnessReviewPort;
    locks: InFlightLocks;
  };

  constructor(deps: CategoriesProposal["deps"]) {
    this.deps = deps;
  }

  async read(): Promise<CategoriesProposalRowResult> {
    const harness = await this.deps.harness();
    if (harness === null) return { ok: false, error: "not-configured" };
    await this.deps.fetchGate.fetchRecent(harness.root);
    const assessed = await this.assess(harness, this.deps.reads);
    if (!assessed.ok) {
      return assessed.error === "categories-unreadable"
        ? { ok: false, error: assessed.error }
        : { ok: true, row: { state: "unread" } };
    }
    return { ok: true, row: assessed.value.row };
  }

  async preview(): Promise<CategoriesProposalPreviewResult> {
    const harness = await this.deps.harness();
    if (harness === null) return { ok: false, error: "not-configured" };
    const ready = await this.ready(harness);
    return ready.ok ? { ok: true, preview: ready.value.preview } : ready;
  }

  // Every refusal is checked again here, after a fresh fetch and read.
  async submit(): Promise<CategoriesProposalSubmitResult> {
    const harness = await this.deps.harness();
    if (harness === null) return { ok: false, error: "not-configured" };
    const run = await this.deps.locks.run(harness.root, () =>
      this.create(harness),
    );
    return run.ok ? run.value : { ok: false, error: "promote-in-progress" };
  }

  private async create(
    harness: HarnessKey,
  ): Promise<CategoriesProposalSubmitResult> {
    const ready = await this.ready(harness);
    if (!ready.ok) return ready;
    const { origin, base, head, record, preview, row } = ready.value;
    if (preview.kind === "unchanged") {
      return { ok: false, error: "list-unchanged" };
    }
    if (preview.kind === "update" && preview.difference.kind === "unchanged") {
      return { ok: false, error: "request-unchanged" };
    }
    const push = await this.deps.git.pushListFile(harness.root, {
      subject: SUBJECT,
      text: writeHarnessCategoriesFile(record),
      defaultTip: head,
      message: TITLE,
    });
    if (push !== "pushed") {
      return {
        ok: false,
        error:
          push === "offline"
            ? "no-answer"
            : push === "push-elsewhere"
              ? push
              : "promote-failed",
      };
    }
    // The new commit reaches the clone only through a fetch.
    this.deps.fetchGate.invalidate(harness.root);
    if (row.state === "own-open") {
      const { number, url } = row;
      return { ok: true, pullRequest: { state: "updated", number, url } };
    }
    const created = await this.deps.review.createRequest(origin, {
      head: subjectBranch(SUBJECT),
      base,
      title: TITLE,
      body: BODY,
    });
    return {
      ok: true,
      pullRequest: created.ok
        ? { state: "opened", number: created.number, url: created.url }
        : { state: "missing", gh: "available" },
    };
  }

  // A fresh fetch and review read, then every refusal the row states.
  private async ready(
    harness: HarnessKey,
  ): Promise<{ ok: true; value: Assessed } | Refused> {
    if ((await this.deps.fetchGate.fetchFresh(harness.root)) !== "fetched") {
      return { ok: false, error: "no-answer" };
    }
    const assessed = await this.assess(harness, this.deps.review);
    if (!assessed.ok) return assessed;
    const refusal = rowRefusal(assessed.value.row);
    return refusal === null ? assessed : { ok: false, error: refusal };
  }

  private async assess(
    { root, ...key }: HarnessKey,
    review: ReviewReads,
  ): Promise<{ ok: true; value: Assessed } | Refused> {
    const section = readCategorySection(
      (await this.deps.store.read()).categories,
    );
    if (section === null) return { ok: false, error: "categories-unreadable" };
    const own = recordOf(section, { root, ...key });
    const facts = await readOriginFacts(this.deps.git, root);
    if (!facts.ok) return facts;
    const { origin, base, head } = facts;
    if (head === null) return { ok: false, error: "no-answer" };

    const reviews = await review.readReviews(origin);
    if (reviews.outcome !== "read") return { ok: false, error: "no-answer" };
    const matching = reviews.requests.filter((request) =>
      matchesProposal(request, {
        ownerRepo: origin.ownerRepo,
        branch: subjectBranch(SUBJECT),
        base,
      }),
    );
    const viewer: ViewerRead =
      matching.length === 0
        ? { outcome: "unavailable" }
        : await review.readViewer(origin);
    // A bounded read cannot prove that nobody's request is open.
    const open = requestRow(matching, viewer);
    if (open === null && !reviews.complete) {
      return { ok: false, error: "no-answer" };
    }
    const branch = await this.deps.git.readListProposal(root, SUBJECT);
    if (branch === null) return { ok: false, error: "no-answer" };
    // The Harness row's own rule, so Settings shows a state exactly as long.
    const harnessRow = listReviewRow(
      { origin, defaultBranch: base, review: reviews, viewer },
      branch,
    );
    const missing: CategoriesProposalRow | null =
      harnessRow?.status === "pull-request-missing"
        ? { state: "pull-request-missing" }
        : null;
    const requests = open ?? missing;

    const next = await readHarnessCategoriesAt(this.deps.git, root, head);
    const atTip = await this.deps.git.readPrimitives(root, head);
    // The file as the operator's open pull request carries it now.
    const sent =
      requests?.state === "own-open"
        ? await readHarnessCategoriesAt(this.deps.git, root, REQUEST_REF)
        : undefined;
    if (next === null || atTip === null || sent === null) {
      return { ok: false, error: "no-answer" };
    }
    const nextRecord = recordIn(next);
    const sentRecord = sent === undefined ? EMPTY : recordIn(sent);
    const held = await heldBeside(
      this.deps.fs,
      root,
      [
        ...own.assignments,
        ...nextRecord.assignments,
        ...sentRecord.assignments,
      ],
      new Set(atTip.map(primitiveKey)),
    );
    if (held === null) return { ok: false, error: "no-answer" };
    const holds = (record: CategoryRecord): CategoryRecord => ({
      names: [...record.names].sort(compareCategoryNames),
      assignments: record.assignments.filter((each) => held.holds(each)),
    });
    const record = holds(own);
    const tooLarge =
      record.names.length > HARNESS_CATEGORIES_MAX_COUNT ||
      byteLength(writeHarnessCategoriesFile(record)) >
        HARNESS_CATEGORIES_MAX_BYTES;
    const againstNext: CategoriesDifference =
      next.kind === "faulty"
        ? { kind: "uncompared" }
        : differenceOf(record, holds(nextRecord));
    const listState =
      record.names.length === 0 ? "empty" : tooLarge ? "over-limits" : null;
    if (requests?.state === "own-open" && sent !== undefined) {
      const difference: CategoriesDifference =
        sent.kind === "faulty"
          ? { kind: "uncompared" }
          : differenceOf(record, holds(sentRecord));
      return {
        ok: true,
        value: {
          row: {
            ...requests,
            list:
              listState ??
              (difference.kind === "unchanged" ? "same" : "differs"),
          },
          origin,
          base,
          head,
          record,
          preview: {
            kind: "update",
            number: requests.number,
            difference,
            deleted: againstNext.kind === "changes" ? againstNext.deleted : [],
          },
        },
      };
    }
    return {
      ok: true,
      value: {
        row:
          requests?.state === "waiting-on-other"
            ? requests
            : // A list the write refuses blocks finishing a pushed branch too.
              listState !== null
              ? { state: listState }
              : (missing ?? { state: "start" }),
        origin,
        base,
        head,
        record,
        preview: againstNext,
      },
    };
  }
}
