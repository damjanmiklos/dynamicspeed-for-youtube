import { useEffect, useRef, useState } from 'react';

type Props = {
  value: number;
  min: number;
  max: number;
  step?: number;
  decimals?: number;
  unit?: string;
  className?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
};

function snap(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  if (step <= 0) {
    return clamped;
  }
  const steps = Math.round((clamped - min) / step);
  return Number((min + steps * step).toFixed(6));
}

export function EditableNumber({
  value,
  min,
  max,
  step = 1,
  decimals = 0,
  unit = '',
  className = '',
  disabled = false,
  onChange,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const parsed = Number(draft.replace(',', '.'));
    if (Number.isFinite(parsed)) {
      onChange(snap(parsed, min, max, step));
    }
    setEditing(false);
  };

  if (editing && !disabled) {
    return (
      <input
        ref={inputRef}
        className={`w-16 rounded border border-ds-accent bg-ds-surface px-1 py-0.5 text-right font-mono text-sm text-ds-text outline-none ${className}`}
        value={draft}
        inputMode="decimal"
        aria-label="Edit value"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
          if (event.key === 'Escape') {
            setEditing(false);
          }
        }}
      />
    );
  }

  if (disabled) {
    return (
      <span className={`px-1 font-mono text-sm text-ds-muted ${className}`}>
        {value.toFixed(decimals)}
        {unit}
      </span>
    );
  }

  return (
    <button
      type="button"
      title="Click to type an exact value"
      className={`rounded px-1 font-mono text-sm text-ds-accent hover:bg-ds-surface-2 cursor-pointer ${className}`}
      onClick={() => {
        setDraft(value.toFixed(decimals));
        setEditing(true);
      }}
    >
      {value.toFixed(decimals)}
      {unit}
    </button>
  );
}
