import { useState } from 'react';
import { type SettingsStatus, api } from '../../lib/api';
import { ConfirmDialog } from './confirm-dialog';
import { DnsConfigSection, ProxyConfigSection } from './config';
import { Tooltip } from './tooltip';

function downloadFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function doExport(): Promise<void> {
  const data = await api.settings.export();
  const timestamp = new Date().toISOString().split('T')[0];
  downloadFile(JSON.stringify(data, null, 2), `autoxpose-backup-${timestamp}.json`);
}

async function handleImport(): Promise<void> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e: Event): Promise<void> => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    const data = JSON.parse(text);
    await api.settings.import(data);
    window.location.reload();
  };
  input.click();
}

interface SettingsPanelProps {
  settings: SettingsStatus | null | undefined;
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ settings, isOpen, onClose }: SettingsPanelProps): JSX.Element {
  const visClass = isOpen ? 'max-h-[60vh] opacity-100' : 'max-h-0 opacity-0';

  return (
    <div
      className={`overflow-y-auto border-t border-[#30363d] bg-[#0d1117] transition-all duration-300 ease-in-out ${visClass}`}
    >
      <div className="p-6 pb-8">
        <PanelHeader onClose={onClose} />
        <div className="grid gap-6 md:grid-cols-2">
          <DnsConfigSection current={settings?.dns ?? null} />
          <ProxyConfigSection current={settings?.proxy ?? null} />
        </div>
      </div>
    </div>
  );
}

function PanelHeader({ onClose }: { onClose: () => void }): JSX.Element {
  const [showWarning, setShowWarning] = useState(false);

  const handleExport = (): void => {
    setShowWarning(true);
  };

  const confirmExport = (): void => {
    setShowWarning(false);
    void doExport();
  };

  return (
    <>
      <ConfirmDialog
        isOpen={showWarning}
        title="Export Settings"
        message="This file contains sensitive API keys and credentials. Store it securely and delete after importing. Do not share this file or commit it to version control."
        confirmText="Export Anyway"
        cancelText="Cancel"
        variant="warning"
        onConfirm={confirmExport}
        onCancel={() => setShowWarning(false)}
      />
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#c9d1d9]">Configuration</h3>
        <div className="flex items-center gap-3">
          <Tooltip content="Export settings to JSON file">
            <button
              onClick={handleExport}
              className="text-xs text-[#58a6ff] transition-colors hover:text-[#79c0ff]"
            >
              Export
            </button>
          </Tooltip>
          <Tooltip content="Import settings from JSON file">
            <button
              onClick={() => void handleImport()}
              className="text-xs text-[#58a6ff] transition-colors hover:text-[#79c0ff]"
            >
              Import
            </button>
          </Tooltip>
          <button
            onClick={onClose}
            className="text-xs text-[#8b949e] transition-colors hover:text-[#c9d1d9]"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}
