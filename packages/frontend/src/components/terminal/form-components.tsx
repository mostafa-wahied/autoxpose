import { InlineSpinner } from './progress';

interface FormSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}

export function FormSelect(props: FormSelectProps): JSX.Element {
  const cls = props.disabled ? 'text-[#9aa0aa]' : 'text-[#e2e8f0]';
  return (
    <div>
      <label className="mb-1 block text-xs text-[#9aa0aa]">{props.label}</label>
      <select
        value={props.value}
        onChange={(e): void => props.onChange(e.target.value)}
        disabled={props.disabled}
        className={`w-full rounded border border-[#1b1f29] bg-[#0b0d11] px-3 py-2 text-sm focus:border-[#50c4e6] focus:outline-none ${cls}`}
      >
        {props.options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface FormInputProps {
  label: string;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}

export function FormInput(props: FormInputProps): JSX.Element {
  return (
    <div>
      <label className="mb-1 block text-xs text-[#9aa0aa]">{props.label}</label>
      <input
        type={props.type || 'text'}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e): void => props.onChange(e.target.value)}
        className="w-full rounded border border-[#1b1f29] bg-[#0b0d11] px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#6b7280] focus:border-[#50c4e6] focus:outline-none"
      />
    </div>
  );
}

interface FormActionsProps {
  isPending: boolean;
  canSave: boolean;
  showCancel: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export function FormActions(props: FormActionsProps): JSX.Element {
  return (
    <div className="flex gap-2">
      <button
        onClick={props.onSave}
        disabled={props.isPending || !props.canSave}
        className="flex items-center gap-2 rounded bg-[#238636] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#2ea043] disabled:opacity-50"
      >
        {props.isPending && <InlineSpinner />}
        Save
      </button>
      {props.showCancel && (
        <button
          onClick={props.onCancel}
          className="rounded border border-[#1b1f29] px-3 py-1.5 text-xs text-[#e2e8f0] transition-colors hover:bg-[#1b1f29]"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
