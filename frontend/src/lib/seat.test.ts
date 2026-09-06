import { describe, expect, it } from 'vitest'
import { PRESETS } from '../data/presets'
import type { Goals } from '../types'
import { applyWhatIfKeys, extractTurnIds, sanitizeGoals } from './seat'

describe('seat interaction helpers', () => {
  it('sanitizes incomplete goal rows before GoalsForm submission', () => {
    const goals: Goals = {
      target_assets: ['a', 'b', 'c', 'd', 'e', 'f'],
      min_value_share: 90,
      red_lines: [
        { kind: 'no_sell_asset', asset_id: null, member_id: null, text: '' },
        { kind: 'not_below_legal', asset_id: null, member_id: null, text: '' },
      ],
      soft_goals: [
        { kind: 'custom', asset_id: null, member_id: null, text: '' },
        { kind: 'recognition', asset_id: null, member_id: null, text: '' },
      ],
      narrative: 'x'.repeat(700),
      source: 'user',
    }
    const clean = sanitizeGoals(goals)
    expect(clean.target_assets).toHaveLength(5)
    expect(clean.red_lines.map((row) => row.kind)).toEqual(['not_below_legal'])
    expect(clean.soft_goals.map((row) => row.kind)).toEqual(['recognition'])
    expect(clean.narrative).toHaveLength(600)
  })

  it('applies combined what-if switches to a copy without mutating the draft', () => {
    const original = PRESETS[0].build()
    const before = structuredClone(original)
    const changed = applyWhatIfKeys(original, ['main_support:son', 'joint:house'])
    expect(changed.members.find((member) => member.id === 'son')?.main_support)
      .toBe(!before.members.find((member) => member.id === 'son')?.main_support)
    expect(changed.assets.find((asset) => asset.id === 'house')?.joint)
      .toBe(!before.assets.find((asset) => asset.id === 'house')?.joint)
    expect(original).toEqual(before)
  })

  it('deduplicates debrief turn references used by jump chips', () => {
    expect(extractTurnIds('依据 [t:t-1]，再看 [t:t-2] 和 [t:t-1]'))
      .toEqual(['t-1', 't-2'])
  })
})
