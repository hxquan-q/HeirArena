import { ParallaxPxlKitIcon, PxlKitIcon } from '@pxlkit/core'
import { Coin, Key, Scroll, SpellBook } from '@pxlkit/gamification'
import { GhostFriend, MagicOrb, PixelCrown, PixelHeart } from '@pxlkit/parallax'
import { Gear } from '@pxlkit/ui'
import { useMediaQuery } from '@pxlkit/ui-kit'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, BookOpen, Check, Clapperboard } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type ServerConfig } from '../api/client'
import ProviderManager from '../components/ProviderManager'
import Fireflies from '../components/scene/Fireflies'
import { RoomBackground } from '../components/scene/Room'
import SafeVoxelStage from '../components/scene3d/SafeVoxelStage'
import { ModeBadge, SfxToggle } from '../components/ui/TopBar'
import { Gavel as PixelGavel } from '../components/icons/pixel'
import { PRESETS } from '../data/presets'
import { useProviders } from '../hooks/useProviders'
import { sfx } from '../lib/sfx'
import { useCaseDraft } from '../store/useCaseDraft'

type MenuId = 'continue' | 'episodes' | 'import' | 'providers'
interface MenuItem {
  id: MenuId
  label: string
  icon: ReactNode
  hint: (ctx: { save: string; preset?: string }) => string
}
const MENU: MenuItem[] = [
  { id: 'continue', label: '继续卷宗', icon: <BookOpen size={16} />, hint: ({ save, preset }) => `${save}${preset ? ` · ${preset}` : ''}` },
  { id: 'episodes', label: '选择剧本', icon: <Clapperboard size={16} />, hint: () => `${PRESETS.length} 个原型案件，选一个直接开卷` },
  { id: 'import', label: 'AI 读案建卷', icon: <PxlKitIcon icon={SpellBook} size={16} />, hint: () => '上传 / 粘贴案情，执行官替你抽取人物与资产' },
  { id: 'providers', label: '模型供应商', icon: <PxlKitIcon icon={Gear} size={16} appearance="solid" color="currentColor" />, hint: () => '接入 OpenAI 兼容接口，角色由模型驱动' },
]

/* 判定是否正在输入：标题画面的快捷键不该抢输入框的键 */
const typing = () => {
  const el = document.activeElement
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable)
}

export default function LobbyPage() {
  const nav = useNavigate()
  const [config, setConfig] = useState<ServerConfig | null>(null)
  const [showProviders, setShowProviders] = useState(false)
  const { providers, presets, refresh } = useProviders()
  const c = useCaseDraft((s) => s.c)
  const activePreset = useCaseDraft((s) => s.activePreset)
  const loadPreset = useCaseDraft((s) => s.loadPreset)

  const narrow = useMediaQuery('(max-width: 40rem)', false)
  const totemSize = narrow ? 140 : 200

  const [screen, setScreen] = useState<'menu' | 'episodes'>('menu')
  const [cursor, setCursor] = useState(0)
  const [epCursor, setEpCursor] = useState(() => Math.max(0, PRESETS.findIndex((p) => p.id === activePreset)))

  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(null))
  }, [])

  const onProvidersChanged = async () => {
    await refresh()
    api.config().then(setConfig).catch(() => {})
  }

  const total = c.assets.reduce((s, a) => s + (Number(a.value) || 0), 0)
  const saveLabel = `${c.decedent_name || '未命名'}的遗产卷宗 · ${c.members.length} 位 · ${total.toFixed(total >= 100 ? 0 : 1)} 万`
  const presetTitle = PRESETS.find((p) => p.id === activePreset)?.title

  const moveCursor = (setter: (fn: (v: number) => number) => void, delta: number, n: number) => {
    sfx('move')
    setter((v) => (v + delta + n) % n)
  }
  const hoverCursor = (setter: (v: number) => void, current: number, next: number) => {
    if (current !== next) { sfx('move'); setter(next) }
  }

  const activate = useCallback((id: MenuId) => {
    sfx(id === 'episodes' ? 'open' : 'confirm')
    if (id === 'continue') nav('/setup')
    else if (id === 'episodes') setScreen('episodes')
    else if (id === 'import') nav('/import')
    else setShowProviders(true)
  }, [nav])

  const pickEpisode = useCallback((idx: number) => {
    const p = PRESETS[idx]
    if (!p) return
    sfx('coin')
    loadPreset(p.id)
    nav('/setup')
  }, [loadPreset, nav])

  const backToMenu = useCallback(() => { sfx('back'); setScreen('menu') }, [])

  /* 手柄式操作：↑↓←→ 移动光标，Enter 确认，Esc 返回 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showProviders || typing()) return
      if (screen === 'menu') {
        if (e.key === 'ArrowDown') { e.preventDefault(); moveCursor(setCursor, 1, MENU.length) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); moveCursor(setCursor, -1, MENU.length) }
        else if (e.key === 'Enter') { e.preventDefault(); activate(MENU[cursor].id) }
      } else {
        const n = PRESETS.length
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); moveCursor(setEpCursor, 1, n) }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); moveCursor(setEpCursor, -1, n) }
        else if (e.key === 'Enter') { e.preventDefault(); pickEpisode(epCursor) }
        else if (e.key === 'Escape') { e.preventDefault(); backToMenu() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen, cursor, epCursor, showProviders, activate, pickEpisode, backToMenu])

  return (
    <div className="lobby-shell relative flex min-h-screen flex-col">
      {/* 背景：把听证庭场景本身当标题画面的世界 */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: 'max(100vw, 171.5vh)', height: 'max(100vh, 58.4vw)' }}>
          <RoomBackground decedentName={c.decedent_name} />
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_40%,rgba(23,18,15,.42),rgba(23,18,15,.92)_78%)]" />
        <Fireflies count={18} />
        <div className="scanlines absolute inset-0 opacity-70" />
      </div>

      {/* HUD 顶栏 */}
      <header className="relative z-20 flex items-center justify-between px-4 py-3 sm:px-6">
        <span className="pixel-text text-[12px] tracking-[0.14em] text-ink-400">HEIR ARENA · v0.1 · 像素听证庭</span>
        <div className="flex items-center gap-2">
          <ModeBadge config={config} providers={providers} />
          <SfxToggle />
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-[1200px] flex-1 items-center gap-10 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-14 lg:py-0">
        {/* 标题区 */}
        {/* 窄屏下标题块叠在明亮的护墙板上，垫一层半透明深色底保证可读 */}
        <section className="relative flex flex-col items-center text-center max-lg:border-2 max-lg:border-ink-700/70 max-lg:bg-ink-950/60 max-lg:px-4 max-lg:py-5 lg:items-start lg:text-left">
          {/* 视差漂浮物：像素世界里的道具 */}
          <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden>
            <span className="absolute -top-6 left-[8%] opacity-80"><ParallaxPxlKitIcon icon={PixelCrown} size={34} strength={18} interactive appearance="palette" /></span>
            <span className="absolute top-[18%] right-[6%] opacity-70"><ParallaxPxlKitIcon icon={GhostFriend} size={36} strength={26} interactive appearance="palette" /></span>
            <span className="absolute bottom-[6%] left-[2%] opacity-70"><ParallaxPxlKitIcon icon={MagicOrb} size={30} strength={14} interactive appearance="palette" /></span>
            <span className="absolute right-[18%] bottom-[10%] opacity-70"><ParallaxPxlKitIcon icon={PixelHeart} size={26} strength={22} interactive appearance="palette" /></span>
            <span className="animate-float absolute top-[46%] right-[2%] opacity-70"><PxlKitIcon icon={Coin} size={24} /></span>
            <span className="animate-float absolute top-[8%] left-[38%] opacity-60 [animation-delay:1.2s]"><PxlKitIcon icon={Key} size={22} /></span>
          </div>

          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
            className="relative" style={{ width: totemSize, height: totemSize }}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_55%,rgba(226,178,90,.28),transparent_62%)]" aria-hidden />
            <SafeVoxelStage
              icon={PixelGavel}
              size={totemSize}
              spin={0.4}
              bob={0.07}
              glow="rgba(226,178,90,.32)"
              fallbackLabel="法槌图腾"
            />
          </motion.div>

          {/* 标题按视口宽度流式缩放：手机 40px 起，宽屏封顶 72px，不再在 390px 宽下被裁掉 */}
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.08 }}
            className="pixel-text mt-2 max-w-full leading-none">
            <span className="gold-text block text-[clamp(40px,11vw,72px)] tracking-[0.06em]" style={{ filter: 'drop-shadow(4px 4px 0 rgba(0,0,0,.7))' }}>HEIR ARENA</span>
            <span className="mt-2 block text-[clamp(20px,5.5vw,30px)] tracking-[0.3em] text-ink-100" style={{ textShadow: '3px 3px 0 rgba(0,0,0,.7)' }}>遗 产 竞 技 场</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.2 }}
            className="mt-5 max-w-[520px] text-[13px] leading-6 text-ink-200 sm:text-[14px] sm:leading-7" style={{ textShadow: '1px 1px 0 rgba(0,0,0,.8)' }}>
            写下身后事，让 AI 继承人在像素听证庭里陈述、交锋、结盟；遗嘱执行官依《民法典》落槌，每一条裁决都能溯源。
          </motion.p>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.5 }}
            className="pixel-text mt-6 flex items-center gap-3 text-[12px] text-gold-300">
            <span className="animate-blink-step">▶ PRESS START</span>
            <span className="text-ink-400">·</span>
            <span className="text-ink-300">↑↓ 选择 · Enter 确认 · Esc 返回</span>
          </motion.div>
        </section>

        {/* 主菜单 / 剧本选择 */}
        <section className="w-full">
          <AnimatePresence mode="wait" initial={false}>
            {screen === 'menu' ? (
              <motion.div key="menu" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.22 }}
                className="panel-wood bg-ink-800 p-2">
                <div className="flex items-center justify-between border-b-2 border-ink-700 px-3 py-2">
                  <span className="pixel-text text-[12px] tracking-[0.14em] text-gold-400">MAIN MENU · 主菜单</span>
                  <span className="pixel-text text-[12px] text-ink-400">{cursor + 1}/{MENU.length}</span>
                </div>
                <ul className="p-1" role="menu" aria-label="主菜单">
                  {MENU.map((item, i) => {
                    const on = i === cursor
                    return (
                      <li key={item.id} role="none">
                        <button role="menuitem" type="button"
                          onMouseEnter={() => hoverCursor(setCursor, cursor, i)} onFocus={() => setCursor(i)} onClick={() => activate(item.id)}
                          className={`group relative flex w-full items-center gap-3 border-2 px-3 py-3 text-left transition ${on ? 'border-gold-600 bg-gold-600/12' : 'border-transparent hover:border-ink-600'}`}>
                          <span className={`pixel-text w-4 shrink-0 text-[14px] ${on ? 'animate-blink-step text-gold-300' : 'text-transparent'}`} aria-hidden>▶</span>
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center border-2 ${on ? 'border-gold-600 bg-ink-950 text-gold-300 shadow-[2px_2px_0_rgba(0,0,0,.55)]' : 'border-ink-700 bg-ink-900 text-ink-300'}`}>{item.icon}</span>
                          <span className="min-w-0 flex-1">
                            <span className={`pixel-text block text-[18px] leading-6 ${on ? 'text-ink-100' : 'text-ink-200'}`}>{item.label}</span>
                            <span className="block truncate text-[12px] text-ink-400">{item.hint({ save: saveLabel, preset: presetTitle })}</span>
                          </span>
                          {item.id === 'continue' && <span className="chip shrink-0 border-jade-700 bg-jade-700/20 text-jade-300">存档</span>}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </motion.div>
            ) : (
              <motion.div key="episodes" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.22 }}
                className="panel-wood bg-ink-800 p-2">
                <div className="flex items-center justify-between border-b-2 border-ink-700 px-3 py-2">
                  <span className="pixel-text text-[12px] tracking-[0.14em] text-gold-400">EPISODE SELECT · 选择剧本</span>
                  <button type="button" className="btn-ghost h-7 px-2 text-[11px]" onClick={backToMenu}><ArrowLeft size={12} /> 返回</button>
                </div>
                <ul className="grid gap-2 p-2 sm:grid-cols-2" role="listbox" aria-label="剧本">
                  {PRESETS.map((p, i) => {
                    const on = i === epCursor
                    const loaded = p.id === activePreset
                    return (
                      <li key={p.id} role="option" aria-selected={on}>
                        <button type="button" onMouseEnter={() => hoverCursor(setEpCursor, epCursor, i)} onFocus={() => setEpCursor(i)} onClick={() => pickEpisode(i)}
                          className={`relative flex h-full w-full flex-col border-2 p-3 text-left transition ${on ? 'border-gold-600 bg-gold-600/12 shadow-[3px_3px_0_rgba(0,0,0,.55)]' : 'border-ink-700 bg-ink-900/70 hover:border-ink-500'}`}>
                          <span className="flex items-center justify-between">
                            <span className="text-[30px] leading-none drop-shadow-[2px_2px_0_rgba(0,0,0,.6)]" aria-hidden>{p.emoji}</span>
                            <span className="pixel-text text-[12px] text-gold-500">CASE {String(i + 1).padStart(2, '0')}</span>
                          </span>
                          <span className="pixel-text mt-2 block text-[16px] leading-5 text-ink-100">{p.title}</span>
                          <span className="mt-1 block text-[11px] leading-relaxed text-ink-400">{p.tagline}</span>
                          {loaded && (
                            <span className="chip mt-2 w-fit border-jade-700 bg-jade-700/20 text-jade-300"><Check size={10} strokeWidth={3} /> 已装载</span>
                          )}
                          {on && <span className="pixel-text absolute -top-2 -left-1 animate-blink-step text-[14px] text-gold-300" aria-hidden>▶</span>}
                        </button>
                      </li>
                    )
                  })}
                </ul>
                <div className="flex items-center justify-between border-t-2 border-ink-700 px-3 py-2 text-[11px] text-ink-400">
                  <span>选择后进入卷宗，全部细节仍可修改</span>
                  <span className="pixel-text">←→ 移动 · Enter 开卷</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      <footer className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[11px] text-ink-400 sm:px-6">
        <span className="flex items-center gap-1.5"><PxlKitIcon icon={Scroll} size={12} /> 规则引擎依据《民法典》继承编 · 结果仅供娱乐与学习，不构成法律意见</span>
        <span className="pixel-text">Pxlkit · Tailwind · Motion · R3F</span>
      </footer>

      <ProviderManager open={showProviders} onClose={() => setShowProviders(false)} providers={providers} presets={presets} onChanged={onProvidersChanged} />
    </div>
  )
}
