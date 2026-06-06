import { useEffect, useState } from "react";
import { RegistryPanel } from "./registry/registry-panel";

// Minimal shell, no Maestro UI: fetches /api/health and shows the status. Its
// only purpose is to prove the live web -> server HTTP boundary works.
type HealthState = "checking" | "healthy" | "unreachable";

export function App() {
  const [state, setState] = useState<HealthState>("checking");

  useEffect(() => {
    let cancelled = false;

    fetch("/api/health")
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(String(res.status))),
      )
      .then((body: { ok?: boolean }) => {
        if (!cancelled) {
          setState(body.ok ? "healthy" : "unreachable");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState("unreachable");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>Maestro</h1>
      <p>Server: {state}</p>
      <RegistryPanel />
    </main>
  );
}
