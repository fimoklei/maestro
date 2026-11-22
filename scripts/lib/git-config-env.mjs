// Settings and env entries git reads through `GIT_CONFIG_COUNT`, the one
// config channel that survives a blanked `GIT_CONFIG_GLOBAL`.

/** Keeps git from writing into a repository after a command returns (#1937). */
export const NO_BACKGROUND_GIT = [
  ["maintenance.auto", "false"],
  ["gc.auto", "0"],
  ["receive.autoGc", "false"],
];

/** The env entries that add `pairs` after the config entries `env` already holds. */
export function appendGitConfig(env, pairs) {
  const first = Number(env.GIT_CONFIG_COUNT ?? 0) || 0;
  const entries = {};
  pairs.forEach(([key, value], index) => {
    entries[`GIT_CONFIG_KEY_${first + index}`] = key;
    entries[`GIT_CONFIG_VALUE_${first + index}`] = value;
  });
  return { ...entries, GIT_CONFIG_COUNT: String(first + pairs.length) };
}
