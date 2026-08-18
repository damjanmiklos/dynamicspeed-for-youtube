type Props = {
  label?: string;
  value: string;
  options: { code: string; label: string }[];
  onChange: (value: string) => void;
};

export function SelectField({ label, value, options, onChange }: Props) {
  const known = options.some((option) => option.code === value);
  const list = known
    ? options
    : [{ code: value, label: `Saved language (${value})` }, ...options];
  return (
    <label className="block w-full space-y-1">
      {label ? <span className="text-sm font-medium">{label}</span> : null}
      <select
        className="w-full rounded-lg border border-ds-border bg-ds-surface px-3 py-2 text-sm text-ds-text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {list.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
