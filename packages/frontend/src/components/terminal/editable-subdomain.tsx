import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { Tooltip } from './tooltip';

interface EditableSubdomainProps {
  value: string;
  baseDomain: string | null;
  isExposed: boolean;
  onChange: (value: string) => void;
}

function EmptyState({ onEdit }: { onEdit: () => void }): JSX.Element {
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={onEdit}
        className="flex cursor-pointer items-center gap-1 text-xs text-[#f0883e] hover:underline"
      >
        <span className="animate-pulse">{'\u25B6'}</span>
        <span>set subdomain to expose</span>
      </button>
    </div>
  );
}

interface EditInputProps {
  inputRef: RefObject<HTMLInputElement>;
  draft: string;
  baseDomain: string | null;
  onDraftChange: (v: string) => void;
  onSave: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}

function EditInput(p: EditInputProps): JSX.Element {
  return (
    <div className="mb-3 flex items-center gap-1 text-xs">
      <input
        ref={p.inputRef}
        type="text"
        value={p.draft}
        onChange={e => p.onDraftChange(e.target.value)}
        onBlur={p.onSave}
        onKeyDown={p.onKeyDown}
        className="w-24 border-b border-[#58a6ff] bg-transparent text-[#58a6ff] outline-none"
        placeholder="subdomain"
      />
      {p.baseDomain && <span className="text-[#8b949e]">.{p.baseDomain}</span>}
    </div>
  );
}

function ExposedLink({ domain }: { domain: string }): JSX.Element {
  return (
    <div className="mb-3 flex items-center text-xs">
      <a
        href={`https://${domain}`}
        target="_blank"
        rel="noopener noreferrer"
        className="truncate text-[#58a6ff] hover:underline"
      >
        {domain}
      </a>
      <span className="ml-1 text-[#58a6ff]">{'>'}</span>
    </div>
  );
}

interface DisplayProps {
  domain: string;
  hasBaseDomain: boolean;
  onEdit: () => void;
}

function DisplayState({ domain, hasBaseDomain, onEdit }: DisplayProps): JSX.Element {
  return (
    <Tooltip content="Click to edit subdomain">
      <button
        onClick={onEdit}
        className="mb-3 block truncate text-left text-xs text-[#8b949e] hover:text-[#c9d1d9]"
      >
        {domain}
        {!hasBaseDomain && <span className="ml-1 text-[#f85149]">(no domain)</span>}
      </button>
    </Tooltip>
  );
}

export function EditableSubdomain(props: EditableSubdomainProps): JSX.Element {
  const { value, baseDomain, isExposed, onChange } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const save = (): void => {
    const trimmed = draft
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-');
    if (trimmed && trimmed !== value) onChange(trimmed);
    setEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') {
      setDraft(value);
      setEditing(false);
    }
  };

  const startEdit = (): void => {
    setDraft(value);
    setEditing(true);
  };

  if (editing) {
    return (
      <EditInput
        inputRef={inputRef as RefObject<HTMLInputElement>}
        draft={draft}
        baseDomain={baseDomain}
        onDraftChange={setDraft}
        onSave={save}
        onKeyDown={handleKeyDown}
      />
    );
  }

  if (!value) return <EmptyState onEdit={startEdit} />;

  const fullDomain = baseDomain ? `${value}.${baseDomain}` : value;
  if (isExposed) return <ExposedLink domain={fullDomain} />;

  return (
    <DisplayState domain={fullDomain} hasBaseDomain={Boolean(baseDomain)} onEdit={startEdit} />
  );
}
