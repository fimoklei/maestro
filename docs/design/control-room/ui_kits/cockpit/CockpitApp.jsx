// Maestro cockpit — app state + layout. Mount after window.MaestroDS is loaded.

function CockpitApp() {
  const [view, setView] = React.useState("inventory");
  const [theme, setTheme] = React.useState("dark");
  // The consuming app toggles the whole system from one attribute on <html>.
  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const [targets, setTargets] = React.useState(window.COCKPIT_DATA.targets);
  const [draftItems, setDraftItems] = React.useState([
    "react-patterns 1.2.0",
    "code-review 1.4.0",
    "pre-commit-lint 1.0.2",
  ]);
  const [target, setTarget] = React.useState("~/dev/acme-web");
  const [activity, setActivity] = React.useState([
    "deployed code-review 1.4.0 → acme-web",
    "updated secret-scan 1.3.0 → Codex",
    "composed bundle backend 1.1.0",
  ]);

  const inventory = window.COCKPIT_DATA.inventory;
  const driftCount = targets
    .flatMap((t) => t.deployed)
    .filter((d) => d.drift).length;
  const log = (msg) => setActivity((a) => [msg, ...a].slice(0, 6));

  const handleUpdate = (targetKey, itemName) => {
    setTargets((ts) =>
      ts.map((t) =>
        t.key !== targetKey
          ? t
          : {
              ...t,
              deployed: t.deployed.map((d) =>
                d.name !== itemName
                  ? d
                  : { ...d, version: d.central, drift: false },
              ),
            },
      ),
    );
    const t = targets.find((x) => x.key === targetKey);
    const d = t.deployed.find((x) => x.name === itemName);
    log(`updated ${itemName} ${d.central} → ${t.title.replace("~/dev/", "")}`);
  };

  const handleDeploy = (item) =>
    log(
      `deployed ${item.name} ${item.version} → ${target.replace("~/dev/", "")}`,
    );
  const handleAdd = (item) =>
    setDraftItems((xs) => [...xs, `${item.name} ${item.version}`]);
  const handleRemove = (x) => setDraftItems((xs) => xs.filter((i) => i !== x));
  const handleDeployBundle = () => {
    if (draftItems.length === 0) return;
    log(
      `deployed bundle frontend-v2 (${draftItems.length} items) → ${target.replace("~/dev/", "")}`,
    );
  };

  return (
    <div
      style={{
        width: 1440,
        minHeight: 1000,
        background: "var(--bg-0)",
        color: "var(--text-1)",
        fontFamily: "var(--font-ui)",
        display: "grid",
        gridTemplateRows: "var(--h-statusbar) 1fr",
        textAlign: "left",
      }}
    >
      <CkStatusBar
        driftCount={driftCount}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "var(--w-sidebar) 1fr var(--w-aside)",
        }}
      >
        <CkSidebar view={view} onNav={setView} targets={targets} />
        <main
          style={{ padding: "20px 24px", minWidth: 0 }}
          data-screen-label={`Cockpit · ${view}`}
        >
          {view === "inventory" ? (
            <CkInventoryView inventory={inventory} onDeploy={handleDeploy} />
          ) : null}
          {view === "deploy" ? (
            <CkDeployStateView targets={targets} onUpdate={handleUpdate} />
          ) : null}
          {view === "compose" ? (
            <CkComposeView
              inventory={inventory}
              draftItems={draftItems}
              onAdd={handleAdd}
            />
          ) : null}
        </main>
        <CkAside
          draftItems={draftItems}
          onRemove={handleRemove}
          target={target}
          onTarget={setTarget}
          onDeployBundle={handleDeployBundle}
          activity={activity}
        />
      </div>
    </div>
  );
}

// Scale-to-fit wrapper: letterboxes the 1440-wide cockpit into any viewport width.
function CockpitStage() {
  const [scale, setScale] = React.useState(1);
  React.useEffect(() => {
    const fit = () => setScale(Math.min(1, window.innerWidth / 1440));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div style={{ width: 1440 * scale, margin: "0 auto", overflow: "hidden" }}>
      <div
        style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        <CockpitApp />
      </div>
    </div>
  );
}

Object.assign(window, { CockpitApp, CockpitStage });
