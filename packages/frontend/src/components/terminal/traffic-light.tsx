import { Tooltip } from './tooltip';

interface TrafficLightButtonProps {
  color: 'red' | 'yellow' | 'green';
  tooltip: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
}

const BG_COLORS = {
  red: 'bg-red-500 hover:bg-red-400',
  yellow: 'bg-yellow-500 hover:bg-yellow-400',
  green: 'bg-green-500 hover:bg-green-400',
};

const ICONS = {
  red: '■',
  yellow: '↻',
  green: '▶',
};

const ICON_STYLES = {
  red: '',
  yellow: '',
  green: 'ml-[1px]',
};

export function TrafficLightButton({
  color,
  tooltip,
  shortcut,
  onClick,
  disabled,
}: TrafficLightButtonProps): JSX.Element {
  const disabledCss = disabled
    ? 'opacity-50 cursor-not-allowed'
    : 'cursor-pointer hover:scale-125 hover:shadow-lg';

  return (
    <Tooltip content={tooltip} shortcut={shortcut}>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`h-4 w-4 rounded-full transition-all duration-200 flex items-center justify-center text-black text-[10px] font-bold ${BG_COLORS[color]} ${disabledCss}`}
        aria-label={tooltip}
      >
        <span className={ICON_STYLES[color]}>{ICONS[color]}</span>
      </button>
    </Tooltip>
  );
}
