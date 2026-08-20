import { type FormEvent, type ReactNode, useEffect, useRef } from "react";
import { Button } from "../ui/button";
import { Notice, type NoticeContent } from "../ui/notice";
import { previewCloneChild } from "./clone-destination-preview";

// Presentational form for the offline connect flow, shared by the connect
// gate and Settings' re-point view (PRD #93). Path is a controlled prop, not
// local state, so a "browse…" picker selection can seed it from a container.
type ConnectInventoryFormProps = {
  path: string;
  onPathChange: (path: string) => void;
  onSubmit: (path: string) => void;
  // What the last submit came back with, headed and levelled by the host. A
  // refusal the user clears by choosing elsewhere, and the scaffold offer,
  // both arrive as this one notice with an action on it (#147, #555, #556).
  notice?: NoticeContent | null;
  isPending?: boolean;
  // A scaffold running beside the form: submit goes down with it, but the
  // clone progress sentence is not its (#556).
  submitDisabled?: boolean;
  onBrowse?: () => void;
  // Where a cloned Harness lands. null means the home ceiling the server
  // falls back to; the child folder is always the repository's own name.
  cloneParent?: string | null;
  onChooseParent?: () => void;
  // Re-point flow overrides this so a returning user isn't told to "Connect"
  // a source they already have (#229).
  submitLabel?: string;
  secondaryAction?: ReactNode;
};

export function ConnectInventoryForm({
  path,
  onPathChange,
  onSubmit,
  notice = null,
  isPending = false,
  submitDisabled = false,
  onBrowse,
  cloneParent = null,
  onChooseParent,
  submitLabel = "Connect inventory",
  secondaryAction,
}: ConnectInventoryFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Only a url is cloned, so only a url has a destination to show. The server
  // classifies the input again and remains the authority on both.
  const cloneChild = previewCloneChild(path);

  // A rejected submit hands focus back to the field to fix (#214). The one
  // place focus moves: everywhere else the notice appears and the caret stays.
  // Keyed on the sentence, not the object: the host rebuilds the notice every
  // render, and identity as the dependency would re-take focus each time.
  const noticeMessage = notice?.message ?? null;
  useEffect(() => {
    if (noticeMessage !== null) {
      inputRef.current?.focus();
    }
  }, [noticeMessage]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(path);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor="inventory-path" className="m-label">
        Inventory path or GitHub URL
      </label>
      <div className="flex items-end gap-2">
        <input
          ref={inputRef}
          id="inventory-path"
          name="inventory-path"
          value={path}
          onChange={(event) => onPathChange(event.target.value)}
          placeholder="/path/to/harness or https://github.com/owner/repo"
          aria-describedby="inventory-path-error"
          // An offer is not a malformed field: the path is fine, it just has no
          // Harness in it yet, so only an error marks the input invalid.
          aria-invalid={notice?.level === "error" ? true : undefined}
          // No outline-none: it poisons --tw-outline-style and hides the ring (#227).
          className="flex-1 rounded-control border border-line bg-inset px-2 py-1.5 font-mono text-fg text-mono-sm placeholder:text-dim focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
        />
        {onBrowse ? (
          <Button type="button" variant="quiet" size="sm" onClick={onBrowse}>
            browse…
          </Button>
        ) : null}
      </div>
      {cloneChild ? (
        <div className="flex items-center gap-2">
          <p className="text-dim text-tag">
            Clone into{" "}
            <span className="font-mono text-fg text-mono-sm">
              {`${cloneParent ?? "your home folder"}/${cloneChild}`}
            </span>
          </p>
          {onChooseParent ? (
            <Button
              type="button"
              variant="quiet"
              size="sm"
              onClick={onChooseParent}
            >
              change folder…
            </Button>
          ) : null}
        </div>
      ) : null}
      {isPending ? (
        // A clone has no honest percentage to show and nothing safe to cancel
        // mid-way, so the wait is stated in words. Worded for both routes: the
        // form is shared with Settings' re-point, which never clones (#554).
        <p role="status" className="text-dim text-tag">
          Connecting. A GitHub URL is being cloned first, which can take a
          minute — this stays open until it finishes.
        </p>
      ) : null}
      {/* The field's description: mounted before the failure is, and wired to
          the input by id rather than by the primitive (#465, decision 10). */}
      <Notice trigger="user-action" notice={notice} id="inventory-path-error" />
      <div className="flex gap-2">
        <Button
          type="submit"
          // Steps down whenever the notice owns the primary action, so the two
          // never compete for the same weight (#147, #556).
          variant={notice?.action === undefined ? "primary" : "quiet"}
          size="sm"
          // A running scaffold takes submit down with it: both mutations end in
          // the one inventory path, so whichever finished last would win (#556).
          disabled={isPending || submitDisabled}
        >
          {submitLabel}
        </Button>
        {secondaryAction}
      </div>
    </form>
  );
}
