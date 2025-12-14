type Props = {
  onCancel: () => void;
  isPending: boolean;
  submitLabel: string;
  pendingLabel: string;
};

export function FormButtons({
  onCancel,
  isPending,
  submitLabel,
  pendingLabel,
}: Props): JSX.Element {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="rounded px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
      >
        {isPending ? pendingLabel : submitLabel}
      </button>
    </div>
  );
}
