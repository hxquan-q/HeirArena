// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentSpec, Turn } from '../../types'
import ActiveTestimony from './ActiveTestimony'

afterEach(cleanup)

const agent: AgentSpec = {
  id: 'heir-1',
  name: '王小雅',
  role: '申请人',
  relation: 'daughter',
  personality: 'filial',
  personality_label: '孝顺',
  title: '长女',
  color: '#f07aa8',
  kind: 'human',
  legal_percent: 50,
  eligible: true,
  wish: '保住房子',
  llm: false,
  model_label: '剧本模式',
}

const turn: Turn = {
  turn_id: 'turn-1',
  agent_id: agent.id,
  phase: 'debate',
  round: 1,
  text: '父亲住院的三年里，一直是我在照顾。',
  meta: {
    action: 'plead',
    target: null,
    emoji: '🙏',
    claims: {},
  },
  done: false,
  ts: 10,
}

describe('ActiveTestimony', () => {
  it('shows a phase-specific waiting state before anyone speaks', () => {
    render(
      <ActiveTestimony
        turn={null}
        status="idle"
        phaseLabel="等待开庭"
        onOpenTranscript={() => {}}
      />,
    )

    expect(screen.getByText('等待开庭')).toBeTruthy()
    expect(screen.getByText('执行官正在核对卷宗，下一位发言者会在这里出现。')).toBeTruthy()
  })

  it('keeps the complete live testimony visible and opens the transcript', () => {
    const open = vi.fn()
    render(
      <ActiveTestimony
        turn={turn}
        agent={agent}
        status="speaking"
        phaseLabel="辩论 第1轮"
        onOpenTranscript={open}
      />,
    )

    expect(screen.getByText(turn.text)).toBeTruthy()
    expect(screen.getByText('发言中')).toBeTruthy()
    expect(screen.getByText('恳求')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '查看完整庭审记录' }))
    expect(open).toHaveBeenCalledOnce()
  })

  it('keeps emotional status visible after a turn is recorded', () => {
    render(
      <ActiveTestimony
        turn={{ ...turn, done: true }}
        agent={agent}
        status="angry"
        phaseLabel="辩论 第1轮"
        onOpenTranscript={() => {}}
      />,
    )

    expect(screen.getByText('生气')).toBeTruthy()
    expect(screen.getByText('已记录')).toBeTruthy()
  })
})
