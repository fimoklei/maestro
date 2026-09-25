// Scaffolding pushes with the machine's git credentials, so it may act only on
// a path connect offered, never one the client chose. In memory, and not
// consumed on use, so a failed scaffold can retry.
export class ScaffoldOffers {
  private readonly offered = new Set<string>();

  // Takes the canonical path validateRepoPath resolved.
  offer(canonicalPath: string): void {
    this.offered.add(canonicalPath);
  }

  holds(canonicalPath: string): boolean {
    return this.offered.has(canonicalPath);
  }
}
