type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
};

export function FormSelect({ label, value, onChange, options }: Props): JSX.Element {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-700">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
