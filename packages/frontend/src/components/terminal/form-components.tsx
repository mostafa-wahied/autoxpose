import { InlineSpinner } from './progress';

interface FormSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}

export function FormSelect(props: FormSelectProps): JSX.Element {
  const cls = props.disabled ? 'text-[#8b949e]' : 'text-[#c9d1d9]';
  return (
    <div>
      <label className="mb-1 block text-xs text-[#8b949e]">{props.label}</label>
      <select
        value={props.value}
        onChange={(e): void => props.onChange(e.target.value)}
        disabled={props.disabled}
        className={`w-full rounded border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm focus:border-[#58a6ff] focus:outline-none ${cls}`}
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
      <label className="mb-1 block text-xs text-[#8b949e]">{props.label}</label>
      <input
        type={props.type || 'text'}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e): void => props.onChange(e.target.value)}
        className="w-full rounded border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-[#c9d1d9] placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none"
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
          className="rounded border border-[#30363d] px-3 py-1.5 text-xs text-[#c9d1d9] transition-colors hover:bg-[#30363d]"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
