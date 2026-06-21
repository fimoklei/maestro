Small mono capsule for status and meta. Status chips always carry a glyph; neutral chips carry plain data.

```jsx
<Chip tone="ok">● in sync</Chip>
<Chip tone="drift">▲ 2 drift</Chip>
<Chip>v1.4.0</Chip>
```

Tones: `ok` (green — in sync / healthy), `drift` (amber — needs attention; drift is the loudest signal in the product), `dim` (grey — versions, counts, neutral meta).
