import type { NoticeContent } from "./notice";
import { StatusRegion } from "./status-region";
import { useReadAnnouncement } from "./use-read-announcement";
import { useReadSkeleton } from "./use-read-skeleton";
import { useStatusRegion } from "./use-status-region";

export type ScreenStatus = {
  /** Skeleton rows stand in for the data. */
  skeleton: boolean;
  /** The reader pressed Re-read: the skeleton at once, an earlier write's sentence dropped. */
  press: () => void;
  /** Into the one status region: a busy label, a done sentence, or "" for silence. */
  report: (write: string) => void;
  announcement: string;
};

// A screen's read side: skeleton timing and its one status region. The table
// screen runs on it; Settings, an out-of-table frame, uses it directly.
export function useScreenStatus({
  name,
  reading,
  notice,
  busy,
}: {
  /** The screen name, as the announcements say it. */
  name: string;
  /** A read is running, shown or not. */
  reading: boolean;
  /** The failed read's notice, which speaks for itself. */
  notice: NoticeContent | null;
  /** A running write's busy label, heard over everything else; null when none runs. */
  busy: string | null;
}): ScreenStatus {
  const skeleton = useReadSkeleton(reading);
  const [announcement, setWrite] = useStatusRegion(
    useReadAnnouncement(name, skeleton.visible, notice),
  );
  return {
    skeleton: skeleton.visible,
    press: () => {
      skeleton.press();
      setWrite("");
    },
    report: setWrite,
    announcement: busy ?? announcement,
  };
}

/** The screen's one status region, mounted before its content changes. */
export function ScreenStatusRegion({ status }: { status: ScreenStatus }) {
  return <StatusRegion>{status.announcement}</StatusRegion>;
}
