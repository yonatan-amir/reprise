import { z } from 'zod'

/**
 * A Project is a folder you've told Reprise to watch.
 * Versions belong to a Project.
 */
export const ProjectSchema = z.object({
  id: z.uuid(), // unique id (we generate it — a UUID)
  name: z.string().min(1), // human label, e.g. "Summer Track"
  watchedPath: z.string().min(1) // the folder on disk we watch
})
export type Project = z.infer<typeof ProjectSchema>

/**
 * A Version is one auto-saved snapshot of a project file,
 * optionally with a bounced audio file and a note attached.
 */
export const VersionSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(), // which Project this belongs to
  createdAt: z.number().int().nonnegative(), // epoch milliseconds (Date.now())
  storedFilePath: z.string().min(1), // where we copied the snapshot to
  bouncePath: z.string().nullish(), // attached audio bounce (added later, M4)
  description: z.string().nullish(), // optional text note (M4)
  fileHash: z.string() // content hash, for dedup/integrity (M2)
})
export type Version = z.infer<typeof VersionSchema>

export const ProjectInputSchema = ProjectSchema.omit({ id: true })
export type ProjectInput = z.infer<typeof ProjectInputSchema>

export const VersionInputSchema = VersionSchema.omit({ id: true, createdAt: true })
export type VersionInput = z.infer<typeof VersionInputSchema>
