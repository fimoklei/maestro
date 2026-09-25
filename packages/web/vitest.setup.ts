import { configure } from "@testing-library/dom";
import "@testing-library/jest-dom/vitest";

// findBy*'s 1s default loses to cold module loading in a file's first test.
// Kept under the 20s testTimeout so an absent element still fails the test.
configure({ asyncUtilTimeout: 5_000 });

// happy-dom 20 fetches relative URLs from localhost:3000.
// Assigned, not stubbed, so `vi.unstubAllGlobals()` restores this refusal.
globalThis.fetch = () =>
  Promise.reject(
    new TypeError("The web test lane has no network: stub fetch in the test."),
  );
