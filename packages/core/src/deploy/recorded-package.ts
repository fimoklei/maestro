// Reads back what apm recorded for the skill it just installed. apm exits 0 and
// prints its success marker even for a package it recorded as invalid, so this
// is the only machine-readable verdict there is (#358, apm-behavior.md).
import { basename } from "node:path";
import {
  type PackageReading,
  parseLockfile,
  readPackage,
} from "../lockfile/lockfile";
import type { FileSystemPort } from "../registry/file-system";
import type { DeployTarget, RecordedPackagePort } from "./deploy-skill";
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

  async read(input: {
    target: DeployTarget;
    name: string;
  }): Promise<PackageReading | null> {
    const raw = await this.fs.readFile(
      this.location.lockfilePath(input.target),
    );
    if (raw === null) {
      return null;
    }
    const parsed = parseLockfile(raw);
    if (!parsed.ok) {
      return null;
    }
    // basename, never a literal `skills/<name>`: a harness is free to record
    // its own subpath (LEARNINGS · ref-subpath-is-literal).
    const entry = parsed.entries.find(
      (candidate) => basename(candidate.virtual_path) === input.name,
    );
    // Nothing recorded — no entry, or one too broken to parse — leaves the
    // install apm proved standing (#357).
    return entry === undefined ? null : readPackage(entry);
  }
}
