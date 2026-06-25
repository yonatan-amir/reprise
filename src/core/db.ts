import { DatabaseSync } from 'node:sqlite'

/**
 * Open (or create) the SQLite database at `dbPath` and make sure the tables exist.
 *
 * `dbPath` is a PARAMETER on purpose — core stays framework-free, so it doesn't decide
 * where the file lives. Callers supply it:
 *   - the Electron app (later) passes app.getPath('userData') + '/reprise.db'
 *   - tests pass ':memory:' — a throwaway database that lives only in RAM
 */
export function openDatabase(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath)

  // SQLite ships with foreign keys OFF — turn them on so a version can't point
  // at a project that doesn't exist.
  db.exec('PRAGMA foreign_keys = ON;')

  // Idempotent schema: safe to run on every startup ("IF NOT EXISTS").
  db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL UNIQUE
      );

      CREATE TABLE IF NOT EXISTS versions (
        id                  TEXT PRIMARY KEY,
        projectId           TEXT NOT NULL,
        fileHash            TEXT NOT NULL,
        savedAt             INTEGER NOT NULL,
        versionLabel        TEXT,
        sourceMissing       INTEGER NOT NULL DEFAULT 0,
        bouncePath          TEXT,
        description         TEXT,
        sourceRelativePath  TEXT NOT NULL,
        watchRootId         TEXT NOT NULL,

        
        FOREIGN KEY (projectId) REFERENCES projects(id),
        FOREIGN KEY (watchRootId) REFERENCES watch_roots(id),
        UNIQUE (watchRootId, sourceRelativePath)
      );

      CREATE TABLE IF NOT EXISTS watch_roots (
        id            TEXT PRIMARY KEY,
        path          TEXT NOT NULL UNIQUE
      );
  `)

  return db
}
