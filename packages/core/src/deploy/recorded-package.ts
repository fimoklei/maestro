// apm prints its success marker even for a package it recorded as invalid, so
// this read-back is the only machine-readable verdict (#358).
import { basename } from "node:path";
import { parseLockfile, readPackage } from "../lockfile/lockfile";
import type { FileSystemPort } from "../registry/file-system";
import type {
  DeployTarget,
  RecordedPackagePort,
  RecordedPackageResult,
} from "./deploy-skill";
import type { DeployedLocation } from "./deployed-location";

export class RecordedPackageAdapter implements RecordedPackagePort {
  private readonly fs: FileSystemPort;
  private readonly location: Pick<DeployedLocation, "lockfilePath">;

  constructor(deps: {
    fs: FileSystemPort;
    location: Pick<DeployedLocation, "lockfilePath">;
  }) {
    this.fs = deps.fs;
    this.location = deps.location;
  }

  // Everything short of an entry we read is "unverified" (#58, #357).
  async read(input: {
    target: DeployTarget;
    name: string;
  }): Promise<RecordedPackageResult> {
    const raw = await this.fs.readFile(
      this.location.lockfilePath(input.target),
    );
    if (raw === null) {
      return { kind: "unverified" };
    }
    const parsed = parseLockfile(raw);
    if (!parsed.ok) {
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
