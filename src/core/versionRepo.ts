import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { type Version, type VersionInput, VersionInputSchema, VersionSchema } from './types'

export function createVersion(db: DatabaseSync, input: VersionInput): Version {
  const parsed = VersionInputSchema.parse(input) // validate untrusted input at the boundary
  const version = {
    id: randomUUID(),
    projectId: parsed.projectId,
    watchRootId: parsed.watchRootId,
    sourceRelativePath: parsed.sourceRelativePath,
    fileHash: parsed.fileHash,
    savedAt: parsed.savedAt,
    versionLabel: parsed.versionLabel ?? null,
    sourceMissing: false,
    bouncePath: parsed.bouncePath ?? null,
    description: parsed.description ?? null
  }

  db.prepare(
    `INSERT INTO versions (id, projectId, watchRootId, sourceRelativePath, fileHash, savedAt,
versionLabel, sourceMissing, bouncePath, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    version.id,
    version.projectId,
    version.watchRootId,
    version.sourceRelativePath,
    version.fileHash,
    version.savedAt,
    version.versionLabel,
    version.sourceMissing ? 1 : 0,
    version.bouncePath,
    version.description
  )

  return version
}

/** List every version, newest-inserted order not guaranteed (we'll sort when it matters). */
export function listVersionsForProject(db: DatabaseSync, projectId: string): Version[] {
  const rows = db
    .prepare(
      'SELECT id, projectId, watchRootId, sourceRelativePath, fileHash, savedAt, versionLabel, sourceMissing, bouncePath, description FROM versions WHERE projectId = ? ORDER BY savedAt DESC'
    )
    .all(projectId)
  return rows.map((row) => VersionSchema.parse(row))
}

/** Get one version by id, or null if there's no match. */
export function getVersion(db: DatabaseSync, id: string): Version | null {
  const row = db
    .prepare(
      'SELECT id, projectId, watchRootId, sourceRelativePath, fileHash, savedAt, versionLabel, sourceMissing, bouncePath, description FROM versions WHERE id = ?'
    )
    .get(id)
  return row ? VersionSchema.parse(row) : null
}
