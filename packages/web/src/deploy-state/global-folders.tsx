import { useRef } from "react";
import { SubListHeading } from "../ui/sub-list-heading";
import { SubListValueRow } from "../ui/sub-list-row";
import { GLOBAL_FOLDERS } from "./deploy-state-copy";
import type { FolderRow } from "./target-rows";

/** The Global pane's folders: those Global writes, each with its word, readers and counts. */
export function GlobalFolders({ folders }: { folders: readonly FolderRow[] }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const written = folders.filter((folder) => folder.detected);
  return (
    <section className="mb-section">
      <SubListHeading
        label={GLOBAL_FOLDERS}
        count={written.length}
        headingRef={heading}
      />
      <ul
        aria-label={GLOBAL_FOLDERS}
        className="m-0 list-none border-divider border-t p-0"
      >
        {written.map((folder) => (
          <SubListValueRow
            key={folder.path}
            status={folder.word}
            value={folder.path}
            meta={folder.meta}
          />
        ))}
      </ul>
    </section>
  );
}
