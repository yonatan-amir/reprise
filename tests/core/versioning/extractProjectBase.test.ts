import { describe, it, expect } from 'vitest'
import { extractProjectBase } from '../../../src/core/versioning/extractProjectBase'

const cases: [string, string][] = [
  ['take me away V0.als', 'take me away'],
  ['Hear My Voice V10.als', 'hear my voice'],
  ['afterblue - burn it down v22.als', 'afterblue - burn it down'],
  ['Blue V2.1 Stuck.als', 'blue'],
  ['cant stop this V33 [2024-11-25 134043].als', 'cant stop this'],
  ['808 2.als', '808 2'],
  ['Doggo.als', 'doggo'],
  ['Doggo [2025-11-25 160641].als', 'doggo'],
  ['Afterblue-01.cpr', 'afterblue-01'],
  ['lost in open waters Comped V2-01.cpr', 'lost in open waters comped']
]

describe('extractProjectBase', () => {
  it.each(cases)('%s → %s', (input, expected) => {
    expect(extractProjectBase(input)).toBe(expected)
  })
})
