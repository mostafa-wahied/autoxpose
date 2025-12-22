import { useState, useEffect } from 'react';
import type { ServiceRecord } from '../../lib/api';
import { useTagPreferences } from '../../hooks/use-tag-preferences';

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

function TagButton({
  tag,
  count,
  isSelected,
  onClick,
}: {
  tag: string;
  count: number;
  isSelected: boolean;
  onClick: () => void;
}): JSX.Element {
  const color = TAG_COLORS[tag] || TAG_COLORS.utility;
  const label = TAG_LABELS[tag] || tag;

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-normal rounded transition-all ${
        isSelected ? 'ring-1' : 'hover:opacity-80'
      }`}
      style={{
        backgroundColor: isSelected ? `${color}19` : `${color}09`,
        color: color,
        borderColor: isSelected ? color : `${color}20`,
        borderWidth: '1px',
        borderStyle: 'solid',
        ...(isSelected && { ringColor: `${color}40` }),
      }}
    >
      <span>{label}</span>
      <span
        className="text-[10px] px-1 py-0.5 rounded opacity-70"
        style={{
          backgroundColor: `${color}12`,
        }}
      >
        {count}
      </span>
    </button>
  );
}

interface TagFiltersProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  tagCounts: Record<string, number>;
}

export function TagFilters({
  selectedTags,
  onTagsChange,
  tagCounts,
}: TagFiltersProps): JSX.Element {
  const { showTags } = useTagPreferences();
  const availableTags = Object.keys(tagCounts).sort((a, b) => {
    const countDiff = (tagCounts[b] || 0) - (tagCounts[a] || 0);
    if (countDiff !== 0) return countDiff;
    return a.localeCompare(b);
  });

  const toggleTag = (tag: string): void => {
    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter(t => t !== tag));
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };

  const clearFilters = (): void => {
    onTagsChange([]);
  };

  if (!showTags || availableTags.length === 0) {
    return <></>;
  }

  return (
    <div className="flex flex-col gap-2 mb-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400">Filter by category:</div>
        {selectedTags.length > 0 && (
          <button
            onClick={clearFilters}
            className="text-[10px] text-gray-500 hover:text-gray-400 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {availableTags.map(tag => (
          <TagButton
            key={tag}
            tag={tag}
            count={tagCounts[tag] || 0}
            isSelected={selectedTags.includes(tag)}
            onClick={() => toggleTag(tag)}
          />
        ))}
      </div>
    </div>
  );
}

interface UseTagFiltersResult {
  selectedTags: string[];
  setSelectedTags: (tags: string[]) => void;
  tagCounts: Record<string, number>;
  filteredServices: ServiceRecord[];
}

export function useTagFilters(services: ServiceRecord[]): UseTagFiltersResult {
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    const stored = localStorage.getItem('autoxpose:selectedTags');
    return stored ? JSON.parse(stored) : [];
  });

  useEffect(() => {
    localStorage.setItem('autoxpose:selectedTags', JSON.stringify(selectedTags));
  }, [selectedTags]);

  const tagCounts: Record<string, number> = {};
  for (const service of services) {
    if (!service.tags) continue;
    try {
      const tags = typeof service.tags === 'string' ? JSON.parse(service.tags) : service.tags;
      for (const tag of tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    } catch {
      continue;
    }
  }

  const filteredServices =
    selectedTags.length === 0
      ? services
      : services.filter(service => {
          if (!service.tags) return false;
          try {
            const tags = typeof service.tags === 'string' ? JSON.parse(service.tags) : service.tags;
            return selectedTags.some(selectedTag => tags.includes(selectedTag));
          } catch {
            return false;
          }
        });

  return {
    selectedTags,
    setSelectedTags,
    tagCounts,
    filteredServices,
  };
}
