# Maestro branding

The approved Convergence M mark lives in
`packages/web/src/assets/maestro-mark.svg`. The app uses it directly.
Run `node scripts/brand-assets.mjs` to regenerate the SVG exports.

The README uses the wordmark and real Inventory screenshots in both themes.
`social-preview.png` is the 1280 × 640 GitHub social preview, combining the
wordmark and tagline with the real light-theme Inventory screenshot.
`github-avatar.png` is a square export for branding. A repository has no
separate avatar setting; changing the owner's avatar would affect other repos.

To regenerate PNGs, open their SVG exports in `agent-browser`, set the
viewport to the SVG's dimensions, wait for fonts, and take a screenshot.
Use 32 × 32 for the PNG favicon, 180 × 180 for the Apple touch icon,
512 × 512 for the avatar and 1280 × 640 for the social preview.
