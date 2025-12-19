import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ServiceRecord } from '../lib/api';

interface StatusResult {
  online: boolean;
  protocol: 'https' | 'http' | null;
}

interface UseBulkStatusCheckReturn {
  statusMap: Record<string, StatusResult>;
  checkServices: (services: ServiceRecord[]) => void;
  isChecking: boolean;
}

const DEBOUNCE_DELAY = 300;

function processCheckResults(response: {
  results: Record<string, { online: boolean; protocol: string | null }>;
}): Record<string, StatusResult> {
  const results: Record<string, StatusResult> = {};
  const entries = Object.entries(response.results);
  entries.forEach(([key, item]) => {
    results[key] = {
      online: item.online,
      protocol: item.protocol === 'https' || item.protocol === 'http' ? item.protocol : null,
    };
  });
  return results;
}

export function useBulkStatusCheck(scanTrigger?: number): UseBulkStatusCheckReturn {
  const [statusMap, setStatusMap] = useState<Record<string, StatusResult>>({});
  const [isChecking, setIsChecking] = useState(false);
  const debounceTimer = useRef<number | null>(null);
  const lastScanTrigger = useRef(scanTrigger);

  const checkServices = useCallback((services: ServiceRecord[]) => {
    const exposedServices = services.filter(s => s.enabled);
    if (exposedServices.length === 0) {
      setStatusMap({});
      return;
    }

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      setIsChecking(true);
      const serviceIds = exposedServices.map(s => s.id);

      api.services
        .checkBulk(serviceIds)
        .then(response => {
          setStatusMap(processCheckResults(response));
          setIsChecking(false);
        })
        .catch(() => {
          setIsChecking(false);
        });
    }, DEBOUNCE_DELAY) as unknown as number;
  }, []);

  useEffect(() => {
    if (scanTrigger !== undefined && scanTrigger !== lastScanTrigger.current) {
      lastScanTrigger.current = scanTrigger;
      setStatusMap({});
    }
  }, [scanTrigger]);

  useEffect(() => {
    return (): void => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  return { statusMap, checkServices, isChecking };
}
