import { PixelChip, PixelCollapsible, PixelIconButton, PixelInput, PixelSwitch } from '@pxlkit/ui-kit'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { BRIEF_SECTIONS, newBriefItem } from '../../lib/seat'
import { useCaseDraft } from '../../store/useCaseDraft'
import type { Brief, BriefItem } from '../../types'

export default function BriefEditor({ memberId }: { memberId: string }) {
  const c = useCaseDraft((s) => s.c)
  const setStrategy = useCaseDraft((s) => s.setStrategy)
  const strategy = c.seat?.strategy
  const brief = strategy?.briefs[memberId]
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  if (!strategy || !brief) return null

  const write = (next: Brief) => {
    setStrategy({
      ...strategy,
      briefs: { ...strategy.briefs, [memberId]: next },
    })
  }

  const patchSection = (key: (typeof BRIEF_SECTIONS)[number]['key'], items: BriefItem[]) => {
    write({ ...brief, [key]: items })
  }

  return (
    <div className="space-y-2">
      {BRIEF_SECTIONS.map((section) => {
        const items = brief[section.key]
        return (
          <PixelCollapsible key={section.key} label={section.title} defaultOpen={section.defaultOpen} bordered>
            <ul className="space-y-2">
              {items.map((item, index) => (
                <li key={item.id} className="border-2 border-ink-700 bg-ink-950 p-2">
                  <div className="flex items-start gap-2">
                    <PixelSwitch
                      label={item.text}
                      checked={item.enabled}
                      onChange={(enabled) => patchSection(section.key, items.map((it, i) => (i === index ? { ...it, enabled } : it)))}
                    />
                    {item.custom && (
                      <PixelIconButton
                        label="删除自定义条目"
                        size="sm"
                        tone="red"
                        icon={<Trash2 size={12} />}
                        onClick={() => patchSection(section.key, items.filter((_, i) => i !== index))}
                      />
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-ink-400">
                    {item.article && <PixelChip label={`第${item.article}条`} size="sm" />}
                    {item.delta_pct != null && <span>Δ{item.delta_pct > 0 ? '+' : ''}{item.delta_pct}%</span>}
                    {item.confidence && <PixelChip label={item.confidence === 'abstain' ? '弃权' : item.confidence} size="sm" />}
                    {item.depends_on.map((d) => <span key={d}>依赖 {d}</span>)}
                    {item.evidence.map((ev) => <span key={ev}>{ev}</span>)}
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <PixelInput
                label="添加一条"
                value={drafts[section.key] ?? ''}
                placeholder="自定义条目"
                onChange={(e) => setDrafts((s) => ({ ...s, [section.key]: e.target.value }))}
              />
              <button
                type="button"
                className="btn-ghost h-10 self-end px-3 text-[11px]"
                onClick={() => {
                  const text = (drafts[section.key] ?? '').trim()
                  if (!text) return
                  patchSection(section.key, [...items, newBriefItem(section.key, items.length + 1, text)])
                  setDrafts((s) => ({ ...s, [section.key]: '' }))
                }}
              >
                添加
              </button>
            </div>
          </PixelCollapsible>
        )
      })}
    </div>
  )
}
