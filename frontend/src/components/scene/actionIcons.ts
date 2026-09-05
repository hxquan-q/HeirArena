import { Flag, Heart, Scroll, Sword } from '@pxlkit/gamification'
import { Friends } from '@pxlkit/social'
import type { PxlKitData } from '@pxlkit/core'

export interface ActionStyle {
  label: string
  icon: PxlKitData
  /** 文本 / 边框 / 底色（深色主题下的语义色） */
  cls: string
}

/** 辩论动作的统一视觉词汇：像素图标 + 语义色，气泡、记录、裁决三处共用 */
export const ACTION_STYLE: Record<string, ActionStyle> = {
  attack: { label: '攻击', icon: Sword, cls: 'text-red-300 border-red-400/40 bg-red-500/10' },
  ally: { label: '结盟', icon: Friends, cls: 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10' },
  propose: { label: '提案', icon: Scroll, cls: 'text-sky-300 border-sky-400/40 bg-sky-500/10' },
  concede: { label: '让步', icon: Flag, cls: 'text-amber-300 border-amber-400/40 bg-amber-500/10' },
  plead: { label: '恳求', icon: Heart, cls: 'text-pink-300 border-pink-400/40 bg-pink-500/10' },
}
