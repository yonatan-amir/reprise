const PROJECT_EXTENSIONS = ['als', 'flp', 'cpr', 'rpp', 'song', 'ptx', 'bwproject']

export function isProjectFile(filename: string): boolean {
  return PROJECT_EXTENSIONS.includes(filename.slice(filename.lastIndexOf('.') + 1).toLowerCase())
}
