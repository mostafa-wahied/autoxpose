interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

const CONFIRM_COLORS = {
  danger: 'bg-[#f85149] hover:bg-[#da3633]',
  warning: 'bg-[#d29922] hover:bg-[#bb8009]',
  default: 'bg-[#58a6ff] hover:bg-[#4493f8]',
};

const FONT_STACK = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText,
  cancelText = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element | null {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        className="w-full max-w-md border border-[#30363d] bg-[#161b22] p-6 shadow-2xl"
        style={{ fontFamily: FONT_STACK }}
      >
        <h3 className="mb-2 text-lg font-bold text-[#c9d1d9]">{title}</h3>
        <p className="mb-6 text-sm text-[#8b949e]">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded border border-[#30363d] px-4 py-2 text-sm text-[#c9d1d9] transition-colors hover:bg-[#30363d]"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded px-4 py-2 text-sm font-medium text-white transition-colors ${CONFIRM_COLORS[variant]}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
