import { X } from "lucide-react";
import { IconButton } from "./icon-button";

export function DialogHeader({
  title,
  onClose,
  busy = false,
}: {
  title: string;
  onClose: () => void;
  /** The action runs: closing waits, as Escape and the backdrop do. */
  busy?: boolean;
}) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-inline border-edge border-b pr-cell pl-panel">
      <h2 className="m-0 truncate font-semibold font-ui text-gray-12 text-heading">
        {title}
      </h2>
      <IconButton
        label="Close"
        variant="ghost"
        unavailable={busy ? "action still running" : undefined}
        onClick={onClose}
      >
        <X aria-hidden="true" strokeWidth={1.5} className="size-4" />
      </IconButton>
    </div>
  );
}
