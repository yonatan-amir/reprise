# CLAUDE.md — Reprise

> **START HERE (new session):** Read `PLAN.md` (source of truth, FIXED) — or `plan.html` for the
> visual version. Then confirm the **current status** below and continue from the resume point.
> Do **not** re-open settled decisions (stack, scope). The thinking is done; the job now is _doing_.

## Current status — resume point

- **As of 2026-06-25:** **M1 done.** **M2 (Watch) fully designed — see `DECISIONS.md` → "M2 — Watch"
  for the locked spec.** Storage is an **INDEX (pointers to real files, no copying)**, not a copy-vault
  — this overrides the "snapshot to app storage" wording in PLAN.md. **M2 schema refactor DONE,
  committed & pushed: 20 `tests/core` passing** (`types.ts`, `db.ts`, `projectRepo`, `watchRootRepo`,
  `versionRepo` all on the index model).
- **`fileHash` (2a) DONE** (TDD, committed): `hashBuffer` (one-shot, `node:crypto`) + streamed
  `hashFile` (read-stream → `update`/`digest`), validated against canonical SHA-256 vectors. **22
  `tests/core` passing**, typecheck + lint clean.
- **M2 pure bricks DONE** (all TDD, committed & pushed, 26 `tests/core` passing, typecheck + lint clean):
  `decideVersionAction` (add/update/skip), `extractProjectBase` (DAW-aware project grouping — validated
  against ~1,966 real files; Ableton `[timestamp]` strip + `v<n>` cut-point + edge-trim; Cubase `-NN` and
  client prefixes deliberately over-split), `isProjectFile` (extension allow-list gate — seven single-file
  DAW formats). See `DECISIONS.md` → "M2 — Watch" for the (now extensively expanded) real-data spec.
- **▶ Resume at brick 3 — the chokidar watcher** (`src/main`, integration not pure TDD). Ties the bricks
  together: one watcher per `WatchRoot`, `awaitWriteFinish`, `isProjectFile` gate → `fs.stat` (mtime) +
  `hashFile` → `decideVersionAction` → `extractProjectBase` → repo write. **Logic Pro IS required for v1
  (user decision, release-blocking)** — so the watcher must handle BOTH single files AND packages
  (`.logicx`/`.band` watched as an opaque folder-unit, hashed whole, internal churn debounced); design the
  package approach first, before wiring. User types the code; review per `reprise-working-mode`.
- Update this line at the end of each milestone (e.g. "M2 done, resume at M3").

## What this is

A **local, cross-platform (Windows + macOS) desktop app** that auto-versions music projects and
A/B-compares versions (you can _hear_ what changed between saves). v1 is **local only, no cloud.**
It is the buildable cloud/organization half of the user's bigger "patchbay" idea — NOT the C++ plugin.

## Hard rules — do not let the user (or yourself) break these

- **Stack is LOCKED: Electron + React + TypeScript + SQLite.** NOT C++, NOT Rust, NOT Tauri.
  If asked to switch, point to PLAN.md → "Why Electron, why not C++." (Settled: the app is
  I/O-bound, not CPU-bound, so C++ buys nothing and costs months. This question has come up
  repeatedly — hold the line; that's what the user asked for.)
- **No scope creep.** Nothing from PLAN.md "NOT v1" (cloud, plugin-chain capture, cross-DAW
  conversion, collaboration, payments, AI) until v1 ships.
- **Build to learn.** The user understands every line. AI tutors and explains; it does NOT
  silently generate code he can't read or debug. (Past pain: patchbay was AI-generated vapor he
  couldn't use — do not repeat that here.)
- **One milestone at a time** (M0→M7). Each one runs and is tested before the next. Commit at the
  end of each milestone.
- **No "learn X first" gates.** New bits (Electron IPC, etc.) are learned _while building_.

## Architecture

- `src/core/` — pure TS, **no Electron/React imports** (versioning, hashing, data model). Decoupled
  so cloud / shell-swap is possible later without a rewrite.
- `src/main/` — Electron main: chokidar file-watch, fs, SQLite, IPC. Thin; calls core.
- `src/renderer/` — React UI; talks to main via IPC.

## Data model (M2 index model — see `DECISIONS.md` for rationale)

- `WatchRoot { id, path }` — the only absolute path; online/offline status is runtime-derived, not stored
- `Project { id, name }` — `name` unique (the grouping key = conservative filename base)
- `Version { id, projectId, watchRootId, sourceRelativePath, fileHash, savedAt, versionLabel?, sourceMissing, bouncePath?, description? }`
  - `sourceRelativePath` = pointer relative to its root (not a copy); `savedAt` = file `mtime` (caller-supplied), not discovery time; `sourceMissing` soft-flags an on-disk deletion. `bouncePath?`/`description?` are M4 (and `bouncePath` becomes one-to-many then).

## Conventions

- Follow the user's global TS rules: explicit types on public APIs, no `any` (use `unknown` +
  narrow), immutable updates, Zod at boundaries, no `console.log` in committed code.
- Many small focused files. Keep `core` framework-free.

## Context (so a fresh session understands the stakes)

The user (Yonatan) is a music producer + self-taught dev (Le Wagon, deep Udemy, 42 Berlin C/systems;
real shipped app = `mixedbyyonatan`). **This project is his deliberate "finish ONE real thing"
effort** — the entire point is _shipping it_, not perfecting it. His known failure modes are
(1) switching stacks/lanes, (2) not finishing, (3) over-engineering / reaching for the hard tool.
Protect against all three. Bigger frame: his real goal is a **music-artist career**; software is
the **income scaffold** that funds it, and Reprise is both a finishable proof piece and a rung
toward his long-term "patchbay" north star. Encourage finishing; resist scope creep and stack
debates.
