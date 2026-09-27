import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = readFileSync(
  join(root, "packages/web/src/assets/maestro-mark.svg"),
  "utf8",
);
const mark = source.match(/<g id="mark">([\s\S]*?)<\/g>/)[1];
const requireWeb = createRequire(join(root, "packages/web/package.json"));
const fontRoot = dirname(requireWeb.resolve("@fontsource-variable/geist"));
const font = readFileSync(
  join(fontRoot, "files/geist-latin-wght-normal.woff2"),
).toString("base64");
const fontStyle = `<style>@font-face{font-family:Geist;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}text{font-family:Geist,Arial,sans-serif}</style>`;
const inventoryScreenshot = readFileSync(
  join(root, "docs/images/inventory.png"),
).toString("base64");
const svg = (width, height, content) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>Maestro</title>${content}</svg>\n`;
const glyph = (x, y, size, color) =>
  `<g transform="translate(${x} ${y}) scale(${size / 100})" fill="${color}">${mark}</g>`;
const save = (path, content) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
};

save(
  "packages/web/public/favicon.svg",
  svg(
    100,
    100,
    `<style>.mark{fill:#1c2024}@media(prefers-color-scheme:dark){.mark{fill:#edeef0}}</style><g class="mark">${mark}</g>`,
  ),
);
save(
  "docs/images/maestro-mark.svg",
  svg(100, 100, glyph(0, 0, 100, "#1c2024")),
);
save(
  "docs/images/maestro-wordmark.svg",
  svg(
    480,
    112,
    `${fontStyle}<rect width="480" height="112" rx="12" fill="#fcfcfd"/>${glyph(16, 16, 80, "#1c2024")}<text x="116" y="77" font-size="60" font-weight="600" letter-spacing="-1.2" fill="#1c2024">Maestro</text>`,
  ),
);
save(
  "docs/images/social-preview.svg",
  svg(
    1280,
    640,
    `${fontStyle}
    <defs>
      <clipPath id="screen"><rect x="50" y="212" width="1180" height="737.5" rx="12"/></clipPath>
      <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#1c2024" flood-opacity="0.12"/></filter>
    </defs>
    <rect width="1280" height="640" fill="#f0f0f3"/>
    ${glyph(50, 58, 72, "#1c2024")}
    <text x="142" y="118" font-size="64" font-weight="600" letter-spacing="-1.8" fill="#1c2024">Maestro</text>
    <text x="50" y="166" font-size="26" font-weight="400" fill="#60646c">See and steer your AI agent skills from one screen.</text>
    <rect x="50" y="212" width="1180" height="737.5" rx="12" fill="#fcfcfd" filter="url(#shadow)"/>
    <image x="50" y="212" width="1180" height="737.5" href="data:image/png;base64,${inventoryScreenshot}" clip-path="url(#screen)"/>
    <rect x="50" y="212" width="1180" height="737.5" rx="12" fill="none" stroke="#d9d9e0"/>`,
  ),
);
save(
  "docs/images/github-avatar.svg",
  svg(
    512,
    512,
    `<rect width="512" height="512" fill="#111113"/>${glyph(104, 104, 304, "#edeef0")}`,
  ),
);
save(
  "packages/web/public/apple-touch-icon.svg",
  svg(
    180,
    180,
    `<rect width="180" height="180" fill="#111113"/>${glyph(30, 30, 120, "#edeef0")}`,
  ),
);
console.log("Generated branding SVGs from maestro-mark.svg.");
