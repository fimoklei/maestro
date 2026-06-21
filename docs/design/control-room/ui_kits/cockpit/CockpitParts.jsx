// Maestro cockpit — shell + view pieces. Composes the DS primitives from window.MaestroDS.

function CkStatusBar({ driftCount, theme, onToggleTheme }) {
  const { Logo, Chip } = window.MaestroDS;
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 20px",
        borderBottom: "1px solid var(--border-strong)",
        background: "var(--bg-1)",
        height: "var(--h-statusbar)",
      }}
    >
      <Logo
        size={26}
        wordmark
        context={"agent-harness · main · 10 primitives"}
      />
      <div style={{ flex: 1 }}></div>
      {driftCount > 0 ? (
        <Chip tone="drift">▲ {driftCount} drift detected</Chip>
      ) : (
        <Chip tone="ok">● everything in sync</Chip>
      )}
      <Chip tone="ok">● server healthy</Chip>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--text-dim)",
        }}
      >
        synced 2m ago
      </span>
      <button
        type="button"
        onClick={onToggleTheme}
        title="Toggle light / dark"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: "var(--radius-control)",
          color: "var(--text-muted)",
          background: "var(--surface-active)",
          border: "1px solid var(--border-chip)",
        }}
      >
        <span style={{ fontSize: 12 }}>{theme === "dark" ? "◐" : "◑"}</span>
        {theme === "dark" ? "light" : "dark"}
      </button>
    </header>
  );
}

function CkSidebar({ view, onNav, targets }) {
  const { NavItem, StatusDot, Button } = window.MaestroDS;
  const nav = [
    { id: "inventory", icon: "▤", label: "Inventory" },
    { id: "deploy", icon: "⇶", label: "Deploy-state" },
    { id: "compose", icon: "⧉", label: "Compose" },
  ];
  return (
    <nav
      style={{
        borderRight: "1px solid var(--border-strong)",
        padding: "16px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {nav.map((n) => (
        <NavItem
          key={n.id}
          icon={n.icon}
          label={n.label}
          active={view === n.id}
          onClick={() => onNav(n.id)}
        />
      ))}
      <div
        className="m-label"
        style={{ margin: "22px 0 6px", padding: "0 12px" }}
      >
        Targets
      </div>
      {targets.map((t) => (
        <div
          key={t.key}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 12px",
            fontFamily:
              t.kind === "local" ? "var(--font-mono)" : "var(--font-ui)",
            fontSize: t.kind === "local" ? 11.5 : 12.5,
            color: t.kind === "local" ? "var(--text-muted)" : "var(--text-3)",
          }}
        >
          <StatusDot
            status={t.deployed.some((d) => d.drift) ? "drift" : "ok"}
          />
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {t.title}
          </span>
        </div>
      ))}
      <Button variant="dashed" style={{ margin: "10px 12px 0" }}>
        + register repo
      </Button>
    </nav>
  );
}

function CkInventoryRow({ item, action }) {
  const { TypeTag, Chip } = window.MaestroDS;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "70px 170px 1fr 70px 130px",
        gap: 12,
        alignItems: "center",
        padding: "var(--pad-row-y) var(--pad-card-x)",
        borderBottom: "1px solid var(--border-row)",
      }}
    >
      <TypeTag type={item.type} />
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--fs-data)",
          color: "var(--text-1)",
        }}
      >
        {item.name}
      </span>
      <span
        style={{
          fontSize: "var(--fs-desc)",
          color: "var(--text-muted)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {item.desc}
      </span>
      <Chip>v{item.version}</Chip>
      <div style={{ justifySelf: "end" }}>{action}</div>
    </div>
  );
}

function CkInventoryView({ inventory, onDeploy }) {
  const { SectionHeader, Button, Card } = window.MaestroDS;
  return (
    <section>
      <SectionHeader
        title="Central inventory"
        meta="curated · production-ready"
      >
        <Button variant="primary">+ new primitive</Button>
      </SectionHeader>
      <Card>
        {inventory.map((item) => (
          <CkInventoryRow
            key={item.name}
            item={item}
            action={
              <Button variant="ghost" onClick={() => onDeploy(item)}>
                deploy →
              </Button>
            }
          />
        ))}
      </Card>
    </section>
  );
}

function CkTargetCard({ target, onUpdate }) {
  const { Card, Chip, Button } = window.MaestroDS;
  const driftCount = target.deployed.filter((d) => d.drift).length;
  return (
    <Card
      title={target.title}
      kind={target.kind}
      drift={driftCount > 0}
      status={
        driftCount > 0 ? (
          <Chip tone="drift">▲ {driftCount} drift</Chip>
        ) : (
          <Chip tone="ok">● in sync</Chip>
        )
      }
    >
      <div style={{ padding: "6px 0" }}>
        {target.deployed.map((d) => (
          <div
            key={d.name}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto",
              gap: 10,
              alignItems: "center",
              padding: "5px var(--pad-card-x)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--text-2)",
              }}
            >
              {d.name}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: d.drift ? "var(--amber-ink)" : "var(--green-ink)",
              }}
            >
              {d.version}
              {d.drift ? ` → ${d.central}` : ""}
            </span>
            {d.drift ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => onUpdate(target.key, d.name)}
              >
                update
              </Button>
            ) : (
              <span style={{ width: 1 }}></span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function CkDeployStateView({ targets, onUpdate }) {
  const { SectionHeader } = window.MaestroDS;
  return (
    <section>
      <SectionHeader
        title="Deploy-state"
        meta={`read from lockfiles · ${targets.length} targets`}
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {targets.map((t) => (
          <CkTargetCard key={t.key} target={t} onUpdate={onUpdate} />
        ))}
      </div>
    </section>
  );
}

function CkComposeView({ inventory, draftItems, onAdd }) {
  const { SectionHeader, Button } = window.MaestroDS;
  const inDraft = (item) => draftItems.includes(`${item.name} ${item.version}`);
  const { Card } = window.MaestroDS;
  return (
    <section>
      <SectionHeader
        title="Compose"
        meta="pick primitives → bundle drafts on the right"
      />
      <Card>
        {inventory
          .filter((i) => i.type !== "bundle")
          .map((item) => (
            <CkInventoryRow
              key={item.name}
              item={item}
              action={
                inDraft(item) ? (
                  <Button
                    variant="quiet"
                    disabled
                    style={{ cursor: "default", color: "var(--green-ink)" }}
                  >
                    ✓ in draft
                  </Button>
                ) : (
                  <Button variant="dashed" onClick={() => onAdd(item)}>
                    + add
                  </Button>
                )
              }
            />
          ))}
      </Card>
    </section>
  );
}

function CkAside({
  draftItems,
  onRemove,
  target,
  onTarget,
  onDeployBundle,
  activity,
}) {
  const { Button, Chip } = window.MaestroDS;
  const targets = ["~/dev/acme-web", "Claude Code", "Codex"];
  return (
    <aside
      style={{
        borderLeft: "1px solid var(--border-strong)",
        background: "var(--bg-1)",
        padding: "20px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: "var(--fs-subtitle)",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ color: "var(--amber-ink)", fontSize: 12 }}>⧉</span>{" "}
        Compose bundle
      </h2>
      <div
        style={{
          border: "1px dashed var(--border-dashed)",
          borderRadius: "var(--radius-card)",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--text-1)",
          }}
        >
          frontend-v2 (draft)
        </span>
        {draftItems.map((x) => (
          <div
            key={x}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "var(--surface-inset)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-control)",
              padding: "6px 10px",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11.5,
                color: "var(--text-2)",
              }}
            >
              {x}
            </span>
            <span
              onClick={() => onRemove(x)}
              style={{
                color: "var(--text-dim)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              ✕
            </span>
          </div>
        ))}
        {draftItems.length === 0 ? (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--text-dim)",
            }}
          >
            empty — add from inventory
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="m-label">Deploy to</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {targets.map((t) => (
            <span
              key={t}
              onClick={() => onTarget(t)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                padding: "4px 9px",
                borderRadius: "var(--radius-control)",
                cursor: "pointer",
                color: t === target ? "var(--on-accent)" : "var(--text-muted)",
                background: t === target ? "var(--amber)" : "transparent",
                border:
                  t === target
                    ? "1px solid var(--amber)"
                    : "1px solid var(--border-chip)",
              }}
            >
              {t}
            </span>
          ))}
        </div>
        <Button
          variant="success"
          size="lg"
          style={{ marginTop: 4, width: "100%" }}
          onClick={onDeployBundle}
        >
          deploy bundle →
        </Button>
      </div>
      <div
        style={{
          marginTop: "auto",
          borderTop: "1px solid var(--border-strong)",
          paddingTop: 12,
        }}
      >
        <span className="m-label">Recent activity</span>
        {activity.map((x, i) => (
          <div
            key={i}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--text-dim)",
              padding: "5px 0",
              borderBottom: "1px solid var(--border-faint)",
            }}
          >
            {x}
          </div>
        ))}
      </div>
    </aside>
  );
}

Object.assign(window, {
  CkStatusBar,
  CkSidebar,
  CkInventoryView,
  CkDeployStateView,
  CkComposeView,
  CkAside,
});
