import { CommandPrompt } from '../../components/terminal';

interface ScanNoticeData {
  created: number;
  updated: number;
}

export function ScanSuccessNotice({ data }: { data: ScanNoticeData }): JSX.Element {
  return (
    <div className="rounded border border-[#238636] bg-[#23863620] px-4 py-2 text-sm">
      <span className="text-[#3fb950]">{'\u2713'}</span> Scan complete: {data.created} created,{' '}
      {data.updated} updated
    </div>
  );
}

export function LoadingView(): JSX.Element {
  return (
    <div
      className="flex h-screen items-center justify-center font-mono text-[#e2e8f0]"
      style={{ background: 'linear-gradient(135deg, #0b0d11 0%, #0f1218 50%, #0a0c11 100%)' }}
    >
      <CommandPrompt command="Loading services..." />
    </div>
  );
}

export function ErrorView(): JSX.Element {
  return (
    <div
      className="flex h-screen items-center justify-center font-mono text-[#f07b7b]"
      style={{ background: 'linear-gradient(135deg, #0b0d11 0%, #0f1218 50%, #0a0c11 100%)' }}
    >
      [ERROR] Failed to load services. Check your connection.
    </div>
  );
}
