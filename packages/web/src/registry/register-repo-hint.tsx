// One line of text naming where consuming repos get registered.
//
// It is information, never a control: `+ repo` in the sidebar is the single
// registration affordance (ADR-0015), so a second button here would compete
// with it. Rendered wherever the absence of a registered repo would otherwise
// leave a silent dead end.
type RegisterRepoHintProps = {
  // Layout only — placement and spacing at the call site. Appearance is the
  // component's, so the line reads identically wherever it lands.
  className?: string;
};

// A span, not a paragraph, so a caller may place it inside inline content.
// Callers that need it on its own line add `block` through className.
export function RegisterRepoHint({ className }: RegisterRepoHintProps) {
  return (
    <span className={`text-dim text-tag ${className ?? ""}`}>
      Consuming repos are registered via + repo in the sidebar.
    </span>
  );
}
