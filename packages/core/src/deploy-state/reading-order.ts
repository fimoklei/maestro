import type { DeployedPrimitive } from "./deploy-state-types";

type Surface = "target" | "folder" | "skill" | "inventory";

type Entry = {
  kind: string;
  surfaces: readonly Surface[];
  copy?: { edited: boolean; imports: boolean };
};

const READINGS = [
  { kind: "folder-missing", surfaces: ["target"] },
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

export type KindOn<S extends Surface> = KindIn<Reading, S>;

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? A : never) : never;

export type CopyKind = Exact<
  Extract<Reading, { copy: object }>["kind"],
  NonNullable<DeployedPrimitive["copy"]>
>;

export type EditedKind = Extract<Reading, { copy: { edited: true } }>["kind"];
export type ImportKind = Extract<Reading, { copy: { imports: true } }>["kind"];

const entryOf = (kind: string): Entry | undefined =>
  READINGS.find((each) => each.kind === kind);

const showsOn = <S extends Surface>(
  each: Reading,
  surface: S,
): each is Reading & { kind: KindOn<S> } =>
  each.surfaces.some((on) => on === surface);

export function readingsOn<S extends Surface>(surface: S): KindOn<S>[] {
  const kinds: KindOn<S>[] = [];
  for (const each of READINGS) {
    if (showsOn(each, surface)) kinds.push(each.kind);
  }
  return kinds;
}

export function withUnknown<K extends string>(
  kinds: readonly K[],
  after: K,
): (K | "unknown")[] {
  const at = kinds.indexOf(after) + 1;
  return [...kinds.slice(0, at), "unknown", ...kinds.slice(at)];
}

export const isCopyReading = (kind: string): kind is CopyKind =>
  entryOf(kind)?.copy !== undefined;

export const COPY_READINGS: readonly CopyKind[] = READINGS.map(
  (each) => each.kind,
).filter(isCopyReading);

export const holdsEdits = (kind: CopyKind): kind is CopyKind & EditedKind =>
  entryOf(kind)?.copy?.edited === true;

export const offersImport = (kind: CopyKind): kind is CopyKind & ImportKind =>
  entryOf(kind)?.copy?.imports === true;
