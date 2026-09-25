import { join } from "node:path";
import { resolveMaestroHome } from "../home-directory";

export function resolveMaestroConfigPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const base = resolveMaestroHome(env);
  return join(base, "config.json");
}
