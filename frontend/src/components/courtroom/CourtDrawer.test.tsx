// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CourtDrawer from './CourtDrawer'

afterEach(cleanup)

describe('CourtDrawer', () => {
  it('focuses the dialog, closes on Escape, and restores trigger focus', () => {
    const close = vi.fn()
    const trigger = document.createElement('button')
    trigger.textContent = '打开卷宗'
    document.body.append(trigger)
    trigger.focus()

    const { rerender } = render(
      <CourtDrawer open side="left" title="案件卷宗" onClose={close}>
        <button>查看证据</button>
      </CourtDrawer>,
    )

    const dialog = screen.getByRole('dialog', { name: '案件卷宗' })
    expect(dialog.contains(document.activeElement)).toBe(true)

    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' })
    expect(close).toHaveBeenCalledOnce()

    rerender(
      <CourtDrawer open={false} side="left" title="案件卷宗" onClose={close}>
        <button>查看证据</button>
      </CourtDrawer>,
    )
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('does not steal focus when an open drawer rerenders with a new callback', () => {
    const { rerender } = render(
      <CourtDrawer open side="right" title="庭审洞察" onClose={() => {}}>
        <button>庭审记录</button>
      </CourtDrawer>,
    )
    const interior = screen.getByRole('button', { name: '庭审记录' })
    interior.focus()

    rerender(
      <CourtDrawer open side="right" title="庭审洞察" onClose={() => {}}>
        <button>庭审记录</button>
      </CourtDrawer>,
    )

    expect(document.activeElement).toBe(interior)
  })
})
