import { describe, it, expect } from 'vitest'
import { hashBuffer, hashFile } from '../../../src/core/versioning/fileHash'
import { rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

describe('fileHash', () => {
  it('returns the exact, correct SHA-256 fingerprint', () => {
    const buffer1 = Buffer.from('')
    expect(hashBuffer(buffer1)).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
    const buffer2 = Buffer.from('abc')
    expect(hashBuffer(buffer2)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })

  it('reads a file streamed off disk and returns the same kind of hash string', async () => {
    const filePath = path.join(os.tmpdir(), 'somename.txt')
    writeFileSync(filePath, 'abc')
    const result = await hashFile(filePath)
    rmSync(filePath)
    expect(result).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
