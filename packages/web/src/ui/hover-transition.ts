// The one colour transition every hoverable control in the cockpit uses, so the
// 120–160ms ease-out window DESIGN.md §5 specifies has a single owner instead of
// being retyped per component. motion-safe: means a visitor who asked for
// reduced motion gets the colour change instantly, which is the reduced
// alternative PRODUCT.md calls for — Tailwind compiles the variant to
// @media (prefers-reduced-motion: no-preference).
export const HOVER_TRANSITION =
  "motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out";
