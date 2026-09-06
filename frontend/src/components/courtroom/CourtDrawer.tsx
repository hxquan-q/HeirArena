import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export interface CourtDrawerProps {
  open: boolean
  side: 'left' | 'right'
  title: string
  badge?: ReactNode
  onClose: () => void
  children: ReactNode
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function useDesktopDrawer(): boolean {
  const query = '(min-width: 80rem)'
  const [desktop, setDesktop] = useState(() =>
    typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? true
      : window.matchMedia(query).matches,
  )

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(query)
    const update = () => setDesktop(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return desktop
}

export default function CourtDrawer({ open, side, title, badge, onClose, children }: CourtDrawerProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const desktop = useDesktopDrawer()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (!focusable.length) {
        event.preventDefault()
        closeRef.current?.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      triggerRef.current?.focus()
    }
  }, [open])

  const desktopOffset = side === 'left' ? '-100%' : '100%'

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            aria-hidden
            className="fixed inset-0 z-[90] cursor-default bg-black/65 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.section
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={[
              'panel-elevated fixed inset-x-0 bottom-0 z-[100] flex max-h-[85dvh] w-full flex-col overflow-hidden',
              'xl:inset-y-0 xl:bottom-auto xl:max-h-none xl:w-[min(460px,42vw)]',
              side === 'left' ? 'xl:right-auto xl:left-0' : 'xl:right-0 xl:left-auto',
            ].join(' ')}
            initial={desktop ? { x: desktopOffset, opacity: 0 } : { y: '100%', opacity: 0 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={desktop ? { x: desktopOffset, opacity: 0 } : { y: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 34, mass: 0.9 }}
          >
            <header className="flex min-h-14 shrink-0 items-center gap-3 border-b-2 border-ink-700 bg-ink-900 px-3">
              <span className="h-5 w-1 bg-gold-400 shadow-[2px_0_0_#8f6522]" aria-hidden />
              <h2 id={titleId} className="pixel-text text-[15px] tracking-[0.08em] text-gold-300">
                {title}
              </h2>
              {badge && <div className="ml-1">{badge}</div>}
              <button
                ref={closeRef}
                type="button"
                className="ml-auto flex h-11 w-11 items-center justify-center border-2 border-ink-600 bg-ink-950 text-ink-200 transition hover:border-gold-600 hover:text-gold-300"
                onClick={onClose}
                aria-label={`关闭${title}`}
              >
                <X size={18} />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
              {children}
            </div>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  )
}
