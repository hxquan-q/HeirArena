import { PixelAlertDialog, PixelSwitch, useToast } from '@pxlkit/ui-kit'
import { useState } from 'react'
import { api } from '../../api/client'
import { sfx } from '../../lib/sfx'
import { useCourt } from '../../store/useCourt'

interface Props {
  sessionId: string
}

export default function SeatToggle({ sessionId }: Props) {
  const seat = useCourt((s) => s.seat)
  const awaiting = useCourt((s) => s.awaiting)
  const done = useCourt((s) => s.done)
  const { toast } = useToast()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!seat || done) return null

  const apply = async (human: boolean) => {
    setBusy(true)
    try {
      await api.setSeat(sessionId, human)
      sfx('confirm')
    } catch (error) {
      sfx('error')
      toast.error({ title: '切换席位失败', message: (error as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PixelSwitch
        label="本席由我发言"
        checked={seat.human}
        tone="gold"
        disabled={busy}
        onChange={(next) => {
          if (!next && awaiting) {
            setConfirm(true)
            return
          }
          void apply(next)
        }}
      />
      <PixelAlertDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="这一轮会由 AI 代说"
        description="当前正轮到你。关掉开关后，这一轮发言交给 AI 代理，你写的草稿不会送出。"
        actionLabel="改由 AI 代说"
        cancelLabel="继续自己说"
        onAction={async () => {
          await apply(false)
        }}
      />
    </>
  )
}
