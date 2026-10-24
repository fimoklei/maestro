import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { rereadLabel } from "./control-labels";
import type { NoticeContent } from "./notice";
import { plainText } from "./phrase";
import { useScreenStatus } from "./screen-status";
import { showSuccess } from "./toast";
import type { WriteResult } from "./use-write-action";

/** A failed read's words; the table screen adds `Re-read {screen name}`. */
export type ReadFailure = Omit<NoticeContent, "action">;

export type TableScreenState = {
  name: string;
  /** Skeleton first, then the screen's own read. Hand it to any notice that re-reads. */
  reread: () => void;
  /** The Re-read control, where a dismissed notice hands focus back. */
  rereadRef: RefObject<HTMLButtonElement | null>;
  /** Into the one status region: a busy label, a done sentence, or "" for silence. */
  report: (write: string) => void;
  /** Holds each landed write until the read after it lands, then says it by the row: in view → the region, else a toast. */
  settle: (result: WriteResult) => void;
  /** A landed write waits for its read; the screen's own announcements hold back until it is said. */
  settling: boolean;
  /** Whether a row id is in view now; `TableScreen` keeps it current. */
  inView: RefObject<(row: string) => boolean>;
  /** The row whose detail pane is open. */
  openId: string | null;
  open: (id: string | null) => void;
  /** The row to select and focus once shown, after an add on a screen without a pane; null once done. */
  addedId: string | null;
  markAdded: (id: string | null) => void;
  /** The groups the reader folded, by group key. */
  collapsed: ReadonlySet<string>;
  toggleGroup: (key: string) => void;
  reading: boolean;
  settled: boolean;
  skeleton: boolean;
  notice: NoticeContent | null;
  announcement: string;
};

// The read side of a table screen; `TableScreen` renders it. A hook, so the
// screen's own handlers can report a write and re-read before rendering.
export function useTableScreen({
  name,
  reading,
  settled,
  failure,
  readFailed,
  onReread,
  openOnArrival,
}: {
  /** The screen name, as `Re-read {screen name}` and the announcements say it. */
  name: string;
  /** A read is running, shown or not. */
  reading: boolean;
  /** The rows stand for a read that answered; false before one and after a failure. */
  settled: boolean;
  /** Any failed read the screen states, shown in its notice. */
  failure: ReadFailure | null;
  /** The read a write is followed by failed: its result is then never in view. */
  readFailed: boolean;
  onReread: () => void;
  /** The row a navigation asked this screen to open, read on mount only. */
  openOnArrival: string | null;
}): TableScreenState {
  const [openId, setOpenId] = useState(openOnArrival);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggleGroup = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const [pending, setPending] = useState<readonly WriteResult[]>([]);
  const inView = useRef<(row: string) => boolean>(() => false);
  const settle = useCallback(
    (result: WriteResult) => setPending((held) => [...held, result]),
    [],
  );
  const rereadRef = useRef<HTMLButtonElement>(null);
  const reread = () => {
    status.press();
    onReread();
  };
  const notice =
    failure === null
      ? null
      : { ...failure, action: { label: rereadLabel(name), onClick: reread } };
  const status = useScreenStatus({ name, reading, notice, busy: null });
  // After the status region's own effect, so a read's announcement landing in
  // the same commit does not drop the done sentence.
  // biome-ignore lint/correctness/useExhaustiveDependencies: status.report is a state setter
  useEffect(() => {
    if (pending.length === 0 || reading || status.skeleton) return;
    setPending([]);
    const shown = pending.filter(
      (result) =>
        !readFailed && result.row !== null && inView.current(result.row),
    );
    status.report(shown.map((result) => plainText(result.sentence)).join(" "));
    for (const result of pending) {
      if (!shown.includes(result)) showSuccess(result.sentence);
    }
  }, [pending, reading, status.skeleton, readFailed]);
  return {
    name,
    reread,
    rereadRef,
    report: status.report,
    settle,
    settling: pending.length > 0,
    inView,
    openId,
    open: setOpenId,
    addedId,
    markAdded: setAddedId,
    collapsed,
    toggleGroup,
    reading,
    settled,
    skeleton: status.skeleton,
    notice,
    announcement: status.announcement,
  };
}
