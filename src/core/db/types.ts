import { z } from 'zod'

// Input validation at the create boundary. Row/output TYPES now live in schema.ts
// (Drizzle `$inferSelect`); this file only guards data going INTO the DB.

export const ProjectInputSchema = z.object({ name: z.string().min(1) })

export const WatchRootInputSchema = z.object({ path: z.string().min(1) })

export const VersionInputSchema = z.object({
  projectId: z.uuid(),
  watchRootId: z.uuid(),
  sourceRelativePath: z.string().min(1),
  fileHash: z.string(),
  savedAt: z.number().int().nonnegative(),
  versionLabel: z.string().nullish(),
  isBackup: z.coerce.boolean(),
  bouncePath: z.string().nullish(),
  description: z.string().nullish()
})

export type ProjectInput = z.infer<typeof ProjectInputSchema>
export type WatchRootInput = z.infer<typeof WatchRootInputSchema>
export type VersionInput = z.infer<typeof VersionInputSchema>
