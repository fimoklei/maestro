import { basename } from "node:path";
import { type LockfileReading, readPackage } from "../lockfile/lockfile";
import type {
  RecordedPackagePort,
  RecordedPackageResult,
} from "./deploy-skill";

export class RecordedPackageAdapter implements RecordedPackagePort {
  async read(input: {
    lockfile: LockfileReading;
    name: string;
  }): Promise<RecordedPackageResult> {
    const parsed = input.lockfile;
    if (parsed === "missing" || !parsed.ok) {
      return { kind: "unverified" };
    }
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
