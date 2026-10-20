// Read from content hashes, never ancestry: merge, squash and rebase must report
// the same movements (#517). A renamed-and-edited primitive reads as add plus
// remove, and a rename never crosses types.
import {
  HARNESS_PRIMITIVE_TYPES,
  type HarnessObject,
  type PrimitiveRef,
} from "./harness-primitive";

export type HarnessMovementKind = "added" | "changed" | "removed" | "renamed";

export type HarnessMovement = PrimitiveRef & {
  kind: HarnessMovementKind;
  previousName?: string;
};

const groupByHash = (objects: HarnessObject[]) => {
  const byHash = new Map<string, HarnessObject[]>();
  for (const object of objects) {
    byHash.set(object.hash, [...(byHash.get(object.hash) ?? []), object]);
  }
  return byHash;
};

const diffOneType = (
  previous: HarnessObject[],
  current: HarnessObject[],
): HarnessMovement[] => {
  const previousByName = new Map(previous.map((o) => [o.name, o.hash]));
  const currentByName = new Map(current.map((o) => [o.name, o.hash]));

  const added = current.filter((object) => !previousByName.has(object.name));
  const dropped = previous.filter((object) => !currentByName.has(object.name));
  const addedByHash = groupByHash(added);
  const droppedByHash = groupByHash(dropped);

  // A rename only where the content matches exactly one name on each side.
  const renamedHashes = new Set(
    [...droppedByHash]
      .filter(
        ([hash, gone]) =>
          gone.length === 1 && addedByHash.get(hash)?.length === 1,
      )
      .map(([hash]) => hash),
  );

  const movements: HarnessMovement[] = current
    .filter((object) => {
      const before = previousByName.get(object.name);
      return before !== undefined && before !== object.hash;
    })
    .map(({ type, name }) => ({ type, kind: "changed", name }));

  for (const { type, name, hash } of added) {
    const gone = renamedHashes.has(hash)
      ? droppedByHash.get(hash)?.[0]
      : undefined;
    movements.push(
      gone === undefined
        ? { type, kind: "added", name }
        : { type, kind: "renamed", name, previousName: gone.name },
    );
  }

  for (const gone of dropped) {
    if (!renamedHashes.has(gone.hash)) {
      movements.push({ type: gone.type, kind: "removed", name: gone.name });
    }
  }
  return movements;
};

export const diffPrimitives = (
  previous: HarnessObject[],
  current: HarnessObject[],
): HarnessMovement[] =>
  HARNESS_PRIMITIVE_TYPES.flatMap((type) =>
    diffOneType(
      previous.filter((object) => object.type === type),
      current.filter((object) => object.type === type),
    ),
  ).sort(
    (a, b) =>
      a.name.localeCompare(b.name, "en") || a.type.localeCompare(b.type, "en"),
  );
