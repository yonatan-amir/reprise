import { describe, it, expect } from 'vitest'
import { decideVersionAction } from '../../src/core/decideVersionAction'

describe('decideVersionAction', () => {
  it('add', () => {
    const newHash = 'abc123'
    const existing = null
    const result = decideVersionAction(newHash, existing)
    expect(result.kind).toBe('add')
  })

  it('update', () => {
    const newHash = 'abc1234'
    const existing = 'abc123'
    const result = decideVersionAction(newHash, existing)
    expect(result.kind).toBe('update')
  })

  it('skips', () => {
    const newHash = 'abc123'
    const existing = 'abc123'
    const result = decideVersionAction(newHash, existing)
    expect(result.kind).toBe('skip')
  })
})
