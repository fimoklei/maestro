Outlined panel — the basic container of the cockpit (tables, target cards, panels). The outline itself carries the drift signal.

```jsx
<Card title="~/dev/acme-web" kind="local" drift status={<Chip tone="drift">▲ 1 drift</Chip>}>
  …rows…
</Card>
<Card padded>…free content…</Card>
```

No shadows ever — hierarchy comes from background steps and 1px borders. Set `drift` whenever any item inside has drift.
