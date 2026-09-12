// Reads back what apm recorded for the skill it just installed. apm exits 0 and
// prints its success marker even for a package it recorded as invalid, so this
// is the only machine-readable verdict there is (#358, apm-behavior.md).
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

  // Everything short of an entry we read is "unverified": the rest leave apm's
  // marker as the only evidence, which is the evidence this read exists to
  // distrust (#58, #357).
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
    // subpath (LEARNINGS · ref-subpath-is-literal). A root-package row names
    // none, so it never matches and the read stays unverified.
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
