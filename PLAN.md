# Reprise — Build & Ship Plan (FIXED)

**One line:** A local, cross-platform (Windows + macOS) desktop app that auto-versions your
music projects and lets you A/B compare versions — so you never lose a take and can _hear_
what changed between saves.

> "Reprise" is a working name (musical term: a repeat). Rename it freely. **The plan does not change. The name can.**

---

## ⚠ THE ONE RULE THAT MAKES THIS WORK: THIS PLAN IS FIXED

History: 4+ half-learned stacks, plus music, DSP, and patchbay — all unfinished, because the
plan kept changing every time it got hard or a shinier idea appeared. The single thing that
decides whether this ships is **not changing the plan.**

When you feel the pull to: switch the stack, add "just one more feature," learn a new language
first, or rebuild it "properly in C++" — **that pull is the exact thing that has cost you
years.** Re-read this section instead of acting on it.

**Locked. Not up for re-litigation:**

- Stack = **Electron + React + TypeScript.** NOT C++. NOT Rust. NOT Tauri.
- Scope = the v1 list below. Nothing from "NOT v1" gets added until v1 ships.
- Method = **build to learn** (AI as tutor, you understand every line). No "study first" gate.
- **One milestone at a time.** Finish and run the current one before starting the next.

---

## Why Electron, why NOT C++ (settled — do not reopen)

- This app is **I/O-bound, not CPU-bound.** It watches a folder (idle), copies a file on save
  (disk-bound), and plays back a rendered audio file (the OS/codec does that). None of it is
  real-time audio. **C++ buys zero speed here** — the disk and sound hardware are the
  bottleneck, not your code.
- You already know JS/TS/React/Node = ~90% of Electron. Electron = Node + Chromium. The only
  new bits are main-vs-renderer, IPC, and packaging — about a day, learned while building.
- Cross-platform (Win + Mac) is free in Electron from one codebase. C++ cross-platform GUI +
  a hand-built React bridge is weeks of pain for no benefit.
- **C is real (42), but C ≠ C++**, and "almost done with a C++ course" ≠ "can ship a
  cross-platform C++ GUI+audio app." Multi-month gap, zero payoff for this app.
- **Where C++ DOES belong:** the long-term north star — _patchbay's_ in-DAW plugin (real-time
  audio genuinely needs C++). Keep learning C++ on the side for THAT. It is not part of Reprise.

---

## v1 — what ships (and nothing more)

**IN:**

- Pick folder(s) to watch (handles any DAW / both OSes — you point it at where projects live)
- Auto-snapshot a version when a project file changes (debounced)
- Attach an audio bounce + a note to a version (manual)
- Version timeline per project
- **A/B audio player** — two versions, level-matched, instant toggle
- Restore a version

**NOT v1 (the wall / later — do NOT add now):**

- Cloud sync, accounts, multi-device → v2
- Plugin-chain capture, chain reuse, cross-DAW conversion → patchbay (the boss level)
- Collaboration, payments, AI features
- Auto-rendering bounces (impossible outside the DAW — that's why bounces are attached manually)

---

## Architecture (this is what keeps the long road open)

- `src/core/` — **pure TS, no Electron/React imports**: versioning, hashing/dedup, data model.
  This decoupling is what lets you add cloud or swap the shell later WITHOUT a rewrite.
- `src/main/` — Electron main process: file watching (chokidar), fs, SQLite, IPC. Thin — calls core.
- `src/renderer/` — React UI only. Talks to main via IPC.

---

## Data model

- `Project { id, name, watchedPath }`
- `Version { id, projectId, createdAt, storedFilePath, bouncePath?, description?, fileHash }`

---

## Build order — milestones (each one RUNS and is tested before the next)

- **M0 — Scaffold:** Electron + React + TS starter; window opens. (e.g. `npm create @quick-start/electron@latest`)
- **M1 — core:** data model + SQLite read/write, tested standalone (no UI).
- **M2 — Watch:** folder picker (Electron dialog) + chokidar; on change → snapshot file + write Version.
- **M3 — UI:** projects list → version timeline (read from DB via IPC).
- **M4 — Bounce + note:** attach an audio file + note to a version.
- **M5 — A/B player:** Web Audio, two sources, level-match, instant toggle.
- **M6 — Restore:** copy a version back / reveal in folder.
- **M7 — Package:** electron-builder → Windows installer + Mac .dmg.

---

## Definition of DONE (v1)

You can: point it at a folder → see versions auto-appear when you save in your DAW → attach a
bounce → A/B two versions in the app → restore one — **packaged and running on Windows and Mac.**
When that's true, v1 is DONE. Ship it. Only THEN consider v2.

---

## Reality check (read when you doubt it's worth it)

- Finishing this = you become someone who **finishes** — the muscle missing under everything else.
- It's a real portfolio piece, and it closes your "can't work without AI" gap (because you build it).
- It improves job odds; it does **not** guarantee a job or income. Keep the job search running in parallel.
- The dream is **music.** Reprise is a rung toward patchbay + a scaffold skill — not the dream itself.
