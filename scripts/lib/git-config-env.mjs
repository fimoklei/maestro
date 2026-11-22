export const NO_BACKGROUND_GIT = [
  ["maintenance.auto", "false"],
  ["gc.auto", "0"],
  ["receive.autoGc", "false"],
];

export function appendGitConfig(env, pairs) {
  const first = Number(env.GIT_CONFIG_COUNT ?? 0) || 0;
  const entries = {};
  pairs.forEach(([key, value], index) => {
    entries[`GIT_CONFIG_KEY_${first + index}`] = key;
    entries[`GIT_CONFIG_VALUE_${first + index}`] = value;
  });
  return { ...entries, GIT_CONFIG_COUNT: String(first + pairs.length) };
}
