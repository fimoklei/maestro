// Scaffolding writes, commits and pushes with whatever git credentials the
// machine already has, so the path it acts on may not be the client's to
// choose: only one connect has just refused and offered stands (security.md).
//
// In-process and unpersisted: an offer lasts as long as the server does, which
// is the session the gate hands it out in. It is not consumed on use — a
// scaffold that failed on git identity is retried against the same offer.
export class ScaffoldOffers {
  private readonly offered = new Set<string>();

  // The canonical path validateRepoPath resolved, which is the same path the
  // scaffold will validate its own input down to.
  offer(canonicalPath: string): void {
    this.offered.add(canonicalPath);
  }

  holds(canonicalPath: string): boolean {
    return this.offered.has(canonicalPath);
  }
}
