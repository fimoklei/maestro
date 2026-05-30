import { useEffect, useState } from "react";

// Minimale schil, geen Maestro-UI: haalt /api/health op en toont de status.
// Het enige doel is bewijzen dat de live HTTP-grens web -> server werkt.
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
    </main>
  );
}
