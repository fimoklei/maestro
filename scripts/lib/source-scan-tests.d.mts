export function sourceScanTests(
  changed: readonly string[],
  tests: readonly { path: string; text: string }[],
): string[];
