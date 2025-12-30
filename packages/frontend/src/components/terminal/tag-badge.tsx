import { useTagPreferences } from '../../hooks/use-tag-preferences';
import { Tooltip } from './tooltip';

const TAG_COLORS: Record<string, string> = {
  ai: '#ff6ec7',
  web: '#58a6ff',
  database: '#f85149',
  media: '#a371f7',
  download: '#56d364',
  automation: '#ffa657',
  monitoring: '#79c0ff',
  security: '#ff7b72',
  productivity: '#39d353',
  utility: '#8b949e',
  gaming: '#db61a2',
  communication: '#ffd33d',
  development: '#7ee787',
  networking: '#8957e5',
  storage: '#f778ba',
  dashboard: '#3fb950',
};

const TAG_LABELS: Record<string, string> = {
  ai: 'AI',
  web: 'Web',
  database: 'Database',
  media: 'Media',
  download: 'Download',
  automation: 'Automation',
  monitoring: 'Monitoring',
  security: 'Security',
  productivity: 'Productivity',
  utility: 'Utility',
  gaming: 'Gaming',
  communication: 'Communication',
  development: 'Development',
  networking: 'Networking',
  storage: 'Storage',
  dashboard: 'Dashboard',
};

interface TagBadgeProps {
  tags: string[];
  showAll?: boolean;
}

export function TagBadge({ tags, showAll = false }: TagBadgeProps): JSX.Element {
  const { showTags } = useTagPreferences();

  if (!showTags || !tags || tags.length === 0) {
    return <></>;
  }

  const displayTags = showAll ? tags : tags.slice(0, 1);
  const remaining = tags.length - displayTags.length;

  return (
    <div className="flex items-center gap-1">
      {displayTags.map(tag => {
        const color = TAG_COLORS[tag] || TAG_COLORS.utility;
        const label = TAG_LABELS[tag] || tag;

        return (
          <Tooltip key={tag} content={tags.join(', ')}>
            <span
              className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-normal rounded opacity-60"
              style={{
                backgroundColor: `${color}09`,
                color: color,
                border: `1px solid ${color}25`,
              }}
            >
              {label}
            </span>
          </Tooltip>
        );
      })}
      {remaining > 0 && (
        <Tooltip content={tags.join(', ')}>
          <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-normal rounded text-gray-500 opacity-70">
            +{remaining}
          </span>
        </Tooltip>
      )}
    </div>
  );
}
