import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { type Project, type ProjectInput, ProjectInputSchema, ProjectSchema } from './types'

export function createProject(db: DatabaseSync, input: ProjectInput): Project {
  const parsed = ProjectInputSchema.parse(input) // validate untrusted input at the boundary
  const project: Project = { id: randomUUID(), ...parsed } // new object — no mutation

  db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(project.id, project.name)

  return project
}

/** List every project, newest-inserted order not guaranteed (we'll sort when it matters). */
export function listProjects(db: DatabaseSync): Project[] {
  const rows = db.prepare('SELECT id, name FROM projects').all()
  return rows.map((row) => ProjectSchema.parse(row)) // validate data coming OUT of the DB too
}

/** Get one project by id, or null if there's no match. */
export function getProject(db: DatabaseSync, id: string): Project | null {
  const row = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(id)
  return row ? ProjectSchema.parse(row) : null
}
