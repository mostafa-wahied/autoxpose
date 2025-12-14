import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { Tooltip } from '../tooltip';

interface EditableServiceNameProps {
  value: string;
  containerName: string;
  port: number;
  onChange: (value: string) => void;
}

interface EditInputProps {
  inputRef: RefObject<HTMLInputElement>;
  draft: string;
  onDraftChange: (v: string) => void;
  onSave: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}

function EditInput(p: EditInputProps): JSX.Element {
  return (
    <input
      ref={p.inputRef}
      type="text"
      value={p.draft}
      onChange={e => p.onDraftChange(e.target.value)}
      onBlur={p.onSave}
      onKeyDown={p.onKeyDown}
      className="w-full border-b border-[#58a6ff] bg-transparent text-[#c9d1d9] font-bold outline-none"
      placeholder="service name"
    />
  );
}

interface DisplayProps {
  name: string;
  containerName: string;
  showHover: boolean;
  onEdit: () => void;
}

function DisplayState({
  name,
  showHover,
  onEdit,
}: Omit<DisplayProps, 'containerName'>): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <Tooltip content="Click to rename service">
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 text-[#c9d1d9] font-bold hover:text-[#58a6ff] transition-colors group/name"
        >
          <span>{name}</span>
          {showHover && (
            <span className="text-[#8b949e] text-xs opacity-0 group-hover/name:opacity-100 transition-opacity">
              ✎
            </span>
          )}
        </button>
      </Tooltip>
    </div>
  );
}

export function EditableServiceName(props: EditableServiceNameProps): JSX.Element {
  const { value, onChange } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [showHover, setShowHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const save = (): void => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value && trimmed.length <= 100) {
      onChange(trimmed);
    }
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
        onDraftChange={setDraft}
        onSave={save}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <div onMouseEnter={() => setShowHover(true)} onMouseLeave={() => setShowHover(false)}>
      <DisplayState name={value} showHover={showHover} onEdit={startEdit} />
    </div>
  );
}
