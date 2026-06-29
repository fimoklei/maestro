/* Maestro — story flow A screens.
   Thin compositions of the bound Control Room design system (window.MaestroDesignSystem_382d1f),
   mounted one-per-frame from the storyboard DC via <x-import component="FlowScreen" screen="...">.
   Mirrors the DS's own ui_kits/cockpit pattern: DS primitives for everything that is a primitive,
   plain token-styled divs for layout scaffolding and the form controls the DS doesn't ship. */

function DS() {
  return window.MaestroDesignSystem_382d1f || window.MaestroDS || {};
}

const mono = (extra) => ({ fontFamily: "var(--font-mono)", ...extra });
const ui = (extra) => ({ fontFamily: "var(--font-ui)", ...extra });

/* ---------- shared shell: status bar + sidebar + main (+ optional aside) ---------- */
function Shell({
  context,
  statusChips,
  synced = "synced 2m ago",
  activeNav,
  settingsActive = false,
  targets,
  registerCta = true,
  bodyMinHeight = 360,
  children,
  aside,
}) {
  const { Logo, NavItem, StatusDot, Button } = DS();
  const nav = [
    { id: "inventory", icon: "▤", label: "Inventory" },
    { id: "deploy", icon: "⇶", label: "Deploy-state" },
    { id: "compose", icon: "⧉", label: "Compose" },
  ];
  return (
    <div
      style={{
        width: "100%",
        background: "var(--bg-0)",
        color: "var(--text-1)",
        fontFamily: "var(--font-ui)",
        textAlign: "left",
      }}
    >
      {/* status bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "0 16px",
          height: 46,
          borderBottom: "1px solid var(--border-strong)",
          background: "var(--bg-1)",
        }}
      >
        <Logo size={22} wordmark context={context} />
        <div style={{ flex: 1 }}></div>
        {statusChips}
        <span style={mono({ fontSize: 11, color: "var(--text-dim)" })}>
          {synced}
        </span>
        <span
          style={mono({
            fontSize: 13,
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: "var(--radius-control)",
            color: settingsActive ? "var(--amber-ink)" : "var(--text-dim)",
            background: settingsActive ? "var(--amber-bg)" : "transparent",
            border: `1px solid ${settingsActive ? "var(--amber-border)" : "var(--border-chip)"}`,
          })}
        >
          ⚙
        </span>
      </div>
      {/* body */}
      <div style={{ display: "flex", minHeight: bodyMinHeight }}>
        <nav
          style={{
            width: 200,
            flexShrink: 0,
            borderRight: "1px solid var(--border-strong)",
            background: "var(--bg-1)",
            padding: "14px 10px",
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
              active={activeNav === n.id}
            />
          ))}
          <div
            className="m-label"
            style={{ margin: "20px 0 6px", padding: "0 12px" }}
          >
            Targets
          </div>
          {targets && targets.length ? (
            targets.map((t, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 12px",
                  fontFamily: t.mono ? "var(--font-mono)" : "var(--font-ui)",
                  fontSize: t.mono ? 11.5 : 12.5,
                  color: "var(--text-muted)",
                }}
              >
                <StatusDot status={t.drift ? "drift" : "ok"} />
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.label}
                </span>
              </div>
            ))
          ) : (
            <div style={{ padding: "3px 12px" }}>
              <span style={mono({ fontSize: 11, color: "var(--text-dim)" })}>
                none yet
              </span>
            </div>
          )}
          {registerCta ? (
            <Button variant="dashed" style={{ margin: "12px 12px 0" }}>
              + register repo
            </Button>
          ) : null}
        </nav>
        <main style={{ flex: 1, padding: "18px 20px", minWidth: 0 }}>
          {children}
        </main>
        {aside || null}
      </div>
    </div>
  );
}

/* form field the DS doesn't ship — token-styled */
function Field({ label, value, placeholder, mute }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="m-label">{label}</span>
      <div
        style={mono({
          fontSize: 12,
          color: mute ? "var(--text-dim)" : "var(--text-2)",
          background: "var(--surface-inset)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-control)",
          padding: "9px 11px",
        })}
      >
        {value || (
          <span style={{ color: "var(--text-dim)" }}>{placeholder}</span>
        )}
      </div>
    </div>
  );
}

/* deployed-primitive row inside a target card (plain div like the DS cockpit kit) */
function DepRow({ name, version, central, drift }) {
  const { Button } = DS();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        gap: 10,
        alignItems: "center",
        padding: "5px var(--pad-card-x)",
      }}
    >
      <span style={mono({ fontSize: 12, color: "var(--text-2)" })}>{name}</span>
      <span
        style={mono({
          fontSize: 11,
          color: drift ? "var(--amber-ink)" : "var(--green-ink)",
        })}
      >
        {version}
        {drift ? ` → ${central}` : ""}
      </span>
      {drift ? (
        <Button variant="primary" size="sm">
          update
        </Button>
      ) : (
        <span style={{ width: 1 }}></span>
      )}
    </div>
  );
}

function TargetCard({ kind, title, drift, deployed, empty }) {
  const { Card, Chip } = DS();
  return (
    <Card
      kind={kind}
      title={title}
      drift={drift}
      status={
        drift ? (
          <Chip tone="drift">▲ 1 drift</Chip>
        ) : (
          <Chip tone="ok">● in sync</Chip>
        )
      }
    >
      {empty ? (
        <div
          style={{
            padding: "12px var(--pad-card-x)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <span style={mono({ fontSize: 11.5, color: "var(--text-dim)" })}>
            nothing deployed yet
          </span>
          <DS_GhostDeploy />
        </div>
      ) : (
        <div style={{ padding: "6px 0" }}>
          {deployed.map((d) => (
            <DepRow key={d.name} {...d} />
          ))}
        </div>
      )}
    </Card>
  );
}
function DS_GhostDeploy() {
  const { Button } = DS();
  return (
    <Button variant="ghost" size="sm">
      deploy from inventory →
    </Button>
  );
}

/* ---------------------------------- screens ---------------------------------- */
function FlowScreen({ screen }) {
  const { SectionHeader, Card, Button, Chip, TypeTag, Logo } = DS();

  /* ===== FLOW 1 — first run ===== */
  if (screen === "f1-empty") {
    return (
      <Shell
        context="no inventory connected"
        synced="not configured"
        statusChips={<Chip tone="dim">○ setup required</Chip>}
        targets={[]}
        registerCta={false}
        bodyMinHeight={372}
      >
        <div
          style={{
            minHeight: 332,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            textAlign: "center",
          }}
        >
          <Logo size={44} />
          <div
            style={{
              maxWidth: 440,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
            }}
          >
            <h2
              style={ui({
                margin: 0,
                fontSize: 18,
                fontWeight: 600,
                color: "var(--text-1)",
              })}
            >
              Connect your central inventory
            </h2>
            <p
              style={ui({
                margin: 0,
                fontSize: 13,
                lineHeight: 1.6,
                color: "var(--text-muted)",
              })}
            >
              The cockpit is empty until it knows your inventory. Maestro reads
              primitives from the{" "}
              <span style={mono({ color: "var(--text-2)" })}>
                agent-harness
              </span>{" "}
              git repo — point it there to begin.
            </p>
            <Button variant="primary" size="lg" style={{ marginTop: 4 }}>
              connect inventory →
            </Button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {[
              ["1", "connect inventory", true],
              ["2", "register repos", false],
              ["3", "deploy", false],
            ].map(([n, l, on]) => (
              <span
                key={n}
                style={mono({
                  fontSize: 10,
                  padding: "4px 9px",
                  borderRadius: "var(--radius-control)",
                  color: on ? "var(--amber-ink)" : "var(--text-dim)",
                  background: on ? "var(--amber-bg)" : "transparent",
                  border: `1px solid ${on ? "var(--amber-border)" : "var(--border-chip)"}`,
                })}
              >
                {n} · {l}
              </span>
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  if (screen === "f1-connect") {
    return (
      <Shell
        context="no inventory connected"
        synced="connecting…"
        statusChips={<Chip tone="dim">○ connecting</Chip>}
        targets={[]}
        registerCta={false}
        bodyMinHeight={372}
      >
        <SectionHeader
          title="Connect central inventory"
          meta="step 1 of 2 · point Maestro at the inventory repo"
        />
        <div
          style={{
            maxWidth: 540,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <Card padded>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Field
                label="Git repository"
                value="git@github.com:you/agent-harness.git"
              />
              <Field label="Branch" value="main" />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  background: "var(--green-bg)",
                  border: "1px solid var(--green-border)",
                  borderRadius: "var(--radius-control)",
                }}
              >
                <span style={{ color: "var(--green-ink)", fontSize: 12 }}>
                  ●
                </span>
                <span style={mono({ fontSize: 11.5, color: "var(--text-2)" })}>
                  cloning…{" "}
                  <span style={{ color: "var(--green-ink)" }}>
                    10 primitives found
                  </span>{" "}
                  · read-only, never writes back
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                <Button variant="primary">connect →</Button>
                <Button variant="quiet">cancel</Button>
              </div>
            </div>
          </Card>
          <span style={mono({ fontSize: 11, color: "var(--text-dim)" })}>
            // the step that was missing — you connect the inventory before
            anything else exists
          </span>
        </div>
      </Shell>
    );
  }

  if (screen === "f1-connect-path") {
    return (
      <Shell
        context="no inventory connected"
        synced="connecting…"
        statusChips={<Chip tone="dim">○ connecting</Chip>}
        targets={[]}
        registerCta={false}
        bodyMinHeight={372}
      >
        <SectionHeader
          title="Connect central inventory"
          meta="step 1 of 2 · point Maestro at a local inventory folder"
        />
        <div
          style={{
            maxWidth: 540,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <Card padded>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <Field label="Inventory folder" value="~/dev/agent-harness" />
                </div>
                <Button variant="quiet">browse…</Button>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  background: "var(--green-bg)",
                  border: "1px solid var(--green-border)",
                  borderRadius: "var(--radius-control)",
                }}
              >
                <span style={{ color: "var(--green-ink)", fontSize: 12 }}>
                  ●
                </span>
                <span style={mono({ fontSize: 11.5, color: "var(--text-2)" })}>
                  reading…{" "}
                  <span style={{ color: "var(--green-ink)" }}>
                    10 primitives found
                  </span>{" "}
                  · read-only, never writes back
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                <Button variant="primary">connect →</Button>
                <Button variant="quiet">cancel</Button>
              </div>
            </div>
          </Card>
          <span style={mono({ fontSize: 11, color: "var(--text-dim)" })}>
            // path-only variant — for an inventory you already have checked out
            locally; no git URL or branch
          </span>
        </div>
      </Shell>
    );
  }

  /* persistent INVENTORY SOURCE view — connection only, reached via ⚙ source */
  if (screen === "inv-source" || screen === "inv-source-path") {
    const isPath = screen === "inv-source-path";
    return (
      <Shell
        context="agent-harness · main · 10 primitives"
        synced="synced 2m ago"
        statusChips={<Chip tone="ok">● inventory synced</Chip>}
        settingsActive
        targets={[]}
        registerCta={false}
        bodyMinHeight={372}
      >
        <SectionHeader
          title="Inventory source"
          meta={isPath ? "local path · read-only" : "git · read-only"}
        />
        <div
          style={{
            maxWidth: 540,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <Card padded>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 11px",
                  background: "var(--green-bg)",
                  border: "1px solid var(--green-border)",
                  borderRadius: "var(--radius-control)",
                }}
              >
                <span style={{ color: "var(--green-ink)", fontSize: 12 }}>
                  ●
                </span>
                <span style={mono({ fontSize: 11.5, color: "var(--text-2)" })}>
                  connected ·{" "}
                  <span style={{ color: "var(--green-ink)" }}>
                    synced 2m ago
                  </span>{" "}
                  · 10 primitives
                </span>
              </div>
              <Field
                label={
                  isPath ? "Source · local folder" : "Source · git repository"
                }
                value={
                  isPath
                    ? "~/dev/agent-harness"
                    : "git@github.com:you/agent-harness.git"
                }
              />
              <Field
                label={isPath ? "Mode" : "Branch"}
                value={isPath ? "watching folder for changes" : "main"}
                mute
              />
              <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                <Button variant="primary">re-sync →</Button>
                <Button variant="quiet">change source</Button>
              </div>
            </div>
          </Card>
          <span style={mono({ fontSize: 11, color: "var(--text-dim)" })}>
            {isPath
              ? "// the source lives here, not in the inventory list — change it or re-read anytime"
              : "// the source lives here, not in the inventory list — re-sync re-reads from git, read-only"}
          </span>
        </div>
      </Shell>
    );
  }

  /* persistent INVENTORY catalog — primitives only, the ▤ nav view */
  if (screen === "inventory") {
    const prims = [
      {
        type: "skill",
        name: "react-patterns",
        v: "2.3.1",
        desc: "React component conventions",
      },
      {
        type: "skill",
        name: "frontend",
        v: "2.3.1",
        desc: "frontend scaffolding skill",
      },
      {
        type: "hook",
        name: "lint-on-save",
        v: "1.4.0",
        desc: "run linters on every save",
      },
      {
        type: "hook",
        name: "secret-scan",
        v: "1.3.0",
        desc: "block commits with secrets",
      },
      {
        type: "mcp",
        name: "supabase",
        v: "0.9.2",
        desc: "supabase MCP server",
      },
      {
        type: "bundle",
        name: "code-review",
        v: "1.4.0",
        desc: "review skill + hooks",
      },
    ];
    return (
      <Shell
        context="agent-harness · main · 10 primitives"
        synced="synced 2m ago"
        statusChips={<Chip tone="ok">● inventory synced</Chip>}
        activeNav="inventory"
        targets={[]}
        registerCta={false}
        bodyMinHeight={372}
      >
        <SectionHeader
          title="Central inventory"
          meta="10 primitives · curated · deploy from here"
        />
        <Card>
          {prims.map((p, i) => (
            <div
              key={p.name}
              style={{
                display: "grid",
                gridTemplateColumns: "62px 1fr auto auto",
                gap: 10,
                alignItems: "center",
                padding: "9px var(--pad-card-x)",
                borderTop: i === 0 ? "none" : "1px solid var(--border-row)",
              }}
            >
              <TypeTag type={p.type} />
              <span
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  minWidth: 0,
                }}
              >
                <span style={mono({ fontSize: 12.5, color: "var(--text-1)" })}>
                  {p.name}
                </span>
                <span
                  style={mono({ fontSize: 10.5, color: "var(--text-dim)" })}
                >
                  {p.desc}
                </span>
              </span>
              <Chip>v{p.v}</Chip>
              <Button variant="ghost" size="sm">
                deploy →
              </Button>
            </div>
          ))}
        </Card>
        <div style={{ marginTop: 14 }}>
          <span style={mono({ fontSize: 11, color: "var(--text-dim)" })}>
            // just the catalog — no source or sync chatter; that lives behind
            ⚙ source
          </span>
        </div>
      </Shell>
    );
  }

  /* change-source form — reached from ⚙ source · re-point Maestro */
  if (screen === "src-change" || screen === "src-change-path") {
    const isPath = screen === "src-change-path";
    return (
      <Shell
        context="agent-harness · main · 10 primitives"
        synced="re-pointing…"
        statusChips={<Chip tone="dim">○ changing source</Chip>}
        settingsActive
        targets={[]}
        registerCta={false}
        bodyMinHeight={372}
      >
        <SectionHeader
          title="Change inventory source"
          meta={
            isPath
              ? "re-point at another local folder"
              : "re-point at another repo / branch"
          }
        />
        <div
          style={{
            maxWidth: 540,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <Card padded>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {isPath ? (
                <div
                  style={{ display: "flex", gap: 8, alignItems: "flex-end" }}
                >
                  <div style={{ flex: 1 }}>
                    <Field
                      label="Inventory folder"
                      value="~/dev/agent-harness"
                    />
                  </div>
                  <Button variant="quiet">browse…</Button>
                </div>
              ) : (
                <>
                  <Field
                    label="Git repository"
                    value="git@github.com:you/agent-harness.git"
                  />
                  <Field label="Branch" value="main" />
                </>
              )}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  background: "var(--green-bg)",
                  border: "1px solid var(--green-border)",
                  borderRadius: "var(--radius-control)",
                }}
              >
                <span style={{ color: "var(--green-ink)", fontSize: 12 }}>
                  ●
                </span>
                <span style={mono({ fontSize: 11.5, color: "var(--text-2)" })}>
                  {isPath ? "reading…" : "cloning…"}{" "}
                  <span style={{ color: "var(--green-ink)" }}>
                    10 primitives found
                  </span>{" "}
                  · read-only, never writes back
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                <Button variant="primary">save source →</Button>
                <Button variant="quiet">cancel</Button>
              </div>
            </div>
          </Card>
          <span style={mono({ fontSize: 11, color: "var(--text-dim)" })}>
            // same form as first-run connect — here it re-points an inventory
            that's already live
          </span>
        </div>
      </Shell>
    );
  }

  if (screen === "f1-repos") {
    return (
      <Shell
        context="agent-harness · main · 10 primitives"
        synced="synced just now"
        statusChips={<Chip tone="ok">● inventory synced</Chip>}
        targets={[
          { label: "~/dev/acme-web", mono: true },
          { label: "~/dev/payments-api", mono: true },
        ]}
        bodyMinHeight={372}
      >
        <SectionHeader
          title="Register consuming repos"
          meta="step 2 of 2 · where local deploys can land"
        />
        <div
          style={{
            maxWidth: 560,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <Card padded>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <Field label="Repo path" value="~/dev/acme-web" />
                </div>
                <Button variant="primary">+ register</Button>
              </div>
              <div style={{ height: 1, background: "var(--border-row)" }}></div>
              {[
                ["~/dev/acme-web", true],
                ["~/dev/payments-api", true],
              ].map(([p]) => (
                <div
                  key={p}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <DS_Dot />
                    <span
                      style={mono({ fontSize: 12, color: "var(--text-2)" })}
                    >
                      {p}
                    </span>
                  </span>
                  <span
                    style={mono({ fontSize: 11, color: "var(--text-dim)" })}
                  >
                    registered · 0 deployed
                  </span>
                </div>
              ))}
            </div>
          </Card>
          <span style={mono({ fontSize: 11, color: "var(--text-dim)" })}>
            // inventory is live — 10 primitives now available to deploy from
            Inventory →
          </span>
        </div>
      </Shell>
    );
  }

  if (screen === "f1-landing") {
    return (
      <Shell
        context="agent-harness · main · 10 primitives"
        synced="synced just now"
        statusChips={<Chip tone="ok">● everything in sync</Chip>}
        activeNav="deploy"
        targets={[
          { label: "~/dev/acme-web", mono: true },
          { label: "~/dev/payments-api", mono: true },
        ]}
        bodyMinHeight={372}
      >
        <SectionHeader
          title="Deploy-state"
          meta="read from lockfiles · 2 targets · nothing deployed yet"
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 12,
          }}
        >
          <TargetCard kind="local" title="~/dev/acme-web" empty />
          <TargetCard kind="local" title="~/dev/payments-api" empty />
        </div>
        <div
          style={{
            marginTop: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={mono({ fontSize: 11, color: "var(--text-dim)" })}>
            // configured &amp; empty — the cockpit now nudges you to your first
            deploy. Globals (Claude Code · Codex) sit here too.
          </span>
        </div>
      </Shell>
    );
  }

  /* ===== FLOW 2 — already configured (daily use) ===== */
  const dailyTargets = [
    { label: "Claude Code", drift: false },
    { label: "Codex", drift: true },
    { label: "~/dev/acme-web", mono: true, drift: true },
    { label: "~/dev/payments-api", mono: true, drift: false },
  ];

  if (screen === "f2-landing") {
    return (
      <Shell
        context="agent-harness · main · 10 primitives"
        statusChips={<Chip tone="drift">▲ 2 drift detected</Chip>}
        activeNav="deploy"
        targets={dailyTargets}
        bodyMinHeight={520}
      >
        <SectionHeader
          title="Deploy-state"
          meta="read from lockfiles · 4 targets"
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
            gap: 12,
          }}
        >
          <TargetCard
            kind="global"
            title="Claude Code"
            deployed={[
              { name: "react-patterns", version: "2.3.1" },
              { name: "code-review", version: "1.4.0" },
              { name: "secret-scan", version: "1.3.0" },
            ]}
          />
          <TargetCard
            kind="global"
            title="Codex"
            drift
            deployed={[
              { name: "react-patterns", version: "2.3.1" },
              {
                name: "secret-scan",
                version: "1.2.0",
                central: "1.3.0",
                drift: true,
              },
            ]}
          />
          <TargetCard
            kind="local"
            title="~/dev/acme-web"
            drift
            deployed={[
              { name: "frontend", version: "2.3.1" },
              {
                name: "react-patterns",
                version: "2.1.0",
                central: "2.3.1",
                drift: true,
              },
              { name: "lint-on-save", version: "1.4.0" },
            ]}
          />
          <TargetCard
            kind="local"
            title="~/dev/payments-api"
            deployed={[
              { name: "supabase", version: "0.9.2" },
              { name: "secret-scan", version: "1.3.0" },
            ]}
          />
        </div>
        <div style={{ marginTop: 14 }}>
          <span style={mono({ fontSize: 11, color: "var(--text-dim)" })}>
            // you land straight in the signal: two questions answered at a
            glance — and the drift is loud.
          </span>
        </div>
      </Shell>
    );
  }

  if (screen === "f2-resolve") {
    return (
      <Shell
        context="agent-harness · main · 10 primitives"
        statusChips={<Chip tone="drift">▲ 2 drift detected</Chip>}
        activeNav="deploy"
        targets={dailyTargets}
        bodyMinHeight={372}
      >
        <SectionHeader
          title="Resolve drift"
          meta="~/dev/acme-web · react-patterns"
        />
        <div
          style={{
            maxWidth: 560,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <Card
            kind="local"
            title="~/dev/acme-web"
            drift
            status={<Chip tone="drift">▲ 1 drift</Chip>}
          >
            <div
              style={{
                padding: "14px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <TypeTag type="skill" />
                <span style={mono({ fontSize: 13, color: "var(--text-1)" })}>
                  react-patterns
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "stretch", gap: 12 }}>
                <div
                  style={{
                    flex: 1,
                    padding: 11,
                    background: "var(--amber-bg)",
                    border: "1px solid var(--amber-border)",
                    borderRadius: "var(--radius-control)",
                  }}
                >
                  <div
                    className="m-label"
                    style={{ color: "var(--amber-ink)" }}
                  >
                    deployed
                  </div>
                  <div
                    style={mono({
                      fontSize: 17,
                      color: "var(--amber-ink)",
                      marginTop: 4,
                    })}
                  >
                    v2.1.0
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    color: "var(--text-dim)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  →
                </div>
                <div
                  style={{
                    flex: 1,
                    padding: 11,
                    background: "var(--green-bg)",
                    border: "1px solid var(--green-border)",
                    borderRadius: "var(--radius-control)",
                  }}
                >
                  <div
                    className="m-label"
                    style={{ color: "var(--green-ink)" }}
                  >
                    central
                  </div>
                  <div
                    style={mono({
                      fontSize: 17,
                      color: "var(--green-ink)",
                      marginTop: 4,
                    })}
                  >
                    v2.3.1
                  </div>
                </div>
              </div>
              <span style={mono({ fontSize: 11, color: "var(--text-dim)" })}>
                apm installs 2.3.1 and bumps this repo's lockfile — no manual
                pin editing.
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="primary">update → 2.3.1</Button>
                <Button variant="quiet">view diff</Button>
              </div>
            </div>
          </Card>
        </div>
      </Shell>
    );
  }

  if (screen === "f2-synced") {
    const synced = dailyTargets.map((t) => ({ ...t, drift: false }));
    return (
      <Shell
        context="agent-harness · main · 10 primitives"
        synced="synced just now"
        statusChips={<Chip tone="ok">● everything in sync</Chip>}
        activeNav="deploy"
        targets={synced}
        bodyMinHeight={372}
      >
        <SectionHeader title="Deploy-state" meta="all targets in sync" />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 12px",
            background: "var(--green-bg)",
            border: "1px solid var(--green-border)",
            borderRadius: "var(--radius-control)",
            marginBottom: 14,
            maxWidth: 560,
          }}
        >
          <span style={{ color: "var(--green-ink)", fontSize: 12 }}>✓</span>
          <span style={mono({ fontSize: 11.5, color: "var(--text-2)" })}>
            updated react-patterns 2.1.0 → 2.3.1 → acme-web · lockfile bumped
          </span>
        </div>
        <div style={{ maxWidth: 560 }}>
          <TargetCard
            kind="local"
            title="~/dev/acme-web"
            deployed={[
              { name: "frontend", version: "2.3.1" },
              { name: "react-patterns", version: "2.3.1" },
              { name: "lint-on-save", version: "1.4.0" },
            ]}
          />
        </div>
        <div style={{ marginTop: 14 }}>
          <span style={mono({ fontSize: 11, color: "var(--text-dim)" })}>
            // steered from the same view you landed on — no CLI, no hand-edited
            pins.
          </span>
        </div>
      </Shell>
    );
  }

  /* alternate daily paths — two compact panels, not full screens */
  if (screen === "branches") {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 18,
          width: "100%",
          textAlign: "left",
        }}
      >
        <div
          style={{
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-card)",
            overflow: "hidden",
            background: "var(--bg-0)",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--border-row)",
              background: "var(--bg-1)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                color: "var(--amber-ink)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
              }}
            >
              ▤
            </span>
            <span style={ui({ fontSize: 13, fontWeight: 600 })}>
              deploy a primitive
            </span>
            <span
              style={mono({
                fontSize: 11,
                color: "var(--text-dim)",
                marginLeft: "auto",
              })}
            >
              Inventory → target
            </span>
          </div>
          <div style={{ padding: 14 }}>
            <Card>
              {[
                {
                  type: "skill",
                  name: "react-patterns",
                  v: "2.3.1",
                  desc: "React component conventions",
                },
                {
                  type: "hook",
                  name: "secret-scan",
                  v: "1.3.0",
                  desc: "block commits with secrets",
                },
              ].map((it, i) => (
                <div
                  key={it.name}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "62px 1fr auto auto",
                    gap: 10,
                    alignItems: "center",
                    padding: "9px 14px",
                    borderBottom:
                      i === 0 ? "1px solid var(--border-row)" : "none",
                  }}
                >
                  <TypeTag type={it.type} />
                  <span
                    style={mono({ fontSize: 12.5, color: "var(--text-1)" })}
                  >
                    {it.name}
                  </span>
                  <Chip>v{it.v}</Chip>
                  <Button variant="ghost" size="sm">
                    deploy →
                  </Button>
                </div>
              ))}
            </Card>
          </div>
        </div>

        <div
          style={{
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-card)",
            overflow: "hidden",
            background: "var(--bg-1)",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--border-row)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                color: "var(--amber-ink)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
              }}
            >
              ⧉
            </span>
            <span style={ui({ fontSize: 13, fontWeight: 600 })}>
              compose + deploy a bundle
            </span>
            <span
              style={mono({
                fontSize: 11,
                color: "var(--text-dim)",
                marginLeft: "auto",
              })}
            >
              draft → deploy
            </span>
          </div>
          <div
            style={{
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div
              style={{
                border: "1px dashed var(--border-dashed)",
                borderRadius: "var(--radius-card)",
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 7,
              }}
            >
              <span style={mono({ fontSize: 12, color: "var(--text-1)" })}>
                frontend-v2 (draft)
              </span>
              {[
                "react-patterns 2.3.1",
                "lint-on-save 1.4.0",
                "code-review 1.4.0",
              ].map((x) => (
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
                    style={mono({ fontSize: 11.5, color: "var(--text-2)" })}
                  >
                    {x}
                  </span>
                  <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
                    ✕
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                alignItems: "center",
              }}
            >
              <span className="m-label">Deploy to</span>
              <span
                style={mono({
                  fontSize: 11,
                  padding: "4px 9px",
                  borderRadius: "var(--radius-control)",
                  color: "var(--on-accent)",
                  background: "var(--amber)",
                  border: "1px solid var(--amber)",
                })}
              >
                ~/dev/acme-web
              </span>
            </div>
            <Button variant="success" size="lg" style={{ width: "100%" }}>
              deploy bundle →
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={mono({ padding: 20, color: "var(--text-dim)" })}>
      unknown screen: {String(screen)}
    </div>
  );
}

function DS_Dot() {
  const { StatusDot } = DS();
  return <StatusDot status="ok" />;
}

window.FlowScreen = FlowScreen;
try {
  module.exports = { FlowScreen };
} catch (e) {}
