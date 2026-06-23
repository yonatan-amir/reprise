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
