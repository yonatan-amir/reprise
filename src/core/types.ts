import { z } from 'zod'

export const ProjectSchema = z.object({ id: z.uuid(), name: z.string().min(1) })

export const VersionSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  watchRootId: z.uuid(),
  sourceRelativePath: z.string().min(1),
  fileHash: z.string(),
  savedAt: z.number().int().nonnegative(),
  versionLabel: z.string().nullish(),
  sourceMissing: z.coerce.boolean(),
  bouncePath: z.string().nullish(),
  description: z.string().nullish()
})

export const WatchRootSchema = z.object({ id: z.uuid(), path: z.string().min(1) })

export const WatchRootInputSchema = WatchRootSchema.omit({ id: true })
export const ProjectInputSchema = ProjectSchema.omit({ id: true })
export const VersionInputSchema = VersionSchema.omit({ id: true, sourceMissing: true })

export type Project = z.infer<typeof ProjectSchema>
export type WatchRoot = z.infer<typeof WatchRootSchema>
export type WatchRootInput = z.infer<typeof WatchRootInputSchema>
export type ProjectInput = z.infer<typeof ProjectInputSchema>
export type Version = z.infer<typeof VersionSchema>
export type VersionInput = z.infer<typeof VersionInputSchema>
