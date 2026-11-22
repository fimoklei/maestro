import type { FileAtRef } from "./read-harness-state";

export const fileAtRef = (
  text: string | undefined,
  maxBytes: number,
): FileAtRef => {
  if (text === undefined) return { kind: "absent" };
  return new TextEncoder().encode(text).byteLength > maxBytes
    ? { kind: "too-large" }
    : { kind: "text", text };
};
