export const FIXTURE_ORIGIN: string;

export const FIXTURE_PACKAGE: string;

export const FIXTURE_RELEASES: string[];

export function releasesUpTo(release: string): string[];

export function fixtureRedirectEnv(
  bareDir: string,
  env: Record<string, string | undefined>,
): Record<string, string>;

export function buildFixtureHarness(input: {
  fixtureDir: string;
  workDir: string;
}): Record<string, string>;

export function publishFixtureRelease(input: {
  workDir: string;
  bareDir: string;
  release: string;
}): void;
