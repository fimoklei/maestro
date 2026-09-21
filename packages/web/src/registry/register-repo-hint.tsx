// Information, never a control — Register repository on the Repositories
// screen is the single registration affordance (ADR-0015, #991).
type RegisterRepoHintProps = {
  className?: string;
};

// A span, not a paragraph, so a caller may place it inside inline content.
export function RegisterRepoHint({ className }: RegisterRepoHintProps) {
  return (
    <span className={`text-dim text-tag ${className ?? ""}`}>
      No repositories registered. Select Register repository on the Repositories
      screen to register one.
    </span>
  );
}
