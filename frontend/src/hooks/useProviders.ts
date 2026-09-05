import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { ModelRef, Provider, ProviderPreset } from '../types'

export function useProviders() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [presets, setPresets] = useState<ProviderPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await api.providers()
      setProviders(r.providers)
      setPresets(r.presets)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    api.providers()
      .then((r) => {
        if (cancelled) return
        setProviders(r.providers)
        setPresets(r.presets)
        setError(null)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  return { providers, presets, loading, error, refresh }
}

export const MOCK_REF: ModelRef = { provider_id: 'mock', model: '' }

export function encodeRef(ref: ModelRef | null): string {
  if (!ref) return ''
  if (ref.provider_id === 'mock') return 'mock'
  return `${ref.provider_id}::${ref.model}`
}

export function decodeRef(value: string): ModelRef | null {
  if (!value) return null
  if (value === 'mock') return MOCK_REF
  const idx = value.indexOf('::')
  return idx < 0 ? { provider_id: value, model: '' } : { provider_id: value.slice(0, idx), model: value.slice(idx + 2) }
}

export function describeRef(ref: ModelRef | null, providers: Provider[], fallback = '剧本模式'): string {
  if (!ref) return fallback
  if (ref.provider_id === 'mock') return '剧本模式'
  const p = providers.find((x) => x.id === ref.provider_id)
  const model = ref.model || p?.models[0] || ''
  return p ? `${p.name} · ${model}` : `${ref.provider_id} · ${model}`
}
