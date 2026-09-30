// apm probes github.com anonymously before it uses a token, so every install
// spends this machine's unauthenticated GitHub quota (60 per hour per IP).
// `node scripts/github-quota.mjs <needed>` exits 1 when fewer remain.
import { pathToFileURL } from "node:url";

/** Quota left for anonymous calls; never throws, unknown counts as short. */
export async function checkQuota(needed, get = fetch) {
  try {
    const response = await get("https://api.github.com/rate_limit");
    if (!response.ok) return { ok: false, remaining: null, resetAt: null };
    const { remaining, reset } = (await response.json()).resources.core;
    return {
      ok: remaining >= needed,
      remaining,
      resetAt: `${new Date(reset * 1000).toISOString().slice(11, 19)}Z`,
    };
  } catch {
    return { ok: false, remaining: null, resetAt: null };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const needed = Number(process.argv[2] ?? 1);
  const { ok, remaining, resetAt } = await checkQuota(needed);
  console.log(
    `anonymous GitHub quota: ${remaining ?? "unknown"} left (need ${needed}), resets ${resetAt ?? "unknown"}`,
  );
  process.exit(ok ? 0 : 1);
}
