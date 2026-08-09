// Information, never a control — `+ repo` in the sidebar is the single
// registration affordance (ADR-0015).
type RegisterRepoHintProps = {
  className?: string;
};

// A span, not a paragraph, so a caller may place it inside inline content.
export function RegisterRepoHint({ className }: RegisterRepoHintProps) {
  return (
    <span className={`text-dim text-tag ${className ?? ""}`}>
      No repositories registered. Register one with{" "}
      <span className="font-mono">+ repo</span> in the sidebar.
    </span>
  );
}
