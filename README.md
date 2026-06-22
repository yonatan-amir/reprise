# Reprise

A local, cross-platform desktop app that **auto-versions your music projects** and lets you
**A/B compare versions** — never lose a take, and hear exactly what changed between saves.

- **Platforms:** Windows + macOS
- **Stack:** Electron + React + TypeScript + SQLite (local, no cloud in v1)
- **Status:** v1 in progress — see [`PLAN.md`](./PLAN.md) for the fixed scope and build order.

## Why

Built by a producer who got tired of "final_v3_REALfinal.als" and of not being able to hear
what changed between two versions of a mix. Reprise watches your projects folder, snapshots a
version on every save, and lets you flip between versions' audio instantly.

## Run (after M0 scaffold)

```bash
npm install
npm run dev
```

See `PLAN.md` for milestones M0–M7.
