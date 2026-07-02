import { sqliteTable, text, integer, unique } from 'drizzle-orm/sqlite-core'

export const projects = sqliteTable('projects', {
  id: text().primaryKey(),
  name: text().notNull().unique()
})

export const watchRoots = sqliteTable('watch_roots', {
  id: text().primaryKey(),
  path: text().notNull().unique()
})

export const versions = sqliteTable(
  'versions',
  {
    id: text().primaryKey(),
    projectId: text()
      .notNull()
      .references(() => projects.id),
    watchRootId: text()
      .notNull()
      .references(() => watchRoots.id),
    sourceRelativePath: text().notNull(),
    fileHash: text().notNull(),
    savedAt: integer().notNull(),
    versionLabel: text(),
    sourceMissing: integer({ mode: 'boolean' }).notNull().default(false),
    isBackup: integer({ mode: 'boolean' }).notNull().default(false),
    bouncePath: text(),
    description: text()
  },
  (t) => [unique().on(t.watchRootId, t.sourceRelativePath)]
)

export type Project = typeof projects.$inferSelect
export type WatchRoot = typeof watchRoots.$inferSelect
export type Version = typeof versions.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type NewWatchRoot = typeof watchRoots.$inferInsert
export type NewVersion = typeof versions.$inferInsert
