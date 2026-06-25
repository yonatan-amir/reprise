import { describe, it, expect } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase } from '../../src/core/db'
import { createProject } from '../../src/core/projectRepo'
import { createVersion, listVersionsForProject, getVersion } from '../../src/core/versionRepo'
import type { Project, VersionInput, WatchRoot } from '../../src/core/types'
import { createWatchRoot } from '../../src/core/watchRootRepo'

// Versions need a real parent project (foreign key), so spin up a db + one project.
function freshDbWithProject(): { db: DatabaseSync; project: Project; watchRoot: WatchRoot } {
  const db = openDatabase(':memory:')
  const project = createProject(db, { name: 'P' })
  const watchRoot = createWatchRoot(db, { path: '/P' })
  return { db, project, watchRoot }
}

function versionInput(
  projectId: string,
  watchRootId: string,
  tag: string,
  savedAt = 1000
): VersionInput {
  return {
    projectId,
    watchRootId,
    sourceRelativePath: `${tag}.als`,
    fileHash: `hash-${tag}`,
    savedAt
  }
}

describe('versionRepo', () => {
  it('creates a version with a generated id and timestamp', () => {
    const { db, project, watchRoot } = freshDbWithProject()
    const v = createVersion(db, versionInput(project.id, watchRoot.id, 'a', 1234))
    expect(v.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(v.savedAt).toBe(1234)
    expect(v.projectId).toBe(project.id)
    expect(v.sourceRelativePath).toBe('a.als')
    expect(v.sourceMissing).toBe(false)
  })

  it('reads a version back by id', () => {
    const { db, project, watchRoot } = freshDbWithProject()
    const created = createVersion(db, versionInput(project.id, watchRoot.id, 'a', 1234))
    expect(getVersion(db, created.id)).toEqual(created)
  })

  it('returns null for an unknown version id', () => {
    const { db } = freshDbWithProject()
    expect(getVersion(db, 'nope')).toBeNull()
  })

  it('stores absent optional fields as null (round-trip)', () => {
    const { db, project, watchRoot } = freshDbWithProject()
    const v = createVersion(db, versionInput(project.id, watchRoot.id, 'a', 1234))
    expect(v.bouncePath).toBeNull()
    expect(v.description).toBeNull()
    expect(getVersion(db, v.id)?.bouncePath).toBeNull()
  })

  it('stores provided optional fields', () => {
    const { db, project, watchRoot } = freshDbWithProject()
    const v = createVersion(db, {
      ...versionInput(project.id, watchRoot.id, 'a', 1234),
      bouncePath: '/bounces/a.wav',
      description: 'added reverb'
    })
    expect(v.bouncePath).toBe('/bounces/a.wav')
    expect(getVersion(db, v.id)?.description).toBe('added reverb')
  })

  it('lists versions for a project, newest first', () => {
    const { db, project, watchRoot } = freshDbWithProject()
    const oldest = createVersion(db, versionInput(project.id, watchRoot.id, 'old', 1000))
    const middle = createVersion(db, versionInput(project.id, watchRoot.id, 'mid', 2000))
    const newest = createVersion(db, versionInput(project.id, watchRoot.id, 'new', 3000))

    const list = listVersionsForProject(db, project.id)
    expect(list.map((v) => v.id)).toEqual([newest.id, middle.id, oldest.id])
  })

  it('rejects a version for a non-existent project (foreign key)', () => {
    const { db, watchRoot } = freshDbWithProject()
    const orphanProjectId = '00000000-0000-4000-8000-000000000000' // valid UUID, no such project
    expect(() =>
      createVersion(db, versionInput(orphanProjectId, watchRoot.id, 'x', 1234))
    ).toThrow()
  })

  it('only returns versions for the requested project', () => {
    const db = openDatabase(':memory:')
    const project1 = createProject(db, { name: 'projectA' })
    const project2 = createProject(db, { name: 'projectB' })
    const watchRoot = createWatchRoot(db, { path: '/p' })
    createVersion(db, versionInput(project1.id, watchRoot.id, 'a'))
    createVersion(db, versionInput(project2.id, watchRoot.id, 'b'))
    createVersion(db, versionInput(project2.id, watchRoot.id, 'c'))

    const p1Versions = listVersionsForProject(db, project1.id)
    expect(p1Versions).toHaveLength(1)
    expect(p1Versions.every((v) => v.projectId == project1.id)).toBe(true)
    expect(listVersionsForProject(db, project2.id)).toHaveLength(2)
  })
})
