type Props = {
  onAdd: () => void;
};

export function ServicesEmptyState({ onAdd }: Props): JSX.Element {
  return (
    <div className="mt-8 rounded-lg border-2 border-dashed border-neutral-200 p-8 text-center">
      <p className="text-neutral-500">No services configured.</p>
      <button onClick={onAdd} className="mt-2 text-sm font-medium text-neutral-900 hover:underline">
        Add your first service
      </button>
    </div>
  );
}
