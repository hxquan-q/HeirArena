import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const memory = new Map<string, string>()
vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => { memory.set(k, v) },
  removeItem: (k: string) => { memory.delete(k) },
  clear: () => memory.clear(),
  key: (i: number) => [...memory.keys()][i] ?? null,
  get length() { return memory.size },
})

const seatAnalyze = vi.fn()
vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return {
    ...actual,
    api: {
      ...actual.api,
      seatAnalyze: (...args: unknown[]) => seatAnalyze(...args),
    },
  }
})

import { PRESETS } from '../data/presets'
import type { Goals } from '../types'
import {
  cleanDraft,
  goalsFromWish,
  isDraftValid,
  seatAnalysisEligible,
  useCaseDraft,
  watchSeatAnalysis,
} from './useCaseDraft'

function resetDraft() {
  const built = PRESETS[0].build()
  useCaseDraft.setState({
    c: built,
    activePreset: PRESETS[0].id,
    preview: null,
    previewErr: null,
    analysis: null,
    analysisErr: null,
    analyzing: false,
    strategizing: false,
    strategyErr: null,
    strategyStale: false,
    advisorModel: null,
  })
}

describe('useCaseDraft seat', () => {
  beforeEach(() => {
    memory.clear()
    seatAnalyze.mockReset()
    resetDraft()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('empty wish uses defaultWish as narrative', () => {
    useCaseDraft.getState().enterSeat('cat_agent')
    expect(useCaseDraft.getState().c.seat).toBeNull()
    const built = PRESETS[0].build()
    const dad = { ...built.members.find((m) => m.id === 'son')!, wish: '' }
    useCaseDraft.setState({ c: { ...built, members: built.members.map((m) => (m.id === 'son' ? dad : m)) } })
    useCaseDraft.getState().enterSeat('son')
    const narrative = useCaseDraft.getState().c.seat?.goals.son.narrative ?? ''
    expect(narrative.length).toBeGreaterThan(0)
    expect(narrative).not.toBe('')
    expect(narrative).toContain('收入囊中')
  })

  it('applyParsed then enterSeat seeds 周晓 from wish-hit assets', () => {
    const built = PRESETS[0].build()
    const result = {
      case: {
        ...built,
        decedent_name: '老周',
        members: [
          { ...built.members[0], id: 'wife', name: '赵阿姨' },
          { ...built.members[2], id: 'zhouxiao', name: '周晓', relation: 'daughter' as const, wish: '紫砂壶一把', personality: 'filial' as const },
        ],
        assets: [
          { id: 'house', name: '学区房', type: 'house' as const, value: 520, joint: true, sentimental: false, note: '' },
          { id: 'pot', name: '紫砂壶', type: 'collectible' as const, value: 3, joint: false, sentimental: true, note: '' },
        ],
        seat: null,
      },
      legal: useCaseDraft.getState().preview ?? {
        order_used: 1, shares: [], steps: [], articles: {}, gross_total: 0,
        community_deduction: 0, estate_total: 0, spouse_id: null, dependents_carveout: 0,
      },
      warnings: [],
      model_label: 'scripted',
      source_chars: 20,
    }
    useCaseDraft.getState().applyParsed(result)
    useCaseDraft.getState().enterSeat('zhouxiao')
    const seat = useCaseDraft.getState().c.seat
    expect(seat?.player_id).toBe('zhouxiao')
    expect(seat?.goals.zhouxiao.narrative).toBe('紫砂壶一把')
    expect(seat?.goals.zhouxiao.target_assets).toContain('pot')
  })

  it('enterSeat fills goals from wish and leaveSeat clears the seat', () => {
    useCaseDraft.getState().enterSeat('daughter')
    const seat = useCaseDraft.getState().c.seat
    expect(seat?.player_id).toBe('daughter')
    expect(seat?.goals.daughter.source).toBe('user')
    expect(seat?.goals.daughter.narrative).toBe('相册和大橘')
    expect(seat?.goals.daughter.target_assets.length).toBeGreaterThan(0)
    useCaseDraft.getState().leaveSeat()
    expect(useCaseDraft.getState().c.seat).toBeNull()
    expect(useCaseDraft.getState().analysis).toBeNull()
  })

  it('setPlayer keeps old goals and seeds the new player from wish', () => {
    useCaseDraft.getState().enterSeat('daughter')
    useCaseDraft.getState().setPlayer('son')
    const seat = useCaseDraft.getState().c.seat
    expect(seat?.player_id).toBe('son')
    expect(seat?.goals.daughter.source).toBe('user')
    expect(seat?.goals.son.source).toBe('user')
    expect(seat?.goals.son.narrative).toBe('房子和比特币')
  })

  it('updGoals marks source user and applyInferred does not overwrite user goals', () => {
    useCaseDraft.getState().enterSeat('daughter')
    useCaseDraft.getState().updGoals('daughter', { min_value_share: 40 })
    expect(useCaseDraft.getState().c.seat?.goals.daughter.source).toBe('user')
    expect(useCaseDraft.getState().c.seat?.goals.daughter.min_value_share).toBe(40)
    const inferred: Record<string, Goals> = {
      daughter: { ...useCaseDraft.getState().c.seat!.goals.daughter, min_value_share: 10, source: 'inferred' },
      son: { target_assets: ['house'], min_value_share: null, red_lines: [], soft_goals: [], narrative: '推断', source: 'inferred' },
    }
    useCaseDraft.getState().applyInferred(inferred)
    expect(useCaseDraft.getState().c.seat?.goals.daughter.min_value_share).toBe(40)
    expect(useCaseDraft.getState().c.seat?.goals.son.source).toBe('inferred')
  })

  it('deleting the player member leaves the seat', () => {
    useCaseDraft.getState().enterSeat('daughter')
    useCaseDraft.getState().removeMember('daughter')
    expect(useCaseDraft.getState().c.seat).toBeNull()
  })

  it('deleting an asset strips it from all goals', () => {
    useCaseDraft.getState().enterSeat('daughter')
    useCaseDraft.getState().updGoals('son', { target_assets: ['house', 'btc'], red_lines: [{ kind: 'no_sell_asset', asset_id: 'house', member_id: null, text: '' }] })
    useCaseDraft.getState().removeAsset('house')
    const goals = useCaseDraft.getState().c.seat!.goals
    for (const g of Object.values(goals)) {
      expect(g.target_assets).not.toContain('house')
      expect(g.red_lines.every((r) => r.asset_id !== 'house')).toBe(true)
      expect(g.soft_goals.every((s) => s.asset_id !== 'house')).toBe(true)
    }
  })

  it('isDraftValid rejects a pet or deceased player', () => {
    const c = PRESETS[0].build()
    expect(isDraftValid(c)).toBe(true)
    expect(isDraftValid({
      ...c,
      seat: { player_id: 'cat_agent', goals: {}, seat_human: false, advisor_model: null, strategy: null },
    })).toBe(false)
  })

  it('cleanDraft drops unnamed members and stale goal keys', () => {
    useCaseDraft.getState().enterSeat('daughter')
    const raw = {
      ...useCaseDraft.getState().c,
      members: [...useCaseDraft.getState().c.members, { ...useCaseDraft.getState().c.members[0], id: 'ghost', name: '   ' }],
    }
    raw.seat = {
      ...raw.seat!,
      goals: { ...raw.seat!.goals, ghost: goalsFromWish(raw.members[0], raw.assets) },
    }
    const cleaned = cleanDraft(raw)
    expect(cleaned.members.every((m) => m.name.trim())).toBe(true)
    expect(cleaned.seat?.goals.ghost).toBeUndefined()
    expect(cleaned.seat?.goals.daughter).toBeTruthy()
  })

  it('cleanDraft drops incomplete red lines and custom soft goals', () => {
    useCaseDraft.getState().enterSeat('daughter')
    useCaseDraft.getState().updGoals('daughter', {
      red_lines: [
        { kind: 'no_sell_asset', asset_id: null, member_id: null, text: '' },
        { kind: 'custom', asset_id: null, member_id: null, text: '' },
        { kind: 'not_below_legal', asset_id: null, member_id: null, text: '' },
      ],
      soft_goals: [
        { kind: 'keep_relation', member_id: null, asset_id: null, text: '' },
        { kind: 'custom', member_id: null, asset_id: null, text: '   ' },
        { kind: 'recognition', member_id: null, asset_id: null, text: '' },
      ],
    })
    const cleaned = cleanDraft(useCaseDraft.getState().c)
    expect(cleaned.seat?.goals.daughter.red_lines).toEqual([
      { kind: 'not_below_legal', asset_id: null, member_id: null, text: '' },
    ])
    expect(cleaned.seat?.goals.daughter.soft_goals).toEqual([
      { kind: 'recognition', member_id: null, asset_id: null, text: '' },
    ])
  })

  it('watchSeatAnalysis does not call the API in observer mode', () => {
    vi.useFakeTimers()
    const stop = watchSeatAnalysis(useCaseDraft.getState().c, seatAnalyze, {
      setAnalysis: vi.fn(),
      setAnalysisErr: vi.fn(),
      setAnalyzing: vi.fn(),
      applyInferred: vi.fn(),
    })
    vi.advanceTimersByTime(500)
    expect(seatAnalyze).not.toHaveBeenCalled()
    expect(seatAnalysisEligible(useCaseDraft.getState().c)).toBe(false)
    stop()
  })
})
