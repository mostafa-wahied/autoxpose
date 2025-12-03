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

export function TrafficLightButton({
  color,
  tooltip,
  shortcut,
  onClick,
  disabled,
}: TrafficLightButtonProps): JSX.Element {
  const disabledCss = disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-110';

  return (
    <Tooltip content={tooltip} shortcut={shortcut}>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`h-3 w-3 rounded-full transition-all ${BG_COLORS[color]} ${disabledCss}`}
        aria-label={tooltip}
      />
    </Tooltip>
  );
}
