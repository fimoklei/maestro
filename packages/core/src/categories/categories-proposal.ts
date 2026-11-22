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
import {
  type HarnessStageRow,
  listReviewRow,
  newestMerged,
} from "../harness/harness-stages";
import {
  type PullRequestOutcome,
  readOriginFacts,
} from "../harness/proposal-request";
import {
  CATEGORIES_SUBJECT,
  subjectBranch,
  subjectBranchLeaf,
} from "../harness/proposal-subject";
import type { HarnessGitPort, HarnessTag } from "../harness/read-harness-state";
import { readListMovements } from "../harness/release-delta";
import { highestReleaseTag } from "../harness/release-tag";
import type { ConfigStore } from "../registry/config-store";
import { compareCategoryNames, sameCategoryName } from "./category-name";
import {
  type CategoryRecord,
  type HarnessKey,
  type ItemCount,
  itemCount,
  readCategorySection,
  recordOf,
} from "./category-section";
import {
  exceedsHarnessCategoriesLimits,
  type HarnessCategoriesFile,
  writeHarnessCategoriesFile,
} from "./harness-categories-file";
import { heldBeside } from "./held-items";
import { readHarnessCategoriesAt } from "./released-harness-categories";

const SUBJECT = CATEGORIES_SUBJECT;
const TITLE = "Set Harness categories";
const BODY = "Proposed from the Maestro cockpit.";
const REQUEST_REF = `${PROPOSAL_REFS}/${subjectBranchLeaf(SUBJECT)}`;
const EMPTY: CategoryRecord = { names: [], assignments: [] };

const recordIn = (file: HarnessCategoriesFile): CategoryRecord =>
  file.kind === "valid" ? file.record : EMPTY;

type ListReadiness = "ready" | "empty" | "over-limits";

type OwnListAgainstRequest = "same" | "differs" | "empty" | "over-limits";

export type CategoriesProposalRow =
  | { state: "unread" }
  | { state: "no-usable-origin" }
  | { state: "waiting-on-other"; author: string; number: number; url: string }
  | {
      state: "own-open";
      status: "waiting-for-review" | "changes-requested";
      number: number;
      url: string;
      list: OwnListAgainstRequest;
    }
  | { state: "pull-request-missing"; list: ListReadiness }
  | {
      state: "closed";
      number: number;
      url: string;
      author: string;
      byOther: boolean;
      list: ListReadiness;
    }
  | {
      state: "merged-not-released";
      number: number;
      url: string;
      list: ListReadiness;
    }
  | { state: "empty" }
  | { state: "over-limits" }
  | { state: "start" };

export type CategoryCount = { name: string } & ItemCount;

export type MovedItem = {
  type: HarnessPrimitiveType;
  name: string;
  category: string | null;
};

export type CategoriesDifference =
  | {
      kind: "changes";
      added: CategoryCount[];
      deleted: CategoryCount[];
      moved: MovedItem[];
    }
  | { kind: "unchanged" }
  | { kind: "uncompared" };

export type CategoriesProposalPreview =
  | CategoriesDifference
  | {
      kind: "update";
      number: number;
      difference: CategoriesDifference;
      deleted: CategoryCount[];
    }
  | {
      kind: "after-close";
      number: number;
      deletesBranch: boolean;
      difference: CategoriesDifference;
    };

export const CATEGORIES_PREVIEW_KINDS = [
  "changes",
  "unchanged",
  "uncompared",
  "update",
  "after-close",
] as const satisfies readonly CategoriesProposalPreview["kind"][];

export type CategoriesProposalError =
  | "not-configured"
  | "categories-unreadable"
  | "no-usable-origin"
  | "no-answer"
  | "list-empty"
  | "list-too-large"
  | "list-unchanged"
  | "proposed-by-other"
  | "request-unchanged"
  | "proposal-changed"
  | "push-elsewhere"
  | "promote-failed"
  | "push-failed-after-delete"
  | "promote-in-progress";

type Refused = { ok: false; error: CategoriesProposalError };

export type CategoriesProposalRowResult =
  | { ok: true; row: CategoriesProposalRow }
  | { ok: false; error: "not-configured" | "categories-unreadable" };

export type CategoriesProposalPreviewResult =
  | { ok: true; preview: CategoriesProposalPreview }
  | Refused;

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

type Assessment = { ok: true; value: Assessed } | Refused;

const LIST_REFUSAL = {
  empty: "list-empty",
  "over-limits": "list-too-large",
} as const satisfies Record<string, CategoriesProposalError>;

const rowRefusal = (
  row: CategoriesProposalRow,
): CategoriesProposalError | null => {
  switch (row.state) {
    case "unread":
      return "no-answer";
    case "no-usable-origin":
      return "no-usable-origin";
    case "waiting-on-other":
      return "proposed-by-other";
    case "empty":
    case "over-limits":
      return LIST_REFUSAL[row.state];
    case "own-open":
    case "pull-request-missing":
    case "closed":
    case "merged-not-released":
      return row.list === "empty" || row.list === "over-limits"
        ? LIST_REFUSAL[row.list]
        : null;
    case "start":
      return null;
  }
};

const writeOf = (kind: CategoriesProposalPreview["kind"]) =>
  kind === "update" || kind === "after-close" ? kind : "create";

type OwnOpen = Omit<
  Extract<CategoriesProposalRow, { state: "own-open" }>,
  "list"
>;
type WaitingOnOther = Extract<
  CategoriesProposalRow,
  { state: "waiting-on-other" }
>;
type MergedRow = Omit<
  Extract<CategoriesProposalRow, { state: "merged-not-released" }>,
  "list"
>;
type ClosedRow = Omit<
  Extract<CategoriesProposalRow, { state: "closed" }>,
  "list"
>;

const openRow = (
  requests: readonly ReviewRequest[],
  viewer: ViewerRead,
): WaitingOnOther | OwnOpen | null => {
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

const closedRow = (harnessRow: HarnessStageRow | null): ClosedRow | null => {
  const [ended] = harnessRow?.requests ?? [];
  return harnessRow?.status === "proposal-closed" && ended !== undefined
    ? {
        state: "closed",
        number: ended.number,
        url: ended.url,
        author: ended.author,
        byOther: ended.byOther,
      }
    : null;
};

const sameItem = (a: PrimitiveRef) => (b: PrimitiveRef) =>
  a.type === b.type && a.name === b.name;

const categoryIn = (record: CategoryRecord, item: PrimitiveRef) =>
  record.assignments.find(sameItem(item))?.category ?? null;

const counted = (
  name: string,
  items: readonly { type: HarnessPrimitiveType }[],
): CategoryCount => ({ name, ...itemCount(items) });

const byName = (a: { name: string }, b: { name: string }) =>
  compareCategoryNames(a.name, b.name);

const hasName = (names: readonly string[], name: string) =>
  names.some((each) => sameCategoryName(each, name));

const sameCategory = (a: string | null, b: string | null) =>
  a === null || b === null ? a === b : sameCategoryName(a, b);

const differenceOf = (
  own: CategoryRecord,
  next: CategoryRecord,
): CategoriesDifference => {
  const addedNames = own.names.filter((name) => !hasName(next.names, name));
  const deletedNames = next.names.filter((name) => !hasName(own.names, name));
  const respelled = own.names.some(
    (name) => hasName(next.names, name) && !next.names.includes(name),
  );
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
    const counts =
      (from === null && to !== null && addedNames.includes(to)) ||
      (to === null && from !== null && deletedNames.includes(from));
    return sameCategory(from, to) || counts ? [] : [{ ...item, category: to }];
  });
  if (added.length + deleted.length + moved.length === 0 && !respelled) {
    return { kind: "unchanged" };
  }
  return {
    kind: "changes",
    added: added.sort(byName),
    deleted: deleted.sort(byName),
    moved: moved.sort(byName),
  };
};

const differenceAgainst = (
  own: CategoryRecord,
  file: HarnessCategoriesFile,
  holds: (record: CategoryRecord) => CategoryRecord,
): CategoriesDifference =>
  file.kind === "faulty"
    ? { kind: "uncompared" }
    : differenceOf(own, holds(recordIn(file)));

type Reading = {
  open: WaitingOnOther | OwnOpen | null;
  harnessRow: HarnessStageRow | null;
  merged: MergedRow | null;
  record: CategoryRecord;
  list: Exclude<ListReadiness, "ready"> | null;
  againstNext: CategoriesDifference;
  againstRequest: CategoriesDifference | null;
  ownsBranch: boolean;
};

const rowOf = ({
  open,
  harnessRow,
  merged,
  list,
  againstRequest,
}: Reading): CategoriesProposalRow => {
  if (open?.state === "waiting-on-other") return open;
  if (open !== null) {
    return {
      ...open,
      list: list ?? (againstRequest?.kind === "unchanged" ? "same" : "differs"),
    };
  }
  if (harnessRow?.status === "pull-request-missing") {
    return { state: "pull-request-missing", list: list ?? "ready" };
  }
  const closed = closedRow(harnessRow);
  if (closed !== null) return { ...closed, list: list ?? "ready" };
  if (merged !== null) return { ...merged, list: list ?? "ready" };
  return list === null ? { state: "start" } : { state: list };
};

const previewOf = (
  row: CategoriesProposalRow,
  reading: Reading,
): CategoriesProposalPreview => {
  const { againstNext, againstRequest, ownsBranch } = reading;
  if (row.state === "own-open" && againstRequest !== null) {
    return {
      kind: "update",
      number: row.number,
      difference: againstRequest,
      deleted: againstNext.kind === "changes" ? againstNext.deleted : [],
    };
  }
  if (row.state === "closed") {
    return {
      kind: "after-close",
      number: row.number,
      deletesBranch: ownsBranch,
      difference: againstNext,
    };
  }
  return againstNext;
};

const unchangedRefusal = (
  preview: CategoriesProposalPreview,
): CategoriesProposalError | null => {
  switch (preview.kind) {
    case "unchanged":
      return "list-unchanged";
    case "update":
      return preview.difference.kind === "unchanged"
        ? "request-unchanged"
        : null;
    case "after-close":
      return preview.difference.kind === "unchanged" ? "list-unchanged" : null;
    default:
      return null;
  }
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
      switch (assessed.error) {
        case "categories-unreadable":
          return { ok: false, error: assessed.error };
        case "no-usable-origin":
          return { ok: true, row: { state: "no-usable-origin" } };
        default:
          return { ok: true, row: { state: "unread" } };
      }
    }
    return { ok: true, row: assessed.value.row };
  }

  async preview(): Promise<CategoriesProposalPreviewResult> {
    const harness = await this.deps.harness();
    if (harness === null) return { ok: false, error: "not-configured" };
    const ready = await this.ready(harness);
    return ready.ok ? { ok: true, preview: ready.value.preview } : ready;
  }

  async submit(
    previewed: CategoriesProposalPreview["kind"],
  ): Promise<CategoriesProposalSubmitResult> {
    const harness = await this.deps.harness();
    if (harness === null) return { ok: false, error: "not-configured" };
    const run = await this.deps.locks.run(harness.root, () =>
      this.create(harness, previewed),
    );
    return run.ok ? run.value : { ok: false, error: "promote-in-progress" };
  }

  private async create(
    harness: HarnessKey,
    previewed: CategoriesProposalPreview["kind"],
  ): Promise<CategoriesProposalSubmitResult> {
    const ready = await this.ready(harness);
    if (!ready.ok) return ready;
    const { origin, base, head, record, preview, row } = ready.value;
    if (writeOf(preview.kind) !== writeOf(previewed)) {
      return { ok: false, error: "proposal-changed" };
    }
    const unchanged = unchangedRefusal(preview);
    if (unchanged !== null) return { ok: false, error: unchanged };
    const deletes = preview.kind === "after-close" && preview.deletesBranch;
    if (
      deletes &&
      (await this.deps.git.deleteProposalBranch(harness.root, SUBJECT)) !==
        "deleted"
    ) {
      return { ok: false, error: "promote-failed" };
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
        error: deletes
          ? "push-failed-after-delete"
          : push === "offline"
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

  private async ready(harness: HarnessKey): Promise<Assessment> {
    if ((await this.deps.fetchGate.fetchFresh(harness.root)) !== "fetched") {
      return { ok: false, error: "no-answer" };
    }
    const assessed = await this.assess(harness, this.deps.review);
    if (!assessed.ok) return assessed;
    const refusal = rowRefusal(assessed.value.row);
    return refusal === null ? assessed : { ok: false, error: refusal };
  }

  private async assess(
    harness: HarnessKey,
    review: ReviewReads,
  ): Promise<Assessment> {
    const own = await this.ownList(harness);
    if (own === null) return { ok: false, error: "categories-unreadable" };
    const facts = await readOriginFacts(this.deps.git, harness.root);
    if (!facts.ok) return facts;
    const { origin, base, head, tags } = facts;
    if (head === null) return { ok: false, error: "no-answer" };
    const requests = await this.readRequests(origin, base, review);
    if (requests === null) return { ok: false, error: "no-answer" };
    const branch = await this.deps.git.readListProposal(harness.root, SUBJECT);
    if (branch === null) return { ok: false, error: "no-answer" };
    const harnessRow = listReviewRow(
      {
        origin,
        defaultBranch: base,
        review: requests.reviews,
        viewer: requests.viewer,
      },
      branch,
    );
    const lists = await this.compareLists(
      harness.root,
      head,
      own,
      requests.open?.state === "own-open",
    );
    if (lists === null) return { ok: false, error: "no-answer" };
    const reading: Reading = {
      open: requests.open,
      harnessRow,
      merged: await this.mergedNotReleased(
        harness.root,
        tags,
        head,
        requests.matching,
      ),
      ...lists,
      ownsBranch: branch.promote?.authorship === "own",
    };
    const row = rowOf(reading);
    return {
      ok: true,
      value: {
        row,
        origin,
        base,
        head,
        record: lists.record,
        preview: previewOf(row, reading),
      },
    };
  }

  private async ownList(harness: HarnessKey): Promise<CategoryRecord | null> {
    const section = readCategorySection(
      (await this.deps.store.read()).categories,
    );
    return section === null ? null : recordOf(section, harness);
  }

  private async readRequests(
    origin: GitOrigin,
    base: string,
    review: ReviewReads,
  ) {
    const reviews = await review.readReviews(origin);
    if (reviews.outcome !== "read") return null;
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
    const open = openRow(matching, viewer);
    if (open === null && !reviews.complete) return null;
    return { reviews, matching, viewer, open };
  }

  private async compareLists(
    root: string,
    head: string,
    own: CategoryRecord,
    ownOpen: boolean,
  ): Promise<Pick<
    Reading,
    "record" | "list" | "againstNext" | "againstRequest"
  > | null> {
    const next = await readHarnessCategoriesAt(this.deps.git, root, head);
    const atTip = await this.deps.git.readPrimitives(root, head);
    const sent = ownOpen
      ? await readHarnessCategoriesAt(this.deps.git, root, REQUEST_REF)
      : undefined;
    if (next === null || atTip === null || sent === null) return null;
    const held = await heldBeside(
      this.deps.fs,
      root,
      [
        ...own.assignments,
        ...recordIn(next).assignments,
        ...(sent === undefined ? [] : recordIn(sent).assignments),
      ],
      new Set(atTip.map(primitiveKey)),
    );
    if (held === null) return null;
    const holds = (record: CategoryRecord): CategoryRecord => ({
      names: [...record.names].sort(compareCategoryNames),
      assignments: record.assignments.filter((each) => held.holds(each)),
    });
    const record = holds(own);
    return {
      record,
      list:
        record.names.length === 0
          ? "empty"
          : exceedsHarnessCategoriesLimits(record)
            ? "over-limits"
            : null,
      againstNext: differenceAgainst(record, next, holds),
      againstRequest:
        sent === undefined ? null : differenceAgainst(record, sent, holds),
    };
  }

  private async mergedNotReleased(
    root: string,
    tags: HarnessTag[] | null,
    head: string,
    matching: readonly ReviewRequest[],
  ): Promise<MergedRow | null> {
    const request = newestMerged(matching);
    if (tags === null || request === undefined) return null;
    const moved = await readListMovements(
      this.deps.git,
      root,
      highestReleaseTag(tags),
      head,
    );
    if (moved === null || moved.length === 0) return null;
    const { number, url } = request;
    return { state: "merged-not-released", number, url };
  }
}
