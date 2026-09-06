# HeirArena Courtroom Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the courtroom from a permanently dense three-column dashboard into a stage-first experience with accessible document drawers, a persistent active-testimony card, a focused roster, and clearer Agent state choreography.

**Architecture:** Keep `useCourt`, SSE, evidence, Seat, skill casting, betting, and verdict behavior unchanged. Extract display-only courtroom components under `components/courtroom`, derive the visible testimony through a pure view-model helper, and let `CourtroomPage` compose a single stage column plus two overlay drawers. Keep 3D conversion independent from R3F rendering and do not depend on the currently unpublished `@pxlkit/voxel` npm package.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Tailwind CSS 4, Motion 13, Pxlkit UI Kit 2.1, React Three Fiber 9, drei 10, Vitest 5, Testing Library, jsdom.

## Global Constraints

- Preserve all current API calls, `useCourt` state, SSE behavior, Seat flow, evidence picking, ghost skills, pause/resume, betting, and verdict behavior.
- Do not migrate from Vite to Next.js.
- Keep the existing semantic palette and Fusion Pixel/body/mono type roles.
- Desktop drawers overlay the stage; mobile drawers become bottom sheets no taller than `85dvh`.
- Controls remain keyboard operable, visible focus is retained, and primary touch targets are at least `44×44px`.
- Continuous motion must respect `prefers-reduced-motion`.
- Do not install `@pxlkit/voxel`: the official npm registry currently returns 404.
- Do not create commits; the user did not request commits and the working tree contains unrelated changes.

---

### Task 1: Courtroom View Model

**Files:**
- Create: `frontend/src/components/courtroom/viewModel.test.ts`
- Create: `frontend/src/components/courtroom/viewModel.ts`

**Interfaces:**
- Produces: `selectStageTurn(turns: Turn[], activeTurnId: string | null, now: number, maxAgeMs?: number): Turn | null`
- Produces: `statusLabel(status: AgentStatus): string`

- [ ] **Step 1: Write the failing view-model tests**

```ts
import { describe, expect, it } from 'vitest'
import type { Turn } from '../../types'
import { selectStageTurn, statusLabel } from './viewModel'

const turn = (id: string, ts: number, done = true): Turn => ({
  turn_id: id,
  agent_id: `agent-${id}`,
  phase: 'debate',
  round: 1,
  text: `发言 ${id}`,
  done,
  ts,
})

describe('selectStageTurn', () => {
  it('prefers the active turn even when it is older than the recent window', () => {
    expect(selectStageTurn([turn('old', 1, false)], 'old', 100_000)?.turn_id).toBe('old')
  })

  it('falls back to the newest recent turn', () => {
    expect(selectStageTurn([turn('a', 80_000), turn('b', 95_000)], null, 100_000)?.turn_id).toBe('b')
  })

  it('returns null when the latest completed turn is stale', () => {
    expect(selectStageTurn([turn('old', 1)], null, 100_000)).toBeNull()
  })
})

it('provides a non-color status label for every agent state', () => {
  expect(['idle', 'thinking', 'speaking', 'angry', 'happy'].map(statusLabel))
    .toEqual(['待命', '思考中', '发言中', '生气', '开心'])
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- src/components/courtroom/viewModel.test.ts`

Expected: FAIL because `./viewModel` does not exist.

- [ ] **Step 3: Implement the minimal view model**

```ts
import type { AgentStatus, Turn } from '../../types'

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: '待命',
  thinking: '思考中',
  speaking: '发言中',
  angry: '生气',
  happy: '开心',
}

export function statusLabel(status: AgentStatus): string {
  return STATUS_LABEL[status]
}

export function selectStageTurn(
  turns: Turn[],
  activeTurnId: string | null,
  now: number,
  maxAgeMs = 60_000,
): Turn | null {
  if (activeTurnId) {
    const active = turns.find((item) => item.turn_id === activeTurnId)
    if (active) return active
  }
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (now - turns[index].ts <= maxAgeMs) return turns[index]
  }
  return null
}
```

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `npm test -- src/components/courtroom/viewModel.test.ts`

Expected: 4 tests pass.

---

### Task 2: Accessible Overlay Drawer

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/src/components/courtroom/CourtDrawer.test.tsx`
- Create: `frontend/src/components/courtroom/CourtDrawer.tsx`

**Interfaces:**
- Produces: `CourtDrawer({ open, side, title, badge, onClose, children }: CourtDrawerProps)`
- `side` is `'left' | 'right'`.

- [ ] **Step 1: Add the DOM test dependencies**

Run: `npm install --save-dev @testing-library/react jsdom`

Expected: `package.json` and `package-lock.json` update without peer-dependency errors.

- [ ] **Step 2: Write the failing drawer behavior test**

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import CourtDrawer from './CourtDrawer'

afterEach(cleanup)

describe('CourtDrawer', () => {
  it('focuses the dialog, closes on Escape, and restores trigger focus', () => {
    const close = vi.fn()
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()

    const { rerender } = render(
      <CourtDrawer open side="left" title="案件卷宗" onClose={close}>
        <button>查看证据</button>
      </CourtDrawer>,
    )

    expect(screen.getByRole('dialog', { name: '案件卷宗' }).contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(close).toHaveBeenCalledOnce()

    rerender(
      <CourtDrawer open={false} side="left" title="案件卷宗" onClose={close}>
        <button>查看证据</button>
      </CourtDrawer>,
    )
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })
})
```

- [ ] **Step 3: Run the test and confirm RED**

Run: `npm test -- src/components/courtroom/CourtDrawer.test.tsx`

Expected: FAIL because `CourtDrawer` does not exist.

- [ ] **Step 4: Implement the drawer**

Implementation requirements:

```tsx
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { useMediaQuery } from '@pxlkit/ui-kit'

export interface CourtDrawerProps {
  open: boolean
  side: 'left' | 'right'
  title: string
  badge?: ReactNode
  onClose: () => void
  children: ReactNode
}
```

The component must:

1. Capture `document.activeElement` when `open` becomes true.
2. Focus the close button after mount.
3. Close on `Escape`.
4. Keep `Tab` focus inside the panel by cycling the first/last focusable controls.
5. Restore the captured trigger when `open` becomes false.
6. Render `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`.
7. Render a clickable fixed backdrop.
8. Use `useMediaQuery('(min-width: 80rem)', true)`:
   - desktop: fixed left/right panel, width `min(460px, 42vw)`, full viewport height;
   - mobile/tablet: fixed bottom sheet, width full, maximum height `85dvh`.
9. Use a 44px close button and Motion enter/exit transitions.

- [ ] **Step 5: Run the drawer test and confirm GREEN**

Run: `npm test -- src/components/courtroom/CourtDrawer.test.tsx`

Expected: 1 test passes.

---

### Task 3: Active Testimony and Focused Agent Roster

**Files:**
- Create: `frontend/src/components/courtroom/ActiveTestimony.test.tsx`
- Create: `frontend/src/components/courtroom/ActiveTestimony.tsx`
- Create: `frontend/src/components/courtroom/AgentRoster.test.tsx`
- Create: `frontend/src/components/courtroom/AgentRoster.tsx`

**Interfaces:**
- `ActiveTestimony` consumes `turn: Turn | null`, `agent?: AgentSpec`, `status: AgentStatus`, `phaseLabel?: string`, `onOpenTranscript(): void`.
- `AgentRoster` consumes `agents: AgentSpec[]`, `statuses: Record<string, AgentStatus>`, `turns: Turn[]`, `betId: string | null`, `bettingLocked: boolean`, `onBet(agentId: string): void`.

- [ ] **Step 1: Write failing component tests**

The tests use `// @vitest-environment jsdom`, Testing Library, and minimal `AgentSpec` fixtures.

`ActiveTestimony.test.tsx` verifies:

```tsx
render(<ActiveTestimony turn={null} status="idle" phaseLabel="等待开庭" onOpenTranscript={open} />)
expect(screen.getByText('等待开庭')).toBeTruthy()

render(<ActiveTestimony turn={sampleTurn} agent={sampleAgent} status="speaking" phaseLabel="辩论 第1轮" onOpenTranscript={open} />)
expect(screen.getByText(sampleTurn.text)).toBeTruthy()
expect(screen.getByText('发言中')).toBeTruthy()
fireEvent.click(screen.getByRole('button', { name: '查看完整庭审记录' }))
expect(open).toHaveBeenCalledOnce()
```

`AgentRoster.test.tsx` verifies:

```tsx
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
expect(screen.getByRole('button', { name: new RegExp(speakingAgent.name) }).getAttribute('aria-current')).toBe('true')
fireEvent.click(screen.getByRole('button', { name: new RegExp(idleAgent.name) }))
expect(onBet).toHaveBeenCalledWith(idleAgent.id)
```

- [ ] **Step 2: Run both tests and confirm RED**

Run: `npm test -- src/components/courtroom/ActiveTestimony.test.tsx src/components/courtroom/AgentRoster.test.tsx`

Expected: FAIL because both components are missing.

- [ ] **Step 3: Implement `ActiveTestimony`**

Requirements:

- Use `CharacterPortrait` for the speaking Agent and `ACTION_STYLE` for action metadata.
- Render complete text in a bounded scroll region rather than line-clamping it.
- Show role, personality, `statusLabel(status)`, action, target, and a streaming caret.
- Empty state copy is phase-specific and says what the court is waiting for.
- The “查看完整庭审记录” button is at least 44px tall.
- Do not announce every streamed token through `aria-live`.

- [ ] **Step 4: Implement `AgentRoster`**

Requirements:

- Use actual `<button>` elements, not `role="button"` divs.
- Put the current speaking/thinking Agent first in the scrollable sequence.
- Add `aria-current="true"` to the active Agent.
- Include text labels for all statuses, so state is not color-only.
- Preserve the existing click-to-bet toggle contract and locked verdict title.
- Keep `DramaMeter` at the end of the rail.
- Use `CharacterPortrait` with animation disabled in the small roster thumbnails.

- [ ] **Step 5: Run both tests and confirm GREEN**

Run: `npm test -- src/components/courtroom/ActiveTestimony.test.tsx src/components/courtroom/AgentRoster.test.tsx`

Expected: all focused tests pass.

---

### Task 4: Agent Motion Vocabulary and Stage Spotlight

**Files:**
- Create: `frontend/src/components/scene/agentMotion.test.ts`
- Create: `frontend/src/components/scene/agentMotion.ts`
- Modify: `frontend/src/components/scene/AgentSprite.tsx`
- Modify: `frontend/src/components/scene/CharacterPortrait.tsx`
- Modify: `frontend/src/components/scene/CourtroomScene.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Produces: `agentMotionClass(status: AgentStatus, animated?: boolean): string`

- [ ] **Step 1: Write the failing motion mapping test**

```ts
import { describe, expect, it } from 'vitest'
import { agentMotionClass } from './agentMotion'

describe('agentMotionClass', () => {
  it('gives every animated state a distinct motion contract', () => {
    expect(agentMotionClass('idle')).toBe('agent-motion-idle')
    expect(agentMotionClass('thinking')).toBe('agent-motion-thinking')
    expect(agentMotionClass('speaking')).toBe('agent-motion-speaking')
    expect(agentMotionClass('angry')).toBe('agent-motion-angry')
    expect(agentMotionClass('happy')).toBe('agent-motion-happy')
  })

  it('disables state motion when animation is disabled', () => {
    expect(agentMotionClass('speaking', false)).toBe('')
  })
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- src/components/scene/agentMotion.test.ts`

Expected: FAIL because `agentMotion` does not exist.

- [ ] **Step 3: Implement the mapping and use it in both portrait renderers**

```ts
import type { AgentStatus } from '../../types'

export function agentMotionClass(status: AgentStatus, animated = true): string {
  return animated ? `agent-motion-${status}` : ''
}
```

Replace the duplicated `animate-float` / `animate-bob` / `animate-shake` selection in `AgentSprite` and `CharacterPortrait`.

- [ ] **Step 4: Add restrained state keyframes**

Add to `frontend/src/index.css`:

- `agent-idle`: slow two-step 2px breathing.
- `agent-thinking`: no body translation.
- `agent-speaking`: short two-step 2px forward/up cadence.
- `agent-angry`: one 420ms stepped recoil, not infinite.
- `agent-happy`: one 560ms stepped rise, not infinite.

The existing global reduced-motion rule must neutralize these animations.

- [ ] **Step 5: Add the signature “辩席聚光” to `CourtroomScene`**

When `speakerId` exists:

- Render a warm translucent cone from the upper court toward `PODIUM_ANCHOR`.
- Render a small elliptical floor pool below the speaker.
- Animate only opacity and scale over 220ms.
- Keep the spotlight behind Agent sprites and relation lines.
- Use a square pixel frame for stage status badges instead of new glass pills.
- Preserve current Agent movement coordinates, speech bubbles, relation edges, ghost messages, and gavel effect.

- [ ] **Step 6: Run the motion test**

Run: `npm test -- src/components/scene/agentMotion.test.ts`

Expected: 2 tests pass.

---

### Task 5: Separate Voxel Conversion from R3F Rendering

**Files:**
- Create: `frontend/src/components/scene3d/voxelData.test.ts`
- Create: `frontend/src/components/scene3d/voxelData.ts`
- Modify: `frontend/src/components/scene3d/VoxelIcon.tsx`

**Interfaces:**
- Produces: `iconToVoxelData(icon: PxlKitData, alphaCutoff?: number): VoxelDatum[]`
- `VoxelDatum` contains `{ x: number; y: number; color: string }`.

- [ ] **Step 1: Write a failing conversion test**

Use a tiny valid `PxlKitData` fixture and assert that transparent pixels are removed, colors are retained, and coordinates are centered around the icon grid.

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- src/components/scene3d/voxelData.test.ts`

Expected: FAIL because `voxelData` does not exist.

- [ ] **Step 3: Implement conversion using `gridToPixels`**

The helper owns alpha filtering and coordinate conversion. `VoxelIcon` owns R3F refs, animation, geometry, material, and `<Instances>`.

- [ ] **Step 4: Update `VoxelIcon` to consume `iconToVoxelData`**

Keep the current one-draw-call instancing, depth, material, spin, bob, and visual size.

- [ ] **Step 5: Run the focused test**

Run: `npm test -- src/components/scene3d/voxelData.test.ts`

Expected: conversion tests pass.

---

### Task 6: Stage-First Courtroom Composition

**Files:**
- Modify: `frontend/src/pages/CourtroomPage.tsx`

**Interfaces:**
- Consumes: `CourtDrawer`, `ActiveTestimony`, `AgentRoster`, `selectStageTurn`.
- Preserves all existing child component props and event handlers.

- [ ] **Step 1: Replace permanent side columns with local drawer state**

Add:

```ts
type CourtPanel = 'docket' | 'insights'
const [courtPanel, setCourtPanel] = useState<CourtPanel | null>(null)
```

Add header controls:

- “卷宗” opens `docket`; badge shows `freshCount`.
- “洞察” opens `insights`; badge indicates verdict or Seat debrief.
- Opening one closes the other because a single discriminated state owns both.
- The evidence chest continues to open the existing `EvidenceDrawer`; close `courtPanel` before opening it.

- [ ] **Step 2: Build the single-column stage**

Replace the desktop three-column grid with:

```tsx
<main className="relative mx-auto flex w-full max-w-[1680px] min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
  <section className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3">
    {/* stage */}
    {/* ActiveTestimony */}
    {/* AgentRoster */}
    {/* SeatDock or ActionBar */}
  </section>
</main>
```

Use `selectStageTurn(s.turns, s.activeTurnId, now)` and resolve its Agent from `s.agents`. Clicking “查看完整庭审记录” sets `tab` to `transcript` and opens `insights`.

- [ ] **Step 3: Move left-column content into the docket drawer**

The left `CourtDrawer` contains:

- `CaseTimeline`;
- evidence summary and `EvidenceRail`;
- an explicit “查看全部证据” button that calls `openChest()`.

Do not duplicate evidence business logic.

- [ ] **Step 4: Move right-column content into the insights drawer**

The right `CourtDrawer` contains:

- compact model/mode chip;
- `PredictionCard`;
- existing tab strip;
- existing graph, legal, transcript, Seat brief, and verdict panels unchanged.

The verdict effect may select the verdict tab but must not force-open the drawer.

- [ ] **Step 5: Remove the old inline roster and permanent asides**

Use the extracted `AgentRoster` and keep `placeBet` unchanged.

- [ ] **Step 6: Check edited-file diagnostics**

Run the IDE diagnostics for:

- `CourtroomPage.tsx`
- all new `components/courtroom/*`
- modified scene and voxel files.

Expected: no new TypeScript or lint diagnostics.

---

### Task 7: Responsive, Accessibility, and Regression Verification

**Files:**
- Modify as needed: `frontend/src/index.css`
- Modify as needed: files touched in Tasks 2–6

- [ ] **Step 1: Run focused and full tests**

Run:

```powershell
npm test -- src/components/courtroom src/components/scene/agentMotion.test.ts src/components/scene3d/voxelData.test.ts
npm test
```

Expected: focused tests and the full suite pass.

- [ ] **Step 2: Run lint and production build**

Run:

```powershell
npm run lint
npm run build
```

Expected: both commands exit 0 with no errors.

- [ ] **Step 3: Verify desktop layout in-browser**

At `1440×900`:

- stage plus testimony owns the visual majority of the first screen;
- no permanent side columns remain;
- both drawers overlay without resizing the stage;
- Escape closes each drawer and focus returns to its trigger;
- streaming testimony, roster, evidence chest, actions, pause, and tabs remain usable.

- [ ] **Step 4: Verify responsive layout**

Check `375×812`, `768×1024`, and `1024×768`:

- no page-level horizontal scroll;
- drawer is a bottom sheet and stays at or under `85dvh`;
- close and drawer trigger controls are at least 44px;
- stage keeps its aspect ratio;
- testimony and action dock do not overlap.

- [ ] **Step 5: Verify reduced motion**

Emulate `prefers-reduced-motion: reduce`:

- no continuous Agent translation, pulsing, or drawer choreography remains;
- status labels and visual state markers remain understandable.

- [ ] **Step 6: Review final diff**

Run:

```powershell
git diff -- frontend docs/superpowers/specs/2026-09-06-heirarena-courtroom-stage-design.md docs/superpowers/plans/2026-09-06-heirarena-courtroom-stage.md
git status --short
```

Expected: only the intended frontend files and the two design documents are newly modified by this task; unrelated pre-existing changes remain untouched.
