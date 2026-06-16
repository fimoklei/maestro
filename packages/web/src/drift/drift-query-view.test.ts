import { describe, expect, it } from "vitest";
import { toDriftView } from "./drift-query-view";
import type { DriftResponse } from "./use-drift";

// The query-state the view-mapper reads: just the two fields toDriftView uses.
const query = (state: {
  data?: DriftResponse;
  isError?: boolean;
}): { data: DriftResponse | undefined; isError: boolean } => ({
  data: state.data,
  isError: state.isError ?? false,
});

describe("toDriftView", () => {
  it("maps a ran check to ready with its behind set", () => {
    expect(toDriftView(query({ data: { behind: ["tdd"] } }))).toEqual({
      status: "ready",
      behind: ["tdd"],
    });
  });

  it("maps an empty behind set to ready, not unknown", () => {
    expect(toDriftView(query({ data: { behind: [] } }))).toEqual({
      status: "ready",
      behind: [],
    });
  });

  it("maps no data yet to pending", () => {
    expect(toDriftView(query({ data: undefined }))).toEqual({
      status: "pending",
    });
  });

  it("maps a request error to unknown", () => {
    expect(toDriftView(query({ isError: true }))).toEqual({
      status: "unknown",
    });
  });

  it("maps a check that could not run ({ ok: false }) to unknown", () => {
    expect(toDriftView(query({ data: { ok: false } }))).toEqual({
      status: "unknown",
    });
  });

  it("never derives up-to-date from a check that could not run", () => {
    // The J04 failure mode: { ok: false } must read as unknown, never as a
    // ready+empty behind set that the badge would show as up-to-date.
    expect(toDriftView(query({ data: { ok: false } }))).not.toEqual({
      status: "ready",
      behind: [],
    });
  });
});
