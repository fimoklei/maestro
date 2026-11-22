// Tests `vitest related` cannot reach: they read their package's source from
// disk instead of importing it.

const SCANS_SOURCE = /\breaddirSync\(/;
const packageSrc = (path) => path.match(/^packages\/[^/]+\/src\//)?.[0];

/**
 * The source-scan tests among `tests` whose package source `changed` touches.
 * Paths are relative to the repository root.
 */
export function sourceScanTests(changed, tests) {
  const touched = new Set(changed.map(packageSrc).filter(Boolean));
  return tests
    .filter((test) => touched.has(packageSrc(test.path)))
    .filter((test) => SCANS_SOURCE.test(test.text))
    .map((test) => test.path);
}
