import { Menu, X } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import type { ServiceRecord } from '../../lib/api';
import { TerminalSidebar } from './sidebar';
import { Tooltip } from './tooltip';

interface MobileServicesProps {
  services: ServiceRecord[];
  onHelp: () => void;
}

function keepFocusInside(event: KeyboardEvent<HTMLDialogElement>): void {
  if (event.key !== 'Tab') return;
  const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
  const first = buttons[0];
  const last = buttons[buttons.length - 1];
  if (!first || !last) return;
  const boundary = event.shiftKey ? first : last;
  if (document.activeElement === boundary) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}

function useServiceDrawer(onHelp: () => void): {
  dialog: React.RefObject<HTMLDialogElement>;
  trigger: React.RefObject<HTMLButtonElement>;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  restoreFocus: () => void;
  selectService: (service: ServiceRecord) => void;
  showHelp: () => void;
} {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const selectedId = useRef<string | null>(null);
  const helpRequested = useRef(false);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = (): void => {
      if (desktop.matches) dialog.current?.close();
    };
    desktop.addEventListener('change', closeOnDesktop);
    return (): void => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  const close = (): void => dialog.current?.close();
  const open = (): void => {
    dialog.current?.showModal();
    setIsOpen(true);
  };
  const restoreFocus = (): void => {
    setIsOpen(false);
    const card = selectedId.current ? document.getElementById(selectedId.current) : null;
    selectedId.current = null;
    if (card) {
      card.scrollIntoView({ block: 'center' });
      card.focus({ preventScroll: true });
    } else {
      trigger.current?.focus();
    }
    if (helpRequested.current) {
      helpRequested.current = false;
      onHelp();
    }
  };
  const selectService = (service: ServiceRecord): void => {
    selectedId.current = `service-${service.id}`;
    close();
  };
  const showHelp = (): void => {
    helpRequested.current = true;
    close();
  };
  return { dialog, trigger, isOpen, open, close, restoreFocus, selectService, showHelp };
}

export function MobileServices({ services, onHelp }: MobileServicesProps): JSX.Element {
  const drawer = useServiceDrawer(onHelp);
  return (
    <div className="shrink-0 md:hidden">
      <Tooltip content="Services">
        <button
          ref={drawer.trigger}
          type="button"
          aria-label="Open service list"
          aria-haspopup="dialog"
          aria-controls="mobile-services"
          aria-expanded={drawer.isOpen}
          onClick={drawer.open}
          className="flex h-10 w-10 items-center justify-center rounded border border-[#30363d] text-lg text-[#c9d1d9] hover:bg-[#161b22]"
        >
          <Menu size={20} aria-hidden="true" />
        </button>
      </Tooltip>
      <dialog
        ref={drawer.dialog}
        id="mobile-services"
        aria-label="Services"
        onKeyDown={keepFocusInside}
        onClose={drawer.restoreFocus}
        onClick={event => {
          if (event.target === event.currentTarget) drawer.close();
        }}
        className="fixed inset-0 m-0 h-dvh max-h-none w-[min(20rem,85vw)] max-w-none border-0 border-r border-[#30363d] bg-[#0d1117] p-0 text-[#c9d1d9] backdrop:bg-black/60"
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-center justify-end border-b border-[#30363d] p-2">
            <button
              type="button"
              aria-label="Close service list"
              onClick={drawer.close}
              className="flex h-10 w-10 items-center justify-center rounded hover:bg-[#161b22]"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <TerminalSidebar
            services={services}
            onServiceClick={drawer.selectService}
            onHelp={drawer.showHelp}
          />
        </div>
      </dialog>
    </div>
  );
}
