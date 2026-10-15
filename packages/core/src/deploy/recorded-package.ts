// apm prints its success marker even for a package it recorded as invalid, so
// this read-back is the only machine-readable verdict (#358).
import { basename } from "node:path";
import { type LockfileReading, readPackage } from "../lockfile/lockfile";
import type {
  RecordedPackagePort,
  RecordedPackageResult,
} from "./deploy-skill";

export class RecordedPackageAdapter implements RecordedPackagePort {
  // Everything short of an entry we read is "unverified" (#58, #357).
  async read(input: {
    lockfile: LockfileReading;
    name: string;
  }): Promise<RecordedPackageResult> {
    const parsed = input.lockfile;
    if (parsed === "missing" || !parsed.ok) {
      return { kind: "unverified" };
    }
    // basename, never a literal `skills/<name>`: a harness records its own
    // subpath. A root-package row names none, so it stays unverified.
    const entry = parsed.entries.find(
      (candidate) =>
        candidate.virtual_path !== undefined &&
        basename(candidate.virtual_path) === input.name,
    );
    return entry === undefined
      ? { kind: "unverified" }
      : { kind: "recorded", reading: readPackage(entry) };
  }
}
