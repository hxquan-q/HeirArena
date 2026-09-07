import { ParallaxPxlKitIcon, PxlKitIcon } from '@pxlkit/core'
import { Send, WarningTriangle } from '@pxlkit/feedback'
import { ManaPotion } from '@pxlkit/gamification'
import { GhostFriend } from '@pxlkit/parallax'
import { PixelProgress, PixelTooltip, useToast } from '@pxlkit/ui-kit'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { EvidenceCard } from '../../lib/evidence'
import { sfx } from '../../lib/sfx'
import { castSkill, ENERGY_MAX, SKILLS, WHISPER_COST, type Skill } from '../../lib/skills'
import { selectSave, useArena } from '../../store/useArena'
import type { AgentSpec, CaseInput, Turn } from '../../types'

interface Props {
  sessionId: string
  caseData: CaseInput | null
  agents: AgentSpec[]
  turns: Turn[]
  done: boolean
  /** 出示证据：让页面打开选卡抽屉 */
  onPickEvidence: () => void
  /** 页面选好卡后传回来，行动栏据此施放"出示证据" */
  pickedEvidence: EvidenceCard | null
  onPickedHandled: () => void
}

/* 幽灵快捷语录：一点就上膛的"显灵"台词 */
const GHOST_QUIPS = [
  '我尸骨未寒，你们就吵成这样？',
  '谁床前尽孝最多，谁就该多分。',
  '别忘了照顾好那只猫！',
  '都别争了，和和气气地平分吧。',
]

/**
 * 显灵行动栏：玩家是逝者的幽灵。能量按阶段回复，五张显灵术卡各有代价，
 * 全部通过 interject 落到下一位发言人的耳朵里；自由低语也要花一点能量。
 */
export default function ActionBar({ sessionId, caseData, agents, turns, done, onPickEvidence, pickedEvidence, onPickedHandled }: Props) {
  const save = useArena(selectSave)
  const spend = useArena((s) => s.spend)
  const { toast } = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  // 抽屉里选好证据 → 施放"出示证据"
  useEffect(() => {
    if (!pickedEvidence || !caseData) return
    const skill = SKILLS.find((s) => s.id === 'present')!
    onPickedHandled()
    void send(castSkill('present', { caseData, agents, turns, evidence: pickedEvidence }), skill.cost, skill.label)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedEvidence])

  const send = async (line: string, cost: number, label: string) => {
    if (!line.trim() || busy || done) return
    if (!spend(cost)) {
      sfx('error')
      toast.error({ title: '显灵能量不足', message: `${label}需要 ${cost} 点，等下一阶段回蓝`, icon: <PxlKitIcon icon={WarningTriangle} size={16} /> })
      return
    }
    setBusy(label)
    try {
      await api.interject(sessionId, line)
      sfx('ghost')
      toast({ title: `${label} · 显灵成功`, message: line, tone: 'purple', icon: <PxlKitIcon icon={ManaPotion} size={16} />, duration: 5000 })
      setText('')
    } catch (e) {
      sfx('error')
      toast.error({ title: '幽灵没能显灵', message: (e as Error).message, icon: <PxlKitIcon icon={WarningTriangle} size={16} /> })
    } finally {
      setBusy(null)
    }
  }

  const cast = (skill: Skill) => {
    if (!caseData) return
    if (skill.needsEvidence) {
      if (save.energy < skill.cost) {
        sfx('error')
        toast.error({ title: '显灵能量不足', message: `${skill.label}需要 ${skill.cost} 点`, icon: <PxlKitIcon icon={WarningTriangle} size={16} /> })
        return
      }
      sfx('open')
      onPickEvidence()
      return
    }
    void send(castSkill(skill.id, { caseData, agents, turns }), skill.cost, skill.label)
  }

  const pct = Math.round((save.energy / ENERGY_MAX) * 100)

  return (
    <div className="panel-elevated flex shrink-0 flex-col gap-2 p-2 sm:p-2.5 xl:flex-row xl:items-stretch">
      <div className="flex items-stretch gap-2 xl:min-w-0 xl:flex-[1.35]">
        {/* 能量槽 */}
        <div className="flex w-[150px] shrink-0 flex-col justify-center gap-1 border-2 border-ghost-700 bg-ghost-700/10 px-2.5 py-1.5">
          <div className="flex items-center justify-between">
            <span className="pixel-text flex items-center gap-1 text-[11px] text-ghost-300"><PxlKitIcon icon={ManaPotion} size={13} /> 显灵能量</span>
            <motion.span key={save.energy} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="pixel-text text-[14px] text-ghost-300">
              {save.energy}<span className="text-[10px] text-ink-400">/{ENERGY_MAX}</span>
            </motion.span>
          </div>
          <PixelProgress value={pct} tone="purple" showValue={false} aria-label="显灵能量" />
          <span className="text-[9px] leading-tight text-ink-400">每进入新阶段 +15 · 已显灵 {save.casts} 次</span>
        </div>

        {/* 显灵术卡 */}
        <div className="no-scrollbar flex min-w-0 flex-1 items-stretch gap-1.5 overflow-x-auto">
          {SKILLS.map((sk) => {
            const affordable = save.energy >= sk.cost
            const locked = done || !affordable
            return (
              <PixelTooltip key={sk.id} content={`${sk.desc}（${sk.cost} 能量）`}>
                <button type="button" disabled={done || busy !== null} onClick={() => cast(sk)}
                  aria-label={`${sk.label}，消耗 ${sk.cost} 能量`}
                  className={`group relative flex w-[92px] shrink-0 flex-col items-center justify-center gap-1 border-2 px-1.5 py-1.5 transition ${locked
                    ? 'border-ink-700 bg-ink-950/60 text-ink-400'
                    : sk.id === 'ultimate'
                      ? 'border-seal-700 bg-seal-700/15 text-ink-100 shadow-[2px_2px_0_rgba(0,0,0,.55)] hover:-translate-x-px hover:-translate-y-px hover:border-seal-400'
                      : 'border-ghost-700 bg-ink-900 text-ink-100 shadow-[2px_2px_0_rgba(0,0,0,.55)] hover:-translate-x-px hover:-translate-y-px hover:border-ghost-400'} ${busy === sk.label ? 'animate-blink-step' : ''}`}>
                  <span className={`flex h-8 w-8 items-center justify-center border-2 border-ink-950 ${locked ? 'bg-ink-900 grayscale' : sk.id === 'ultimate' ? 'bg-seal-700/40' : 'bg-ghost-700/35'}`}>
                    <PxlKitIcon icon={sk.icon} size={18} appearance={locked ? 'solid' : 'palette'} color="#7a6350" />
                  </span>
                  <span className="pixel-text text-[11px] leading-3">{sk.label}</span>
                  <span className={`pixel-text text-[10px] leading-3 ${affordable ? 'text-ghost-300' : 'text-seal-400'}`}>
                    {locked && !affordable ? `需 ${sk.cost}` : `-${sk.cost}`}
                  </span>
                  {sk.id === 'ultimate' && !affordable && !done && (
                    <span className="absolute -top-1.5 -right-1 border border-ink-950 bg-seal-700 px-1 text-[8px] leading-3 text-white">锁</span>
                  )}
                </button>
              </PixelTooltip>
            )
          })}
        </div>
      </div>

      {/* 自由低语 */}
      <div className="flex items-center gap-2 xl:min-w-[360px] xl:flex-1">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-ghost-700 bg-ghost-700/10">
          <ParallaxPxlKitIcon icon={GhostFriend} size={20} strength={12} interactive appearance="palette" aria-label="逝者的幽灵" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 border-2 border-ink-600 bg-ink-950 p-0.5 pl-2.5 transition focus-within:border-ghost-400">
          <input className="min-w-0 flex-1 bg-transparent text-sm text-ink-100 outline-none placeholder:text-ink-400"
            placeholder={done ? '听证会已结束，幽灵也该安息了。' : `以 ${caseData?.decedent_name ?? '逝者'} 的幽灵身份低语一句（-${WHISPER_COST} 能量）…`}
            value={text} disabled={done} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void send(text, WHISPER_COST, '低语')} maxLength={200} />
          <span className="hidden font-mono text-[9px] text-ink-400 sm:inline">{text.length}/200</span>
          <button className="btn-gold shrink-0 px-3 py-1 text-xs" disabled={!text.trim() || busy !== null || done} onClick={() => void send(text, WHISPER_COST, '低语')}>
            <PxlKitIcon icon={Send} size={13} appearance="solid" color="#1b1205" /> {busy === '低语' ? '传递中' : '显灵'}
          </button>
        </div>
        {!done && (
          <div className="no-scrollbar hidden items-center gap-1.5 overflow-x-auto 2xl:flex">
            {GHOST_QUIPS.map((q) => (
              <button key={q} type="button" onClick={() => { setText(q); sfx('move') }}
                className="shrink-0 border border-ghost-700/60 bg-ghost-700/10 px-2 py-0.5 text-[10px] text-ghost-300/85 transition hover:border-ghost-400 hover:text-ghost-300">
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
