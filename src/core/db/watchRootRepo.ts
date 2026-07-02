import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { watchRoots, type WatchRoot } from './schema'
import { WatchRootInputSchema, type WatchRootInput } from './types'
import type { Db } from './connection'

export async function createWatchRoot(db: Db, input: WatchRootInput): Promise<WatchRoot> {
  const parsed = WatchRootInputSchema.parse(input) // validate untrusted input at the boundary
  const watchRoot: WatchRoot = { id: randomUUID(), path: parsed.path }

  await db.insert(watchRoots).values(watchRoot)
  return watchRoot
}

export async function listWatchRoots(db: Db): Promise<WatchRoot[]> {
  return db.select().from(watchRoots)
}

export async function getWatchRoot(db: Db, id: string): Promise<WatchRoot | null> {
  const rows = await db.select().from(watchRoots).where(eq(watchRoots.id, id))
  return rows[0] ?? null
}

export async function findWatchRootByPath(db: Db, path: string): Promise<WatchRoot | null> {
  const rows = await db.select().from(watchRoots).where(eq(watchRoots.path, path))
  return rows[0] ?? null
}
