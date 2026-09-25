// Read from tree hashes, never ancestry: merge, squash and rebase must report
// the same movements (#517). A renamed-and-edited skill reads as add plus remove.

export type HarnessSkillTree = { name: string; treeHash: string };

export type SkillMovementKind = "added" | "changed" | "removed" | "renamed";

export type SkillMovement = {
  kind: SkillMovementKind;
  name: string;
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

  // A rename only where the content matches exactly one name on each side.
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
