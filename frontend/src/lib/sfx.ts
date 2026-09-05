import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * 8-bit 音效：全部用 Web Audio 振荡器现场合成，不带任何音频文件。
 * 浏览器要求首次用户手势后才能出声，所以 AudioContext 懒创建，并在 pointerdown / keydown 时 resume。
 */
export type SfxName =
  | 'move' | 'confirm' | 'back' | 'open' | 'stamp' | 'error' | 'coin'
  | 'gavel' | 'attack' | 'ally' | 'blip' | 'phase' | 'verdict' | 'ghost'

interface Note {
  freq: number
  /** 滑到的目标频率（可选） */
  to?: number
  dur: number
  type?: OscillatorType
  gain?: number
  /** 频率抖动幅度（0~1）：每次发声随机偏移，打字机不至于机械重复 */
  jitter?: number
}

const PATCH: Record<SfxName, Note[]> = {
  move: [{ freq: 880, to: 1046, dur: 0.045, type: 'square', gain: 0.035 }],
  confirm: [{ freq: 659, dur: 0.06, type: 'square' }, { freq: 988, dur: 0.09, type: 'square' }],
  back: [{ freq: 523, to: 392, dur: 0.09, type: 'triangle' }],
  open: [{ freq: 523, dur: 0.05, type: 'square' }, { freq: 659, dur: 0.05, type: 'square' }, { freq: 784, dur: 0.08, type: 'square' }],
  stamp: [{ freq: 220, to: 70, dur: 0.14, type: 'sawtooth', gain: 0.07 }, { freq: 110, dur: 0.05, type: 'square', gain: 0.05 }],
  error: [{ freq: 196, dur: 0.07, type: 'square', gain: 0.05 }, { freq: 185, dur: 0.12, type: 'square', gain: 0.05 }],
  coin: [{ freq: 988, dur: 0.05, type: 'square' }, { freq: 1319, dur: 0.14, type: 'square' }],
  /* 落槌：低频闷砸 + 一声余震 */
  gavel: [{ freq: 170, to: 52, dur: 0.15, type: 'sawtooth', gain: 0.1 }, { freq: 62, dur: 0.14, type: 'triangle', gain: 0.08 }],
  /* 攻击：挥砍下滑 + 命中钝响 */
  attack: [{ freq: 760, to: 210, dur: 0.08, type: 'sawtooth', gain: 0.055 }, { freq: 170, to: 85, dur: 0.11, type: 'square', gain: 0.05 }],
  /* 结盟：温暖上行三音 */
  ally: [{ freq: 523, dur: 0.07, type: 'square', gain: 0.04 }, { freq: 659, dur: 0.07, type: 'square', gain: 0.04 }, { freq: 880, dur: 0.12, type: 'square', gain: 0.045 }],
  /* 打字机：极短极轻的方波tick，频率带抖动 */
  blip: [{ freq: 1180, dur: 0.022, type: 'square', gain: 0.016, jitter: 0.22 }],
  /* 阶段号角：开庭式上行 */
  phase: [{ freq: 523, dur: 0.07, type: 'square', gain: 0.045 }, { freq: 659, dur: 0.07, type: 'square', gain: 0.045 }, { freq: 784, dur: 0.07, type: 'square', gain: 0.045 }, { freq: 1046, dur: 0.15, type: 'square', gain: 0.05 }],
  /* 裁决：庄严琶音收束 */
  verdict: [{ freq: 392, dur: 0.12, type: 'triangle', gain: 0.055 }, { freq: 523, dur: 0.12, type: 'triangle', gain: 0.055 }, { freq: 659, dur: 0.12, type: 'triangle', gain: 0.055 }, { freq: 784, dur: 0.26, type: 'square', gain: 0.05 }],
  /* 幽灵：两段诡异的正弦下滑 */
  ghost: [{ freq: 880, to: 430, dur: 0.28, type: 'sine', gain: 0.04 }, { freq: 610, to: 300, dur: 0.34, type: 'sine', gain: 0.032 }],
}

let ctx: AudioContext | null = null
let armed = false

function context(): AudioContext | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/* 第一次手势时把上下文唤醒，之后 hover 之类的非手势触发也能出声 */
function arm() {
  if (armed || typeof window === 'undefined') return
  armed = true
  const wake = () => { context() }
  window.addEventListener('pointerdown', wake, { once: true, passive: true })
  window.addEventListener('keydown', wake, { once: true, passive: true })
}

function synth(notes: Note[]) {
  const ac = context()
  if (!ac || ac.state !== 'running') return
  let t = ac.currentTime
  for (const n of notes) {
    const osc = ac.createOscillator()
    const env = ac.createGain()
    osc.type = n.type ?? 'square'
    const k = n.jitter ? 1 + (Math.random() * 2 - 1) * n.jitter : 1
    osc.frequency.setValueAtTime(n.freq * k, t)
    if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to * k, t + n.dur)
    const g = n.gain ?? 0.045
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(g, t + 0.004)
    env.gain.exponentialRampToValueAtTime(0.0001, t + n.dur)
    osc.connect(env).connect(ac.destination)
    osc.start(t)
    osc.stop(t + n.dur + 0.01)
    t += n.dur
  }
}

interface SfxState {
  muted: boolean
  toggle: () => void
  play: (name: SfxName) => void
}

export const useSfx = create<SfxState>()(
  persist(
    (set, get) => ({
      muted: false,
      toggle: () => {
        const next = !get().muted
        set({ muted: next })
        if (!next) synth(PATCH.confirm)
      },
      play: (name) => {
        if (get().muted) return
        synth(PATCH[name])
      },
    }),
    { name: 'heirarena-sfx', partialize: (s) => ({ muted: s.muted }) },
  ),
)

arm()

/** 非组件代码里直接用 */
export const sfx = (name: SfxName) => useSfx.getState().play(name)
