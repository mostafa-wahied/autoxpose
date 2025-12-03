type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
};

const INPUT_CLASS = 'mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm';

export function FormInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
}: Props): JSX.Element {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={INPUT_CLASS}
        required={required}
      />
    </div>
  );
}
