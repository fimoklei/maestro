// Named properties, not transition-colors: that shorthand covers outline-color
// too, which fades the focus ring in from the inherited colour (#877).
export const HOVER_TRANSITION =
  "motion-safe:transition-[color,background-color,border-color] motion-safe:duration-150 motion-safe:ease-out";
