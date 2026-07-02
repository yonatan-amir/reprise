import { describe, it, expect } from 'vitest'
import { openDatabase, type Db } from '../../../src/core/db/connection'
import {
  createWatchRoot,
  listWatchRoots,
  getWatchRoot,
  findWatchRootByPath
} from '../../../src/core/db/watchRootRepo'

function freshDb(): Db {
  return openDatabase(':memory:')
}

describe('watchRootRepo', () => {
  it('creates a watchRoot and returns it with a generated id', async () => {
    const db = freshDb()
    const watchRoot = await createWatchRoot(db, { path: '/p' })

    expect(watchRoot.path).toBe('/p')
    expect(watchRoot.id).toMatch(/^[0-9a-f-]{36}$/) // looks like a UUID
  })

  it('reads a created watchRoot back by id', async () => {
    const db = freshDb()
    const created = await createWatchRoot(db, { path: '/p' })

    expect(await getWatchRoot(db, created.id)).toEqual(created)
  })

  it('returns null for an unknown id', async () => {
    const db = freshDb()
    expect(await getWatchRoot(db, 'no-such-id')).toBeNull()
  })

  it('lists all created watchRoots', async () => {
    const db = freshDb()
    await createWatchRoot(db, { path: '/p1' })
    await createWatchRoot(db, { path: '/p2' })

    const all = await listWatchRoots(db)
    expect(all).toHaveLength(2)
    expect(all.map((p) => p.path).sort()).toEqual(['/p1', '/p2'])
  })

  it('rejects an empty path (Zod boundary validation)', async () => {
    const db = freshDb()
    await expect(createWatchRoot(db, { path: '' })).rejects.toThrow()
  })

  it('rejects a duplicate watchRoot path (unique constraint)', async () => {
    const db = freshDb()
    await createWatchRoot(db, { path: '/p' })
    await expect(createWatchRoot(db, { path: '/p' })).rejects.toThrow()
  })

  it('finds a watchRoot by path', async () => {
    const db = freshDb()
    const created = await createWatchRoot(db, { path: '/p1' })
    await createWatchRoot(db, { path: '/p2' })

    expect((await findWatchRootByPath(db, '/p1'))?.id).toBe(created.id)
    expect(await findWatchRootByPath(db, '/nope')).toBeNull()
  })
})
