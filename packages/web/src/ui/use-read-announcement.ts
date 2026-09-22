import { useEffect, useRef, useState } from "react";
import { loadedText, loadingText } from "./busy-copy";
import type { NoticeContent } from "./notice";

// The screen's one status region: a read is heard when its skeleton appears,
// then `{Screen name} loaded.`; a failed read is its notice, so nothing more.
export function useReadAnnouncement(
  screenName: string,
  loading: boolean,
  notice: NoticeContent | null,
): string {
  const [announcement, setAnnouncement] = useState("");
  const announced = useRef(false);
  useEffect(() => {
    if (loading) {
      announced.current = true;
      setAnnouncement(loadingText(screenName));
    } else if (announced.current) {
      announced.current = false;
      setAnnouncement(notice === null ? loadedText(screenName) : "");
    }
  }, [screenName, loading, notice]);
  return announcement;
}
