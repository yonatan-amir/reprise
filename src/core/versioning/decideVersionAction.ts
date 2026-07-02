type VersionAction = { kind: 'add' | 'update' | 'skip' }

export function decideVersionAction(newHash: string, existing: string | null): VersionAction {
  if (!existing) return { kind: 'add' }
  if (newHash === existing) return { kind: 'skip' }
  return { kind: 'update' }
}
