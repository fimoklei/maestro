import type { SkillFolder } from "@maestro/core";
import { useState } from "react";
import { toggleStaged } from "../ui/bulk-selection";
import { useFolderChooser } from "../ui/use-folder-chooser";
import { type ScreenWrites, useWriteAction } from "../ui/use-write-action";
import {
  importSkillsNotice,
  importSkillsScanNotice,
  SKILLS_FOLDER_MISSING,
} from "./import-skills-copy";
import {
  ImportSkillsDialog,
  type SkillFolderLoad,
} from "./import-skills-dialog";
import { useImportSkills, useSkillFolderScan } from "./use-harness";

// Import skills from one chosen folder. The Report stays in the dialog, so
// the screen announces nothing beyond the busy label.
export function ImportSkillsAction({
  screen,
  onClose,
}: {
  screen: ScreenWrites;
  onClose: () => void;
}) {
  const chooser = useFolderChooser();
  // What Folder path holds, and the folder last sent to the scan.
  const [sourceText, setSourceText] = useState("");
  const [source, setSource] = useState<string | null>(null);
  // Set by a submit with no folder; any edit of the field clears it.
  const [folderMissing, setFolderMissing] = useState(false);
  // The new entries the reader unticked, and the held ones they ticked: a
  // folder that replaces a held skill starts unticked.
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [replacing, setReplacing] = useState<ReadonlySet<string>>(new Set());
  const scan = useSkillFolderScan(source);
  const run = useImportSkills();
  const importWrite = useWriteAction(run, {
    screen,
    action: "import",
    subject: () => null,
    failure: importSkillsNotice,
  });

  const load: SkillFolderLoad =
    source === null
      ? { kind: "idle" }
      : scan.isError
        ? { kind: "error", notice: importSkillsScanNotice(scan.error) }
        : scan.data === undefined
          ? { kind: "loading" }
          : { kind: "ready", scan: scan.data };
  const ready =
    load.kind === "ready"
      ? load.scan.folders.filter((folder) => folder.refusal === null)
      : [];
  const isChecked = ({ entry, replaces }: SkillFolder) =>
    replaces ? replacing.has(entry) : !unticked.has(entry);
  const picked = ready.filter(isChecked);
  const checked = new Set(picked.map((folder) => folder.entry));

  // The same folder chosen again lists it anew: its rows may have changed.
  const commitSource = (path: string) => {
    if (path === source) {
      void scan.refetch();
      return;
    }
    setSource(path);
    setUnticked(new Set());
    setReplacing(new Set());
  };

  // A press before any list scans what the field holds; a failed scan is
  // asked again. Only a list in hand imports.
  const submit = () => {
    const typed = sourceText.trim();
    if (typed === "") {
      setFolderMissing(true);
      return;
    }
    if (typed !== source) {
      commitSource(typed);
      return;
    }
    if (load.kind !== "ready") {
      void scan.refetch();
      return;
    }
    importWrite.run({
      source: typed,
      entries: picked.map(({ entry, replaces }) => ({
        entry,
        replace: replaces,
      })),
    });
  };

  return (
    <ImportSkillsDialog
      source={source}
      sourceText={sourceText}
      sourceError={folderMissing ? SKILLS_FOLDER_MISSING : undefined}
      onSourceChange={(text) => {
        setFolderMissing(false);
        setSourceText(text);
      }}
      onSourceCommit={commitSource}
      chooser={chooser}
      load={load}
      checked={checked}
      onToggle={(entry) =>
        ready.find((folder) => folder.entry === entry)?.replaces
          ? setReplacing((current) => toggleStaged(current, entry))
          : setUnticked((current) => toggleStaged(current, entry))
      }
      isRunning={importWrite.phase === "running"}
      outcomes={run.data?.outcomes ?? null}
      failure={importWrite.failure}
      onClose={onClose}
      onImport={submit}
    />
  );
}
