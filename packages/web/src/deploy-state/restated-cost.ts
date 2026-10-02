// Reads the question a refused removal restated (#364). All or nothing.
import { HttpError } from "../api/http";
import {
  type RemovePreflight,
  readRemovePreflight,
} from "./use-remove-preflight";

// Never partial: a fresh cost paired with an older consent is what #364 prevents.
type RestatedCost = RemovePreflight & { receipt: string };

export function restatedCost(error: unknown): RestatedCost | null {
  if (!(error instanceof HttpError) || error.code !== "cost-not-acknowledged") {
    return null;
  }
  const cost = readRemovePreflight(error.body);
  return cost?.receipt === undefined
    ? null
    : { ...cost, receipt: cost.receipt };
}
