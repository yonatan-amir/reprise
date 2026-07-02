import { describe, it, expect } from 'vitest'
import { openDatabase, type Db } from '../../../src/core/db/connection'
import {
  createProject,
  listProjects,
  getProject,
  findProjectByName
} from '../../../src/core/db/projectRepo'

function freshDb(): Db {
  return openDatabase(':memory:')
}

describe('projectRepo', () => {
  it('creates a project and returns it with a generated id', async () => {
    const db = freshDb()
    const project = await createProject(db, { name: 'Summer Track' })

    expect(project.name).toBe('Summer Track')
    expect(project.id).toMatch(/^[0-9a-f-]{36}$/) // looks like a UUID
  })

  it('reads a created project back by id', async () => {
    const db = freshDb()
    const created = await createProject(db, { name: 'Track A' })

    expect(await getProject(db, created.id)).toEqual(created)
  })

  it('returns null for an unknown id', async () => {
    const db = freshDb()
    expect(await getProject(db, 'no-such-id')).toBeNull()
  })

  it('lists all created projects', async () => {
    const db = freshDb()
    await createProject(db, { name: 'One' })
    await createProject(db, { name: 'Two' })

    const all = await listProjects(db)
    expect(all).toHaveLength(2)
    expect(all.map((p) => p.name).sort()).toEqual(['One', 'Two'])
  })

  it('rejects an empty name (Zod boundary validation)', async () => {
    const db = freshDb()
    await expect(createProject(db, { name: '' })).rejects.toThrow()
  })

  it('rejects a duplicate project name (unique constraint)', async () => {
    const db = freshDb()
    await createProject(db, { name: 'Dup' })
    await expect(createProject(db, { name: 'Dup' })).rejects.toThrow()
  })

  it('finds project by name', async () => {
    const db = freshDb()
    await createProject(db, { name: 'p1' })

    const found = await findProjectByName(db, 'p1')
    expect(found?.name).toBe('p1')
    expect(await findProjectByName(db, 'nope')).toBeNull()
  })
})
