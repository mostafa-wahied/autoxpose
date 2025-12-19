import { CommandPrompt } from '../../components/terminal';

interface ScanNoticeData {
  created: number;
  updated: number;
  autoExposed?: number;
  autoExposingServices?: Array<{ id: string; name: string; subdomain: string }>;
}

export function ScanSuccessNotice({ data }: { data: ScanNoticeData }): JSX.Element {
  const hasAutoExpose = data.autoExposed && data.autoExposed > 0;
  const serviceNames = data.autoExposingServices?.map(s => s.name).join(', ') || '';

  return (
    <div className="rounded border border-[#238636] bg-[#23863620] px-4 py-2 text-sm">
      <div>
        <span className="text-[#3fb950]">{'✓'}</span> Scan complete: {data.created} created,{' '}
        {data.updated} updated
      </div>
      {hasAutoExpose && (
        <div className="mt-1 text-[#8b949e]">
          <span className="text-[#f0883e]">{'⚡'}</span> Auto-exposing {serviceNames}...
        </div>
      )}
    </div>
  );
}

export function LoadingView(): JSX.Element {
  return (
    <div className="flex h-screen items-center justify-center bg-[#0d1117] font-mono text-[#c9d1d9]">
      <CommandPrompt command="Loading services..." />
    </div>
  );
}

export function ErrorView(): JSX.Element {
  return (
    <div className="flex h-screen items-center justify-center bg-[#0d1117] font-mono text-[#f85149]">
      [ERROR] Failed to load services. Check your connection.
    </div>
  );
}
