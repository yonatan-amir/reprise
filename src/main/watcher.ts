import { type FSWatcher, watch } from 'chokidar'
import { isProjectFile } from '../core/versioning/isProjectFile'
import { stat } from 'node:fs/promises'
import { hashFile } from '../core/versioning/fileHash'

type FileEvent = 'add' | 'change' | 'unlink'

export function startWatcher(rootPath: string): FSWatcher {
  const watcher = watch(rootPath, {
    ignoreInitial: false,
    usePolling: false,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100
    }
  })

  watcher.on('add', (path) => handleEvent('add', path))
  watcher.on('change', (path) => handleEvent('change', path))
  watcher.on('unlink', (path) => handleEvent('unlink', path))
  watcher.on('ready', () => console.log('[watcher] ready:', rootPath))
  return watcher
}

async function handleEvent(event: FileEvent, path: string): Promise<void> {
  if (!isProjectFile(path)) return

  if (event === 'unlink') {
    console.log('[watcher] unlink ->', path)
    return
  }

  try {
    const stats = await stat(path)
    const hash = await hashFile(path)
    console.log('[watcher]', event, '->', path)
    console.log('          mtime:', stats.mtime, '| hash:', hash.slice(0, 12), '…')
  } catch {
    console.log('[watcher] skipped (gone):', path)
  }
}
