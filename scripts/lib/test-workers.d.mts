export const currentMaxWorkers: () => number | undefined;

export function testMaxWorkers(options: {
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  readPowerSource: () => string;
}): number | undefined;
