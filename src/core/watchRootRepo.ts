import { randomUUID } from 'node:crypto'
import { type WatchRoot, type WatchRootInput, WatchRootInputSchema, WatchRootSchema } from './types'
import type { DatabaseSync } from 'node:sqlite'

export function createWatchRoot(db: DatabaseSync, input: WatchRootInput): WatchRoot {
  const parsed = WatchRootInputSchema.parse(input)
  const watchRoot: WatchRoot = { id: randomUUID(), ...parsed }

  db.prepare(`INSERT INTO watch_roots (id, path) VALUES (?, ?)`).run(watchRoot.id, watchRoot.path)
  return watchRoot
}

export function listWatchRoots(db: DatabaseSync): WatchRoot[] {
  const rows = db.prepare(`SELECT id, path FROM watch_roots`).all()
  return rows.map((row) => WatchRootSchema.parse(row)) // validate data coming OUT of the DB too
}

export function getWatchRoot(db: DatabaseSync, id: string): WatchRoot | null {
  const row = db.prepare(`SELECT id, path FROM watch_roots WHERE id = ?`).get(id)
  return row ? WatchRootSchema.parse(row) : null
}
