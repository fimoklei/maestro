import type { UseMutationResult } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { ACTIONS, type ActionKey, doneSentence } from "./busy-copy";
import type { NoticeContent } from "./notice";
import type { Copy, Phrase } from "./phrase";

type Report = (write: string) => void;

/** What a write touched: the done sentence's name or count, and its row. */
export type Subject = {
  /** A count names several items, as `{n} {things}`; `things` is plural. */
  name: Copy | { count: number; things: string };
  /** The table row the write touches, by row id; null where it touches none. */
  row: string | null;
};

/** A landed write the table screen holds until the read after it lands. */
export type WriteResult = { sentence: Phrase; row: string | null };

/** What a write hands its table screen. */
export type ScreenWrites = {
  /** Into the one status region: a busy label, a done sentence, or "" for silence. */
  report: Report;
  /** Holds a landed write; the screen picks region or toast once its read lands. */
  settle: (result: WriteResult) => void;
};

/** The table screen's writes, for a write mounted inside the screen. */
export const ScreenWritesContext = createContext<ScreenWrites | null>(null);

export function useScreenWrites(): ScreenWrites {
  const writes = useContext(ScreenWritesContext);
  if (writes === null) throw new Error("A write needs its table screen.");
  return writes;
}

export function useScreenReport(): Report {
  return useScreenWrites().report;
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

type Feedback<TData, TVariables> =
  | {
      /** The table screen's writes: `state`, or `useScreenWrites()`. */
      screen: ScreenWrites;
      /** What the write touched; null where the dialog keeps its Report. */
      subject: (data: TData, variables: TVariables) => Subject | null;
    }
  | {
      /** The region of the screen the write starts on: `useScreenReport()`. */
      report: Report;
      /** What the write touched, by the row ids of the screen it ends on; null where the dialog keeps its Report. */
      subject: (data: TData, variables: TVariables) => Subject | null;
      /** Takes the result to the screen the write ends on, whose table screen settles it. */
      handOver: (result: WriteResult, data: TData) => void;
    };

// A write's feedback: its busy label in the screen's region at once. A
// subject goes to the table screen, which picks region or toast once the read
// after the write lands, or is handed over to the screen the write ends on.
// A failure is its notice alone.
export function useWriteAction<TData, TVariables, TFailure = NoticeContent>(
  mutation: UseMutationResult<TData, unknown, TVariables>,
  options: Feedback<TData, TVariables> & {
    /** Picks the busy label and done word from `busy-copy`. */
    action: ActionKey | ((variables: TVariables) => ActionKey);
    failure: (error: unknown) => TFailure | null;
  },
): WriteAction<TData, TVariables, TFailure> {
  const report = "screen" in options ? options.screen.report : options.report;
  const landed = (key: ActionKey, data: TData, variables: TVariables) => {
    const subject = options.subject(data, variables);
    const result =
      subject === null
        ? null
        : {
            sentence: doneSentence(key, subjectName(subject)),
            row: subject.row,
          };
    if ("screen" in options && result !== null) {
      options.screen.settle(result);
      return;
    }
    report("");
    if ("handOver" in options && result !== null) {
      options.handOver(result, data);
    }
  };
  return {
    phase: mutation.isPending ? "running" : "idle",
    failure: mutation.isError ? options.failure(mutation.error) : null,
    run(variables, then) {
      const { action } = options;
      const key = typeof action === "function" ? action(variables) : action;
      report(ACTIONS[key].busy);
      mutation.mutate(variables, {
        onSuccess: (data) => {
          landed(key, data, variables);
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

function subjectName({ name }: Subject): Copy {
  return typeof name === "object" && "count" in name
    ? `${name.count} ${name.things}`
    : name;
}
