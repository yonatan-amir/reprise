import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { versions, type Version } from './schema'
import { VersionInputSchema, type VersionInput } from './types'
import type { Db } from './connection'

export async function createVersion(db: Db, input: VersionInput): Promise<Version> {
  const parsed = VersionInputSchema.parse(input) // validate untrusted input at the boundary
  const version: Version = {
    id: randomUUID(),
    projectId: parsed.projectId,
    watchRootId: parsed.watchRootId,
    sourceRelativePath: parsed.sourceRelativePath,
    fileHash: parsed.fileHash,
    savedAt: parsed.savedAt,
    versionLabel: parsed.versionLabel ?? null,
    sourceMissing: false,
    isBackup: parsed.isBackup,
    bouncePath: parsed.bouncePath ?? null,
    description: parsed.description ?? null
  }

  await db.insert(versions).values(version)
  return version
}

/** List a project's versions, newest first (by savedAt). */
export async function listVersionsForProject(db: Db, projectId: string): Promise<Version[]> {
  return db
    .select()
    .from(versions)
    .where(eq(versions.projectId, projectId))
    .orderBy(desc(versions.savedAt))
}

/** Get one version by id, or null if there's no match. */
export async function getVersion(db: Db, id: string): Promise<Version | null> {
  const rows = await db.select().from(versions).where(eq(versions.id, id))
  return rows[0] ?? null
}

/** Get one version by its path within a root, or null if there's no match. */
export async function findVersionByPath(
  db: Db,
  watchRootId: string,
  sourceRelativePath: string
): Promise<Version | null> {
  const rows = await db
    .select()
    .from(versions)
    .where(
      and(
        eq(versions.watchRootId, watchRootId),
        eq(versions.sourceRelativePath, sourceRelativePath)
      )
    )
  return rows[0] ?? null
}

/** Update savedAt and fileHash of one version by id, or throw if no match. */
export async function updateVersion(
  db: Db,
  id: string,
  fileHash: string,
  savedAt: number
): Promise<Version> {
  await db.update(versions).set({ fileHash, savedAt }).where(eq(versions.id, id))
  const updated = await getVersion(db, id)
  if (!updated) throw new Error(`updateVersion: no version with id ${id}`)
  return updated
}

/** Flag a version's source as missing (soft delete), or throw if no match. */
export async function markVersionMissing(db: Db, id: string): Promise<Version> {
  await db.update(versions).set({ sourceMissing: true }).where(eq(versions.id, id))
  const updated = await getVersion(db, id)
  if (!updated) throw new Error(`markVersionMissing: no version with id ${id}`)
  return updated
}

/** Clear a version's missing flag (resurrection), or throw if no match. */
export async function clearVersionMissing(db: Db, id: string): Promise<Version> {
  await db.update(versions).set({ sourceMissing: false }).where(eq(versions.id, id))
  const updated = await getVersion(db, id)
  if (!updated) throw new Error(`clearVersionMissing: no version with id ${id}`)
  return updated
}
