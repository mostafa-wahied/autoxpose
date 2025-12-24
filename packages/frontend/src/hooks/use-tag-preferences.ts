import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'autoxpose:showTags';

export function useTagPreferences(): { showTags: boolean; setShowTags: (show: boolean) => void } {
  const [showTags, setShowTagsState] = useState<boolean>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null ? stored === 'true' : true;
  });

  const setShowTags = useCallback((show: boolean): void => {
    setShowTagsState(show);
    localStorage.setItem(STORAGE_KEY, show.toString());
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: STORAGE_KEY,
        newValue: show.toString(),
        oldValue: localStorage.getItem(STORAGE_KEY),
      })
    );
  }, []);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent): void => {
      if (e.key === STORAGE_KEY && e.newValue !== null) {
        setShowTagsState(e.newValue === 'true');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return (): void => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return { showTags, setShowTags };
}
