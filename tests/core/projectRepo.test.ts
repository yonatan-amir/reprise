import { describe, it, expect } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase } from '../../src/core/db'
import { createProject, listProjects, getProject } from '../../src/core/projectRepo'

function freshDb(): DatabaseSync {
  return openDatabase(':memory:')
}

describe('projectRepo', () => {
  it('creates a project and returns it with a generated id', () => {
    const db = freshDb()
    const project = createProject(db, { name: 'Summer Track', watchedPath: '/music/summer' })

    expect(project.name).toBe('Summer Track')
    expect(project.watchedPath).toBe('/music/summer')
    expect(project.id).toMatch(/^[0-9a-f-]{36}$/) // looks like a UUID
  })

  it('reads a created project back by id', () => {
    const db = freshDb()
    const created = createProject(db, { name: 'Track A', watchedPath: '/a' })

    expect(getProject(db, created.id)).toEqual(created)
  })

  it('returns null for an unknown id', () => {
    const db = freshDb()
    expect(getProject(db, 'no-such-id')).toBeNull()
  })

  it('lists all created projects', () => {
    const db = freshDb()
    createProject(db, { name: 'One', watchedPath: '/one' })
    createProject(db, { name: 'Two', watchedPath: '/two' })

    const all = listProjects(db)
    expect(all).toHaveLength(2)
    expect(all.map((p) => p.name).sort()).toEqual(['One', 'Two'])
  })

  it('rejects an empty name (Zod boundary validation)', () => {
    const db = freshDb()
    expect(() => createProject(db, { name: '', watchedPath: '/x' })).toThrow()
  })
})
