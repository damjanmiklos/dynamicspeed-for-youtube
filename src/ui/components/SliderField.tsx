type Props = {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  decimals?: number;
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
  onChange,
}: Props) {
  return (
    <label className="block space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-ds-text">{label}</div>
          {hint ? <div className="text-xs text-ds-muted">{hint}</div> : null}
        </div>
        <div className="font-mono text-sm text-ds-accent">
          {value.toFixed(decimals)}
          {unit}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
