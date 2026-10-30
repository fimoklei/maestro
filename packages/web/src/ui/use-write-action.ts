import type { UseMutationResult } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { ACTIONS, type ActionKey, doneSentence } from "./busy-copy";
import type { NoticeContent } from "./notice";
import { type Copy, type Phrase, plainText } from "./phrase";
import { showSuccess } from "./toast";

type Report = (write: string) => void;

/** Several items, counted: `{n} {one}` for one item, `{n} {many}` for none or several. */
type Count = { count: number; one: string; many: string };

/** Where a write's result shows. */
type Touched =
  /** The table row the write touches, by row id; null where it touches none. */
  | { row: string | null }
  /** An item that left the row it stood under, as a skill removed from a target: no row shows it. */
  | { leftItsRow: true };

/** What a write touched: the done sentence's name or count, and where it shows. */
export type Subject = { name: Copy | Count } & Touched;

/** A landed write the table screen holds until the read after it lands. */
export type WriteResult = { sentence: Phrase } & Touched;

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

type Delivery<TData> =
  | {
      /** The table screen's writes: `state`, or `useScreenWrites()`. */
      screen: ScreenWrites;
    }
  | {
      /** The region of the screen the write starts on: `useScreenReport()`. */
      report: Report;
      /** Takes the result to the screen the write ends on, whose table screen settles it. */
      handOver: (result: WriteResult, data: TData) => void;
    }
  | {
      /** The region of a screen without a table, such as Settings. */
      report: Report;
      /** Where the screen says the result: its row is in view, or it left. */
      show: "region" | "toast";
    };

type Feedback<TData, TVariables> = Delivery<TData> & {
  /** What the write touched, by the row ids of the screen it ends on; null where the dialog keeps its Report. */
  subject: (data: TData, variables: TVariables) => Subject | null;
};

// Where a write's busy label goes, and where its landed result goes.
function delivered<TData>(delivery: Delivery<TData>): {
  report: Report;
  deliver: (result: WriteResult, data: TData) => void;
} {
  if ("screen" in delivery) {
    return { report: delivery.screen.report, deliver: delivery.screen.settle };
  }
  if ("show" in delivery) {
    const { report, show } = delivery;
    return {
      report,
      deliver: ({ sentence }) => {
        if (show === "region") {
          report(plainText(sentence));
          return;
        }
        report("");
        showSuccess(sentence);
      },
    };
  }
  const { report, handOver } = delivery;
  return {
    report,
    deliver: (result, data) => {
      report("");
      handOver(result, data);
    },
  };
}

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
  const { report, deliver } = delivered(options);
  const landed = (key: ActionKey, data: TData, variables: TVariables) => {
    const subject = options.subject(data, variables);
    if (subject === null) {
      report("");
      return;
    }
    const { name, ...touched } = subject;
    deliver(
      { sentence: doneSentence(key, subjectName(name)), ...touched },
      data,
    );
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

function subjectName(name: Copy | Count): Copy {
  if (typeof name === "string" || "parts" in name) return name;
  return `${name.count} ${name.count === 1 ? name.one : name.many}`;
}
