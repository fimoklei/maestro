import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Points HOME and MAESTRO_HOME at a throwaway tree for the whole run (#1935). */
export async function setup(): Promise<() => Promise<void>> {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "maestro-test-home-")),
  );
  const home = join(root, "home");
  const maestroHome = join(home, ".maestro");
  await mkdir(maestroHome, { recursive: true });
  process.env.HOME = home;
  process.env.MAESTRO_HOME = maestroHome;
  return () => rm(root, { recursive: true, force: true });
}
