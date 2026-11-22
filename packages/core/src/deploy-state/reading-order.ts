import type { DeployedPrimitive } from "./deploy-state-types";

type Surface = "target" | "folder" | "skill" | "inventory";

type Entry = {
  kind: string;
  surfaces: readonly Surface[];
  // Present on a reading a deployed copy carries. `edited`: its files are
  // proven changed; `imports`: the Working harness may lack its edits.
  copy?: { edited: boolean; imports: boolean };
};

/** Every copy and target reading but Unknown, worst first, with the surfaces that show it. */
const READINGS = [
  { kind: "unfinished", surfaces: ["target"] },
  { kind: "attention", surfaces: ["target"] },
  {
    kind: "local-edits",
    surfaces: ["target", "folder", "skill", "inventory"],
    copy: { edited: true, imports: true },
  },
  { kind: "missing", surfaces: ["target", "folder", "skill"] },
  { kind: "not-updated", surfaces: ["target", "folder", "skill"] },
  {
    kind: "unverified",
    surfaces: ["skill"],
    copy: { edited: false, imports: true },
  },
  { kind: "no-longer-released", surfaces: ["skill"] },
  {
    kind: "edits-in-harness",
    surfaces: ["target", "skill", "inventory"],
    copy: { edited: true, imports: false },
  },
  { kind: "behind", surfaces: ["target", "skill", "inventory"] },
  { kind: "up-to-date", surfaces: ["target", "skill", "inventory"] },
  { kind: "pinned-per-skill", surfaces: ["target"] },
  { kind: "other-origin", surfaces: ["target"] },
  { kind: "empty", surfaces: ["target"] },
  { kind: "not-deployed", surfaces: ["inventory"] },
] as const satisfies readonly Entry[];

type Reading = (typeof READINGS)[number];

type KindIn<E, S extends Surface> = E extends {
  kind: infer K;
  surfaces: readonly (infer L)[];
}
  ? S extends L
    ? K
    : never
  : never;

/** The readings one surface shows. */
export type KindOn<S extends Surface> = KindIn<Reading, S>;

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? A : never) : never;

// Never where the catalogue and `DeployedPrimitive["copy"]` disagree, which
// fails every consumer's type check.
export type CopyKind = Exact<
  Extract<Reading, { copy: object }>["kind"],
  NonNullable<DeployedPrimitive["copy"]>
>;

export type EditedKind = Extract<Reading, { copy: { edited: true } }>["kind"];
export type ImportKind = Extract<Reading, { copy: { imports: true } }>["kind"];

const entryOf = (kind: string): Entry | undefined =>
  READINGS.find((each) => each.kind === kind);

/** One surface's readings, worst first. */
export function readingsOn<S extends Surface>(surface: S): KindOn<S>[] {
  return READINGS.flatMap((each): KindOn<S>[] =>
    each.surfaces.some((on) => on === surface)
      ? // The test on this line is what KindOn<S> states at the type level.
        [each.kind as KindOn<S>]
      : [],
  );
}

/** A surface's readings with Unknown, which the catalogue does not rank, placed after `after`. */
export function withUnknown<K extends string>(
  kinds: readonly K[],
  after: K,
): (K | "unknown")[] {
  const at = kinds.indexOf(after) + 1;
  return [...kinds.slice(0, at), "unknown", ...kinds.slice(at)];
}

/** Whether a reading is one a deployed copy carries. */
export const isCopyReading = (kind: string): kind is CopyKind =>
  entryOf(kind)?.copy !== undefined;

/** The copy readings, worst first: Global's one skill list keeps a skill's worst. */
export const COPY_READINGS: readonly CopyKind[] = READINGS.map(
  (each) => each.kind,
).filter(isCopyReading);

export const holdsEdits = (kind: CopyKind): kind is CopyKind & EditedKind =>
  entryOf(kind)?.copy?.edited === true;

/** Whether Import local edits offers a copy with this reading. */
export const offersImport = (kind: CopyKind): kind is CopyKind & ImportKind =>
  entryOf(kind)?.copy?.imports === true;
