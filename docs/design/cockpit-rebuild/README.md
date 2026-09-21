# Cockpit rebuild — frozen mocks

The nine mocks the wayfinder map ([#984](https://github.com/fimoklei/maestro/issues/984))
produced, exported from their claude.ai artifacts on **2026-09-21** and kept here
unchanged. Every rebuild ticket builds from these files, not from the live
artifacts: an artifact can change or disappear, and an agent without the Artifact
tool cannot read one.

**A mock gives layout and behaviour only.** Colour, size and spacing come from the
tokens (`.impeccable/design.json` → `packages/web/src/styles/tokens.css`), never
from what a mock happens to paint. See `.claude/rules/design.md`.

| Mock | File | Decision ticket | Artifact |
|---|---|---|---|
| Navigation shell | `navigation-shell.html` | [#991](https://github.com/fimoklei/maestro/issues/991) | [15ce24c6](https://claude.ai/code/artifact/15ce24c6-a307-454c-a918-005dd51d01ac) |
| Inventory | `inventory.html` | [#992](https://github.com/fimoklei/maestro/issues/992) | [01635d57](https://claude.ai/code/artifact/01635d57-a48a-45d9-a1e1-b6a9950ceb0a) |
| Deploy-state | `deploy-state.html` | [#993](https://github.com/fimoklei/maestro/issues/993) | [31cca4db](https://claude.ai/code/artifact/31cca4db-7a81-4e3a-a14d-e19480fad3ae) |
| Harness | `harness.html` | [#994](https://github.com/fimoklei/maestro/issues/994) | [3b0ff394](https://claude.ai/code/artifact/3b0ff394-771b-4fe3-8c3d-fc985a1fd10c) |
| Repositories | `repositories.html` | [#1009](https://github.com/fimoklei/maestro/issues/1009) | [882dc3db](https://claude.ai/code/artifact/882dc3db-97fb-41b6-87a1-cef71ec44933) |
| Connect gate and Settings | `connect-gate-and-settings.html` | [#995](https://github.com/fimoklei/maestro/issues/995) | [5018eddf](https://claude.ai/code/artifact/5018eddf-97e7-49ee-8372-012bbb52a88b) |
| Feedback patterns | `feedback-patterns.html` | [#1003](https://github.com/fimoklei/maestro/issues/1003) | [297a3aca](https://claude.ai/code/artifact/297a3aca-1938-4e87-ad14-452fddc66a3b) |
| Folder picker in Import and the gate | `folder-picker.html` | [#1013](https://github.com/fimoklei/maestro/issues/1013) | [d4084fad](https://claude.ai/code/artifact/d4084fad-bceb-419b-849d-116a9c4fddc7) |
| Loading | `loading.html` | [#898](https://github.com/fimoklei/maestro/issues/898) | [e03c14f8](https://claude.ai/code/artifact/e03c14f8-a028-4cd5-81fb-1139bcb012ff) |

## Opening one

Open the file directly in a browser (`file://…`). Each is a self-contained Claude
Design canvas: it pans and zooms, and it is read-only — saving needs the live
artifact. The only network request is Geist from `fonts.googleapis.com`; without
it the page still renders, in the fallback system font.

To change a mock, edit the artifact and export it here again, with the date above.
