# Decisions log — Reprise

> Tactical / implementation decisions made *while building*. PLAN.md holds the fixed **strategy**
> (stack, scope, method — don't touch). This file records the **how** — choices that refine the
> architecture without changing what v1 is. Each entry: what we chose, why, and the escape hatch.
>
> Rule of thumb for adding here: a change is fair game if it helps ship a *better v1* without
> expanding scope or swapping the stack. New features / stack swaps / rabbit holes do **not** belong.

---

## M0 — Scaffold

- **Build tooling: electron-vite (Vite-based).** Scaffolded via `npm create @quick-start/electron`.
  It's *tooling*, not a stack change — compiles/bundles TS + React for Electron's 3 processes and
  gives hot-reload. Removable without affecting the Electron+React+TS stack.
- **Line endings: LF everywhere.** `.gitattributes` (`* text=auto eol=lf`) + `.vscode` `files.eol`.
  Prevents Windows↔Mac CRLF churn (this project is cross-platform).

## M1 — Core (data model + SQLite)

- **SQLite engine: `node:sqlite` (built into Node/Electron), not `better-sqlite3`.**
  Why: zero native compilation, no electron-rebuild / ABI-mismatch pain, works identically in
  standalone tests *and* the Electron app. Synchronous, clean API. Cost: marked "experimental"
  (prints a warning; API could shift). **Escape hatch:** isolated behind the repository layer
  (`src/core/*Repo.ts`) — swapping to better-sqlite3 or Postgres later is a one-file change.
- **IDs: UUID v4 via built-in `crypto.randomUUID()`.** No dependency. Ordering is handled by the
  `createdAt` field, so time-ordered v7 isn't needed at this scale (and v7 would need a library).
  Schema validates with `z.uuid()` (accepts any UUID version → not over-constrained).
  **Escape hatch:** id generation lives in one place (the repository).
- **Generated fields are filled by the repository, never the caller.** `id` (UUID) and
  `Version.createdAt` (epoch ms) are produced inside the repository's `create()` functions, not
  passed in. Enforced by *input schemas* (`ProjectInputSchema` / `VersionInputSchema` = the entity
  schema with generated fields `.omit()`ted) → impossible to forget or spoof. Chose repository-side
  generation over a SQLite `DEFAULT` so the "creation policy" stays in portable core (survives a DB
  swap) and `create()` can return the full record without a re-read.
- **Data model = Zod schemas as the single source of truth.** TS types are *derived* with
  `z.infer<typeof Schema>` (write the shape once). Schemas double as runtime validators at
  boundaries (IPC, file input) per the "validate at boundaries" rule.
- **Field rename: `Version.note` → `Version.description`.** Clearer name; tactical (no scope/stack
  change). PLAN.md + CLAUDE.md data model synced.
- **Optional fields use `.nullish()`; "absent" is stored as `NULL`.** SQLite/`node:sqlite` *throws*
  on binding `undefined`, and reads a missing column back as `null`. So the repo coalesces absent
  optionals to `null` once at object construction (`?? null`), and the schema accepts `null`.
- **IDs are typed `string`, not `node:crypto`'s `UUID` template type.** The *value* is a real UUID
  (enforced at runtime by `z.uuid()`); the *static type* is plain `string` to match the rest of the
  system. The template type doesn't truly validate a UUID and only causes friction. Lesson:
  annotate boundaries with the type the system speaks; let runtime validation guarantee format.
- **No pre-insert existence check for id collisions.** v4 collision probability is effectively zero,
  and `id TEXT PRIMARY KEY` makes the DB reject a dupe atomically anyway. Enforce uniqueness with a
  DB constraint, never a SELECT-then-INSERT race.

## M2 — Watch (in progress)

- **Storage model: INDEX, not vault — Reprise references files in place, it does NOT copy them.**
  *(Amends PLAN.md, which said "snapshot the file to app storage." Deliberate amendment, not drift.)*
  We store only pointers + metadata (path, hash, timestamp); the user's files stay where they save
  them. Why: (1) we are not adding collaboration, so copies buy nothing; (2) duplicating large DAW
  projects + samples across external drives is wasteful and fights a *global existing workflow*
  (everyone already saves to disk — don't replace it, just map it); (3) backup stays the user's
  responsibility. **Goal restated:** one place to *see/sync* projects across many directories/drives,
  with mutation (restore/change) offered only on request — never forced.
  **Trade (accepted, eyes open):** the headline weakens from "never lose a take" to *"never lose a
  take you kept on disk."* Save-as-new workflow (v1/v2/v3 files) → no loss. Overwrite/delete of a
  tracked file → that prior state is gone, because we only held a pointer. User confirmed this is
  fine ("overwrite is fine, only display what's there"). **Escape hatch:** copy-on-overwrite could
  guard *just* the overwrite case later — left out now to avoid the duplication we're rejecting.
  **Knock-on:** M6 Restore changes from "copy from vault" → "reveal / optionally copy the referenced
  file" (`shell.showItemInFolder` gives right-click → open folder for free). v1's definition of done
  is unchanged in shape.
- **The tracked unit is the *openable* project file, treated as an opaque blob.** We track the thing
  you double-click to open in the DAW (`.als`, Logic's openable project, etc.); in the timeline a
  version's primary action is **open-in-DAW** (`shell.openPath`). "Opaque" = we **fingerprint** the
  file with `fileHash` (to tell a real save from a no-op touch) but never **parse/interpret** its
  musical content. Keeps us out of the folder/package internals — **file-based formats first**
  (`.als`/`.flp`/`.cpr`/`.rpp`/`.song`); folder-packages (`.logicx`, PT sessions) stay parked.
- **Hashing is stream-friendly.** Reading a small `.als` whole is fine, but `hashFile` streams bytes
  through the hasher so RAM stays flat when we hash large `.wav` bounces in M4. Perf levers that
  actually matter: (1) don't watch junk (ignore sample/render dirs, filter by extension), (2) stream
  large-file hashes. The pure-logic-vs-chokidar-plumbing split costs nothing — it's just structure.
- **Watch scope: the whole root, recursively, filtered to project extensions** (`.als`, `.logicx`,
  `.flp`, …). Point at a root → any project file saved anywhere under it is caught; no per-project
  registration. **Scoping is the user's lever, not ours** — want less noise, pick a tighter root.
- **Event handling: liberal in, strict out.** Listen to both `add` and `change` (DAW atomic saves
  show up as bursts — temp write → unlink → rename — and "save-as new" shows up as a plain `add`);
  treat every such event as a *candidate*, then collapse the burst (debounce) and decide if it's
  really new (hash) downstream. We do NOT try to detect one precise "save done" event per DAW/OS.
- **Temp files are ignored entirely — no live tracking, no orphan-recovery scan.** A real temp
  vanishes the instant it becomes the save (and is corrupt/locked while mid-write, so reading it is
  useless); leftover temps (crashed/temp exports DAWs never clean up) are junk, not lost work.
- **Drive resilience: only the WatchRoot stores an absolute path; everything under it is relative.**
  Root carries `path` + `status` (online/offline). **Offline ≠ deleted:** drive unplugged → grey out,
  keep entries; file removed while the drive is online → reflect the removal ("display what's there").
- **Resync model: index-once-then-watch; recovery = manual drop + full re-index (NO auto-relink).**
  *(Supersedes the earlier `volumeLabel` auto-find idea — user chose the simpler manual path.)* On
  adding a root we index every existing project file once (chokidar fires `add` for existing files),
  then watch for changes. If a drive letter changes / it can't be reached, the user **drops the sync
  and re-adds the folder** for a full re-scan. **Metadata survives the resync:** re-discovered files
  are reconciled to existing version records **by `fileHash`** (matching content → re-attach, not a
  fresh record), so notes/bounces are never lost to a re-scan. (Reconciliation UI = M3.)
- **Offline-vs-deleted disambiguation (LOCKED): gate every `unlink` on root reachability.** Before
  honoring a file-gone event, `fs.access` the watch root. Root reachable + file gone → genuine
  deletion. Root unreachable → drive disconnected → flip root `offline`, grey out, change nothing.
  Stops a yanked USB drive from marking the whole catalog as deleted.
  **On a genuine (external) deletion: soft-flag, don't hard-remove.** Mark the version
  `sourceMissing` (grey it out) but keep the row + its notes/bounces. If the file was actually
  *moved*, hash-reconcile snaps it back automatically; an explicit "purge" is the only thing that
  truly removes the record. So an external delete is non-destructive to *our* data by design.
- **SCOPE FLAG — needs a deliberate v1-vs-v2 call, NOT M2: Reprise as a two-way file manager.** User
  wants delete-version / rename / full CRUD on the *actual* files, "replace directory browsing," not
  just a preview. This **expands locked v1 scope** — PLAN.md v1 mutation = *Restore only*, no
  delete/rename file-management — and it's **destructive** (erases real user files → needs
  confirm/undo). Deferred on purpose: M2 is the *watcher* (reacts to external changes only);
  user-initiated CRUD needs UI (M3+) to exist at all. Caught the "one more feature" pull early — this
  is the exact failure mode the project guards against. **Free win already in the design:** external
  renames are absorbed by hash-reconcile (same content, new path → update the version's path, not a
  new row). Batch-rename-that-also-renames-the-parent-folder = explicitly later.
  **Delete model for that future CRUD (user's framing, captured for later):** asymmetric — delete
  *on disk* (external) → Reprise **keeps** it greyed (soft, per the rule above); delete *in the app*
  → **propagates** and removes the real file too (hard). Confirm/undo design comes with that work.
- **Multiple roots: one chokidar watcher PER root** (not one watcher spanning many paths). Each root
  has an independent lifecycle (online/offline, add, drop-and-resync), so isolating one watcher per
  root means a disconnecting drive / dropped root / per-root error never disturbs the others. Cost (a
  few watcher instances) is negligible at handful-of-roots scale. Startup: for each saved root →
  check reachability → online: start watcher (initial index, then live); offline: mark offline, don't
  start. Add root → start a watcher; drop root → close it + remove records.
- **chokidar config: native fs events + `awaitWriteFinish`, extension-filter in the handler.**
  `usePolling:false` (native events — lighter; works on local + USB drives, Win + Mac).
  `awaitWriteFinish` with ~300–500ms stability window = the agreed "save settled" debounce (also
  absorbs the atomic-save temp→rename burst). `ignoreInitial:false` + the `ready` event to know the
  initial index finished (everything after `ready` is a live save). Filter to project extensions in
  our handler (temps/samples never match). **Parked risk:** network/odd filesystems may not emit
  native events → per-root `usePolling:true` fallback if it ever comes up (not now).
- **Grouping: one Project (song) → many Versions, keyed on the filename BASE — folder name ignored.**
  This is what makes the M5 A/B feature possible. **Base extraction is conservative — only strip an
  *explicit* trailing version marker** (` v3`, `_v3`, `ver 3`, `version 3`, `(3)`, `copy`), then
  normalize (lowercase, collapse `_ - . space`). **Never strip a bare number/date** (`song 2023`
  stays `song 2023`, so it can't wrong-merge with `song 2024`). Same base → same project. The rule
  *refuses to guess* on ambiguous names → worst case is **over-split** (extra projects the user can
  merge), **never wrong-merge** — which is the cardinal sin (user's principle). The Project name is
  the stripped base; **the Version keeps its original token as its label** (`just a lie v7.als` alone
  → Project "just a lie", one Version labeled `v7`).
- **Same base across folders/drives → auto-group into one Project; source path shown on demand.**
  A toggle/expander reveals each version's path so the user can locate or disambiguate. Accepted
  residual risk: generic default names (`Untitled` ×5 across folders) auto-group into one messy
  project — a *soft* wrong-merge, but **visible** (path display) and **reversible** (manual split,
  M3), so it never silently destroys anything. Transparency over forcing. Base-extraction itself is a
  pure, testable function in `core`; the merge/split + path-toggle UI is M3.
- **Duplicates across locations: transparency, never force.** The same `song v1` on two drives shows
  as **two** Versions (labeled by source); the user decides (rename / keep both / ignore). We never
  silently merge or auto-pick. Goal is transparency, not forcing a workflow change. This is the
  default behavior of the model (each file = its own row), so "force a resolution" is the feature we
  *omit*, not one we build.
- **FORWARD-NOTE (M4/M5, NOT M2): a Version owns *many* exports, not one.** Current schema has
  `Version.bouncePath?` (single). The real model is one-to-many (a version has several `.wav`
  mixes/masters to A/B). Deliberately deferred to the Bounce (M4) + A/B-player (M5) milestones —
  pulling it into M2 would balloon the watcher. Think it through *there*, with full attention.
- **Settle + write rule (the watcher's core loop).** On a file event: (1) **`awaitWriteFinish`**
  (chokidar) holds until the file size is stable — mid-write files are never acted on or displayed.
  Then (2) hash the settled file and branch: **new file path → INSERT a Version** (this is how
  save-as-new `v1/v2/v3` become three versions); **known path + different hash → UPDATE that
  Version** (overwrite; old bytes weren't copied, so one row per real file is the honest truth);
  **known path + identical hash → SKIP** (DAW touched the file without a real edit). Deletion while
  the drive is online → remove/mark that Version; drive offline → grey out, keep. `fileHash` (2a) is
  the foundation this whole branch depends on.
- **Base-extraction spec (LOCKED) — the marker allow-list + the save convention.** `extractProjectBase`
  is a *coward*: it strips a trailing version marker **only** when it's unmistakable, and **never**
  guesses. The grouping contract: *no naming mistake can cause data loss or a silent wrong-merge —
  worst case is over-split, which M3 fixes by hand.*
  - **STRIP these explicit trailing markers** (case-insensitive, any separator `_ - . space`):
    `v3` / `_v3` / `-v3` / ` v3` (a `v` followed by digits) · `ver 3` · `version 3` · `(3)`
    (parenthesized number = the OS "duplicate file" convention) · `copy` / `copy 2`.
  - **LEAVE ALONE (never strip):** bare trailing numbers (`song 3`, `song3`), years/dates
    (`song 2024`), and **leading** numbers (`34song`). These are too ambiguous — stripping them risks
    wrong-merging `song 2023` with `song 2024`, the cardinal sin.
  - **Then normalize** what's left: lowercase + collapse/trim separators, so `Song`, `song `, `song`
    all match. The result is the Project key (same key → same Project).
  - **Worked cases:** `afterblue_lost_in_open_water v3` → `afterblue lost in open water` (groups with
    `v4`); `song23`/`song24` → stay separate ✅; `untitled1`/`untitled2` → stay separate ✅;
    `34song`/`35song` → stay separate (over-split if meant as versions — safe, mergeable in M3);
    `Untitled`×5 → group into one messy-but-visible-and-splittable project (accepted residual risk).
  - **The user's lever = the save convention (to be surfaced in-app later):** keep the song name
    *identical* across versions; mark the version as a trailing `v` suffix (`afterblue v2`,
    `afterblue_v3`); avoid leading/bare-number versioning (`34song`, `song 3`); give unrelated songs
    distinct names (don't both be `Untitled`). Follow it → rock-solid grouping; ignore it → at worst
    over-split. The algorithm handles the unambiguous; the user steers the rest (same philosophy as
    "pick a tighter watch root for less noise"). Manual merge/split UI = M3.
- **Base-extraction (real-data revision, ~980 of the user's files).** Strip Ableton's
  ` [YYYY-MM-DD HHMMSS]` backup timestamp; treat `v<n>` as a **cut point** (free text + timestamp follow
  it — `V21 flatten`, `v25 ... right direction now`, decimals like `V2.1`/`V0.1.1.1`), keeping the prefix
  as the base. Algorithm: lowercase → strip extension → cut at first version marker → (if none) strip
  trailing ` [timestamp]` → normalize. **Principle: UNIVERSAL patterns → algorithm; PERSONAL conventions
  → user config.** Timestamp + `v<n>` are universal (every Ableton user emits them). The user's client
  prefix (`afterblue -`) and ordering prefixes (`2.`/`10.`) are personal → **deferred** to a future
  user-configurable prefix strip-list + a client/project organization view (**v2+, NOT v1**). Until then
  they over-split safely (visible, mergeable in M3) — never wrong-merge.
- **Multi-DAW audit (Cubase `.cpr` + Logic `.logicx` in the user's real library).**
  - **Cubase auto-backups = `.bak` (and `.tmp`) — EXCLUDE from the watcher's allow-list.** Cubase emits
    rolling `Name-02.bak … Name-10.bak` by the dozen; they're not openable projects, just noise. Brick 3
    (the watcher) must filter these out.
  - **Cubase versioning = trailing `-NN`** (its "Save New Version": `Afterblue-01.cpr`,
    `studio-02 Export Ready.cpr`) — a *cut point* like Ableton's `V<n>`. **DECIDED: NOT stripped.** A
    `-\d` cut would carry a wrong-merge risk (a name genuinely ending `-<digits>` like `tr-808` vs
    `tr-909` would fuse to `tr`) — and wrong-merge is the cardinal sin. So pure-`-NN` Cubase saves
    **over-split** (preserved as-is) and the user merges them manually in M3. (Combined names like
    `... Comped V2-01` still group, because the leftmost `V`-cut eats the `-01` too.) Revisit only if
    real users want it — and then with a tighter guard.
  - **Logic `.logicx` is a PACKAGE, not a file** — a directory on Windows, a double-click bundle on macOS
    (like `.app`). Brick 2 (name parsing) handles it fine; the file-vs-package complexity is entirely a
    **brick-3** concern (hashing + watching a directory-as-a-unit; Logic churns many internal files per
    save). No-separator markers seen here too (`turn out the lightsV2`, `Project0`) → over-split, accepted.
  - **OPEN SCOPE QUESTION (decide at brick 3, NOT now): does v1 track Logic packages?** Strong product
    case — Ableton+FL+Logic are the big three; skipping Logic misses ~⅓ of users (NOT the PLAN "NOT v1"
    list, so fair to revisit). Tension: packages need watch-the-folder-as-a-unit + how-to-hash-a-dir,
    which the locked "file-based first" deferral was avoiding. Resolve when designing the watcher.
- **FORWARD-NOTE (M3 grouping, NOT M2): per-DAW version/backup recognition using filename pattern +
  folder layout.** Insight: machine-generated markers (Cubase `-NN`, Ableton `[timestamp]`) are
  *deterministic* — the DAW writes them identically every time, no user input — so a per-DAW rule can
  *trust* them, unlike a hand-typed `v3 mastered`. Folder layout corroborates (Ableton → `Backup/`
  subfolder; Cubase → `.bak` beside the project; Logic → inside the `.logicx` package). Pattern +
  location together = wrong-merge-proof. This is the safe home for Cubase `-NN` auto-grouping (via
  sibling/base corroboration, since pure single-filename brick 2 lacks the file-set context) AND for
  telling *backups to ignore* (`.bak`) from *real prior states* (Ableton `[timestamp]`). Keeps brick 2
  pure + safe; the DAW-aware intelligence lives in the grouping layer.
- **In-app file operations (merge/rename/delete) — split into safe-now vs destructive-later.**
  - **Index merge/split (v1, M3): non-destructive.** Because storage is an index of pointers, merging
    two over-split groups is a DB reassignment — files never move or get renamed. This is the safety net
    that makes every "over-split is fine" decision valid. Reveal-in-Finder + open-in-DAW + Restore round
    out v1's "act from inside the app" without mutating files.
  - **Destructive in-app CRUD (rename/delete real files) = planned v1.1, NOT v1.** User wants full
    in-platform file management (find/rename/delete lost versions without leaving the app) — a good
    product direction, but it changes PLAN's locked v1 mutation scope (*Restore only*) and is
    *destructive* (data-loss liability → needs confirm/undo/trash). It also **depends on the watcher +
    hash-reconciliation existing and being solid** (an in-app rename fires `unlink`+`add` that must
    reconcile to the same version, not delete+new). So it's sequenced as the first v1.1 feature: built
    deliberately on a proven engine, after v1 core ships. Deferring it protects the finish-one-thing goal.
- **v1 DAW support = the seven SINGLE-FILE formats; packages deferred.** The watcher's allow-list
  (`isProjectFile` / `PROJECT_EXTENSIONS`) covers: `.als` (Ableton), `.flp` (FL Studio), `.cpr` (Cubase),
  `.rpp` (Reaper), `.song` (Studio One), `.ptx` (Pro Tools), `.bwproject` (Bitwig). Adding a single-file
  DAW is just one more string → near-zero cost, so support them all. **Logic `.logicx` + GarageBand
  `.band` are packages (directories)** → NOT in v1's first list: the blocker isn't the predicate (a string
  match would return true trivially) but the *watcher* — chokidar fires on the package's INNER files (never
  the `.logicx` folder itself), and `hashFile` can't stream a directory. So the extension only earns its
  place alongside package-watching code (recognize package → treat folder as a unit → ignore internal churn
  → hash specially). **Whether v1 includes package-watching = the open scope decision, made when designing
  the watcher (brick 3).** Allow-list = the filter; anything not listed (`.bak`, `.rpp-bak`, `.wav`, …) is
  rejected implicitly — no explicit exclude list needed.
- **DECIDED (user, release-blocking): Logic Pro IS in v1 — package-watching moves INTO M2's watcher.**
  Supersedes the "packages deferred / fast-follow" lean above. Rationale: Logic is a top-3 DAW and the
  user's primary one; shipping without it makes v1 half-useless to him, and it's not in PLAN's "NOT v1"
  wall (that's cloud/plugin/collab). **v1 will not release without Logic.** Cost (accepted): the watcher
  must handle TWO modes — single files *and* packages (watch the `.logicx`/`.band` folder as a unit,
  debounce internal churn, hash the package as a whole). **Guardrail (keeps it bounded): treat the
  package as an OPAQUE unit** — fingerprint to detect a real save, never parse Logic's internal format
  (that would be a months-long rabbit hole; same opaque-blob rule as `.als`). GarageBand (`.band`,
  also a package) likely rides along for free once package-watching exists. Exact package approach
  (how to hash a directory, how to debounce internal saves) designed first thing at brick 3.
- **Version timeline timestamp = the file's `mtime`, NOT discovery time.** On initial index we read
  the file's last-modified time via `fs.stat` and use *that* as the version's timeline timestamp, so
  files saved years ago keep their real dates and the timeline orders correctly (stamping
  `Date.now()` would flatten 50 historical versions to one instant). `mtime` not `birthtime`
  (birthtime is missing on some OSes and resets when a file is copied to a new drive). On overwrite
  ("update the version"), refresh the timestamp to the **new `mtime`** so the timeline reflects the
  latest save. **Schema impact (caught pre-refactor, as intended):** `createdAt` stops being
  repo-generated (`Date.now()`) and becomes **caller-supplied from `fs.stat().mtime`**; an optional
  `indexedAt = Date.now()` may be kept for internal bookkeeping but is not what the timeline shows.
- **Spike finding (live, real Ableton on Windows, 2026-06-30 — brick-3 throwaway watcher).** Confirmed
  against real saves: (1) a single save is a ~10-event **burst** — Ableton shuffles `AbletonTmp-*`
  scratch files, then writes the real `.als` last → `awaitWriteFinish` + the `isProjectFile` gate
  collapse it to the one event that matters; every temp/`Desktop.ini`/`.ico`/`addDir` was rejected by
  the extension allow-list, 100% noise filtered. (2) **new project = `add`, overwrite = `change`** on
  the `.als` — maps straight onto `decideVersionAction`'s two branches. (3) a **rename = `unlink` + `add`**
  (no rename event) — exactly why hash-reconcile, not path, identifies a moved file. (4) Ableton **wraps
  every project in its own `<name> Project/` folder**; the `.als` sits one level down, so the watcher
  must be **recursive** (it is) — and note this folder is just a container around a real standalone
  `.als` we can hash normally, *unlike* a Logic `.logicx` package where the folder itself is the project.
- **Ableton `Backup/` files are KEPT and FLAGGED in M2 — the drawer UI stays M3.** *(Refines the
  earlier "purely M3" note below; user decision 2026-06-30.)* Observed live: on overwrite, Ableton
  auto-writes a timestamped copy of the *previous* save into a `Backup/` subfolder
  (`test Project\Backup\test [2026-06-30 112036].als`). It's a real `.als`, so it passes `isProjectFile`.
  **User call:** genuine prior versions = free history → don't discard, but don't clutter the main
  timeline. **The M2 split:** the watcher *indexes* backups like any version AND tags each one with a new
  `Version.isBackup` boolean (routing data the watcher can compute cheaply now, from the `Backup/` path
  segment). The **segregation UI** (a separate "backups" drawer inside the project) stays **M3** — it just
  reads the flag instead of re-deriving it. Why flag-in-M2 is free: the schema isn't persisted yet
  (step 5 hasn't created a real `reprise.db`), so adding the column now costs nothing; adding it after
  first launch would need a migration. Detection signal = a `Backup` path segment (Ableton); other DAWs'
  backup conventions can extend `isBackupPath` later. Don't pull the drawer UI into the watcher.
- **FORWARD-NOTE (M3, superseded above for the flag): original "purely M3" framing.** Kept for history:
  the first call was to do *nothing* in M2 and detect backups entirely in M3 by folder layout + timestamp.
  Revised to flag-in-M2 (above) so M3 sorts on a stored boolean rather than re-scanning paths.

### Brick-3 (watcher) completion — ordered task list A→C (locked 2026-06-30)

> The watcher's pure bricks (`fileHash`, `decideVersionAction`, `extractProjectBase`, `isProjectFile`)
> are done. These are the remaining tasks to finish brick 3, in implementation order. Yonatan types;
> Claude reviews. All core work is TDD with a `:memory:` db.

- **Phase A — core data layer (TDD, prerequisites; do before any wiring):**
  - **A1 `findWatchRootByPath(db, path)`** — mirror `getWatchRoot` with `WHERE path = ?`. Needed for
    find-or-create on the WatchRoot; `path` is UNIQUE, so a 2nd launch calling `createWatchRoot` on the
    same path would throw and the app wouldn't start.
  - **A2 `clearVersionMissing(db, id)`** — exact mirror of `markVersionMissing` (`SET sourceMissing = 0`),
    same return-the-row / throw-on-missing-id contract. Needed for resurrection: a flagged-missing file
    whose drive returns hashes to `skip`, so without this the `sourceMissing` flag would never clear.
  - **A3 schema: add `Version.isBackup` boolean** (default `0/false`) to `versions` table (`db.ts`),
    `VersionSchema` + `VersionInputSchema` (`types.ts`, default `false` so existing inputs/tests are
    unaffected), and `createVersion`'s INSERT. Free now because no real DB exists yet (see Backup note).
  - **A4 `isBackupPath(relativePath)` core fn (TDD)** — `true` when a path segment equals `Backup`
    (Ableton). The signal `recordUpsert` uses to set `isBackup`. Extension point for other DAWs later.
- **Phase B — orchestration seam + plumbing (testable core, thin main):**
  - **B7 `src/core/recordFileEvent.ts` (TDD)** — the orchestration, fs-free so it tests with `:memory:`:
    - `recordUpsert(db, { watchRootId, sourceRelativePath, fileHash, savedAt }) → { action, version }`:
      `findVersionByPath` → `decideVersionAction(fileHash, existing?.fileHash ?? null)`.
      **add** → `base = extractProjectBase(basename(relPath)) || basename` (empty-base fallback, C3);
      `findProjectByName(base) ?? createProject({ name: base })`; `isBackup = isBackupPath(relPath)`;
      `createVersion(...)`; `action: 'added'`. **update** → `updateVersion(existing.id, fileHash, savedAt)`;
      if `existing.sourceMissing` → `clearVersionMissing`; `action: 'updated'`. **skip** → if
      `existing.sourceMissing` → `clearVersionMissing` + `action: 'resurrected'`, else `action: 'skipped'`.
    - `recordRemoval(db, { watchRootId, sourceRelativePath }) → { action, version? }`: `findVersionByPath`
      → found ⇒ `markVersionMissing`, `action: 'flagged'`; not found ⇒ `action: 'untracked'`. **Reachability
      is NOT here** — the watcher decides whether to call this (keeps core fs-free).
    - Folds in: **B1** path normalized to relative+`/` (done in watcher before calling), **B2** basename,
      **B3** `savedAt = Math.floor(mtimeMs)` (done in watcher), **B4** add/change unified, **B6** resurrection.
  - **B8 `src/main/log.ts`** — ~5-line logger wrapper (silenceable in tests) replacing the placeholder
    `console.log`s. The global "no console.log" rule is treated as N/A for the Electron main process.
- **Phase C — watcher hardening + wiring (integration; step 5 + step 6):**
  - **C-queue (D17, in v1): serial event queue in the watcher.** Chain each `handleEvent` off the previous
    (promise tail) so no two interleave. Kills three initial-scan hazards at once: same-new-project-name
    race (two files → both `createProject` → UNIQUE throw), same-path race, and the FD/memory storm from
    hashing the whole library in parallel. ~6 lines; real risk on the user's ~2,000-file library.
  - **D2 `watcher.on('error', …)`** — chokidar emits `error` (perms, drive yanked mid-scan); unhandled can
    crash. **D1 `watcher.close()` on app quit** — minor hygiene for M3 folder-reselect.
  - **Step 5 wiring (`index.ts`):** `openDatabase(join(app.getPath('userData'),'reprise.db'))` →
    `findWatchRootByPath(path) ?? createWatchRoot({ path })` → pass `db` + `watchRootId` + `rootPath` into
    a widened `startWatcher`.
  - **Step 6 (`watcher.ts`):** queued `handleEvent` computes `sourceRelativePath` (B1) + `savedAt` (B3) +
    `fileHash`, then calls `recordUpsert`; on `unlink`, `fs.access(rootPath)` gate (B5) → reachable ⇒
    `recordRemoval`, unreachable ⇒ nothing. Log the returned `action`.
  - **C1 (optional, judgment): startup re-hash short-circuit** — if a version exists and
    `Math.floor(mtimeMs) === stored savedAt`, skip the hash (still clear `sourceMissing` if flagged).
    Optimization for big-library startup; can defer.
  - **C4 (deferred to Mac): Logic `.logicx`/`.band` package mode** — the "resolve tracked unit" seam (map
    inner-file event up to the package; hash the directory) slots into the watcher's fs layer; core
    (`recordUpsert`/`recordRemoval`) is unchanged. Can't observe a package save on Windows (no Logic).

## Data layer — Drizzle ORM on `node:sqlite` (decided mid-M2, 2026-06-30)

> **Detour taken DELIBERATELY mid-Phase-A** (paused at A4 `isBackupPath`). Triggered by the raw-SQL repos
> causing repeated, avoidable bugs (hand-aligned column / `?` / value lists drifting — bit us twice on the
> `isBackup` add). User decided to fix the foundation now, **while the surface is small (3 repos)**, rather
> than carry the fragility forward. This is the user's call, eyes open; not a stack switch.

- **NOT a stack change — the locked stack holds.** SQLite, Electron, React, TypeScript all unchanged.
  This swaps only the *access layer*: hand-written SQL strings → a typed layer. Postgres was floated and
  **rejected** — it's a server DB, wrong for a local single-user desktop app (PLAN.md locks SQLite). The
  real itch was "better ergonomics over the SQLite I already have," not "a bigger database."
- **Two-layer mental model (this is what untangled the confusion):** Layer 1 = the *engine/driver* that
  reads the `.db` file (`node:sqlite` vs `better-sqlite3` vs `libsql`); Layer 2 = the *typed code you write*
  (Drizzle vs Kysely vs raw SQL). You pick one from each; they compose. Kysely is **not** an engine — it's
  Drizzle's competitor at Layer 2 and would sit on the same Layer-1 engines.
- **Layer 1 = `node:sqlite` (LOCKED). The deciding factor: no native module, ever.** `node:sqlite` is built
  into Node/Electron — nothing to compile, `electron-rebuild`, or `asarUnpack`, and the *same* code runs in
  vitest (plain Node) and in Electron. `better-sqlite3`/`libsql` are native modules → recurring per-build,
  per-OS (Win+Mac) packaging tax + a vitest-vs-Electron ABI mismatch. For a solo dev shipping cross-platform,
  "no native module" is a *permanent* durability win that outweighs `node:sqlite` being newer. (Research
  confirmed `better-sqlite3` = the multi-day Electron yak-shave we were right to avoid.)
- **Layer 2 = Drizzle (LOCKED, over Kysely).** User wanted "define the schema in ONE place, then read
  `object.property`, like Rails." That's Drizzle. The lone Kysely advantage was "you write the SQL yourself
  and learn it" — but the user is already comfortable with SQL + Rails and explicitly prioritized
  **maintainability over learning reps**, which removes Kysely's edge. Drizzle gives: one schema file →
  generated TS types (`$inferSelect`) → optional `drizzle-zod` validators (one source of truth, kills the
  drift that caused the bugs), and `integer({ mode: 'boolean' })` auto-maps `0/1 ↔ true/false` (kills the
  manual `? 1 : 0` + `z.coerce.boolean()`).
- **Version: `drizzle-orm` pinned to `1.0.0-rc.4` (no caret).** The `drizzle-orm/node-sqlite` driver exists
  **only in the 1.0-rc line** (stable 0.45.x lacks it). Accepted tradeoff: an rc dependency on a local
  learning app, **pinned** (+ committed lockfile) so it can't drift; bump to `1.0.0` final when it lands
  (a one-line change, ~weeks away — rc.4 API is effectively frozen). This is the *only* real cost of the
  node:sqlite path and it's temporary. Drizzle moves faster than Kysely between versions → pinning matters.
- **Spike GREEN (gate passed before migrating anything):** throwaway `tests/core/drizzle-spike.test.ts`
  proved `drizzle-orm/node-sqlite` resolves, `drizzle({ client: new DatabaseSync() })` works on `:memory:`,
  insert+select round-trips, and `mode: 'boolean'` returns a real `true`. Driver is **async** (`await`), so
  repo functions become `async` (fine — the watcher's already async; tests gain `await`).
- **Drizzle DSL is NOT Active Record (intentional).** Headless ORM: rows are plain typed data (no
  `row.save()`), relations are fetched explicitly (`db.query.projects.findFirst({ with: { versions: true }})`),
  no model callbacks. For a small app this is *more* maintainable than fat models; full Active Record
  (TypeORM/MikroORM) was considered heavier/more-magic and **not** adopted.
- **Migrations: `drizzle-kit` is NOT installed and NOT used (for now).** drizzle-kit (the Rails-migrations
  equivalent) **does not support `node:sqlite`**. So table creation stays as the existing idempotent raw
  `CREATE TABLE IF NOT EXISTS` in `db.ts`. Only `drizzle-orm` is a dependency (no `drizzle-kit`/`dotenv`/`tsx`
  from the tutorial — those are standalone-demo scaffolding this project doesn't need). **FORWARD-NOTE:** once
  v1 has shipped and users hold real `reprise.db` files with data, a schema change in v1.1 will need genuine
  migrations — likely hand-written conditional `ALTER TABLE`s applied via `node:sqlite` `exec()`. Designed
  then, not now.
- **Zod retreats to true boundaries.** Drizzle types DB rows, so the on-every-read `Schema.parse(row)` becomes
  redundant; keep Zod for genuinely untrusted input (IPC payloads, file paths) — or generate those validators
  from the Drizzle schema via `drizzle-zod`.
- **Migration plan (brick by brick, tests green after each):** (1) ✅ spike gate; (2) write `src/core/schema.ts`
  (the one file: `projects`, `watch_roots`, `versions` + relations + `$inferSelect` types); (3) keep raw
  `CREATE TABLE` in `db.ts`; (4) repoint `Version`/`Project`/`WatchRoot` types to `$inferSelect`; (5) migrate
  repos smallest-first (`watchRootRepo` → `projectRepo` → `versionRepo`), green after each; (6) decide Zod's
  boundary role. **THEN resume the watcher at A4 `isBackupPath`** (the only Phase-A brick left — it's pure, no
  DB, unaffected by this migration).
