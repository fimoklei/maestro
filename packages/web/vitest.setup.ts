// Registers jest-dom matchers (toBeInTheDocument, etc.) and Testing Library's
// automatic cleanup between tests via Vitest's global afterEach.
import { configure } from "@testing-library/dom";
import "@testing-library/jest-dom/vitest";

// findBy* defaults to 1s, which the first test in a file loses to cold module
// loading — it asserts before the first query settles. Kept under the lane's
// 20s testTimeout so a genuinely absent element still fails the test.
configure({ asyncUtilTimeout: 5_000 });

// happy-dom 20 fetches relative URLs from localhost:3000 (research 1096).
// Assigned, not stubbed, so `vi.unstubAllGlobals()` restores this refusal.
globalThis.fetch = () =>
  Promise.reject(
    new TypeError("The web test lane has no network: stub fetch in the test."),
  );
