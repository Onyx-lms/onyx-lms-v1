'use client';

import { useEffect } from 'react';
import { Icon } from '@/components/onyx-ui';

/**
 * A centered dialog on a backdrop -- the "perfect box for creation" every
 * create-form in the platform console opens into now, instead of expanding
 * inline and shoving the page's own content down. Escape and a backdrop
 * click both close it; the click handler on the backdrop is deliberately
 * separate from the card's own (which stops propagation), so a click inside
 * the form never closes it.
 */
export function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5
                   shadow-lift"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted
                       hover:bg-slate-100">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
