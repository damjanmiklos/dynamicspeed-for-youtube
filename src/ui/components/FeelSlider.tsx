import { EditableNumber } from './EditableNumber';
import { rangeFillStyle } from '../range-fill';

type Props = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  compact?: boolean;
  label?: string;
  hint?: string;
};

export function FeelSlider({
  value,
  onChange,
  disabled = false,
  compact = false,
  label,
  hint,
}: Props) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const tone = percent < 40 ? 'smooth' : percent > 60 ? 'snappy' : 'balanced';

  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      <div className="flex items-end justify-between gap-3">
        <div>
          {label ? <div className="text-sm font-medium text-ds-text">{label}</div> : null}
          {hint ? (
            <div className={compact ? 'text-[11px] text-ds-muted' : 'text-xs text-ds-muted'}>
              {hint}
            </div>
          ) : null}
        </div>
        {disabled ? (
          <span className="px-1 font-mono text-sm text-ds-muted">Custom</span>
        ) : (
          <EditableNumber
            value={percent}
            min={0}
            max={100}
            step={1}
            decimals={0}
            onChange={(next) => onChange(next / 100)}
          />
        )}
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        disabled={disabled}
        aria-label={label || 'Feel'}
        aria-valuetext={disabled ? 'Custom' : `${percent}, ${tone}`}
        style={rangeFillStyle(percent)}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
      />
      <div className="flex justify-between text-[10px] uppercase tracking-[0.14em] text-ds-muted">
        <span>Smooth</span>
        <span>Snappy</span>
      </div>
    </div>
  );
}
