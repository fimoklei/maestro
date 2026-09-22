import { useMutation, useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import type { NoticeContent } from "./notice";
import { chooserNotice } from "./path-field-copy";

/** What `PathField` needs from the system folder chooser (ADR-0032). */
export type FolderChooser = {
  /** False until the server confirms a chooser: no **Browse** before then. */
  available: boolean;
  busy: boolean;
  notice: NoticeContent | null;
  /** Opens the chooser on `start`; a cancel never calls `onPicked`. */
  browse: (start: string, onPicked: (path: string) => void) => void;
};

export function useFolderChooser(): FolderChooser {
  // Whether a helper exists does not change while the server runs.
  const availability = useQuery({
    queryKey: ["folder-chooser"],
    queryFn: () => requestJson<{ available: boolean }>("/api/folder-chooser"),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const pick = useMutation({
    mutationFn: (start: string) =>
      requestJson<{ path: string | null }>("/api/folder-chooser", {
        method: "POST",
        body: JSON.stringify({ path: start }),
      }),
  });

  return {
    available: availability.data?.available === true,
    busy: pick.isPending,
    notice: chooserNotice(pick.error),
    browse: (start, onPicked) =>
      pick.mutate(start, {
        onSuccess: ({ path }) => {
          if (path !== null) {
            onPicked(path);
          }
        },
      }),
  };
}
