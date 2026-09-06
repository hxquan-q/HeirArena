import { PixelAlert, PixelButton, PixelIconButton, PixelInput, PixelNumberInput, PixelSelect, PixelTextarea, PixelTooltip } from '@pxlkit/ui-kit'
import type { ReactNode } from 'react'
import {
  RED_LINE_TEMPLATES, SOFT_GOAL_TEMPLATES, TARGET_WEIGHTS, assetEmoji, emptyGoals, isRedLineComplete,
  isSoftGoalComplete, redLineText, softGoalText,
} from '../../lib/seat'
import { useCaseDraft } from '../../store/useCaseDraft'
import type { Asset, Member, RedLine, SoftGoal } from '../../types'

interface Props {
  memberId: string
  compact?: boolean
}

export default function GoalsForm({ memberId, compact }: Props) {
  const c = useCaseDraft((s) => s.c)
  const analysis = useCaseDraft((s) => s.analysis)
  const updGoals = useCaseDraft((s) => s.updGoals)
  const goals = c.seat?.goals[memberId] ?? emptyGoals()
  const reach = memberId === c.seat?.player_id ? analysis?.reachability : analysis?.matrix.find((r) => r.member_id === memberId)?.reachable
  const unused = c.assets.filter((a) => a.name.trim() && !goals.target_assets.includes(a.id))
  const min = goals.min_value_share
  const high = reach?.high
  const low = reach?.low

  const setTargets = (target_assets: string[]) => updGoals(memberId, { target_assets: target_assets.slice(0, 5) })
  const move = (index: number, dir: -1 | 1) => {
    const next = [...goals.target_assets]
    const swap = index + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[index], next[swap]] = [next[swap], next[index]]
    setTargets(next)
  }

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <section>
        <FieldHint title="目标资产（最多 5，按优先级）" hint="排序影响记分卡：第一目标占目标分 60%，第二 30%，第三 10%。" />
        <ul className="space-y-1.5">
          {goals.target_assets.map((id, i) => {
            const asset = c.assets.find((a) => a.id === id)
            const weight = TARGET_WEIGHTS[i]
            return (
              <li key={id} className="flex items-center gap-2 border-2 border-ink-700 bg-ink-950 px-2 py-1.5">
                <span className="text-[18px]" aria-hidden>{assetEmoji(asset)}</span>
                <span className="pixel-text min-w-0 flex-1 truncate text-[13px] text-ink-100">{asset?.name ?? id}</span>
                {weight && (
                  <PixelTooltip content="影响记分卡权重">
                    <span className="pixel-text shrink-0 text-[10px] text-gold-400">{i + 1}st · {weight}</span>
                  </PixelTooltip>
                )}
                <PixelIconButton label="上移" size="sm" icon={<span aria-hidden>↑</span>} disabled={i === 0} onClick={() => move(i, -1)} />
                <PixelIconButton label="下移" size="sm" icon={<span aria-hidden>↓</span>} disabled={i === goals.target_assets.length - 1} onClick={() => move(i, 1)} />
                <PixelIconButton label="移除" size="sm" tone="red" icon={<span aria-hidden>×</span>} onClick={() => setTargets(goals.target_assets.filter((x) => x !== id))} />
              </li>
            )
          })}
        </ul>
        <div className="mt-2">
          <PixelSelect
            label="添加资产"
            placeholder={goals.target_assets.length >= 5 ? '已满 5 项' : '从遗产中添加'}
            disabled={goals.target_assets.length >= 5 || unused.length === 0}
            options={unused.map((a) => ({ value: a.id, label: `${assetEmoji(a)} ${a.name}` }))}
            onChange={(id) => {
              if (!id || goals.target_assets.includes(id) || goals.target_assets.length >= 5) return
              setTargets([...goals.target_assets, id])
            }}
          />
        </div>
      </section>

      <section>
        <FieldHint title="最低可接受价值份额" hint="按折价补偿后的实际到手计分；超出可达上限会警告，但不阻断开庭。" />
        <div className="flex flex-wrap items-end gap-2">
          <PixelNumberInput
            key={min ?? 'empty'}
            label="最低份额"
            min={0}
            max={100}
            step={0.1}
            suffix="%（价值份额）"
            value={min ?? undefined}
            onChange={(n) => updGoals(memberId, { min_value_share: n })}
          />
          <PixelButton type="button" size="sm" variant="ghost" onClick={() => updGoals(memberId, { min_value_share: null })}>
            清空
          </PixelButton>
          {reach && (
            <span className="pixel-text text-[11px] text-ink-400">可达 {reach.low.toFixed(1)}%~{reach.high.toFixed(1)}%</span>
          )}
        </div>
        {min != null && high != null && min > high && (
          <div className="mt-2">
            <PixelAlert tone="gold" message={`即使证明全部有利事实也只到 ${high.toFixed(1)}%，${min}% 不现实`} />
          </div>
        )}
        {min != null && low != null && min < low && (
          <p className="mt-1 text-[11px] text-ink-400">低于最坏情形，可以更进一步</p>
        )}
      </section>

      <section>
        <FieldHint title="红线（最多 6）" hint="破一条红线，记分卡红线项归零且总分上限压到 40。自定义由军师引用发言判定。" />
        <LineList
          items={goals.red_lines}
          complete={isRedLineComplete}
          textOf={(line) => redLineText(line, c.assets, c.members)}
          onChange={(red_lines) => updGoals(memberId, { red_lines })}
          templates={RED_LINE_TEMPLATES}
          make={(kind) => ({ kind, asset_id: null, member_id: null, text: '' }) as RedLine}
          renderFields={(line, i, update) => (
            <LineParams
              needsAsset={line.kind === 'no_sell_asset' || line.kind === 'no_member_gets_asset' || line.kind === 'no_co_own_asset'}
              needsMember={line.kind === 'no_member_gets_asset' || line.kind === 'no_co_own_asset'}
              custom={line.kind === 'custom'}
              assets={c.assets}
              members={c.members}
              assetId={line.asset_id}
              memberId={line.member_id}
              text={line.text}
              onAsset={(asset_id) => update(i, { ...line, asset_id })}
              onMember={(id) => update(i, { ...line, member_id: id })}
              onText={(text) => update(i, { ...line, text: text.slice(0, 200) })}
            />
          )}
        />
      </section>

      <section>
        <FieldHint title="软目标（最多 6）" hint="占记分卡 10 分；由军师在复盘时对照庭审发言评分。" />
        <LineList
          items={goals.soft_goals}
          complete={isSoftGoalComplete}
          textOf={(goal) => softGoalText(goal, c.assets, c.members)}
          onChange={(soft_goals) => updGoals(memberId, { soft_goals })}
          templates={SOFT_GOAL_TEMPLATES}
          make={(kind) => ({ kind, asset_id: null, member_id: null, text: '' }) as SoftGoal}
          renderFields={(goal, i, update) => (
            <LineParams
              needsAsset={goal.kind === 'pet_custody' || goal.kind === 'keep_residence'}
              needsMember={goal.kind === 'keep_relation'}
              custom={goal.kind === 'custom'}
              assets={c.assets.filter((a) => {
                if (goal.kind === 'pet_custody') return a.type === 'pet'
                if (goal.kind === 'keep_residence') return a.type === 'house'
                return true
              })}
              members={c.members}
              assetId={goal.asset_id}
              memberId={goal.member_id}
              text={goal.text}
              onAsset={(asset_id) => update(i, { ...goal, asset_id })}
              onMember={(id) => update(i, { ...goal, member_id: id })}
              onText={(text) => update(i, { ...goal, text: text.slice(0, 200) })}
            />
          )}
        />
      </section>

      <section>
        <FieldHint title="给代理演的话" hint="写入你的简报与代理提示词，不进入执行官视野。" />
        <PixelTextarea
          label="自由文本"
          value={goals.narrative}
          maxLength={600}
          rows={compact ? 3 : 4}
          showCount={{ max: 600 }}
          placeholder="例如：我只想保住相册和大橘；房子可以谈，但不能让哥哥独占。"
          onChange={(e) => updGoals(memberId, { narrative: e.target.value.slice(0, 600) })}
        />
      </section>
    </div>
  )
}

function FieldHint({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-1.5">
      <div className="pixel-text text-[12px] text-ink-200">{title}</div>
      <p className="text-[11px] leading-relaxed text-ink-400">{hint}</p>
    </div>
  )
}

function LineList<T extends RedLine | SoftGoal, K extends string>({
  items, complete, textOf, onChange, templates, make, renderFields,
}: {
  items: T[]
  complete: (item: T) => boolean
  textOf: (item: T) => string
  onChange: (next: T[]) => void
  templates: { kind: K; label: string }[]
  make: (kind: K) => T
  renderFields: (item: T, index: number, update: (index: number, next: T) => void) => ReactNode
}) {
  const update = (index: number, next: T) => onChange(items.map((item, i) => (i === index ? next : item)))
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const ok = complete(item)
        return (
          <div key={`${item.kind}-${i}`} className={`space-y-2 border-2 p-2 ${ok ? 'border-ink-700 bg-ink-950' : 'border-seal-600 bg-seal-900/20'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="pixel-text text-[12px] text-ink-100">{textOf(item)}</div>
                {!ok && <div className="text-[11px] text-seal-400">参数未齐，开庭时会被剔除</div>}
              </div>
              <PixelIconButton label="删除" size="sm" tone="red" icon={<span aria-hidden>×</span>} onClick={() => onChange(items.filter((_, j) => j !== i))} />
            </div>
            {renderFields(item, i, update)}
          </div>
        )
      })}
      <PixelSelect
        label="添加一条"
        placeholder={items.length >= 6 ? '已满 6 条' : '选择模板'}
        disabled={items.length >= 6}
        options={templates.map((t) => ({ value: t.kind, label: t.label }))}
        onChange={(kind) => {
          if (!kind || items.length >= 6) return
          onChange([...items, make(kind as K)])
        }}
      />
    </div>
  )
}

function LineParams({
  needsAsset, needsMember, custom, assets, members, assetId, memberId, text, onAsset, onMember, onText,
}: {
  needsAsset: boolean
  needsMember: boolean
  custom: boolean
  assets: Asset[]
  members: Member[]
  assetId: string | null
  memberId: string | null
  text: string
  onAsset: (id: string) => void
  onMember: (id: string) => void
  onText: (text: string) => void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {needsAsset && (
        <PixelSelect
          label="资产"
          placeholder="选择资产"
          value={assetId ?? ''}
          options={assets.filter((a) => a.name.trim()).map((a) => ({ value: a.id, label: `${assetEmoji(a)} ${a.name}` }))}
          onChange={onAsset}
          error={!assetId ? '必选' : undefined}
        />
      )}
      {needsMember && (
        <PixelSelect
          label="成员"
          placeholder="选择成员"
          value={memberId ?? ''}
          options={members.filter((m) => m.name.trim()).map((m) => ({ value: m.id, label: m.name }))}
          onChange={onMember}
          error={!memberId ? '必选' : undefined}
        />
      )}
      {custom && (
        <div className="sm:col-span-2">
          <PixelInput
            label="自定义说明"
            value={text}
            maxLength={200}
            showCount={{ max: 200 }}
            hint="由军师引用发言判定"
            error={!text.trim() ? '需要填写说明' : undefined}
            onChange={(e) => onText(e.target.value)}
          />
        </div>
      )}
    </div>
  )
}
