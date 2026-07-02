import { describe, it, expect } from 'vitest'
import { isProjectFile } from '../../../src/core/versioning/isProjectFile'

const cases: [string, boolean][] = [
  ['song.als', true], // Ableton
  ['track.flp', true], // FL Studio
  ['mix.cpr', true], // Cubase
  ['beat.rpp', true], // Reaper
  ['idea.song', true], // Studio One
  ['session.ptx', true], // Pro Tools
  ['loops.bwproject', true], // Bitwig
  ['Mix V1-02.bak', false], // Cubase backup
  ['bounce.wav', false], // audio
  ['SONG.ALS', true] // case-insensitive
]

describe('isProjectFile', () => {
  it.each(cases)('%s -> %s', (input, expected) => {
    expect(isProjectFile(input)).toBe(expected)
  })
})
