import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { projects, type Project } from './schema'
import { ProjectInputSchema, type ProjectInput } from './types'
import type { Db } from './connection'

export async function createProject(db: Db, input: ProjectInput): Promise<Project> {
  const parsed = ProjectInputSchema.parse(input) // validate untrusted input at the boundary
  const project: Project = { id: randomUUID(), name: parsed.name } // new object — no mutation

  await db.insert(projects).values(project)
  return project
}

/** List every project, newest-inserted order not guaranteed (we'll sort when it matters). */
export async function listProjects(db: Db): Promise<Project[]> {
  return db.select().from(projects)
}

/** Get one project by id, or null if there's no match. */
export async function getProject(db: Db, id: string): Promise<Project | null> {
  const rows = await db.select().from(projects).where(eq(projects.id, id))
  return rows[0] ?? null
}

/** Get one project by name, or null if there's no match. */
export async function findProjectByName(db: Db, name: string): Promise<Project | null> {
  const rows = await db.select().from(projects).where(eq(projects.name, name))
  return rows[0] ?? null
}
