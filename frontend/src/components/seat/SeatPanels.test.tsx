// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PxlKitToastProvider } from '@pxlkit/ui-kit'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PRESETS } from '../../data/presets'
import { useCaseDraft } from '../../store/useCaseDraft'
import { useCourt } from '../../store/useCourt'
import type { AgentSpec, Debrief, SeatAnalysis, SpeechCard } from '../../types'
import CourtEvidencePanel from './CourtEvidencePanel'
import DebriefPanel from './DebriefPanel'
import SeatDock from './SeatDock'
import SpeechCards from './SpeechCards'
import WhatIfPanel from './WhatIfPanel'
import { emptySeatDraft, type SeatDraft } from './draft'

const mocks = vi.hoisted(() => ({
  speak: vi.fn(async () => ({ ok: true })),
  regenerateCards: vi.fn(async () => ({ ok: true })),
  submitEvidence: vi.fn(async () => ({ ok: true })),
}))

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client')
  return { ...actual, api: { ...actual.api, ...mocks } }
})
vi.mock('../../lib/sfx', () => ({ sfx: vi.fn() }))

const agent = (id: string, name: string): AgentSpec => ({
  id,
  name,
  role: name,
  relation: id === 'executor' ? 'executor' : 'daughter',
  personality: 'filial',
  personality_label: '孝顺',
  title: '',
  color: '#fff',
  kind: id === 'executor' ? 'judge' : 'human',
  legal_percent: 50,
  eligible: true,
  wish: '',
  llm: false,
  model_label: '剧本',
})

afterEach(cleanup)

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn())
  mocks.speak.mockClear()
  mocks.regenerateCards.mockClear()
  mocks.submitEvidence.mockClear()
  useCourt.getState().reset()
})

describe('seat courtroom components', () => {
  it('SeatDock submits only explicitly selected admissions', async () => {
    const caseData = PRESETS[0].build()
    useCourt.setState({
      seat: { playerId: 'daughter', human: true },
      awaiting: {
        turn_key: 'statements:0:daughter',
        phase: 'statements',
        round: 0,
        attacked_by: null,
        focus: '',
        cards_pending: false,
      },
      agents: [agent('daughter', '王小美'), agent('son', '王大宝')],
      caseData,
    })

    function Harness() {
      const [draft, setDraft] = useState<SeatDraft>({
        ...emptySeatDraft(),
        text: '我明确放弃一部分份额。',
        waiveShare: true,
      })
      return <SeatDock sessionId="s1" draft={draft} onDraftChange={setDraft} onOpenBrief={() => {}} />
    }

    render(<PxlKitToastProvider><Harness /></PxlKitToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: '发言' }))
    await waitFor(() => expect(mocks.speak).toHaveBeenCalledOnce())
    const calls = mocks.speak.mock.calls as unknown as [string, unknown][]
    expect(calls[0][1]).toMatchObject({
      text: '我明确放弃一部分份额。',
      meta: { admissions: ['waive_share'] },
    })
  })

  it('SpeechCards uses a card without synthesizing an admission click', () => {
    const onUse = vi.fn()
    const card: SpeechCard = {
      id: 'card-1',
      title: '守住底线',
      text: '我主张按法定份额处理。',
      responds_to: null,
      action: 'propose',
      claims: {},
      suggests_admission: 'acknowledge_support:son',
      serves: [],
      risk_note: '需手动确认',
    }
    render(
      <SpeechCards
        sessionId="s1"
        cards={[card]}
        agents={[agent('daughter', '王小美'), agent('son', '王大宝')]}
        onUse={onUse}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '用这张' }))
    expect(onUse).toHaveBeenCalledWith(card)
  })

  it('CourtEvidencePanel blocks the current turn but allows another fact on the next turn', async () => {
    useCourt.setState({
      awaiting: {
        turn_key: 'statements:0:daughter',
        phase: 'statements',
        round: 0,
        attacked_by: null,
        focus: '',
        cards_pending: false,
      },
      evidenceOptions: [
        {
          fact_key: 'main_support:daughter',
          subject_id: 'daughter',
          subject_name: '王小美',
          subject_kind: 'member',
          lever: 'main_support',
          label: '证明王小美尽了主要扶养义务',
          article: '1130',
          delta_pct: 8,
          direction: 'favorable',
          evidence_types: ['住院陪护记录', '护理费票据'],
          burden: '由主张多分的一方举证',
          note: '',
        },
        {
          fact_key: 'neglect:son',
          subject_id: 'son',
          subject_name: '王大宝',
          subject_kind: 'member',
          lever: 'neglect',
          label: '证明王大宝有能力却未尽扶养义务',
          article: '1130',
          delta_pct: 5,
          direction: 'favorable',
          evidence_types: ['拒付赡养费记录'],
          burden: '由主张方举证',
          note: '',
        },
      ],
      submittedEvidence: [],
    })

    render(<PxlKitToastProvider><CourtEvidencePanel sessionId="s1" /></PxlKitToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: /选择材料/ }))
    fireEvent.click(screen.getByRole('button', { name: /证明王小美尽了主要扶养义务/ }))
    fireEvent.change(screen.getByRole('textbox', { name: /材料摘要/ }), {
      target: { value: '连续三年的住院陪护记录' },
    })
    fireEvent.click(screen.getByRole('button', { name: '提交并请求沙盘采信' }))

    await waitFor(() => expect(mocks.submitEvidence).toHaveBeenCalledWith('s1', {
      fact_key: 'main_support:daughter',
      evidence_type: '住院陪护记录',
      note: '连续三年的住院陪护记录',
    }))
    expect(screen.getByText('本回合已举证')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '提交并请求沙盘采信' })).toBeNull()
    expect(mocks.submitEvidence).toHaveBeenCalledTimes(1)

    act(() => {
      useCourt.setState({
        awaiting: {
          turn_key: 'debate:1:daughter',
          phase: 'debate',
          round: 1,
          attacked_by: null,
          focus: '扶养义务',
          cards_pending: false,
        },
      })
    })

    fireEvent.click(screen.getByRole('button', { name: /选择材料/ }))
    expect(screen.queryByRole('button', { name: /证明王小美尽了主要扶养义务/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /证明王大宝有能力却未尽扶养义务/ }))
    fireEvent.change(screen.getByRole('textbox', { name: /材料摘要/ }), {
      target: { value: '连续拒付赡养费的调解记录' },
    })
    fireEvent.click(screen.getByRole('button', { name: '提交并请求沙盘采信' }))

    await waitFor(() => expect(mocks.submitEvidence).toHaveBeenCalledTimes(2))
    expect(mocks.submitEvidence).toHaveBeenLastCalledWith('s1', {
      fact_key: 'neglect:son',
      evidence_type: '拒付赡养费记录',
      note: '连续拒付赡养费的调解记录',
    })
  })

  it('DebriefPanel exposes scorecard turn ids as jump controls', () => {
    const onJump = vi.fn()
    const caseData = PRESETS[0].build()
    const debrief: Debrief = {
      scorecards: {
        daughter: {
          member_id: 'daughter',
          parts: [{
            key: 'soft_goals',
            label: '软目标',
            score: 8,
            max: 10,
            applicable: true,
            detail: '付出得到回应',
            turn_ids: ['turn-1'],
          }],
          total: 80,
          capped: false,
          formula: '测试公式',
          value_share: 40,
          nominal_pct: 40,
          legal_pct: 40,
        },
      },
      narrative: null,
      next_time: [],
      whatif_recap: [],
      generated_by: 'fake',
    }
    render(
      <DebriefPanel
        debrief={debrief}
        strategy={null}
        seat={{ playerId: 'daughter', human: true }}
        agents={[agent('daughter', '王小美')]}
        caseData={caseData}
        onJumpToTurn={onJump}
      />,
    )
    fireEvent.click(screen.getByText('turn-1'))
    expect(onJump).toHaveBeenCalledWith('turn-1')
  })

  it('WhatIfPanel shows the matching burden in a single evidence drawer', () => {
    const c = PRESETS[0].build()
    c.seat = {
      player_id: 'daughter',
      goals: {},
      seat_human: false,
      advisor_model: null,
      strategy: null,
    }
    const analysis = {
      player_id: 'daughter',
      whatif: [{
        key: 'main_support:daughter',
        subject_id: 'daughter',
        label: '证明王小美尽了主要扶养义务',
        article: '1130',
        delta_pct: 2,
        direction: 'favorable',
        evidence: ['护理费票据'],
      }],
      evidence_checklist: [{
        lever: 'main_support',
        label: '尽了主要扶养义务',
        article: '1130',
        evidence: ['护理费票据'],
        burden: '由主张多分的一方举证',
        note: '',
      }],
      legal: {},
      reachability: { legal_pct: 40, low: 30, high: 50, value_low: 30, value_high: 50, favorable_keys: [], adverse_keys: [] },
      inferred_goals: {},
      game: { coalition: [], asset_competition: [], payoff: [], equilibrium: [] },
      matrix: [],
      warnings: [],
    } as unknown as SeatAnalysis
    useCaseDraft.setState({ c, analysis, preview: null })

    render(<WhatIfPanel />)
    fireEvent.click(screen.getByRole('button', { name: '证据' }))
    expect(screen.getAllByText('由主张多分的一方举证')).toHaveLength(2)
  })
})
