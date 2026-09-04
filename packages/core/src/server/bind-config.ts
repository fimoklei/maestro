// Binds 127.0.0.1 only — never 0.0.0.0 — so the cockpit is unreachable from
// the network (see .claude/rules/security.md).
export function bindConfig(env: NodeJS.ProcessEnv = process.env): {
  port: number;
  hostname: string;
} {
  return { port: Number(env.PORT ?? 3000), hostname: "127.0.0.1" };
}
