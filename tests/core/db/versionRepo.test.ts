import { describe, it, expect } from 'vitest'
import { openDatabase, type Db } from '../../../src/core/db/connection'
import { createProject } from '../../../src/core/db/projectRepo'
import {
  createVersion,
  listVersionsForProject,
  getVersion,
  findVersionByPath,
  updateVersion,
  markVersionMissing,
  clearVersionMissing
} from '../../../src/core/db/versionRepo'
import type { Project, WatchRoot } from '../../../src/core/db/schema'
import type { VersionInput } from '../../../src/core/db/types'
import { createWatchRoot } from '../../../src/core/db/watchRootRepo'

// Versions need a real parent project (foreign key), so spin up a db + one project.
async function freshDbWithProject(): Promise<{ db: Db; project: Project; watchRoot: WatchRoot }> {
  const db = openDatabase(':memory:')
  const project = await createProject(db, { name: 'P' })
  const watchRoot = await createWatchRoot(db, { path: '/P' })
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
    savedAt,
    isBackup: false
  }
}

describe('versionRepo', () => {
  it('creates a version with a generated id and timestamp', async () => {
    const { db, project, watchRoot } = await freshDbWithProject()
    const v = await createVersion(db, versionInput(project.id, watchRoot.id, 'a', 1234))
    expect(v.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(v.savedAt).toBe(1234)
    expect(v.projectId).toBe(project.id)
    expect(v.sourceRelativePath).toBe('a.als')
    expect(v.sourceMissing).toBe(false)
  })

  it('reads a version back by id', async () => {
    const { db, project, watchRoot } = await freshDbWithProject()
    const created = await createVersion(db, versionInput(project.id, watchRoot.id, 'a', 1234))
    expect(await getVersion(db, created.id)).toEqual(created)
  })

  it('returns null for an unknown version id', async () => {
    const { db } = await freshDbWithProject()
    expect(await getVersion(db, 'nope')).toBeNull()
  })

  it('stores absent optional fields as null (round-trip)', async () => {
    const { db, project, watchRoot } = await freshDbWithProject()
    const v = await createVersion(db, versionInput(project.id, watchRoot.id, 'a', 1234))
    expect(v.bouncePath).toBeNull()
    expect(v.description).toBeNull()
    expect((await getVersion(db, v.id))?.bouncePath).toBeNull()
  })

  it('stores provided optional fields', async () => {
    const { db, project, watchRoot } = await freshDbWithProject()
    const v = await createVersion(db, {
      ...versionInput(project.id, watchRoot.id, 'a', 1234),
      bouncePath: '/bounces/a.wav',
      description: 'added reverb'
    })
    expect(v.bouncePath).toBe('/bounces/a.wav')
    expect((await getVersion(db, v.id))?.description).toBe('added reverb')
  })

  it('lists versions for a project, newest first', async () => {
    const { db, project, watchRoot } = await freshDbWithProject()
    const oldest = await createVersion(db, versionInput(project.id, watchRoot.id, 'old', 1000))
    const middle = await createVersion(db, versionInput(project.id, watchRoot.id, 'mid', 2000))
    const newest = await createVersion(db, versionInput(project.id, watchRoot.id, 'new', 3000))

    const list = await listVersionsForProject(db, project.id)
    expect(list.map((v) => v.id)).toEqual([newest.id, middle.id, oldest.id])
  })

  it('rejects a version for a non-existent project (foreign key)', async () => {
    const { db, watchRoot } = await freshDbWithProject()
    const orphanProjectId = '00000000-0000-4000-8000-000000000000' // valid UUID, no such project
    await expect(
      createVersion(db, versionInput(orphanProjectId, watchRoot.id, 'x', 1234))
    ).rejects.toThrow()
  })

  it('only returns versions for the requested project', async () => {
    const db = openDatabase(':memory:')
    const project1 = await createProject(db, { name: 'projectA' })
    const project2 = await createProject(db, { name: 'projectB' })
    const watchRoot = await createWatchRoot(db, { path: '/p' })
    await createVersion(db, versionInput(project1.id, watchRoot.id, 'a'))
    await createVersion(db, versionInput(project2.id, watchRoot.id, 'b'))
    await createVersion(db, versionInput(project2.id, watchRoot.id, 'c'))

    const p1Versions = await listVersionsForProject(db, project1.id)
    expect(p1Versions).toHaveLength(1)
    expect(p1Versions.every((v) => v.projectId === project1.id)).toBe(true)
    expect(await listVersionsForProject(db, project2.id)).toHaveLength(2)
  })

  it('finds version by path', async () => {
    const db = openDatabase(':memory:')
    const project1 = await createProject(db, { name: 'projectA' })
    const project2 = await createProject(db, { name: 'projectB' })
    const watchRoot1 = await createWatchRoot(db, { path: '/p' })
    const watchRoot2 = await createWatchRoot(db, { path: '/d' })

    await createVersion(db, versionInput(project1.id, watchRoot1.id, 'a'))
    await createVersion(db, versionInput(project2.id, watchRoot1.id, 'b'))
    await createVersion(db, versionInput(project2.id, watchRoot2.id, 'a'))

    const found = await findVersionByPath(db, watchRoot1.id, 'a.als')
    expect(found?.projectId).toBe(project1.id)
    expect(found?.fileHash).toBe('hash-a')
    expect(await findVersionByPath(db, watchRoot1.id, 'missing.als')).toBeNull()
  })

  it("updates a version's hash and savedAt, leaving other fields intact", async () => {
    const { db, project, watchRoot } = await freshDbWithProject()
    const v = await createVersion(db, versionInput(project.id, watchRoot.id, 'a', 1000))
    await updateVersion(db, v.id, 'hash-b', 2000)

    const after = await getVersion(db, v.id)
    expect(after?.fileHash).toBe('hash-b') // content refreshed
    expect(after?.savedAt).toBe(2000) // timestamp refreshed
    expect(after?.sourceRelativePath).toBe('a.als') // path untouched
  })

  it('flags a version as missing without deleting it', async () => {
    const { db, project, watchRoot } = await freshDbWithProject()
    const v = await createVersion(db, versionInput(project.id, watchRoot.id, 'a', 1000))
    expect(v.sourceMissing).toBe(false) // sanity: starts present

    await markVersionMissing(db, v.id)

    const after = await getVersion(db, v.id)
    expect(after).not.toBeNull() // row still exists — not deleted
    expect(after?.sourceMissing).toBe(true) // just flagged
  })

  it('flags a missing version as present', async () => {
    const { db, project, watchRoot } = await freshDbWithProject()
    const v = await createVersion(db, versionInput(project.id, watchRoot.id, 'a', 1000))
    expect(v.sourceMissing).toBe(false) // sanity: starts present

    await markVersionMissing(db, v.id)

    const after = await getVersion(db, v.id)
    expect(after).not.toBeNull() // row still exists — not deleted
    expect(after?.sourceMissing).toBe(true) // just flagged

    await clearVersionMissing(db, v.id)

    const last = await getVersion(db, v.id)
    expect(last).not.toBeNull() // row still exists — not deleted
    expect(last?.sourceMissing).toBe(false) // flag clear
  })

  it('stores isBackup and round-trips it', async () => {
    const { db, project, watchRoot } = await freshDbWithProject()
    const normal = await createVersion(db, versionInput(project.id, watchRoot.id, 'a'))
    expect(normal.isBackup).toBe(false) // default for a normal save

    const backup = await createVersion(db, {
      ...versionInput(project.id, watchRoot.id, 'b'),
      isBackup: true
    })
    expect(backup.isBackup).toBe(true)
    expect((await getVersion(db, backup.id))?.isBackup).toBe(true) // survives the DB round-trip
  })
})
