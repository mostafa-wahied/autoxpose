import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type SettingsStatus, type AccessListRecord, api } from '../../lib/api';
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
  const proxyConfigured = settings?.proxy?.configured ?? false;
  const queryClient = useQueryClient();

  const { data: wildcardDetection } = useQuery({
    queryKey: ['wildcard-detection'],
    queryFn: () => api.settings.detectWildcard(),
    enabled: proxyConfigured && isOpen,
    staleTime: 30000,
  });

  const { data: accessListsData } = useQuery({
    queryKey: ['access-lists'],
    queryFn: () => api.accessLists.list(),
    enabled: proxyConfigured && isOpen,
    staleTime: 60_000,
  });

  const syncAccessLists = useMutation({
    mutationFn: () => api.accessLists.sync(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['access-lists'] });
    },
  });

  const refresh = (): void => {
    queryClient.invalidateQueries({ queryKey: ['settings'] });
    queryClient.invalidateQueries({ queryKey: ['services'] });
    queryClient.invalidateQueries({ queryKey: ['orphans'] });
    queryClient.invalidateQueries({ queryKey: ['wildcard-detection'] });
    queryClient.invalidateQueries({ queryKey: ['access-lists'] });
  };

  const resetMutation = useMutation({
    mutationFn: () => api.settings.reset(),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });

  return (
    <div
      className={`overflow-y-auto border-t border-[#30363d] bg-[#0d1117] transition-all duration-300 ease-in-out ${visClass}`}
    >
      <div className="p-6 pb-8">
        <PanelHeader
          onClose={onClose}
          onReset={() => resetMutation.mutate()}
          isResetting={resetMutation.isPending}
        />
        <div className="grid gap-6 md:grid-cols-2">
          <ProxyConfigSection current={settings?.proxy ?? null} />
          <DnsConfigSection
            current={settings?.dns ?? null}
            proxyConfigured={proxyConfigured}
            wildcardConfig={settings?.wildcard ?? null}
            wildcardDetection={wildcardDetection ?? null}
          />
        </div>
        {proxyConfigured && (
          <AccessListsSection
            accessLists={accessListsData?.accessLists ?? []}
            onSync={() => syncAccessLists.mutate()}
            isSyncing={syncAccessLists.isPending}
          />
        )}
      </div>
    </div>
  );
}

interface PanelHeaderProps {
  onClose: () => void;
  onReset: () => void;
  isResetting: boolean;
}

interface HeaderDialogsProps {
  showWarning: boolean;
  showReset: boolean;
  isResetting: boolean;
  onConfirmExport: () => void;
  onReset: () => void;
  onCloseExport: () => void;
  onCloseReset: () => void;
}

function HeaderDialogs(props: HeaderDialogsProps): JSX.Element {
  return (
    <>
      <ConfirmDialog
        isOpen={props.showWarning}
        title="Export Settings"
        message="This file contains sensitive API keys and credentials. Store it securely and delete after importing. Do not share this file or commit it to version control."
        confirmText="Export Anyway"
        cancelText="Cancel"
        variant="warning"
        onConfirm={props.onConfirmExport}
        onCancel={props.onCloseExport}
      />
      <ConfirmDialog
        isOpen={props.showReset}
        title="Reset autoxpose"
        message="This clears saved settings and local autoxpose state. It does not delete DNS records or proxy hosts outside autoxpose."
        confirmText={props.isResetting ? 'Resetting...' : 'Reset autoxpose'}
        cancelText="Cancel"
        variant="warning"
        confirmDisabled={props.isResetting}
        onConfirm={props.onReset}
        onCancel={props.onCloseReset}
      />
    </>
  );
}

interface HeaderActionsProps {
  onExport: () => void;
  onImport: () => void;
  onOpenReset: () => void;
  onClose: () => void;
}

function HeaderActions(props: HeaderActionsProps): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <Tooltip content="Export settings to JSON file">
        <button
          onClick={props.onExport}
          className="text-xs text-[#58a6ff] transition-colors hover:text-[#79c0ff]"
        >
          Export
        </button>
      </Tooltip>
      <Tooltip content="Import settings from JSON file">
        <button
          onClick={props.onImport}
          className="text-xs text-[#58a6ff] transition-colors hover:text-[#79c0ff]"
        >
          Import
        </button>
      </Tooltip>
      <Tooltip content="Clear saved settings and local autoxpose state">
        <button
          onClick={props.onOpenReset}
          className="text-xs text-[#d29922] transition-colors hover:text-[#e3b341]"
        >
          Reset
        </button>
      </Tooltip>
      <button
        onClick={props.onClose}
        className="text-xs text-[#8b949e] transition-colors hover:text-[#c9d1d9]"
      >
        Close
      </button>
    </div>
  );
}

interface AccessListsSectionProps {
  accessLists: AccessListRecord[];
  onSync: () => void;
  isSyncing: boolean;
}

function AccessListsSection({ accessLists, onSync, isSyncing }: AccessListsSectionProps): JSX.Element {
  return (
    <div className="mt-6 rounded border border-[#30363d] bg-[#161b22] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-bold text-[#c9d1d9]">NPM Access Lists</h4>
        <button
          onClick={onSync}
          disabled={isSyncing}
          className="text-xs text-[#58a6ff] transition-colors hover:text-[#79c0ff] disabled:opacity-50"
        >
          {isSyncing ? 'Syncing...' : 'Sync'}
        </button>
      </div>
      {accessLists.length === 0 ? (
        <p className="text-xs text-[#8b949e]">
          No access lists found. Create them in NPM, then click Sync.
        </p>
      ) : (
        <div className="space-y-2">
          {accessLists.map(al => (
            <div
              key={al.id}
              className="flex items-center justify-between rounded bg-[#0d1117] px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#c9d1d9]">{al.name}</span>
                <span className="text-xs text-[#8b949e]">#{al.id}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-[#8b949e]">
                {al.satisfyAny && <span>satisfy-any</span>}
                {al.syncedAt && (
                  <span>synced {new Date(al.syncedAt).toLocaleTimeString()}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-[#8b949e]">
        Use <code className="rounded bg-[#21262d] px-1 text-[#f0883e]">autoxpose.access_list=name</code> to attach an access list to a container.
      </p>
    </div>
  );
}

function PanelHeader({ onClose, onReset, isResetting }: PanelHeaderProps): JSX.Element {
  const [showWarning, setShowWarning] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const handleExport = (): void => {
    setShowWarning(true);
  };

  const confirmExport = (): void => {
    setShowWarning(false);
    void doExport();
  };

  return (
    <>
      <HeaderDialogs
        showWarning={showWarning}
        showReset={showReset}
        isResetting={isResetting}
        onConfirmExport={confirmExport}
        onReset={onReset}
        onCloseExport={() => setShowWarning(false)}
        onCloseReset={() => setShowReset(false)}
      />
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#c9d1d9]">Configuration</h3>
        <HeaderActions
          onExport={handleExport}
          onImport={() => void handleImport()}
          onOpenReset={() => setShowReset(true)}
          onClose={onClose}
        />
      </div>
    </>
  );
}
