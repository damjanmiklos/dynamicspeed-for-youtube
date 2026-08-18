import { EditableNumber } from './EditableNumber';

type Props = {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  decimals?: number;
  compact?: boolean;
  onChange: (value: number) => void;
};

export function SliderField({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  unit = '',
  decimals = 0,
  compact = false,
  onChange,
}: Props) {
  return (
    <div className={compact ? 'block space-y-1' : 'block space-y-2'}>
      <div className="flex items-end justify-between gap-3">
        <div>
          {label ? <div className="text-sm font-medium text-ds-text">{label}</div> : null}
          {hint ? <div className="text-xs text-ds-muted">{hint}</div> : null}
        </div>
        <EditableNumber
          value={value}
          min={min}
          max={max}
          step={step}
          decimals={decimals}
          unit={unit}
          onChange={onChange}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        aria-label={label || 'Slider'}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
