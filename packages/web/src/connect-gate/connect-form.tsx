import { type FormEvent, useEffect, useId, useRef } from "react";
import { previewCloneChild } from "../shell/clone-destination-preview";
import { ACTIONS } from "../ui/busy-copy";
import { Button } from "../ui/button";
import { Notice, type NoticeContent } from "../ui/notice";
import { PathField } from "../ui/path-field";
import type { FolderChooser } from "../ui/use-folder-chooser";

export const PATH_LABEL = "Inventory path or GitHub URL";
export const CLONE_LABEL = "Folder for the Harness";
const CLONE_HINT =
  "The Harness is cloned into a new folder here, named after the repository. Nothing already in this folder is renamed, moved or deleted.";

// Each field owns the one notice slot under it (#1013); `ConnectFlow` owns the
// mutations.
export type ConnectFormProps = {
  path: string;
  onPathChange: (path: string) => void;
  pathChooser: FolderChooser;
  /** A refusal of the path, or the scaffold offer. */
  notice?: NoticeContent | null;
  /** "" means the home folder the server falls back to. */
  cloneParent: string;
  onCloneParentChange: (parent: string) => void;
  cloneChooser: FolderChooser;
  /** A refusal of the clone folder. */
  cloneNotice?: NoticeContent | null;
  cloneOpen: boolean;
  onOpenClone: () => void;
  onSubmit: () => void;
  isPending?: boolean;
  /** A scaffold running beside the form takes submit down with it (#556). */
  submitDisabled?: boolean;
};

export function ConnectForm({
  path,
  onPathChange,
  pathChooser,
  notice = null,
  cloneParent,
  onCloneParentChange,
  cloneChooser,
  cloneNotice = null,
  cloneOpen,
  onOpenClone,
  onSubmit,
  isPending = false,
  submitDisabled = false,
}: ConnectFormProps) {
  const noticeId = useId();
  const cloneNoticeId = useId();
  const pathRef = useRef<HTMLInputElement>(null);
  const cloneRef = useRef<HTMLInputElement>(null);
  // Only a URL has a destination; the server classifies the input again.
  const cloneChild = previewCloneChild(path);

  // A refused submit hands focus back to the field to fix (#214). Keyed on
  // the sentence: the host rebuilds the notice each render.
  const refusal = notice?.level === "error" ? notice.message : null;
  useEffect(() => {
    if (refusal !== null) pathRef.current?.focus();
  }, [refusal]);
  const cloneRefusal = cloneOpen ? (cloneNotice?.message ?? null) : null;
  useEffect(() => {
    if (cloneRefusal !== null) cloneRef.current?.focus();
  }, [cloneRefusal]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // A busy control keeps focus, so Enter still reaches the form.
    if (!isPending && !submitDisabled) onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-cell">
      <div className="flex flex-col gap-inline">
        <PathField
          label={PATH_LABEL}
          placeholder="/path/to/harness or https://github.com/owner/repo"
          className="placeholder:text-gray-11"
          value={path}
          onChange={onPathChange}
          chooser={pathChooser}
          inputRef={pathRef}
          // An offer is not a malformed field: only an error marks it.
          invalid={notice?.level === "error"}
          describedBy={noticeId}
          autoComplete="off"
          spellCheck={false}
        />
        <Notice id={noticeId} trigger="user-action" notice={notice} />
      </div>

      {cloneChild === null ? null : (
        <div className="flex flex-col gap-inline">
          {cloneOpen ? (
            <>
              <PathField
                label={CLONE_LABEL}
                hint={CLONE_HINT}
                placeholder="your home folder"
                className="placeholder:text-gray-11"
                value={cloneParent}
                onChange={onCloneParentChange}
                chooser={cloneChooser}
                inputRef={cloneRef}
                invalid={cloneNotice?.level === "error"}
                describedBy={cloneNoticeId}
                autoComplete="off"
                spellCheck={false}
                // Opened by a press of Change folder… or its notice action.
                autoFocus
              />
              <Notice
                id={cloneNoticeId}
                trigger="user-action"
                notice={cloneNotice}
              />
            </>
          ) : (
            <Notice trigger="user-action" notice={cloneNotice} />
          )}
          <div className="flex flex-wrap items-center gap-inline">
            <span className="font-ui text-gray-11 text-meta">
              Clone into{" "}
              <span className="break-all font-mono text-gray-12">
                {`${cloneParent.trim() || "your home folder"}/${cloneChild}`}
              </span>
            </span>
            {cloneOpen ? null : (
              <Button type="button" variant="quiet" onClick={onOpenClone}>
                Change folder…
              </Button>
            )}
          </div>
        </div>
      )}

      {isPending ? (
        // No honest percentage and nothing safe to cancel midway (#554).
        <p role="status" className="m-0 font-ui text-gray-11 text-meta">
          Connecting. A GitHub URL is cloned first, which can take a minute.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-inline">
        <Button
          type="submit"
          // Steps down whenever the notice owns the primary action (#556).
          variant={notice?.action === undefined ? "primary" : "quiet"}
          busy={isPending}
          disabled={submitDisabled}
        >
          {isPending ? ACTIONS.connect.busy : "Connect Inventory"}
        </Button>
      </div>
    </form>
  );
}
