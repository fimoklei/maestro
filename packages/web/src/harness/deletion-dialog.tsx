import { useModalDialog } from "../shell/use-modal-dialog";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Notice } from "../ui/notice";

// The confirmation a removal takes before anything is pushed: consequences
// first, then the exact origin/HEAD it is given against (#580).
// Presentational — the host owns the mutation and what the row said.
export function DeletionDialog({
  skill,
  origin,
  seenRemoteTree,
  onClose,
  onConfirm,
  removing,
  removeError,
}: {
  skill: string;
  origin: string;
  seenRemoteTree: string;
  onClose: () => void;
  onConfirm: () => void;
  removing: boolean;
  removeError: string | null;
}) {
  const { panelRef, requestClose } = useModalDialog({
    onClose,
    closeEnabled: !removing,
  });
  const heading = `Remove ${skill}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-6">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={requestClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        tabIndex={-1}
        className="relative flex max-h-[90vh] w-full max-w-[520px] flex-col overflow-hidden rounded-card border border-line-row bg-chrome outline-none"
      >
        <div className="flex items-center justify-between gap-2.5 border-line-row border-b px-3.5 py-3">
          <h2 className="font-semibold font-ui text-fg text-subtitle">
            Remove <span className="font-mono">{skill}</span>
          </h2>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto px-3.5 py-3">
          <p className="m-0 font-ui text-desc text-fg-2">
            You deleted <span className="font-mono text-fg">{skill}</span> from
            the Harness working tree. Confirming proposes that removal to{" "}
            <span className="font-mono text-fg">{origin}</span> on its own
            branch — nobody loses it until the pull request is merged.
          </p>
          <Card padded>
            <dl className="flex flex-wrap gap-x-10 gap-y-3">
              <Fact label="Skill" value={skill} />
              <Fact label="Branch" value={`maestro/${skill}`} />
              {/* The whole hash: this is the exact origin/HEAD copy the
                  confirmation is given against, and a shorter one names
                  something the check would not recognise. */}
              <Fact label="Confirmed against" value={seenRemoteTree} />
            </dl>
          </Card>
          <Notice
            trigger="user-action"
            notice={
              removeError === null
                ? null
                : {
                    level: "error",
                    label: "removal not published",
                    message: removeError,
                  }
            }
          />
        </div>

        <div className="flex items-center gap-2.5 border-line-row border-t px-3.5 py-3">
          <span className="flex-1" />
          <Button
            type="button"
            className="shrink-0"
            variant="quiet"
            size="sm"
            disabled={removing}
            onClick={onClose}
          >
            cancel
          </Button>
          <Button
            type="button"
            className="shrink-0"
            variant="primary"
            size="sm"
            disabled={removing}
            onClick={onConfirm}
          >
            {removing ? "removing…" : "remove"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="m-0 flex min-w-0 flex-col">
      <dt className="m-label mb-1.5">{label}</dt>
      <dd className="m-0 break-all font-mono text-data text-fg">{value}</dd>
    </div>
  );
}
