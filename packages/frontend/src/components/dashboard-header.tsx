interface Props {
  onScan: () => void;
  isPending: boolean;
  count: number;
}

export function DashboardHeader({ onScan, isPending, count }: Props): JSX.Element {
  const countText = `${count} service${count !== 1 ? 's' : ''} tracked`;

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Dashboard</h1>
        <p className="mt-1 text-neutral-600">{countText}</p>
      </div>
      <button
        onClick={onScan}
        disabled={isPending}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
      >
        {isPending ? 'Scanning...' : 'Scan Containers'}
      </button>
    </div>
  );
}
