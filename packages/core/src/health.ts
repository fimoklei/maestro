// Trivial health check: proves the core package builds and is importable.
type HealthReport = {
  ok: true;
  component: string;
};

export function coreHealth(): HealthReport {
  return { ok: true, component: "core" };
}
