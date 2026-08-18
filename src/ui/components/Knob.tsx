type Props = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label?: string;
};

export function Knob({ value, onChange, disabled, label = 'Responsiveness' }: Props) {
  const angle = -135 + value * 270;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-28 w-28">
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
        <div className="text-xs uppercase tracking-[0.14em] text-ds-muted">{label}</div>
        <div className="font-mono text-sm text-ds-text">{Math.round(value * 100)}</div>
      </div>
    </div>
  );
}
