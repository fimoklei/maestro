export class ScaffoldOffers {
  private readonly offered = new Set<string>();

  offer(canonicalPath: string): void {
    this.offered.add(canonicalPath);
  }

  holds(canonicalPath: string): boolean {
    return this.offered.has(canonicalPath);
  }
}
