// The team delta between two states of the harness, read from skill content
// rather than commit ancestry: merge, squash and rebase land the same trees, so
// they must report the same movements (ADR-0021, #517).
//
// A skill directory is one unit. Its tree hash is git's own hash of everything
// inside it, so an identical hash means identical content, whatever moved
// around it in the repository.
//
// Content is the only rename signal, so a directory renamed *and* edited in one
// release reads as an addition and a removal. Guessing a pairing from names
// would put words in the author's mouth.

export type HarnessSkillTree = { name: string; treeHash: string };

export type SkillMovementKind = "added" | "changed" | "removed" | "renamed";

export type SkillMovement = {
  kind: SkillMovementKind;
  name: string;
  // Set only on a rename: the name the released harness carried.
  previousName?: string;
};

const groupByHash = (skills: HarnessSkillTree[]) => {
  const byHash = new Map<string, HarnessSkillTree[]>();
  for (const skill of skills) {
    byHash.set(skill.treeHash, [...(byHash.get(skill.treeHash) ?? []), skill]);
  }
  return byHash;
};

export const diffSkillTrees = (
  previous: HarnessSkillTree[],
  current: HarnessSkillTree[],
): SkillMovement[] => {
  const previousByName = new Map(previous.map((s) => [s.name, s.treeHash]));
  const currentByName = new Map(current.map((s) => [s.name, s.treeHash]));

  const added = current.filter((skill) => !previousByName.has(skill.name));
  const dropped = previous.filter((skill) => !currentByName.has(skill.name));
  const addedByHash = groupByHash(added);
  const droppedByHash = groupByHash(dropped);

  // A rename is claimed only where the content points at one name on each
  // side. Duplicated content points at several at once, and picking one of
  // them would be a guess wearing a fact's clothes.
  const renamedHashes = new Set(
    [...droppedByHash]
      .filter(
        ([hash, gone]) =>
          gone.length === 1 && addedByHash.get(hash)?.length === 1,
      )
      .map(([hash]) => hash),
  );

  const movements: SkillMovement[] = current
    .filter((skill) => {
      const before = previousByName.get(skill.name);
      return before !== undefined && before !== skill.treeHash;
    })
    .map((skill) => ({ kind: "changed", name: skill.name }));

  for (const skill of added) {
    const gone = renamedHashes.has(skill.treeHash)
      ? droppedByHash.get(skill.treeHash)?.[0]
      : undefined;
    movements.push(
      gone === undefined
        ? { kind: "added", name: skill.name }
        : { kind: "renamed", name: skill.name, previousName: gone.name },
    );
  }

  for (const gone of dropped) {
    if (!renamedHashes.has(gone.treeHash)) {
      movements.push({ kind: "removed", name: gone.name });
    }
  }

  return movements.sort((a, b) => a.name.localeCompare(b.name, "en"));
};
