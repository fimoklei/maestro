import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  appendGitConfig,
  NO_BACKGROUND_GIT,
} from "../../scripts/lib/git-config-env.mjs";

const run = promisify(execFile);

/**
 * Points HOME and MAESTRO_HOME at a throwaway tree for the whole run (#1935),
 * and keeps git from writing into a test repository after it returns (#1937).
 */
export async function setup(): Promise<() => Promise<void>> {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "maestro-test-home-")),
  );
  const home = join(root, "home");
  const maestroHome = join(home, ".maestro");
  await mkdir(maestroHome, { recursive: true });
  // A push into a local path drops `GIT_CONFIG_COUNT` for the receiving side,
  // which still reads the home's config file.
  for (const [key, value] of NO_BACKGROUND_GIT) {
    await run("git", [
      "config",
      "--file",
      join(home, ".gitconfig"),
      key,
      value,
    ]);
  }
  process.env.HOME = home;
  process.env.MAESTRO_HOME = maestroHome;
  // apm blanks the home's config file; this channel still reaches its git.
  Object.assign(process.env, appendGitConfig(process.env, NO_BACKGROUND_GIT));
  return () => rm(root, { recursive: true, force: true });
}
