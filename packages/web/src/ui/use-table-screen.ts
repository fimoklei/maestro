import { type RefObject, useRef, useState } from "react";
import type { NoticeContent } from "./notice";
import { useScreenStatus } from "./screen-status";

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
  /** The row whose detail pane is open. */
  openId: string | null;
  open: (id: string | null) => void;
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
  onReread,
  openOnArrival,
}: {
  /** The screen name, as `Re-read {screen name}` and the announcements say it. */
  name: string;
  /** A read is running, shown or not. */
  reading: boolean;
  /** The rows stand for a read that answered; false before one and after a failure. */
  settled: boolean;
  failure: ReadFailure | null;
  onReread: () => void;
  /** The row a navigation asked this screen to open, read on mount only. */
  openOnArrival: string | null;
}): TableScreenState {
  const [openId, setOpenId] = useState(openOnArrival);
  const rereadRef = useRef<HTMLButtonElement>(null);
  const reread = () => {
    status.press();
    onReread();
  };
  const notice =
    failure === null
      ? null
      : { ...failure, action: { label: `Re-read ${name}`, onClick: reread } };
  const status = useScreenStatus({ name, reading, notice, busy: null });
  return {
    name,
    reread,
    rereadRef,
    report: status.report,
    openId,
    open: setOpenId,
    reading,
    settled,
    skeleton: status.skeleton,
    notice,
    announcement: status.announcement,
  };
}
