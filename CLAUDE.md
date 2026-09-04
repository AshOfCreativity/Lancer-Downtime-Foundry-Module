# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A FoundryVTT module for the LANCER system: a standalone downtime-activity tracker built around a
timeline of GM-created "markers" (downtime periods), per-character action logs, and dice rolls.

**There is no build step and no test suite.** No `package.json`, no bundler, no linter config, no CI.
The repo ships exactly what Foundry loads: raw `.mjs` ES modules, one `.hbs` template, one `.css`
file, one `lang/en.json`. Do not add a build pipeline unless explicitly asked — `module.json` points
`esmodules` straight at `scripts/main.mjs`, and browsers resolve the relative `./x.mjs` imports.

## Testing changes (the only "test loop")

There are no automated tests. Verify in a running Foundry world:

1. Link or copy this repo into the Foundry data directory **under the exact name
   `Lancer-Downtime-Foundry-Module-main`** (see the module-ID quirk below):
   ```powershell
   New-Item -ItemType Junction `
     -Path "$env:LOCALAPPDATA\FoundryVTT\Data\modules\Lancer-Downtime-Foundry-Module-main" `
     -Target "C:\Users\delta\OneDrive\Desktop\AshOfCreativityWeb\Lancer-Downtime-Foundry-Module"
   ```
   (Foundry's modules live in `%LOCALAPPDATA%\FoundryVTT\Data\modules`. The module is not installed
   there as of this writing.) Alternatively install from the manifest URL in `module.json`.
2. Launch a world on the `lancer` system (>= 2.0.0), enable "LANCER Downtime Tracker".
3. Open the tracker: the moon icon in the **Notes** scene-control group, or the **Downtime** button
   injected into the Actor Directory header (GM only), or `game.modules.get("Lancer-Downtime-Foundry-Module-main").api.openTracker()`.
4. Reload the browser (F5) after editing `.mjs`, `.hbs`, `.css`, or `lang/en.json`. Only
   `module.json` changes require restarting Foundry.

The `api` object registered on the module in the `init` hook exposes nearly the whole data layer
(markers, character data, roll functions) — use the F12 console against it to exercise code paths
without clicking through the UI.

### Releasing

`manifest` and `download` in `module.json` point at the **`main` branch** raw file / auto-generated
zip, so merging to `main` publishes immediately. Bump `version` in `module.json` by hand; commit
messages follow `vX.Y.Z: <summary>`.

## The module-ID quirk (read before touching paths)

`MODULE_ID` is `"Lancer-Downtime-Foundry-Module-main"` — with the `-main` suffix — because the
`download` URL is a GitHub branch zip, which extracts to a `<repo>-main` folder (commit ac88574,
"Fix module id to match GitHub zip folder name"). Consequences:

- The Handlebars template is loaded as `modules/${MODULE_ID}/templates/downtime-app.hbs`, so the
  installed folder name must equal the ID or the app renders nothing.
- All actor flags and settings are namespaced under that string. Renaming it orphans every world's
  saved data; a rename needs a migration in the `ready` hook.
- The optional Far Field integration reads flags under `"Far-Field-Foundry-Module-main"` for the
  same reason (sibling repo `../Far-Field-Foundry-Module`).

## Architecture

### Entry point and hook flow

`scripts/main.mjs` is both the entry point **and the data-access layer**. It registers hooks:

- `init` — registers the five world settings, then publishes `game.modules.get(MODULE_ID).api`.
- `ready` — GM-only idempotent marker migrations (currently backfilling `order` and `characterIds`).
  This is the established place to add schema migrations for settings-stored data.
- `getSceneControlButtons` — pushes a tool into the `notes` control group.
- `renderActorDirectory` — injects a GM-only button into the directory header.

`main.mjs` also exports the getters/setters that everything else imports (`getMarkers`,
`getActiveMarker`, `addMarker`, `updateCharacterDowntimeData`, …). `DowntimeTrackerApp.mjs` and
`journal-sync.mjs` import back from `main.mjs`, so there are deliberate circular ESM imports — this
is fine at runtime but means new data helpers belong in `main.mjs`, not scattered.

### Persistence model

| Data | Where it lives |
| --- | --- |
| Markers (downtime periods) | world setting `markers` (array) |
| Currently selected marker | world setting `activeMarkerId` |
| LCP-imported action sets | world setting `customActionSets` |
| Enabled action set IDs | world setting `activeActionSets`, default `["lancer-core", "far-field"]` |
| Journal sync config | world setting `journalSyncConfig` |
| Per-character history/projects/stats | actor flag `flags["<MODULE_ID>"].data` |
| Far Field aspects/resources/burdens | actor flag `flags["Far-Field-Foundry-Module-main"].character` (read/written by `character-adapter.mjs`) |

All settings are `scope: "world", config: false` — none appear in Foundry's settings UI; they are
managed entirely through the app's dialogs. Shapes are defined in `scripts/constants.mjs`
(`getDefaultCharacterDowntimeData`, `createHistoryEntry`, `createMarker`).

Two conventions that are easy to break:

- **`marker.characterIds === []` means "all characters"**, not "none". The create/edit dialogs
  collapse a fully-checked list to `[]`, and `getData` expands `[]` back to every character.
- History entries are `unshift`ed (newest first) into the actor flag, but carry `markerId`; the
  timeline view re-aggregates across all actors and re-sorts by timestamp.

Journal sync (`journal-sync.mjs`) is a one-way export: it builds an HTML string from markers +
per-actor history and writes it into a page named `"Downtime Log"` on the configured `JournalEntry`,
creating the page if absent. Nothing reads back from the journal.

### UI layer

Single Application; **Foundry Application V1, jQuery-based** (`activateListeners(html)`,
`html.find(...)`) — not ApplicationV2. `compatibility` is minimum 11 / verified 12.

`DowntimeTrackerApp` is a module-level singleton in `main.mjs`. There is no reactive state: every
mutation path is *await the setter, then `this.render(false)`*. Transient view state
(`selectedCharacterId`, `filterCategory`, `pinnedMarkerId`) lives on the instance and survives
re-render; `_applyPinnedActions` re-applies the pinned-node CSS class after each render.

Templates: exactly one, `templates/downtime-app.hbs`, referenced directly via
`defaultOptions.template`. **There is no `loadTemplates` call, no registered partials, and no custom
Handlebars helpers** — only core helpers plus `{{localize}}`. Adding a second template means calling
`loadTemplates` in `init` yourself.

Styling is split, deliberately or otherwise: `styles/downtime-tracker.css` (loaded via `module.json`)
covers the main window, while **every Dialog and chat card injects its own `<style>` block inline in
the HTML string** it builds (see `_promptForNotes`, `renderRollDialogContent`, `renderPilotCheckChat`).
Colors are repeated as literals across those blocks — the result palette is
`triumph #ffd700 / success #1db954 / conflict #ff9800 / disaster #e94560`, and changing it means
touching all of them. Note also that the CSS class names are global (`.timeline-node`, `.action-card`)
rather than scoped under the app's `.downtime-tracker-app` class.

### Roll flow

`_onExecuteAction` → guard (character selected, `activeMarker.downtimeAllowed`) → `determineRollType`
→ `showRollDialog` → `executePilotCheck` / `executeDicePool` → `postRollToChat` → `_promptForNotes`
→ `_recordAction` (writes the actor flag, bumps `stats`, re-renders).

Two roll systems live in `roll-handler.mjs`:

- **Pilot check** (LANCER Core): `1d20`, accuracy/difficulty as `Nd6kh1` added/subtracted.
  Thresholds 20+/10+/1+ → triumph/success/conflict, else disaster.
- **Dice pool** (Far Field): `Xd6`, each 5-6 a success. 3+/2/1/0 → triumph/success/conflict/disaster.

`determineRollType` precedence: explicit `action.rollType` of `dice-pool`/`pool`/`recovery` → pool;
explicit `pilot-check` → pilot; character has Far Field flag → pool; `actionSetId === "far-field"` →
pool; `rollType === "skill"` → pilot; default pilot.

**Conditional modifiers** are the non-obvious design: a player can propose bonuses ("if my contact
helps") that need GM sign-off. Both functions roll the *full* dice set once — confirmed + conditional
— then slice the results into a `confirmed` outcome and a `potential` outcome, so the chat card can
truthfully show "if approved, this would have been X" without re-rolling. `CONDITIONAL_STATUS`
defines `PENDING/APPROVED/REJECTED`, but **only `PENDING` is ever assigned** — there is no approval
workflow, no socket handler, no GM button. The chat card is purely informational. `module.json`
declares `"socket": true` but no socket is ever opened.

## Localization

All keys are namespaced `DOWNTIME.*` in `lang/en.json` (English only). Templates use `{{localize}}`;
JS uses `game.i18n.localize` / `game.i18n.format`.

Two caveats: (1) `en.json` is much larger than the current UI — whole sub-trees (`Tabs`, `Session`,
`Projects`, `Settings`, `Dialogs.NewSession`, `Notifications`) are leftovers from an earlier
session-based design that the marker system replaced; don't assume a key is wired up just because it
exists. (2) Conversely, plenty of live UI strings are hardcoded English in JS — the entire Create
Marker dialog, the execute/notes dialogs, roll dialog labels, and all chat-card text. Prefer adding
`localize` calls when you touch those, but expect inconsistency.

## Dead / half-wired code (verify before extending)

- `scripts/lcp-handler.mjs` — LCP import (JSZip, `downtime_actions.json`, validation, storage) is
  fully written but **imported by nothing**. `showImportDialog` is unreachable from the UI.
- `scripts/character-adapter.mjs` — the `BaseCharacterAdapter` / `FarFieldCharacterAdapter` /
  `LancerPilotAdapter` hierarchy and `applyRecoveryEffects` / `applyTakeABreakEffects` are also
  **imported by nothing**. Action `effects` arrays in `downtime-actions.mjs` are declared but never
  applied to characters; only `roll-handler.mjs`'s ad-hoc `getBasePoolSize` reads Far Field aspects.
- Even if LCP import were wired up, custom sets would not appear: `getActionsFromSets` in
  `downtime-actions.mjs` only searches `getBuiltInActionSets()`, ignoring `customActionSets`.
  `getAllActionSets` in `main.mjs` does merge both, but the app calls `getActionsFromSets`.
- `PHASES` and `filterActionsByPhase` are defined and every built-in action declares `phases`, but
  nothing filters by phase — only category filtering is live.
- `createHistoryEntry(sessionId, …)` takes a `sessionId` that is never stored; callers pass `null`.

## Foundry version gotchas

Written against v11/v12 APIs that changed later:
`CONST.CHAT_MESSAGE_TYPES.ROLL` in `postRollToChat` is deprecated in v12 (replaced by
`CONST.CHAT_MESSAGE_STYLES`), and `addSceneControlButton` treats the `getSceneControlButtons`
argument as an **array** (`controls.find(c => c.name === "notes")`), which v13 changed to an object
keyed by control name. Both need updating before claiming v13 support.
