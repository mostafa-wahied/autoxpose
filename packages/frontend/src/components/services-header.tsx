type Props = {
  onAdd: () => void;
};

export function ServicesHeader({ onAdd }: Props): JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Services</h1>
        <p className="mt-1 text-neutral-600">Manage your services</p>
      </div>
      <button
        onClick={onAdd}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Add Service
      </button>
    </div>
  );
}
