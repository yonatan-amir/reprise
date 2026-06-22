import { describe, it, expect, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase } from '../../src/core/db'
import { createProject } from '../../src/core/projectRepo'
import { createVersion, listVersionsForProject, getVersion } from '../../src/core/versionRepo'
import type { Project, VersionInput } from '../../src/core/types'

// Versions need a real parent project (foreign key), so spin up a db + one project.
function freshDbWithProject(): { db: DatabaseSync; project: Project } {
  const db = openDatabase(':memory:')
  const project = createProject(db, { name: 'P', watchedPath: '/p' })
  return { db, project }
}

function versionInput(projectId: string, tag: string): VersionInput {
  return { projectId, storedFilePath: `/stored/${tag}.als`, fileHash: `hash-${tag}` }
}

describe('versionRepo', () => {
  it('creates a version with a generated id and timestamp', () => {
    const { db, project } = freshDbWithProject()
    const v = createVersion(db, versionInput(project.id, 'a'))

    expect(v.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(v.createdAt).toBeGreaterThan(0)
    expect(v.projectId).toBe(project.id)
    expect(v.storedFilePath).toBe('/stored/a.als')
  })

  it('reads a version back by id', () => {
    const { db, project } = freshDbWithProject()
    const created = createVersion(db, versionInput(project.id, 'a'))
    expect(getVersion(db, created.id)).toEqual(created)
  })

  it('returns null for an unknown version id', () => {
    const { db } = freshDbWithProject()
    expect(getVersion(db, 'nope')).toBeNull()
  })

  it('stores absent optional fields as null (round-trip)', () => {
    const { db, project } = freshDbWithProject()
    const v = createVersion(db, versionInput(project.id, 'a'))
    expect(v.bouncePath).toBeNull()
    expect(v.description).toBeNull()
    expect(getVersion(db, v.id)?.bouncePath).toBeNull()
  })

  it('stores provided optional fields', () => {
    const { db, project } = freshDbWithProject()
    const v = createVersion(db, {
      ...versionInput(project.id, 'a'),
      bouncePath: '/bounces/a.wav',
      description: 'added reverb'
    })
    expect(v.bouncePath).toBe('/bounces/a.wav')
    expect(getVersion(db, v.id)?.description).toBe('added reverb')
  })

  it('lists versions for a project, newest first', () => {
    const { db, project } = freshDbWithProject()
    // Control the clock so each version gets a distinct, known createdAt.
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1000))
    const oldest = createVersion(db, versionInput(project.id, 'old'))
    vi.setSystemTime(new Date(2000))
    const middle = createVersion(db, versionInput(project.id, 'mid'))
    vi.setSystemTime(new Date(3000))
    const newest = createVersion(db, versionInput(project.id, 'new'))
    vi.useRealTimers()

    const list = listVersionsForProject(db, project.id)
    expect(list.map((v) => v.id)).toEqual([newest.id, middle.id, oldest.id])
  })

  it('rejects a version for a non-existent project (foreign key)', () => {
    const { db } = freshDbWithProject()
    const orphanProjectId = '00000000-0000-4000-8000-000000000000' // valid UUID, no such project
    expect(() => createVersion(db, versionInput(orphanProjectId, 'x'))).toThrow()
  })
})
