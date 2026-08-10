// Single owner of the hover transition window — see DESIGN.md §5, PRODUCT.md
// (motion-safe: honors prefers-reduced-motion).
const WINDOW = "motion-safe:duration-150 motion-safe:ease-out";

export const HOVER_TRANSITION = `motion-safe:transition-colors ${WINDOW}`;

// For a control that appears on hover or focus rather than changing colour.
export const REVEAL_TRANSITION = `motion-safe:transition-opacity ${WINDOW}`;
