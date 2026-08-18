import { useEffect, useId, useRef, useState } from 'react';
import type { SettingHelp } from '../settings-help';

export function InfoTip({
  help,
  align = 'start',
}: {
  help: SettingHelp;
  align?: 'start' | 'end';
}) {
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!pinned) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setPinned(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPinned(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [pinned]);

  return (
    <span ref={rootRef} className="group/info relative ml-1 inline-flex shrink-0 align-middle">
      <button
        type="button"
        className={`inline-flex h-[18px] w-[18px] cursor-help items-center justify-center rounded-full border text-[11px] font-serif font-bold leading-none transition ${
          pinned
            ? 'border-ds-accent bg-ds-accent/20 text-ds-accent'
            : 'border-[#6d7686] text-[#9aa3b2] hover:border-ds-accent hover:text-ds-accent'
        }`}
        aria-label={help.label}
        aria-describedby={id}
        aria-expanded={pinned}
        onClick={() => setPinned((open) => !open)}
      >
        i
      </button>
      <span
        id={id}
        role="tooltip"
        className={`absolute top-full z-[80] w-[22rem] max-w-[min(22rem,calc(100vw-2.5rem))] pt-2 transition-opacity duration-150 ${
          align === 'end' ? 'right-0' : 'left-0'
        } ${
          pinned
            ? 'visible opacity-100'
            : 'invisible opacity-0 group-hover/info:visible group-hover/info:opacity-100 group-focus-within/info:visible group-focus-within/info:opacity-100'
        }`}
      >
        <span className="block rounded-xl border border-ds-border bg-[#1c2029] p-3.5 text-left shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-ds-accent">
            {help.label.replace(/^About\s+/i, '')}
          </span>
          <span className="space-y-2">
            {help.body.map((paragraph) => (
              <span key={paragraph} className="block text-[12.5px] leading-relaxed text-[#d8dde6]">
                {paragraph}
              </span>
            ))}
          </span>
        </span>
      </span>
    </span>
  );
}
