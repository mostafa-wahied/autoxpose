import { useState } from 'react';
import { type ServiceRecord } from '../../lib/api';
import { InlineSpinner } from './progress';
import { TERMINAL_COLORS } from './theme';
import { Tooltip } from './tooltip';

interface TerminalServiceCardProps {
  service: ServiceRecord;
  onExpose: () => void;
  onDelete: () => void;
  isLoading: boolean;
  isActive?: boolean;
}

export function TerminalServiceCard({
  service,
  onExpose,
  onDelete,
  isLoading,
  isActive,
}: TerminalServiceCardProps): JSX.Element {
  const [showDelete, setShowDelete] = useState(false);
  const isExposed = Boolean(service.enabled);
  const borderClass = isActive ? 'border-[#58a6ff]' : 'border-[#30363d]';

  return (
    <div
      className={`group relative border bg-[#161b22] p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg ${borderClass}`}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      <CardHeader name={service.name} port={service.port} />
      <CardDomain domain={service.domain} isExposed={isExposed} />
      <CardFooter
        isExposed={isExposed}
        showDelete={showDelete}
        isLoading={isLoading}
        onExpose={onExpose}
        onDelete={onDelete}
      />
    </div>
  );
}

function CardHeader({ name, port }: { name: string; port: number }): JSX.Element {
  return (
    <div className="mb-2 flex items-center justify-between">
      <span className="font-bold text-[#c9d1d9]">{name}</span>
      <Tooltip content="Internal port">
        <span className="text-xs text-[#8b949e]">:{port}</span>
      </Tooltip>
    </div>
  );
}

function CardDomain({ domain, isExposed }: { domain: string; isExposed: boolean }): JSX.Element {
  const tip = isExposed ? 'Click to open' : 'Domain (not exposed)';

  return (
    <Tooltip content={tip}>
      {isExposed ? (
        <a
          href={`https://${domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-3 block truncate text-xs text-[#58a6ff] hover:underline"
        >
          {domain} {'>'}
        </a>
      ) : (
        <div className="mb-3 truncate text-xs text-[#8b949e]">{domain}</div>
      )}
    </Tooltip>
  );
}

interface CardFooterProps {
  isExposed: boolean;
  showDelete: boolean;
  isLoading: boolean;
  onExpose: () => void;
  onDelete: () => void;
}

function CardFooter(props: CardFooterProps): JSX.Element {
  const { isExposed, showDelete, isLoading, onExpose, onDelete } = props;

  return (
    <div className="flex items-center justify-between">
      <StatusBadge isExposed={isExposed} />
      <div className="flex items-center gap-2">
        <DeleteButton visible={showDelete} onClick={onDelete} />
        <ExposeButton isExposed={isExposed} isLoading={isLoading} onClick={onExpose} />
      </div>
    </div>
  );
}

function StatusBadge({ isExposed }: { isExposed: boolean }): JSX.Element {
  const tip = isExposed ? 'Service is publicly accessible' : 'Service is not exposed';
  const color = isExposed ? TERMINAL_COLORS.success : TERMINAL_COLORS.textMuted;

  return (
    <Tooltip content={tip}>
      <span
        className="rounded px-2 py-0.5 text-xs font-medium"
        style={{ background: `${color}20`, color }}
      >
        {isExposed ? '\u25CF ONLINE' : '\u25CB OFFLINE'}
      </span>
    </Tooltip>
  );
}

function DeleteButton({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}): JSX.Element {
  const opacityClass = visible ? 'opacity-100' : 'opacity-0';

  return (
    <div className={`transition-opacity duration-200 ${opacityClass}`}>
      <Tooltip content="Remove service">
        <button
          onClick={e => {
            e.stopPropagation();
            onClick();
          }}
          className="flex h-6 w-6 items-center justify-center rounded text-[#8b949e] transition-colors hover:bg-[#f8514920] hover:text-[#f85149]"
          aria-label="Delete service"
        >
          x
        </button>
      </Tooltip>
    </div>
  );
}

interface ExposeButtonProps {
  isExposed: boolean;
  isLoading: boolean;
  onClick: () => void;
}

function ExposeButton({ isExposed, isLoading, onClick }: ExposeButtonProps): JSX.Element {
  const tip = isExposed ? 'Unexpose service' : 'Expose service';
  const label = isExposed ? 'Stop service' : 'Start service';
  const icon = isExposed ? '\u25A0' : '\u25B6';

  return (
    <Tooltip content={tip}>
      <button
        onClick={onClick}
        disabled={isLoading}
        className="flex h-7 w-7 items-center justify-center rounded border border-[#30363d] text-sm transition-all hover:border-[#58a6ff] hover:bg-[#58a6ff20] disabled:cursor-not-allowed disabled:opacity-50"
        style={{ color: TERMINAL_COLORS.accent }}
        aria-label={label}
      >
        {isLoading ? <InlineSpinner /> : icon}
      </button>
    </Tooltip>
  );
}
