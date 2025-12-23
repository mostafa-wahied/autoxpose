import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type ServiceRecord } from '../../lib/api';

interface SubdomainDialogProps {
  service: ServiceRecord;
  onClose: () => void;
}

const FONT_STACK = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

export function SubdomainDialog({ service, onClose }: SubdomainDialogProps): JSX.Element {
  const queryClient = useQueryClient();
  const [selectedSubdomain, setSelectedSubdomain] = useState<string>(service.subdomain);

  const isKeepingExposed = selectedSubdomain === service.exposedSubdomain;

  const migrateMutation = useMutation({
    mutationFn: ({ id, targetSubdomain }: { id: string; targetSubdomain: string }) =>
      api.services.migrateSubdomain(id, targetSubdomain),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      onClose();
    },
  });

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md border border-[#30363d] bg-[#0d1117] p-6 shadow-2xl mx-4"
        style={{ fontFamily: FONT_STACK }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-2 text-[#c9d1d9]">Resolve Subdomain Conflict</h3>
        <p className="text-sm text-[#8b949e] mb-6">
          Choose which subdomain to use. New DNS and proxy resources will be created with the
          selected subdomain, then old resources will be deleted.
        </p>
        <div className="space-y-3 mb-6">
          <SubdomainOption
            value={service.subdomain}
            label="From container label/database"
            selected={selectedSubdomain === service.subdomain}
            onChange={setSelectedSubdomain}
          />
          <SubdomainOption
            value={service.exposedSubdomain!}
            label="From NPM proxy record"
            selected={selectedSubdomain === service.exposedSubdomain}
            onChange={setSelectedSubdomain}
            helperText={
              isKeepingExposed
                ? 'The container label will remain but be ignored. Update your Docker config to remove it.'
                : undefined
            }
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={migrateMutation.isPending}
            className="rounded border border-[#30363d] px-3 py-1.5 text-xs text-[#c9d1d9] transition-colors hover:bg-[#30363d] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              migrateMutation.mutate({ id: service.id, targetSubdomain: selectedSubdomain })
            }
            disabled={migrateMutation.isPending}
            className="rounded px-3 py-1.5 text-xs font-medium text-white bg-[#238636] hover:bg-[#2ea043] transition-colors disabled:opacity-50"
          >
            {migrateMutation.isPending ? 'Applying...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

function SubdomainOption({
  value,
  label,
  selected,
  onChange,
  helperText,
}: {
  value: string;
  label: string;
  selected: boolean;
  onChange: (val: string) => void;
  helperText?: string;
}): JSX.Element {
  return (
    <label className="flex items-start gap-3 p-3 border border-[#30363d] bg-[#161b22] hover:bg-[#21262d] cursor-pointer transition-colors">
      <input
        type="radio"
        name="subdomain"
        value={value}
        checked={selected}
        onChange={e => onChange(e.target.value)}
        className="mt-1 accent-[#238636]"
      />
      <div className="flex-1">
        <div className="text-sm font-medium text-[#c9d1d9]">{value}</div>
        <div className="text-xs text-[#8b949e]">{label}</div>
        {helperText && (
          <div className="text-xs text-[#f0883e] mt-1.5 leading-relaxed">{helperText}</div>
        )}
      </div>
    </label>
  );
}
