import { PixelButton, PixelChip, PixelDrawer, PixelSkeleton, PixelSwitch, PixelTooltip } from '@pxlkit/ui-kit'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api/client'
import { applyWhatIfKeys } from '../../lib/seat'
import { cleanDraft, useCaseDraft } from '../../store/useCaseDraft'
import type { EvidenceHint, LegalResult, WhatIfDelta } from '../../types'
import { ShareBar } from '../ui/CourtRecord'

const EMPTY_KEYS: string[] = []

function asHint(raw: EvidenceHint | Record<string, unknown>): EvidenceHint {
  return {
    lever: String(raw.lever ?? ''),
    label: String(raw.label ?? ''),
    article: String(raw.article ?? ''),
    evidence: Array.isArray(raw.evidence) ? raw.evidence.map(String) : [],
    burden: String(raw.burden ?? ''),
    note: raw.note ? String(raw.note) : '',
  }
}

export default function WhatIfPanel() {
  const c = useCaseDraft((s) => s.c)
  const analysis = useCaseDraft((s) => s.analysis)
  const preview = useCaseDraft((s) => s.preview)
  const playerId = c.seat?.player_id ?? ''
  const [onByPlayer, setOnByPlayer] = useState<Record<string, string[]>>({})
  const [sandbox, setSandbox] = useState<LegalResult | null>(null)
  const [drawer, setDrawer] = useState<WhatIfDelta | null>(null)
  const onKeys = onByPlayer[playerId] ?? EMPTY_KEYS
  const setOnKeys = (next: string[]) => setOnByPlayer((prev) => ({ ...prev, [playerId]: next }))

  useEffect(() => {
    if (!analysis || onKeys.length === 0) return
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      const clone = applyWhatIfKeys(structuredClone(cleanDraft(c)), onKeys)
      api.legalPreview(clone, ctrl.signal)
        .then(setSandbox)
        .catch((e: Error) => {
          if (e.name !== 'AbortError') setSandbox(null)
        })
    }, 350)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [analysis, c, onKeys])

  const groups = useMemo(() => {
    const items = analysis?.whatif ?? []
    return {
      favorable: items.filter((w) => w.direction === 'favorable' && !w.key.startsWith('joint:')),
      adverse: items.filter((w) => w.direction === 'adverse' && !w.key.startsWith('joint:')),
      joint: items.filter((w) => w.key.startsWith('joint:')),
    }
  }, [analysis])

  if (!analysis) {
    return <PixelSkeleton height="8rem" width="100%" ariaLabel="正在准备沙盘" />
  }

  const currentPct = preview?.shares.find((s) => s.member_id === playerId)?.percent
  const shownSandbox = onKeys.length ? sandbox : null
  const sandboxPct = shownSandbox?.shares.find((s) => s.member_id === playerId)?.percent
  const checklist = (analysis.evidence_checklist ?? []).map(asHint)
  const drawerHint = drawer
    ? checklist.find((hint) => hint.lever === drawer.key.split(':', 1)[0])
    : undefined

  return (
    <div className="space-y-4">
      <p className="text-[12px] leading-relaxed text-ink-300">
        这里只是推演，不会改变卷宗。要让某个事实真正进入案情，请回第 III 卷勾选并准备对应证据。
      </p>

      <ToggleGroup title="我能证明的（有利）" items={groups.favorable} onKeys={onKeys} setOnKeys={setOnKeys} onEvidence={setDrawer} />
      <ToggleGroup title="对方可能证明的（不利）" items={groups.adverse} onKeys={onKeys} setOnKeys={setOnKeys} onEvidence={setDrawer} />
      <ToggleGroup title="财产权属" items={groups.joint} onKeys={onKeys} setOnKeys={setOnKeys} onEvidence={setDrawer} />

      <div className="panel-inset space-y-2 p-3">
        <div className="pixel-text text-[12px] text-ink-200">当前法定 vs 沙盘</div>
        <ShareBar preview={preview} previewErr={null} members={c.members} />
        <ShareBar preview={shownSandbox ?? preview} previewErr={null} members={c.members} />
        <div className="grid grid-cols-2 gap-2">
          <div className="border-2 border-ink-700 bg-ink-950 px-2 py-2">
            <div className="text-[10px] text-ink-400">我的当前法定</div>
            <div className="pixel-text text-[20px] text-gold-300">{currentPct == null ? '—' : `${currentPct.toFixed(1)}%`}</div>
          </div>
          <div className="border-2 border-gold-600 bg-gold-600/10 px-2 py-2">
            <div className="text-[10px] text-ink-400">沙盘中的我</div>
            <div className="pixel-text text-[20px] text-gold-200">{sandboxPct == null ? '—' : `${sandboxPct.toFixed(1)}%`}</div>
          </div>
        </div>
      </div>

      <div>
        <div className="pixel-text mb-1.5 text-[12px] text-ink-200">举证清单</div>
        <ul className="space-y-2">
          {checklist.map((hint) => (
            <li key={hint.lever} className="border-2 border-ink-700 bg-ink-950 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="pixel-text text-[12px] text-ink-100">{hint.label}</span>
                <PixelChip label={`第${hint.article}条`} size="sm" tone="gold" />
              </div>
              <p className="mt-1 text-[11px] text-ink-400">{hint.burden}</p>
              <ul className="mt-1 list-disc pl-4 text-[11px] text-ink-300">
                {hint.evidence.map((ev) => <li key={ev}>{ev}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      </div>

      <PixelDrawer open={drawer != null} onOpenChange={(open) => { if (!open) setDrawer(null) }} title={drawer?.label ?? '证据'} size="md">
        {drawer && (
          <PixelDrawer.Body className="space-y-2">
            <PixelChip label={`第${drawer.article}条`} size="sm" tone="gold" />
            {drawerHint?.burden && (
              <p className="text-[12px] leading-relaxed text-ink-300">
                <span className="pixel-text text-gold-300">举证责任：</span>{drawerHint.burden}
              </p>
            )}
            {drawerHint?.note && <p className="text-[11px] text-gold-400">{drawerHint.note}</p>}
            <ul className="list-disc space-y-1 pl-4 text-[13px] text-ink-200">
              {drawer.evidence.map((ev) => <li key={ev}>{ev}</li>)}
            </ul>
          </PixelDrawer.Body>
        )}
      </PixelDrawer>
    </div>
  )
}

function ToggleGroup({
  title, items, onKeys, setOnKeys, onEvidence,
}: {
  title: string
  items: WhatIfDelta[]
  onKeys: string[]
  setOnKeys: (next: string[]) => void
  onEvidence: (item: WhatIfDelta) => void
}) {
  if (items.length === 0) return null
  return (
    <div>
      <div className="pixel-text mb-1.5 text-[12px] text-gold-400">{title}</div>
      <ul className="space-y-2">
        {items.map((item) => {
          const on = onKeys.includes(item.key)
          const positive = item.delta_pct >= 0
          return (
            <li key={item.key} className="flex flex-wrap items-center gap-2 border-2 border-ink-700 bg-ink-950 px-2 py-2">
              <PixelSwitch
                label={item.label}
                checked={on}
                tone={item.direction === 'favorable' ? 'green' : 'gold'}
                onChange={(next) => setOnKeys(next ? [...onKeys, item.key] : onKeys.filter((k) => k !== item.key))}
              />
              <span className={`pixel-text text-[12px] ${positive ? 'text-green-300' : 'text-seal-400'}`}>
                {positive ? '+' : ''}{item.delta_pct.toFixed(1)}%
              </span>
              <PixelChip label={`第${item.article}条`} size="sm" />
              <PixelTooltip content={item.evidence.slice(0, 4).join(' · ') || '查看证据'}>
                <PixelButton type="button" size="sm" variant="ghost" onClick={() => onEvidence(item)}>证据</PixelButton>
              </PixelTooltip>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
