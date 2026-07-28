/* @ds-bundle: {"format":3,"namespace":"MaestroDesignSystem_382d1f","components":[{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Chip","sourcePath":"components/core/Chip.jsx"},{"name":"StatusDot","sourcePath":"components/core/StatusDot.jsx"},{"name":"TypeTag","sourcePath":"components/core/TypeTag.jsx"},{"name":"Card","sourcePath":"components/shell/Card.jsx"},{"name":"Logo","sourcePath":"components/shell/Logo.jsx"},{"name":"NavItem","sourcePath":"components/shell/NavItem.jsx"},{"name":"SectionHeader","sourcePath":"components/shell/SectionHeader.jsx"}],"sourceHashes":{"components/core/Button.jsx":"4bbd97d5f486","components/core/Chip.jsx":"f3d263fc8834","components/core/StatusDot.jsx":"75581a7f71ed","components/core/TypeTag.jsx":"ec4fdeb9456d","components/shell/Card.jsx":"729189f1f212","components/shell/Logo.jsx":"6cd79b06d89a","components/shell/NavItem.jsx":"16f3eb722b7c","components/shell/SectionHeader.jsx":"c414457b0707","ds-loader.js":"c51e41302125","guidelines/tweaks-panel.jsx":"6591467622ed","ui_kits/cockpit/CockpitApp.jsx":"c06b7f9cea0f","ui_kits/cockpit/CockpitParts.jsx":"8790ea28f262","ui_kits/cockpit/cockpit-data.js":"32c6201630e6"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.MaestroDesignSystem_382d1f = window.MaestroDesignSystem_382d1f || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Maestro Button — mono-typeset action button. Default size is "md". */
function Button({
  variant = "primary",
  size = "md",
  children,
  style,
  ...rest
}) {
  const sizes = {
    sm: {
      fontSize: 10,
      padding: "3px 8px"
    },
    md: {
      fontSize: 11,
      padding: "6px 12px"
    },
    lg: {
      fontSize: 12,
      padding: "10px 16px"
    }
  };
  const variants = {
    primary: {
      color: "var(--on-accent)",
      background: "var(--amber)",
      border: "1px solid var(--amber)",
      fontWeight: 700
    },
    success: {
      color: "var(--on-accent)",
      background: "var(--green)",
      border: "1px solid var(--green)",
      fontWeight: 700
    },
    ghost: {
      color: "var(--amber-ink)",
      background: "transparent",
      border: "1px solid var(--border-amber-dim)",
      fontWeight: 400
    },
    quiet: {
      color: "var(--text-muted)",
      background: "transparent",
      border: "1px solid var(--border-chip)",
      fontWeight: 400
    },
    dashed: {
      color: "var(--text-muted)",
      background: "transparent",
      border: "1px dashed var(--border-dashed)",
      fontWeight: 400
    }
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    style: {
      fontFamily: "var(--font-mono)",
      borderRadius: size === "lg" ? "var(--radius-item)" : "var(--radius-control)",
      cursor: "pointer",
      whiteSpace: "nowrap",
      ...(sizes[size] || sizes.md),
      ...(variants[variant] || variants.primary),
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Chip.jsx
try { (() => {
/* Maestro Chip — small mono status/meta capsule. */
function Chip({
  tone = "dim",
  children,
  style
}) {
  const tones = {
    ok: {
      color: "var(--green-ink)",
      background: "var(--green-bg)",
      border: "1px solid var(--green-border)"
    },
    drift: {
      color: "var(--amber-ink)",
      background: "var(--amber-bg)",
      border: "1px solid var(--amber-border)"
    },
    dim: {
      color: "var(--text-muted)",
      background: "var(--dim-bg)",
      border: "1px solid var(--border-chip)"
    }
  };
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      padding: "2px 7px",
      borderRadius: "var(--radius-control)",
      whiteSpace: "nowrap",
      display: "inline-block",
      ...(tones[tone] || tones.dim),
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Chip.jsx", error: String((e && e.message) || e) }); }

// components/core/StatusDot.jsx
try { (() => {
/* Maestro StatusDot — 6px sync-state dot used in lists and sidebars. */
function StatusDot({
  status = "ok",
  size = 6,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      width: size,
      height: size,
      borderRadius: size / 2,
      flexShrink: 0,
      display: "inline-block",
      background: status === "drift" ? "var(--amber-ink)" : "var(--green-ink)",
      ...style
    }
  });
}
Object.assign(__ds_scope, { StatusDot });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/StatusDot.jsx", error: String((e && e.message) || e) }); }

// components/core/TypeTag.jsx
try { (() => {
/* Maestro TypeTag — uppercase mono tag identifying a primitive's type. */
function TypeTag({
  type = "skill",
  style
}) {
  const colors = {
    skill: "var(--type-skill)",
    hook: "var(--type-hook)",
    mcp: "var(--type-mcp)",
    bundle: "var(--type-bundle)"
  };
  const c = colors[type] || colors.skill;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      letterSpacing: "var(--ls-tag)",
      textTransform: "uppercase",
      color: c,
      border: `1px solid color-mix(in srgb, ${c} 27%, transparent)`,
      background: `color-mix(in srgb, ${c} 8%, transparent)`,
      padding: "2px 6px",
      borderRadius: "var(--radius-tag)",
      whiteSpace: "nowrap",
      display: "inline-block",
      ...style
    }
  }, type);
}
Object.assign(__ds_scope, { TypeTag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/TypeTag.jsx", error: String((e && e.message) || e) }); }

// components/shell/Card.jsx
try { (() => {
/* Maestro Card — outlined panel; optional mono header with kind label + status. */
function Card({
  title,
  kind,
  status,
  drift = false,
  padded = false,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-card)",
      border: `1px solid ${drift ? "var(--border-drift)" : "var(--border-strong)"}`,
      borderRadius: "var(--radius-card)",
      overflow: "hidden",
      ...style
    }
  }, title ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "var(--pad-header-y) var(--pad-card-x)",
      borderBottom: "1px solid var(--border-row)"
    }
  }, kind ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      color: kind === "global" ? "var(--type-skill)" : "var(--text-muted)"
    }
  }, kind) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 13,
      color: "var(--text-1)",
      flex: 1,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, title), status) : null, /*#__PURE__*/React.createElement("div", {
    style: padded ? {
      padding: "var(--pad-card-x)"
    } : null
  }, children));
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/shell/Card.jsx", error: String((e && e.message) || e) }); }

// components/shell/Logo.jsx
try { (() => {
/* Maestro Logo — amber "M" tile, optional wordmark + mono context line. */
function Logo({
  size = 26,
  wordmark = false,
  context,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: Math.round(size * 0.55),
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: size,
      height: size,
      borderRadius: Math.max(4, Math.round(size * 0.19)),
      background: "var(--amber)",
      color: "var(--on-accent)",
      display: "grid",
      placeItems: "center",
      fontFamily: "var(--font-mono)",
      fontWeight: 700,
      fontSize: Math.round(size * 0.54),
      flexShrink: 0
    }
  }, "M"), wordmark ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-ui)",
      fontSize: Math.round(size * 0.58),
      fontWeight: 600,
      letterSpacing: "0.01em",
      color: "var(--text-1)"
    }
  }, "Maestro") : null, context ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "var(--text-dim)"
    }
  }, context) : null);
}
Object.assign(__ds_scope, { Logo });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/shell/Logo.jsx", error: String((e && e.message) || e) }); }

// components/shell/NavItem.jsx
try { (() => {
/* Maestro NavItem — sidebar navigation item with glyph icon. */
function NavItem({
  icon,
  label,
  active = false,
  onClick,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 12px",
      borderRadius: "var(--radius-item)",
      fontSize: "var(--fs-body)",
      fontFamily: "var(--font-ui)",
      cursor: "pointer",
      background: active ? "var(--surface-active)" : "transparent",
      color: active ? "var(--text-1)" : "var(--text-muted)",
      border: active ? "1px solid var(--border-chip)" : "1px solid transparent",
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      width: 14,
      color: active ? "var(--amber-ink)" : "var(--text-dim)"
    }
  }, icon), label);
}
Object.assign(__ds_scope, { NavItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/shell/NavItem.jsx", error: String((e && e.message) || e) }); }

// components/shell/SectionHeader.jsx
try { (() => {
/* Maestro SectionHeader — section title + mono meta + right-aligned actions. */
function SectionHeader({
  title,
  meta,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 12,
      marginBottom: 10,
      ...style
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: "var(--fs-title)",
      fontWeight: 600,
      color: "var(--text-1)",
      fontFamily: "var(--font-ui)"
    }
  }, title), meta ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "var(--text-dim)"
    }
  }, meta) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), children);
}
Object.assign(__ds_scope, { SectionHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/shell/SectionHeader.jsx", error: String((e && e.message) || e) }); }

// ds-loader.js
try { (() => {
/* Maestro DS loader — used by specimen cards and UI kits.
   Prefers a compiled design-system bundle when one is present on window;
   otherwise fetches the raw component .jsx sources, strips module syntax,
   transpiles with Babel standalone, and exposes them on window.MaestroDS.
   Requires React, ReactDOM and Babel to be loaded first. */
(function () {
  function findCompiledBundle() {
    var skip = {
      MaestroDS: 1,
      React: 1,
      ReactDOM: 1,
      Babel: 1
    };
    var names = Object.getOwnPropertyNames(window);
    for (var i = 0; i < names.length; i++) {
      var k = names[i];
      if (skip[k]) continue;
      try {
        var v = window[k];
        if (v && typeof v === "object" && typeof v.Button === "function" && typeof v.Chip === "function" && typeof v.TypeTag === "function") return v;
      } catch (e) {/* ignore restricted props */}
    }
    return null;
  }
  async function loadDS(paths) {
    var ns = window.MaestroDS = window.MaestroDS || {};
    var compiled = findCompiledBundle();
    if (compiled) {
      Object.assign(ns, compiled);
      return ns;
    }
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];
      var src = await (await fetch(p)).text();
      var names = [];
      var re = /export\s+function\s+([A-Za-z0-9_]+)/g;
      var m;
      while (m = re.exec(src)) names.push(m[1]);
      var body = src.replace(/^\s*import[^\n]*\n/gm, "").replace(/export\s+function/g, "function");
      var code = body + "\n;Object.assign(window.MaestroDS, { " + names.join(", ") + " });";
      var js = Babel.transform(code, {
        presets: ["react"],
        filename: p
      }).code;
      (0, eval)(js);
    }
    return ns;
  }
  window.loadDS = loadDS;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ds-loader.js", error: String((e && e.message) || e) }); }

// guidelines/tweaks-panel.jsx
try { (() => {
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)

/* BEGIN USAGE */
// tweaks-panel.jsx
// Reusable Tweaks shell + form-control helpers.
// Exports (to window): useTweaks, TweaksPanel, TweakSection, TweakRow, TweakSlider,
//   TweakToggle, TweakRadio, TweakSelect, TweakText, TweakNumber, TweakColor, TweakButton.
//
// Owns the host protocol (listens for __activate_edit_mode / __deactivate_edit_mode,
// posts __edit_mode_available / __edit_mode_set_keys / __edit_mode_dismissed) so
// individual prototypes don't re-roll it. Ships a consistent set of controls so you
// don't hand-draw <input type="range">, segmented radios, steppers, etc.
//
// Usage (in an HTML file that loads React + Babel):
//
//   const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
//     "primaryColor": "#D97757",
//     "palette": ["#D97757", "#29261b", "#f6f4ef"],
//     "fontSize": 16,
//     "density": "regular",
//     "dark": false
//   }/*EDITMODE-END*/;
//
//   function App() {
//     const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
//     return (
//       <div style={{ fontSize: t.fontSize, color: t.primaryColor }}>
//         Hello
//         <TweaksPanel>
//           <TweakSection label="Typography" />
//           <TweakSlider label="Font size" value={t.fontSize} min={10} max={32} unit="px"
//                        onChange={(v) => setTweak('fontSize', v)} />
//           <TweakRadio  label="Density" value={t.density}
//                        options={['compact', 'regular', 'comfy']}
//                        onChange={(v) => setTweak('density', v)} />
//           <TweakSection label="Theme" />
//           <TweakColor  label="Primary" value={t.primaryColor}
//                        options={['#D97757', '#2A6FDB', '#1F8A5B', '#7A5AE0']}
//                        onChange={(v) => setTweak('primaryColor', v)} />
//           <TweakColor  label="Palette" value={t.palette}
//                        options={[['#D97757', '#29261b', '#f6f4ef'],
//                                  ['#475569', '#0f172a', '#f1f5f9']]}
//                        onChange={(v) => setTweak('palette', v)} />
//           <TweakToggle label="Dark mode" value={t.dark}
//                        onChange={(v) => setTweak('dark', v)} />
//         </TweaksPanel>
//       </div>
//     );
//   }
//
// TweakRadio is the segmented control for 2–3 short options (auto-falls-back to
// TweakSelect past ~16/~10 chars per label); reach for TweakSelect directly when
// options are many or long. For color tweaks always curate 3-4 options rather than
// a free picker; an option can also be a whole 2–5 color palette (the stored value
// is the array). The Tweak* controls are a floor, not a ceiling — build custom
// controls inside the panel if a tweak calls for UI they don't cover.
/* END USAGE */
// ─────────────────────────────────────────────────────────────────────────────

const __TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom right;
    background:rgba(250,249,247,.78);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
  .twk-body::-webkit-scrollbar{width:8px}
  .twk-body::-webkit-scrollbar-track{background:transparent;margin:2px}
  .twk-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px;
    border:2px solid transparent;background-clip:content-box}
  .twk-body::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.25);
    border:2px solid transparent;background-clip:content-box}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
    color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-val{color:rgba(41,38,27,.5);font-variant-numeric:tabular-nums}

  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}

  .twk-field{appearance:none;box-sizing:border-box;width:100%;min-width:0;height:26px;padding:0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;
    background:rgba(255,255,255,.6);color:inherit;font:inherit;outline:none}
  .twk-field:focus{border-color:rgba(0,0,0,.25);background:rgba(255,255,255,.85)}
  select.twk-field{padding-right:22px;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='rgba(0,0,0,.5)' d='M0 0h10L5 6z'/></svg>");
    background-repeat:no-repeat;background-position:right 8px center}

  .twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;margin:6px 0;
    border-radius:999px;background:rgba(0,0,0,.12);outline:none}
  .twk-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
    width:14px;height:14px;border-radius:50%;background:#fff;
    border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
  .twk-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;
    background:#fff;border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}

  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg.dragging .twk-seg-thumb{transition:none}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:default;padding:4px 6px;line-height:1.2;
    overflow-wrap:anywhere}

  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:rgba(0,0,0,.15);transition:background .15s;cursor:default;padding:0}
  .twk-toggle[data-on="1"]{background:#34c759}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}

  .twk-num{display:flex;align-items:center;box-sizing:border-box;min-width:0;height:26px;padding:0 0 0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;background:rgba(255,255,255,.6)}
  .twk-num-lbl{font-weight:500;color:rgba(41,38,27,.6);cursor:ew-resize;
    user-select:none;padding-right:8px}
  .twk-num input{flex:1;min-width:0;height:100%;border:0;background:transparent;
    font:inherit;font-variant-numeric:tabular-nums;text-align:right;padding:0 8px 0 0;
    outline:none;color:inherit;-moz-appearance:textfield}
  .twk-num input::-webkit-inner-spin-button,.twk-num input::-webkit-outer-spin-button{
    -webkit-appearance:none;margin:0}
  .twk-num-unit{padding-right:8px;color:rgba(41,38,27,.45)}

  .twk-btn{appearance:none;height:26px;padding:0 12px;border:0;border-radius:7px;
    background:rgba(0,0,0,.78);color:#fff;font:inherit;font-weight:500;cursor:default}
  .twk-btn:hover{background:rgba(0,0,0,.88)}
  .twk-btn.secondary{background:rgba(0,0,0,.06);color:inherit}
  .twk-btn.secondary:hover{background:rgba(0,0,0,.1)}

  .twk-swatch{appearance:none;-webkit-appearance:none;width:56px;height:22px;
    border:.5px solid rgba(0,0,0,.1);border-radius:6px;padding:0;cursor:default;
    background:transparent;flex-shrink:0}
  .twk-swatch::-webkit-color-swatch-wrapper{padding:0}
  .twk-swatch::-webkit-color-swatch{border:0;border-radius:5.5px}
  .twk-swatch::-moz-color-swatch{border:0;border-radius:5.5px}

  .twk-chips{display:flex;gap:6px}
  .twk-chip{position:relative;appearance:none;flex:1;min-width:0;height:46px;
    padding:0;border:0;border-radius:6px;overflow:hidden;cursor:default;
    box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.06);
    transition:transform .12s cubic-bezier(.3,.7,.4,1),box-shadow .12s}
  .twk-chip:hover{transform:translateY(-1px);
    box-shadow:0 0 0 .5px rgba(0,0,0,.18),0 4px 10px rgba(0,0,0,.12)}
  .twk-chip[data-on="1"]{box-shadow:0 0 0 1.5px rgba(0,0,0,.85),
    0 2px 6px rgba(0,0,0,.15)}
  .twk-chip>span{position:absolute;top:0;bottom:0;right:0;width:34%;
    display:flex;flex-direction:column;box-shadow:-1px 0 0 rgba(0,0,0,.1)}
  .twk-chip>span>i{flex:1;box-shadow:0 -1px 0 rgba(0,0,0,.1)}
  .twk-chip>span>i:first-child{box-shadow:none}
  .twk-chip svg{position:absolute;top:6px;left:6px;width:13px;height:13px;
    filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
`;

// ── useTweaks ───────────────────────────────────────────────────────────────
// Single source of truth for tweak values. setTweak persists via the host
// (__edit_mode_set_keys → host rewrites the EDITMODE block on disk).
function useTweaks(defaults) {
  const [values, setValues] = React.useState(defaults);
  // Accepts either setTweak('key', value) or setTweak({ key: value, ... }) so a
  // useState-style call doesn't write a "[object Object]" key into the persisted
  // JSON block.
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null ? keyOrEdits : {
      [keyOrEdits]: val
    };
    setValues(prev => ({
      ...prev,
      ...edits
    }));
    window.parent.postMessage({
      type: '__edit_mode_set_keys',
      edits
    }, '*');
    // Same-window signal so in-page listeners (deck-stage rail thumbnails)
    // can react — the parent message only reaches the host, not peers.
    window.dispatchEvent(new CustomEvent('tweakchange', {
      detail: edits
    }));
  }, []);
  return [values, setTweak];
}

// ── TweaksPanel ─────────────────────────────────────────────────────────────
// Floating shell. Registers the protocol listener BEFORE announcing
// availability — if the announce ran first, the host's activate could land
// before our handler exists and the toolbar toggle would silently no-op.
// The close button posts __edit_mode_dismissed so the host's toolbar toggle
// flips off in lockstep; the host echoes __deactivate_edit_mode back which
// is what actually hides the panel.
function TweaksPanel({
  title = 'Tweaks',
  children
}) {
  const [open, setOpen] = React.useState(false);
  const dragRef = React.useRef(null);
  const offsetRef = React.useRef({
    x: 16,
    y: 16
  });
  const PAD = 16;
  const clampToViewport = React.useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth,
      h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y))
    };
    panel.style.right = offsetRef.current.x + 'px';
    panel.style.bottom = offsetRef.current.y + 'px';
  }, []);
  React.useEffect(() => {
    if (!open) return;
    clampToViewport();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', clampToViewport);
      return () => window.removeEventListener('resize', clampToViewport);
    }
    const ro = new ResizeObserver(clampToViewport);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [open, clampToViewport]);
  React.useEffect(() => {
    const onMsg = e => {
      const t = e?.data?.type;
      if (t === '__activate_edit_mode') setOpen(true);else if (t === '__deactivate_edit_mode') setOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({
      type: '__edit_mode_available'
    }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const dismiss = () => {
    setOpen(false);
    window.parent.postMessage({
      type: '__edit_mode_dismissed'
    }, '*');
  };
  const onDragStart = e => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX,
      sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = ev => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy)
      };
      clampToViewport();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  if (!open) return null;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, __TWEAKS_STYLE), /*#__PURE__*/React.createElement("div", {
    ref: dragRef,
    className: "twk-panel",
    "data-omelette-chrome": "",
    style: {
      right: offsetRef.current.x,
      bottom: offsetRef.current.y
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-hd",
    onMouseDown: onDragStart
  }, /*#__PURE__*/React.createElement("b", null, title), /*#__PURE__*/React.createElement("button", {
    className: "twk-x",
    "aria-label": "Close tweaks",
    onMouseDown: e => e.stopPropagation(),
    onClick: dismiss
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    className: "twk-body"
  }, children)));
}

// ── Layout helpers ──────────────────────────────────────────────────────────

function TweakSection({
  label,
  children
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "twk-sect"
  }, label), children);
}
function TweakRow({
  label,
  value,
  children,
  inline = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: inline ? 'twk-row twk-row-h' : 'twk-row'
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-lbl"
  }, /*#__PURE__*/React.createElement("span", null, label), value != null && /*#__PURE__*/React.createElement("span", {
    className: "twk-val"
  }, value)), children);
}

// ── Controls ────────────────────────────────────────────────────────────────

function TweakSlider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label,
    value: `${value}${unit}`
  }, /*#__PURE__*/React.createElement("input", {
    type: "range",
    className: "twk-slider",
    min: min,
    max: max,
    step: step,
    value: value,
    onChange: e => onChange(Number(e.target.value))
  }));
}
function TweakToggle({
  label,
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "twk-row twk-row-h"
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-lbl"
  }, /*#__PURE__*/React.createElement("span", null, label)), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "twk-toggle",
    "data-on": value ? '1' : '0',
    role: "switch",
    "aria-checked": !!value,
    onClick: () => onChange(!value)
  }, /*#__PURE__*/React.createElement("i", null)));
}
function TweakRadio({
  label,
  value,
  options,
  onChange
}) {
  const trackRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  // The active value is read by pointer-move handlers attached for the lifetime
  // of a drag — ref it so a stale closure doesn't fire onChange for every move.
  const valueRef = React.useRef(value);
  valueRef.current = value;

  // Segments wrap mid-word once per-segment width runs out. The track is
  // ~248px (280 panel − 28 body pad − 4 seg pad), each button loses 12px
  // to its own padding, and 11.5px system-ui averages ~6.3px/char — so 2
  // options fit ~16 chars each, 3 fit ~10. Past that (or >3 options), fall
  // back to a dropdown rather than wrap.
  const labelLen = o => String(typeof o === 'object' ? o.label : o).length;
  const maxLen = options.reduce((m, o) => Math.max(m, labelLen(o)), 0);
  const fitsAsSegments = maxLen <= ({
    2: 16,
    3: 10
  }[options.length] ?? 0);
  if (!fitsAsSegments) {
    // <select> emits strings — map back to the original option value so the
    // fallback stays type-preserving (numbers, booleans) like the segment path.
    const resolve = s => {
      const m = options.find(o => String(typeof o === 'object' ? o.value : o) === s);
      return m === undefined ? s : typeof m === 'object' ? m.value : m;
    };
    return /*#__PURE__*/React.createElement(TweakSelect, {
      label: label,
      value: value,
      options: options,
      onChange: s => onChange(resolve(s))
    });
  }
  const opts = options.map(o => typeof o === 'object' ? o : {
    value: o,
    label: o
  });
  const idx = Math.max(0, opts.findIndex(o => o.value === value));
  const n = opts.length;
  const segAt = clientX => {
    const r = trackRef.current.getBoundingClientRect();
    const inner = r.width - 4;
    const i = Math.floor((clientX - r.left - 2) / inner * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  };
  const onPointerDown = e => {
    setDragging(true);
    const v0 = segAt(e.clientX);
    if (v0 !== valueRef.current) onChange(v0);
    const move = ev => {
      if (!trackRef.current) return;
      const v = segAt(ev.clientX);
      if (v !== valueRef.current) onChange(v);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("div", {
    ref: trackRef,
    role: "radiogroup",
    onPointerDown: onPointerDown,
    className: dragging ? 'twk-seg dragging' : 'twk-seg'
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-seg-thumb",
    style: {
      left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
      width: `calc((100% - 4px) / ${n})`
    }
  }), opts.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.value,
    type: "button",
    role: "radio",
    "aria-checked": o.value === value
  }, o.label))));
}
function TweakSelect({
  label,
  value,
  options,
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("select", {
    className: "twk-field",
    value: value,
    onChange: e => onChange(e.target.value)
  }, options.map(o => {
    const v = typeof o === 'object' ? o.value : o;
    const l = typeof o === 'object' ? o.label : o;
    return /*#__PURE__*/React.createElement("option", {
      key: v,
      value: v
    }, l);
  })));
}
function TweakText({
  label,
  value,
  placeholder,
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("input", {
    className: "twk-field",
    type: "text",
    value: value,
    placeholder: placeholder,
    onChange: e => onChange(e.target.value)
  }));
}
function TweakNumber({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange
}) {
  const clamp = n => {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };
  const startRef = React.useRef({
    x: 0,
    val: 0
  });
  const onScrubStart = e => {
    e.preventDefault();
    startRef.current = {
      x: e.clientX,
      val: value
    };
    const decimals = (String(step).split('.')[1] || '').length;
    const move = ev => {
      const dx = ev.clientX - startRef.current.x;
      const raw = startRef.current.val + dx * step;
      const snapped = Math.round(raw / step) * step;
      onChange(clamp(Number(snapped.toFixed(decimals))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "twk-num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "twk-num-lbl",
    onPointerDown: onScrubStart
  }, label), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: value,
    min: min,
    max: max,
    step: step,
    onChange: e => onChange(clamp(Number(e.target.value)))
  }), unit && /*#__PURE__*/React.createElement("span", {
    className: "twk-num-unit"
  }, unit));
}

// Relative-luminance contrast pick — checkmarks drawn over a swatch need to
// read on both #111 and #fafafa without per-option configuration. Hex input
// only (#rgb / #rrggbb); named or rgb()/hsl() colors fall through to "light".
function __twkIsLight(hex) {
  const h = String(hex).replace('#', '');
  const x = h.length === 3 ? h.replace(/./g, c => c + c) : h.padEnd(6, '0');
  const n = parseInt(x.slice(0, 6), 16);
  if (Number.isNaN(n)) return true;
  const r = n >> 16 & 255,
    g = n >> 8 & 255,
    b = n & 255;
  return r * 299 + g * 587 + b * 114 > 148000;
}
const __TwkCheck = ({
  light
}) => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 14 14",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M3 7.2 5.8 10 11 4.2",
  fill: "none",
  strokeWidth: "2.2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  stroke: light ? 'rgba(0,0,0,.78)' : '#fff'
}));

// TweakColor — curated color/palette picker. Each option is either a single
// hex string or an array of 1-5 hex strings; the card adapts — a lone color
// renders solid, a palette renders colors[0] as the hero (left ~2/3) with the
// rest stacked in a sharp column on the right. onChange emits the
// option in the shape it was passed (string stays string, array stays array).
// Without options it falls back to the native color input for back-compat.
function TweakColor({
  label,
  value,
  options,
  onChange
}) {
  if (!options || !options.length) {
    return /*#__PURE__*/React.createElement("div", {
      className: "twk-row twk-row-h"
    }, /*#__PURE__*/React.createElement("div", {
      className: "twk-lbl"
    }, /*#__PURE__*/React.createElement("span", null, label)), /*#__PURE__*/React.createElement("input", {
      type: "color",
      className: "twk-swatch",
      value: value,
      onChange: e => onChange(e.target.value)
    }));
  }
  // Native <input type=color> emits lowercase hex per the HTML spec, so
  // compare case-insensitively. String() guards JSON.stringify(undefined),
  // which returns the primitive undefined (no .toLowerCase).
  const key = o => String(JSON.stringify(o)).toLowerCase();
  const cur = key(value);
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-chips",
    role: "radiogroup"
  }, options.map((o, i) => {
    const colors = Array.isArray(o) ? o : [o];
    const [hero, ...rest] = colors;
    const sup = rest.slice(0, 4);
    const on = key(o) === cur;
    return /*#__PURE__*/React.createElement("button", {
      key: i,
      type: "button",
      className: "twk-chip",
      role: "radio",
      "aria-checked": on,
      "data-on": on ? '1' : '0',
      "aria-label": colors.join(', '),
      title: colors.join(' · '),
      style: {
        background: hero
      },
      onClick: () => onChange(o)
    }, sup.length > 0 && /*#__PURE__*/React.createElement("span", null, sup.map((c, j) => /*#__PURE__*/React.createElement("i", {
      key: j,
      style: {
        background: c
      }
    }))), on && /*#__PURE__*/React.createElement(__TwkCheck, {
      light: __twkIsLight(hero)
    }));
  })));
}
function TweakButton({
  label,
  onClick,
  secondary = false
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: secondary ? 'twk-btn secondary' : 'twk-btn',
    onClick: onClick
  }, label);
}
Object.assign(window, {
  useTweaks,
  TweaksPanel,
  TweakSection,
  TweakRow,
  TweakSlider,
  TweakToggle,
  TweakRadio,
  TweakSelect,
  TweakText,
  TweakNumber,
  TweakColor,
  TweakButton
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "guidelines/tweaks-panel.jsx", error: String((e && e.message) || e) }); }

// ui_kits/cockpit/CockpitApp.jsx
try { (() => {
// Maestro cockpit — app state + layout. Mount after window.MaestroDS is loaded.

function CockpitApp() {
  const [view, setView] = React.useState("inventory");
  const [theme, setTheme] = React.useState("dark");
  // The consuming app toggles the whole system from one attribute on <html>.
  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const [targets, setTargets] = React.useState(window.COCKPIT_DATA.targets);
  const [draftItems, setDraftItems] = React.useState(["react-patterns 1.2.0", "code-review 1.4.0", "pre-commit-lint 1.0.2"]);
  const [target, setTarget] = React.useState("~/dev/acme-web");
  const [activity, setActivity] = React.useState(["deployed code-review 1.4.0 → acme-web", "updated secret-scan 1.3.0 → Codex", "composed bundle backend 1.1.0"]);
  const inventory = window.COCKPIT_DATA.inventory;
  const driftCount = targets.flatMap(t => t.deployed).filter(d => d.drift).length;
  const log = msg => setActivity(a => [msg, ...a].slice(0, 6));
  const handleUpdate = (targetKey, itemName) => {
    setTargets(ts => ts.map(t => t.key !== targetKey ? t : {
      ...t,
      deployed: t.deployed.map(d => d.name !== itemName ? d : {
        ...d,
        version: d.central,
        drift: false
      })
    }));
    const t = targets.find(x => x.key === targetKey);
    const d = t.deployed.find(x => x.name === itemName);
    log(`updated ${itemName} ${d.central} → ${t.title.replace("~/dev/", "")}`);
  };
  const handleDeploy = item => log(`deployed ${item.name} ${item.version} → ${target.replace("~/dev/", "")}`);
  const handleAdd = item => setDraftItems(xs => [...xs, `${item.name} ${item.version}`]);
  const handleRemove = x => setDraftItems(xs => xs.filter(i => i !== x));
  const handleDeployBundle = () => {
    if (draftItems.length === 0) return;
    log(`deployed bundle frontend-v2 (${draftItems.length} items) → ${target.replace("~/dev/", "")}`);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1440,
      minHeight: 1000,
      background: "var(--bg-0)",
      color: "var(--text-1)",
      fontFamily: "var(--font-ui)",
      display: "grid",
      gridTemplateRows: "var(--h-statusbar) 1fr",
      textAlign: "left"
    }
  }, /*#__PURE__*/React.createElement(CkStatusBar, {
    driftCount: driftCount,
    theme: theme,
    onToggleTheme: () => setTheme(t => t === "dark" ? "light" : "dark")
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "var(--w-sidebar) 1fr var(--w-aside)"
    }
  }, /*#__PURE__*/React.createElement(CkSidebar, {
    view: view,
    onNav: setView,
    targets: targets
  }), /*#__PURE__*/React.createElement("main", {
    style: {
      padding: "20px 24px",
      minWidth: 0
    },
    "data-screen-label": `Cockpit · ${view}`
  }, view === "inventory" ? /*#__PURE__*/React.createElement(CkInventoryView, {
    inventory: inventory,
    onDeploy: handleDeploy
  }) : null, view === "deploy" ? /*#__PURE__*/React.createElement(CkDeployStateView, {
    targets: targets,
    onUpdate: handleUpdate
  }) : null, view === "compose" ? /*#__PURE__*/React.createElement(CkComposeView, {
    inventory: inventory,
    draftItems: draftItems,
    onAdd: handleAdd
  }) : null), /*#__PURE__*/React.createElement(CkAside, {
    draftItems: draftItems,
    onRemove: handleRemove,
    target: target,
    onTarget: setTarget,
    onDeployBundle: handleDeployBundle,
    activity: activity
  })));
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
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1440 * scale,
      margin: "0 auto",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      transform: `scale(${scale})`,
      transformOrigin: "top left"
    }
  }, /*#__PURE__*/React.createElement(CockpitApp, null)));
}
Object.assign(window, {
  CockpitApp,
  CockpitStage
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/cockpit/CockpitApp.jsx", error: String((e && e.message) || e) }); }

// ui_kits/cockpit/CockpitParts.jsx
try { (() => {
// Maestro cockpit — shell + view pieces. Composes the DS primitives from window.MaestroDS.

function CkStatusBar({
  driftCount,
  theme,
  onToggleTheme
}) {
  const {
    Logo,
    Chip
  } = window.MaestroDS;
  return /*#__PURE__*/React.createElement("header", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 16,
      padding: "0 20px",
      borderBottom: "1px solid var(--border-strong)",
      background: "var(--bg-1)",
      height: "var(--h-statusbar)"
    }
  }, /*#__PURE__*/React.createElement(Logo, {
    size: 26,
    wordmark: true,
    context: "agent-harness · main · 10 primitives"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), driftCount > 0 ? /*#__PURE__*/React.createElement(Chip, {
    tone: "drift"
  }, "\u25B2 ", driftCount, " drift detected") : /*#__PURE__*/React.createElement(Chip, {
    tone: "ok"
  }, "\u25CF everything in sync"), /*#__PURE__*/React.createElement(Chip, {
    tone: "ok"
  }, "\u25CF server healthy"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "var(--text-dim)"
    }
  }, "synced 2m ago"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onToggleTheme,
    title: "Toggle light / dark",
    style: {
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
      border: "1px solid var(--border-chip)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12
    }
  }, theme === "dark" ? "◐" : "◑"), theme === "dark" ? "light" : "dark"));
}
function CkSidebar({
  view,
  onNav,
  targets
}) {
  const {
    NavItem,
    StatusDot,
    Button
  } = window.MaestroDS;
  const nav = [{
    id: "inventory",
    icon: "▤",
    label: "Inventory"
  }, {
    id: "deploy",
    icon: "⇶",
    label: "Deploy-state"
  }, {
    id: "compose",
    icon: "⧉",
    label: "Compose"
  }];
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      borderRight: "1px solid var(--border-strong)",
      padding: "16px 10px",
      display: "flex",
      flexDirection: "column",
      gap: 2
    }
  }, nav.map(n => /*#__PURE__*/React.createElement(NavItem, {
    key: n.id,
    icon: n.icon,
    label: n.label,
    active: view === n.id,
    onClick: () => onNav(n.id)
  })), /*#__PURE__*/React.createElement("div", {
    className: "m-label",
    style: {
      margin: "22px 0 6px",
      padding: "0 12px"
    }
  }, "Targets"), targets.map(t => /*#__PURE__*/React.createElement("div", {
    key: t.key,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "5px 12px",
      fontFamily: t.kind === "local" ? "var(--font-mono)" : "var(--font-ui)",
      fontSize: t.kind === "local" ? 11.5 : 12.5,
      color: t.kind === "local" ? "var(--text-muted)" : "var(--text-3)"
    }
  }, /*#__PURE__*/React.createElement(StatusDot, {
    status: t.deployed.some(d => d.drift) ? "drift" : "ok"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, t.title))), /*#__PURE__*/React.createElement(Button, {
    variant: "dashed",
    style: {
      margin: "10px 12px 0"
    }
  }, "+ register repo"));
}
function CkInventoryRow({
  item,
  action
}) {
  const {
    TypeTag,
    Chip
  } = window.MaestroDS;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "70px 170px 1fr 70px 130px",
      gap: 12,
      alignItems: "center",
      padding: "var(--pad-row-y) var(--pad-card-x)",
      borderBottom: "1px solid var(--border-row)"
    }
  }, /*#__PURE__*/React.createElement(TypeTag, {
    type: item.type
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-data)",
      color: "var(--text-1)"
    }
  }, item.name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--fs-desc)",
      color: "var(--text-muted)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, item.desc), /*#__PURE__*/React.createElement(Chip, null, "v", item.version), /*#__PURE__*/React.createElement("div", {
    style: {
      justifySelf: "end"
    }
  }, action));
}
function CkInventoryView({
  inventory,
  onDeploy
}) {
  const {
    SectionHeader,
    Button,
    Card
  } = window.MaestroDS;
  return /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement(SectionHeader, {
    title: "Central inventory",
    meta: "curated \xB7 production-ready"
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary"
  }, "+ new primitive")), /*#__PURE__*/React.createElement(Card, null, inventory.map(item => /*#__PURE__*/React.createElement(CkInventoryRow, {
    key: item.name,
    item: item,
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: () => onDeploy(item)
    }, "deploy \u2192")
  }))));
}
function CkTargetCard({
  target,
  onUpdate
}) {
  const {
    Card,
    Chip,
    Button
  } = window.MaestroDS;
  const driftCount = target.deployed.filter(d => d.drift).length;
  return /*#__PURE__*/React.createElement(Card, {
    title: target.title,
    kind: target.kind,
    drift: driftCount > 0,
    status: driftCount > 0 ? /*#__PURE__*/React.createElement(Chip, {
      tone: "drift"
    }, "\u25B2 ", driftCount, " drift") : /*#__PURE__*/React.createElement(Chip, {
      tone: "ok"
    }, "\u25CF in sync")
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "6px 0"
    }
  }, target.deployed.map(d => /*#__PURE__*/React.createElement("div", {
    key: d.name,
    style: {
      display: "grid",
      gridTemplateColumns: "1fr auto auto",
      gap: 10,
      alignItems: "center",
      padding: "5px var(--pad-card-x)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      color: "var(--text-2)"
    }
  }, d.name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: d.drift ? "var(--amber-ink)" : "var(--green-ink)"
    }
  }, d.version, d.drift ? ` → ${d.central}` : ""), d.drift ? /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    onClick: () => onUpdate(target.key, d.name)
  }, "update") : /*#__PURE__*/React.createElement("span", {
    style: {
      width: 1
    }
  })))));
}
function CkDeployStateView({
  targets,
  onUpdate
}) {
  const {
    SectionHeader
  } = window.MaestroDS;
  return /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement(SectionHeader, {
    title: "Deploy-state",
    meta: `read from lockfiles · ${targets.length} targets`
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 12
    }
  }, targets.map(t => /*#__PURE__*/React.createElement(CkTargetCard, {
    key: t.key,
    target: t,
    onUpdate: onUpdate
  }))));
}
function CkComposeView({
  inventory,
  draftItems,
  onAdd
}) {
  const {
    SectionHeader,
    Button
  } = window.MaestroDS;
  const inDraft = item => draftItems.includes(`${item.name} ${item.version}`);
  const {
    Card
  } = window.MaestroDS;
  return /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement(SectionHeader, {
    title: "Compose",
    meta: "pick primitives \u2192 bundle drafts on the right"
  }), /*#__PURE__*/React.createElement(Card, null, inventory.filter(i => i.type !== "bundle").map(item => /*#__PURE__*/React.createElement(CkInventoryRow, {
    key: item.name,
    item: item,
    action: inDraft(item) ? /*#__PURE__*/React.createElement(Button, {
      variant: "quiet",
      disabled: true,
      style: {
        cursor: "default",
        color: "var(--green-ink)"
      }
    }, "\u2713 in draft") : /*#__PURE__*/React.createElement(Button, {
      variant: "dashed",
      onClick: () => onAdd(item)
    }, "+ add")
  }))));
}
function CkAside({
  draftItems,
  onRemove,
  target,
  onTarget,
  onDeployBundle,
  activity
}) {
  const {
    Button,
    Chip
  } = window.MaestroDS;
  const targets = ["~/dev/acme-web", "Claude Code", "Codex"];
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      borderLeft: "1px solid var(--border-strong)",
      background: "var(--bg-1)",
      padding: "20px 18px",
      display: "flex",
      flexDirection: "column",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: "var(--fs-subtitle)",
      fontWeight: 600,
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--amber-ink)",
      fontSize: 12
    }
  }, "\u29C9"), " Compose bundle"), /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1px dashed var(--border-dashed)",
      borderRadius: "var(--radius-card)",
      padding: 14,
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      color: "var(--text-1)"
    }
  }, "frontend-v2 (draft)"), draftItems.map(x => /*#__PURE__*/React.createElement("div", {
    key: x,
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      background: "var(--surface-inset)",
      border: "1px solid var(--border-strong)",
      borderRadius: "var(--radius-control)",
      padding: "6px 10px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11.5,
      color: "var(--text-2)"
    }
  }, x), /*#__PURE__*/React.createElement("span", {
    onClick: () => onRemove(x),
    style: {
      color: "var(--text-dim)",
      fontSize: 11,
      cursor: "pointer"
    }
  }, "\u2715"))), draftItems.length === 0 ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "var(--text-dim)"
    }
  }, "empty \u2014 add from inventory") : null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-label"
  }, "Deploy to"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 6
    }
  }, targets.map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    onClick: () => onTarget(t),
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      padding: "4px 9px",
      borderRadius: "var(--radius-control)",
      cursor: "pointer",
      color: t === target ? "var(--on-accent)" : "var(--text-muted)",
      background: t === target ? "var(--amber)" : "transparent",
      border: t === target ? "1px solid var(--amber)" : "1px solid var(--border-chip)"
    }
  }, t))), /*#__PURE__*/React.createElement(Button, {
    variant: "success",
    size: "lg",
    style: {
      marginTop: 4,
      width: "100%"
    },
    onClick: onDeployBundle
  }, "deploy bundle \u2192")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "auto",
      borderTop: "1px solid var(--border-strong)",
      paddingTop: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-label"
  }, "Recent activity"), activity.map((x, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "var(--text-dim)",
      padding: "5px 0",
      borderBottom: "1px solid var(--border-faint)"
    }
  }, x))));
}
Object.assign(window, {
  CkStatusBar,
  CkSidebar,
  CkInventoryView,
  CkDeployStateView,
  CkComposeView,
  CkAside
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/cockpit/CockpitParts.jsx", error: String((e && e.message) || e) }); }

// ui_kits/cockpit/cockpit-data.js
try { (() => {
// Maestro cockpit — demo data (mirrors the MVP1 brief: inventory / deploy-state / compose).
window.COCKPIT_DATA = {
  inventory: [{
    type: "skill",
    name: "code-review",
    version: "1.4.0",
    desc: "Structured review checklist with severity tiers"
  }, {
    type: "skill",
    name: "react-patterns",
    version: "1.2.0",
    desc: "Component conventions, hooks rules, file layout"
  }, {
    type: "skill",
    name: "commit-style",
    version: "2.1.0",
    desc: "Conventional commits with scoped prefixes"
  }, {
    type: "skill",
    name: "api-design",
    version: "0.9.1",
    desc: "REST resource naming and error envelope rules"
  }, {
    type: "hook",
    name: "pre-commit-lint",
    version: "1.0.2",
    desc: "Run linter before every commit"
  }, {
    type: "hook",
    name: "secret-scan",
    version: "1.3.0",
    desc: "Block commits containing credentials"
  }, {
    type: "mcp",
    name: "github-mcp",
    version: "3.2.0",
    desc: "Issues, PRs and reviews from the agent"
  }, {
    type: "mcp",
    name: "postgres-mcp",
    version: "1.1.0",
    desc: "Read-only schema and query access"
  }, {
    type: "bundle",
    name: "frontend",
    version: "2.0.0",
    desc: "react-patterns + code-review + pre-commit-lint"
  }, {
    type: "bundle",
    name: "backend",
    version: "1.1.0",
    desc: "api-design + postgres-mcp + secret-scan"
  }],
  targets: [{
    key: "claude-code",
    title: "Claude Code",
    kind: "global",
    deployed: [{
      name: "commit-style",
      version: "2.1.0",
      central: "2.1.0",
      drift: false
    }, {
      name: "code-review",
      version: "1.4.0",
      central: "1.4.0",
      drift: false
    }, {
      name: "github-mcp",
      version: "3.2.0",
      central: "3.2.0",
      drift: false
    }]
  }, {
    key: "codex",
    title: "Codex",
    kind: "global",
    deployed: [{
      name: "commit-style",
      version: "2.0.0",
      central: "2.1.0",
      drift: true
    }, {
      name: "secret-scan",
      version: "1.3.0",
      central: "1.3.0",
      drift: false
    }]
  }, {
    key: "acme-web",
    title: "~/dev/acme-web",
    kind: "local",
    deployed: [{
      name: "react-patterns",
      version: "1.0.0",
      central: "1.2.0",
      drift: true
    }, {
      name: "code-review",
      version: "1.4.0",
      central: "1.4.0",
      drift: false
    }, {
      name: "pre-commit-lint",
      version: "1.0.2",
      central: "1.0.2",
      drift: false
    }]
  }, {
    key: "api-gateway",
    title: "~/dev/api-gateway",
    kind: "local",
    deployed: [{
      name: "api-design",
      version: "0.9.1",
      central: "0.9.1",
      drift: false
    }, {
      name: "secret-scan",
      version: "1.1.0",
      central: "1.3.0",
      drift: true
    }, {
      name: "postgres-mcp",
      version: "1.1.0",
      central: "1.1.0",
      drift: false
    }]
  }, {
    key: "data-pipeline",
    title: "~/dev/data-pipeline",
    kind: "local",
    deployed: [{
      name: "commit-style",
      version: "2.1.0",
      central: "2.1.0",
      drift: false
    }]
  }]
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/cockpit/cockpit-data.js", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.StatusDot = __ds_scope.StatusDot;

__ds_ns.TypeTag = __ds_scope.TypeTag;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Logo = __ds_scope.Logo;

__ds_ns.NavItem = __ds_scope.NavItem;

__ds_ns.SectionHeader = __ds_scope.SectionHeader;

})();
