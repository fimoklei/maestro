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

export const diffSkillTrees = (
  previous: HarnessSkillTree[],
  current: HarnessSkillTree[],
): SkillMovement[] => {
  const previousByName = new Map(previous.map((s) => [s.name, s.treeHash]));
  const currentByName = new Map(current.map((s) => [s.name, s.treeHash]));

  const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, "en");

  const added = current
    .filter((skill) => !previousByName.has(skill.name))
    .sort(byName);
  // Consumed as renames are paired off, so a copied skill cannot claim the same
  // removal twice.
  const dropped = previous
    .filter((skill) => !currentByName.has(skill.name))
    .sort(byName);

  const movements: SkillMovement[] = current
    .filter((skill) => {
      const before = previousByName.get(skill.name);
      return before !== undefined && before !== skill.treeHash;
    })
    .map((skill) => ({ kind: "changed", name: skill.name }) as SkillMovement);

  for (const skill of added) {
    const match = dropped.findIndex((gone) => gone.treeHash === skill.treeHash);
    const gone = match === -1 ? undefined : dropped.splice(match, 1)[0];
    movements.push(
      gone === undefined
        ? { kind: "added", name: skill.name }
        : { kind: "renamed", name: skill.name, previousName: gone.name },
    );
  }

  for (const gone of dropped) {
    movements.push({ kind: "removed", name: gone.name });
  }

  return movements.sort(byName);
};
