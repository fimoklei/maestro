export const readPmset: () => string;

export function testMaxWorkers(options: {
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  readPowerSource: () => string;
}): number | undefined;
