import { EditableNumber } from './EditableNumber';

type Props = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
};

export function Knob({
  value,
  onChange,
  disabled,
  label = 'Responsiveness',
  compact = false,
}: Props) {
  const angle = -135 + value * 270;
  const sizeClass = compact ? 'h-14 w-14' : 'h-28 w-28';
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`relative ${sizeClass}`}>
        <svg viewBox="0 0 120 120" className="h-full w-full">
          <circle cx="60" cy="60" r="46" fill="#16181f" stroke="#2c313c" strokeWidth="8" />
          <path
            d="M20 86 A46 46 0 1 1 100 86"
            fill="none"
            stroke="#ff6a3d"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${value * 180} 180`}
          />
          <g transform={`rotate(${angle} 60 60)`}>
            <rect x="57" y="22" width="6" height="22" rx="3" fill="#f5f6f8" />
          </g>
          <circle cx="60" cy="60" r="8" fill="#ff6a3d" />
        </svg>
        <input
          className="absolute inset-0 cursor-pointer opacity-0"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value}
          disabled={disabled}
          aria-label={label}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
      <div className="text-center">
        <div className="text-[10px] uppercase tracking-[0.14em] text-ds-muted">{label}</div>
        <EditableNumber
          value={Math.round(value * 100)}
          min={0}
          max={100}
          step={1}
          decimals={0}
          className="text-ds-text"
          onChange={(next) => onChange(next / 100)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
