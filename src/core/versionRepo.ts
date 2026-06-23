import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { type Version, type VersionInput, VersionInputSchema, VersionSchema } from './types'

/**
 * Create a project. The caller passes only { name, watchedPath } — we generate the id,
 * so it can never be forgotten or faked. Returns the full Project.
 */
export function createVersion(db: DatabaseSync, input: VersionInput): Version {
  const parsed = VersionInputSchema.parse(input) // validate untrusted input at the boundary
  const version = {
    id: randomUUID(),
    createdAt: Date.now(),
    projectId: parsed.projectId,
    storedFilePath: parsed.storedFilePath,
    fileHash: parsed.fileHash,
    bouncePath: parsed.bouncePath ?? null, // undefined → null (SQLite can't bind undefined)
    description: parsed.description ?? null
  }

  db.prepare(
    `INSERT INTO versions (id, projectId, createdAt, storedFilePath, bouncePath, description,
fileHash)
    VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    version.id,
    version.projectId,
    version.createdAt,
    version.storedFilePath,
    version.bouncePath,
    version.description,
    version.fileHash
  )

  return version
}

/** List every version, newest-inserted order not guaranteed (we'll sort when it matters). */
export function listVersionsForProject(db: DatabaseSync, projectId: string): Version[] {
  const rows = db
    .prepare(
      'SELECT id, projectId, createdAt, storedFilePath, bouncePath, description, fileHash FROM versions WHERE projectId = ? ORDER BY createdAt DESC'
    )
    .all(projectId)
  return rows.map((row) => VersionSchema.parse(row))
}

/** Get one version by id, or null if there's no match. */
export function getVersion(db: DatabaseSync, id: string): Version | null {
  const row = db
    .prepare(
      'SELECT id, projectId, createdAt, storedFilePath, bouncePath, description, fileHash FROM versions WHERE id = ?'
    )
    .get(id)
  return row ? VersionSchema.parse(row) : null
}
