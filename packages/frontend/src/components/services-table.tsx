export function ServicesTable({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
            <th className="py-3 pl-4 pr-4">Name</th>
            <th className="py-3 pr-4">Domain</th>
            <th className="py-3 pr-4">Endpoint</th>
            <th className="py-3 pr-4">Status</th>
            <th className="py-3 pr-4">Source</th>
            <th className="py-3 pr-4">Actions</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
