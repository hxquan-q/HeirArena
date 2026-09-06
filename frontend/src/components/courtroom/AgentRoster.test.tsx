// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { AgentSpec } from '../../types'
import AgentRoster from './AgentRoster'

afterEach(cleanup)

const makeAgent = (id: string, name: string, color: string): AgentSpec => ({
  id,
  name,
  role: '继承人',
  relation: 'son',
  personality: 'calculating',
  personality_label: '精明',
  title: '继承人',
  color,
  kind: 'human',
  legal_percent: 50,
  eligible: true,
  wish: '争取份额',
  llm: false,
  model_label: '剧本模式',
})

it('puts the active agent first, labels the state, and preserves betting', () => {
  const idleAgent = makeAgent('idle', '王大宝', '#e2b25a')
  const speakingAgent = makeAgent('speaker', '王小雅', '#f07aa8')
  const onBet = vi.fn()

  render(
    <AgentRoster
      agents={[idleAgent, speakingAgent]}
      statuses={{ [speakingAgent.id]: 'speaking' }}
      turns={[]}
      betId={null}
      bettingLocked={false}
      onBet={onBet}
    />,
  )

  const active = screen.getByRole('button', { name: new RegExp(speakingAgent.name) })
  expect(active.getAttribute('aria-current')).toBe('true')
  expect(screen.getByText('发言中')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: new RegExp(idleAgent.name) }))
  expect(onBet).toHaveBeenCalledWith(idleAgent.id)
})
