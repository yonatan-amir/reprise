import { describe, it, expect } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase } from '../../src/core/db'
import { createWatchRoot, listWatchRoots, getWatchRoot } from '../../src/core/watchRootRepo'

function freshDb(): DatabaseSync {
  return openDatabase(':memory:')
}

describe('watchRootRepo', () => {
  it('creates a watchRoot and returns it with a generated id', () => {
    const db = freshDb()
    const watchRoot = createWatchRoot(db, { path: '/p' })

    expect(watchRoot.path).toBe('/p')
    expect(watchRoot.id).toMatch(/^[0-9a-f-]{36}$/) // looks like a UUID
  })

  it('reads a created watchRoot back by id', () => {
    const db = freshDb()
    const created = createWatchRoot(db, { path: '/p' })

    expect(getWatchRoot(db, created.id)).toEqual(created)
  })

  it('returns null for an unknown id', () => {
    const db = freshDb()
    expect(getWatchRoot(db, 'no-such-id')).toBeNull()
  })

  it('lists all created watchRoots', () => {
    const db = freshDb()
    createWatchRoot(db, { path: '/p1' })
    createWatchRoot(db, { path: '/p2' })

    const all = listWatchRoots(db)
    expect(all).toHaveLength(2)
    expect(all.map((p) => p.path).sort()).toEqual(['/p1', '/p2'])
  })

  it('rejects an empty name (Zod boundary validation)', () => {
    const db = freshDb()
    expect(() => createWatchRoot(db, { path: '' })).toThrow()
  })

  it('rejects a duplicate watchRoot name (unique constrains ', () => {
    const db = freshDb()
    createWatchRoot(db, { path: '/p' })
    expect(() => createWatchRoot(db, { path: '/p' })).toThrow()
  })
})
