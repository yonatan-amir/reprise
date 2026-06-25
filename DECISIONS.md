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
- **Version timeline timestamp = the file's `mtime`, NOT discovery time.** On initial index we read
  the file's last-modified time via `fs.stat` and use *that* as the version's timeline timestamp, so
  files saved years ago keep their real dates and the timeline orders correctly (stamping
  `Date.now()` would flatten 50 historical versions to one instant). `mtime` not `birthtime`
  (birthtime is missing on some OSes and resets when a file is copied to a new drive). On overwrite
  ("update the version"), refresh the timestamp to the **new `mtime`** so the timeline reflects the
  latest save. **Schema impact (caught pre-refactor, as intended):** `createdAt` stops being
  repo-generated (`Date.now()`) and becomes **caller-supplied from `fs.stat().mtime`**; an optional
  `indexedAt = Date.now()` may be kept for internal bookkeeping but is not what the timeline shows.
