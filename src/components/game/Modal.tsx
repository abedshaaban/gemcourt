import { X } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { cx } from './ui'

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  /** omit to make the modal non-dismissable */
  onClose?: () => void
  children?: ReactNode
  footer?: ReactNode
  className?: string
}) {
  const id = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  // Captured during the first render, before the board behind us becomes inert and drops focus.
  const [opener] = useState(() => (typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)))

  // Move focus into the dialog on open and keep Tab cycling inside it.
  useLayoutEffect(() => {
    const el = dialogRef.current
    if (!el) return
    const focusables = () =>
      [...el.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    // Keep a child's autoFocus; otherwise prefer the dialog's own controls over the header close button.
    if (!el.contains(document.activeElement)) {
      const primary = el.querySelector<HTMLElement>(
        '.sp-modal__foot button:not([disabled]), .sp-modal__body button:not([disabled]), .sp-modal__body input:not([disabled])',
      )
      ;(primary ?? focusables()[0] ?? el).focus()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return e.preventDefault()
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    el.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('keydown', onKey)
      // The opener may still be inside an inert container during this commit; wait a frame.
      requestAnimationFrame(() => {
        if (opener?.isConnected && !opener.closest('[inert]')) opener.focus()
      })
    }
  }, [opener])

  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault() // one Escape closes one layer
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div
      className="sp-modal-backdrop"
      onMouseDown={(e) => {
        if (onClose && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={cx('sp-modal', className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <header className="sp-modal__head">
          <div>
            <h2 id={id} className="sp-modal__title">
              {title}
            </h2>
            {subtitle && <p className="sp-modal__sub">{subtitle}</p>}
          </div>
          {onClose && (
            <button type="button" className="sp-iconbtn sp-iconbtn--close" onClick={onClose} aria-label="Close"><X size={16} aria-hidden="true" /></button>
          )}
        </header>
        {children && <div className="sp-modal__body">{children}</div>}
        {footer && <footer className="sp-modal__foot">{footer}</footer>}
      </div>
    </div>
  )
}
