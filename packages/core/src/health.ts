// Triviale health-check: bewijst dat de core-package bouwt en importeerbaar is.
export type HealthReport = {
  ok: true;
  component: string;
};

export function coreHealth(): HealthReport {
  return { ok: true, component: "core" };
}
