Mono-typeset action button; use for every clickable action in the cockpit — labels are lowercase, often with a unicode glyph ("deploy →", "+ new primitive").

```jsx
<Button variant="primary">+ new primitive</Button>
<Button variant="ghost">deploy →</Button>
<Button variant="success" size="lg" style={{ width: "100%" }}>deploy bundle →</Button>
```

Variants: `primary` (amber fill — at most one per view), `success` (green fill — the final confirm), `ghost` (amber outline — repeating row actions), `quiet` (grey outline), `dashed` (additive: "+ add from inventory"). Sizes `sm | md | lg`. Never use sentence case or icons other than unicode glyphs.
