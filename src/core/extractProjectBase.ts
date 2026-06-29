export function extractProjectBase(project: string): string {
  const lower = project.toLowerCase()
  const noExt = lower.slice(0, lower.lastIndexOf('.'))
  const noStamp = noExt.replace(/\s*\[\d{4}-\d{2}-\d{2} \d{6}\]$/, '')
  const cut = noStamp.replace(/[ _-]v ?\d.*$/, '')
  return cut.replace(/^[\s_.-]+/, '').replace(/[\s_.-]+$/, '') // trim edge separators
}
