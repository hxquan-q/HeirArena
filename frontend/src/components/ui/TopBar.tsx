import { PxlKitIcon } from '@pxlkit/core'
import { Plug, Volume2, VolumeX } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ServerConfig } from '../../api/client'
import { useSfx } from '../../lib/sfx'
import type { Provider } from '../../types'
import { Gavel as PixelGavel } from '../icons/pixel'

interface Props {
  config: ServerConfig | null
  providers: Provider[]
  onManageProviders: () => void
  /** 左侧品牌之前的插槽（例如「返回大厅」） */
  leading?: ReactNode
  /** 品牌右侧的插槽（例如当前卷宗名） */
  center?: ReactNode
}

export default function TopBar({ config, providers, onManageProviders, leading, center }: Props) {
  return (
    <header className="relative z-30 shrink-0 border-b-2 border-ink-700 bg-ink-900">
      <div className="wainscot h-2 w-full" aria-hidden />
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-3 sm:px-5">
        {leading}
        <Link to="/" className="flex min-w-0 items-center gap-2.5" aria-label="回到大厅">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-gold-600 bg-ink-950 shadow-[2px_2px_0_#000]">
            <PxlKitIcon icon={PixelGavel} size={22} colorful />
          </span>
          <span className="min-w-0 leading-none">
            <span className="pixel-text block text-[14px] tracking-[0.12em] text-gold-300">HEIR ARENA</span>
            <span className="pixel-text mt-1 block truncate text-[12px] text-ink-300">遗产竞技场</span>
          </span>
        </Link>
        {center && <div className="hidden min-w-0 items-center md:flex">{center}</div>}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ModeBadge config={config} providers={providers} />
          <SfxToggle />
          <button className="btn-ghost h-9 px-2.5" onClick={onManageProviders}>
            <Plug size={13} /> <span className="hidden sm:inline">模型供应商</span>
          </button>
        </div>
      </div>
    </header>
  )
}

/** 8-bit 音效开关：状态存 localStorage，取消静音时会响一声确认。 */
export function SfxToggle() {
  const muted = useSfx((s) => s.muted)
  const toggle = useSfx((s) => s.toggle)
  return (
    <button type="button" className="btn-ghost h-9 w-9 justify-center px-0" onClick={toggle}
      aria-pressed={!muted} aria-label={muted ? '开启音效' : '关闭音效'} title={muted ? '音效已关' : '音效已开'}>
      {muted ? <VolumeX size={14} className="text-ink-400" /> : <Volume2 size={14} className="text-gold-300" />}
    </button>
  )
}

export function ModeBadge({ config, providers }: { config: ServerConfig | null; providers: Provider[] }) {
  if (!config) {
    return (
      <span className="chip text-ink-400">
        <span className="h-2 w-2 animate-blink-step bg-ink-300" /> 连接中
      </span>
    )
  }
  const ready = providers.filter((p) => p.ready)
  const models = ready.reduce((n, p) => n + p.models.length, 0)
  return ready.length > 0 ? (
    <span className="chip border-jade-700 bg-jade-700/20 text-jade-300" title={ready.map((p) => p.name).join('、')}>
      <span className="h-2 w-2 bg-jade-300 shadow-[0_0_6px_#7fd9ad]" />
      <span className="hidden sm:inline">{ready.length} 供应商 · {models} 模型</span>
      <span className="sm:hidden">AI</span>
    </span>
  ) : (
    <span className="chip border-gold-600 bg-gold-600/15 text-gold-300" title="接入任意 OpenAI 兼容接口后，角色会由模型驱动">
      <span className="h-2 w-2 bg-gold-400" />
      <span className="hidden sm:inline">剧本演示</span><span className="sm:hidden">演示</span>
    </span>
  )
}
