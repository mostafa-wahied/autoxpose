import type { ReactNode } from 'react';

type Props = {
  onClose: () => void;
  title: string;
  children: ReactNode;
};

export function Modal({ onClose, title, children }: Props): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">{title}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            ✕
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
