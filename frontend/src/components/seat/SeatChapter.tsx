import { PixelAlertDialog, PixelSegmented, PixelSwitch } from '@pxlkit/ui-kit'
import { useState, type ReactNode } from 'react'
import { describeRef, useProviders } from '../../hooks/useProviders'
import { useCaseDraft, useSeatAnalysis } from '../../store/useCaseDraft'
import GoalsForm from './GoalsForm'
import OpponentGoals from './OpponentGoals'
import ReachabilityHint from './ReachabilityHint'
import SeatPicker from './SeatPicker'
import StrategyPanel from './StrategyPanel'
import WhatIfPanel from './WhatIfPanel'

interface Props {
  onManageProviders: () => void
  onGoFile: () => void
}

export default function SeatChapter({ onManageProviders, onGoFile }: Props) {
  const c = useCaseDraft((s) => s.c)
  const advisorModel = useCaseDraft((s) => s.advisorModel)
  const leaveSeat = useCaseDraft((s) => s.leaveSeat)
  const setSeatHuman = useCaseDraft((s) => s.setSeatHuman)
  const { providers } = useProviders()
  const [intent, setIntent] = useState<'observe' | 'seat'>(c.seat ? 'seat' : 'observe')
  const [leaveOpen, setLeaveOpen] = useState(false)
  useSeatAnalysis()
  const mode = c.seat ? 'seat' : intent

  const player = c.members.find((m) => m.id === c.seat?.player_id)
  const advisorLabel = describeRef(
    c.seat?.advisor_model ?? advisorModel ?? c.executor_model,
    providers,
    '跟随执行官',
  )

  const switchMode = (next: string) => {
    if (next === 'observe') {
      if (c.seat?.strategy) {
        setLeaveOpen(true)
        return
      }
      leaveSeat()
      setIntent('observe')
      return
    }
    setIntent('seat')
  }

  return (
    <div className="space-y-4">
      <div className="panel-elevated p-4">
        <div className="pixel-text text-[12px] text-gold-400">开庭模式</div>
        <div className="mt-2">
          <PixelSegmented
            aria-label="开庭模式"
            tone="gold"
            value={mode}
            onChange={switchMode}
            options={[
              { value: 'observe', label: '旁观全员' },
              { value: 'seat', label: '入局推演' },
            ]}
          />
        </div>
        {mode === 'observe' && (
          <p className="mt-3 text-[12px] leading-relaxed text-ink-400">
            旁观模式下执行官不知道谁是玩家，庭审按全员 Agent 进行。右侧火漆可直接开庭。
          </p>
        )}
      </div>

      {mode === 'seat' && (
        <>
          <div className="panel-inset p-3 text-[12px] leading-relaxed text-ink-300">
            入局模式关闭幽灵插话；对手也会按自己的最优策略行动；执行官不知道谁是玩家。
          </div>

          <Block step="01" title="席位选择" subtitle="我是案件中的谁">
            <SeatPicker />
            {c.seat && <div className="mt-3"><ReachabilityHint /></div>}
          </Block>

          {c.seat && player && (
            <>
              <Block step="02" title="我的诉求" subtitle={player.name}>
                <GoalsForm memberId={c.seat.player_id} />
              </Block>
              <Block step="03" title="对手诉求" subtitle="系统推断，可改，只进你的简报">
                <OpponentGoals />
              </Block>
              <Block step="04" title="what-if 沙盘" subtitle="推演事实开关，不改卷宗">
                <WhatIfPanel />
              </Block>
              <Block step="05" title="推演策略" subtitle="矩阵 · 简报 · 博弈表">
                <StrategyPanel onManageProviders={onManageProviders} />
              </Block>
              <Block step="06" title="席位初值与军师" subtitle="开庭后谁来发言">
                <div className="space-y-3">
                  <PixelSwitch
                    label="开庭后本席由我发言"
                    checked={c.seat.seat_human}
                    tone="gold"
                    onChange={setSeatHuman}
                  />
                  <p className="text-[11px] leading-relaxed text-ink-400">
                    随时可在庭审中切换；关着时由 AI 代理按简报发言。
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-300">
                    <span>当前军师：{advisorLabel}</span>
                    <button type="button" className="pixel-text text-gold-300 hover:underline" onClick={onGoFile}>
                      去第 I 卷修改
                    </button>
                  </div>
                </div>
              </Block>
            </>
          )}
        </>
      )}

      <PixelAlertDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="切回旁观会丢弃已生成的策略"
        description="矩阵、简报和博弈表都会清掉。确定切回旁观全员？"
        actionLabel="丢弃并旁观"
        cancelLabel="留下"
        destructive
        onAction={() => {
          leaveSeat()
          setIntent('observe')
        }}
      />
    </div>
  )
}

function Block({ step, title, subtitle, children }: { step: string; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="panel-elevated p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="pixel-text flex h-8 w-8 items-center justify-center border-2 border-gold-600 bg-ink-950 text-[12px] text-gold-300">{step}</span>
        <div>
          <h3 className="pixel-text text-[16px] text-ink-100">{title}</h3>
          <p className="text-[11px] text-ink-400">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  )
}
