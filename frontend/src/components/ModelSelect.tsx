import { decodeRef, encodeRef } from '../hooks/useProviders'
import type { ModelRef, Provider } from '../types'

interface Props {
  value: ModelRef | null
  onChange: (ref: ModelRef | null) => void
  providers: Provider[]
  /** 显示"跟随默认"选项（值为 null）时的文案；不传则 null 表示"使用 .env 默认 / 剧本" */
  inheritLabel?: string
  className?: string
  disabled?: boolean
  allowMock?: boolean
}

export default function ModelSelect({ value, onChange, providers, inheritLabel, className = '', disabled, allowMock = true }: Props) {
  const ready = providers.filter((p) => p.ready && p.models.length > 0)
  return (
    <select className={`input-base py-1.5 text-xs ${className}`} value={encodeRef(value)} disabled={disabled}
      onChange={(e) => onChange(decodeRef(e.target.value))}>
      <option value="">{inheritLabel ?? '自动（.env 默认模型，未配置则剧本模式）'}</option>
      {allowMock && <option value="mock">🎭 剧本模式（不调用模型）</option>}
      {ready.map((p) => (
        <optgroup key={p.id} label={p.name}>
          {p.models.map((m) => (
            <option key={m} value={`${p.id}::${m}`}>{m}</option>
          ))}
        </optgroup>
      ))}
      {providers.filter((p) => !p.ready).map((p) => (
        <optgroup key={p.id} label={`${p.name}（未填 Key）`} />
      ))}
    </select>
  )
}
