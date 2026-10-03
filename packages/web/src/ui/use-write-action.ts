import type { UseMutationResult } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { ACTIONS, type ActionKey, doneSentence } from "./busy-copy";
import type { NoticeContent } from "./notice";
import { showSuccess } from "./toast";

type Report = (write: string) => void;

/** The table screen's `report`, for a write mounted inside the screen. */
export const ScreenReportContext = createContext<Report | null>(null);

export function useScreenReport(): Report {
  const report = useContext(ScreenReportContext);
  if (report === null) throw new Error("A write needs its table screen.");
  return report;
}

export type WriteAction<TData, TVariables, TFailure = NoticeContent> = {
  /** The dialog's phase; an outcome the dialog shows is its own. */
  phase: "idle" | "running";
  /** Stated in the dialog that ran the write, above its footer. */
  failure: TFailure | null;
  run: (
    variables: TVariables,
    then?: {
      onSuccess?: (data: TData, variables: TVariables) => void;
      onError?: (error: unknown) => void;
    },
  ) => void;
};

// A write's feedback: its busy label in the screen's region at once, then the
// done sentence in the region (`row`, the reader sees the row change) or in a
// toast (`toast`, the reader may miss it). A failure is its notice alone.
export function useWriteAction<TData, TVariables, TFailure = NoticeContent>(
  mutation: UseMutationResult<TData, unknown, TVariables>,
  {
    report,
    action,
    show,
    name,
    failure,
  }: {
    /** The table screen's region: `state.report`, or `useScreenReport()`. */
    report: Report;
    /** Picks the busy label and done word from `busy-copy`. */
    action: ActionKey | ((variables: TVariables) => ActionKey);
    show: "toast" | "row";
    /** What the done sentence names; null where a Report, a notice or the next screen states the outcome. */
    name: (data: TData, variables: TVariables) => string | null;
    failure: (error: unknown) => TFailure | null;
  },
): WriteAction<TData, TVariables, TFailure> {
  return {
    phase: mutation.isPending ? "running" : "idle",
    failure: mutation.isError ? failure(mutation.error) : null,
    run(variables, then) {
      const key = typeof action === "function" ? action(variables) : action;
      report(ACTIONS[key].busy);
      mutation.mutate(variables, {
        onSuccess: (data) => {
          const named = name(data, variables);
          if (named === null || show === "toast") report("");
          else report(doneSentence(key, named));
          if (named !== null && show === "toast") {
            showSuccess(doneSentence(key, named));
          }
          then?.onSuccess?.(data, variables);
        },
        onError: (error) => {
          report("");
          then?.onError?.(error);
        },
      });
    },
  };
}
