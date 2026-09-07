import { Flag, Heart, Scroll, Sword } from '@pxlkit/gamification'
import { Friends } from '@pxlkit/social'
import type { PxlKitData } from '@pxlkit/core'

export interface ActionStyle {
  label: string
  icon: PxlKitData
  /** 文本 / 边框 / 底色：全部走主题令牌（火漆 / 玉绿 / 黄铜 / 幽灵紫 / 粉），不用默认霓虹色 */
  cls: string
  /** 纯色值：给 SVG、内联样式用 */
  color: string
}

/** 辩论动作的统一视觉词汇：像素图标 + 语义色，气泡、记录、裁决三处共用 */
export const ACTION_STYLE: Record<string, ActionStyle> = {
  attack: { label: '攻击', icon: Sword, cls: 'text-seal-400 border-seal-700 bg-seal-700/25', color: '#ea6a5b' },
  ally: { label: '结盟', icon: Friends, cls: 'text-jade-300 border-jade-700 bg-jade-700/25', color: '#7fd9ad' },
  propose: { label: '提案', icon: Scroll, cls: 'text-gold-300 border-gold-600 bg-gold-600/20', color: '#f3d38a' },
  concede: { label: '让步', icon: Flag, cls: 'text-ink-200 border-ink-600 bg-ink-800', color: '#e0d3b9' },
  plead: { label: '恳求', icon: Heart, cls: 'text-[#f7a9c8] border-[#a83a63] bg-[#a83a63]/25', color: '#f7a9c8' },
}
