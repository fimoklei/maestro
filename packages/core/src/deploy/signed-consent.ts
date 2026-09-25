import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export class ConsentSigner {
  // Never exposed over the wire, never persisted: a restart invalidates every
  // outstanding consent, which is the safe direction.
  private readonly secret = randomBytes(32);

  sign(payload: Record<string, unknown>): string {
    return createHmac("sha256", this.secret)
      .update(JSON.stringify(payload))
      .digest("hex");
  }

  // Constant-time; anything malformed fails the match rather than throwing.
  matches(expected: string, actual: string | undefined): boolean {
    if (actual === undefined) {
      return false;
    }
    try {
      const a = Buffer.from(expected, "hex");
      const b = Buffer.from(actual, "hex");
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}
