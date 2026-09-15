import { useQuery } from '@tanstack/react-query';
import { api, type AccessListRecord } from '../lib/api';

export function useAccessLists(): {
  accessLists: AccessListRecord[];
  supported: boolean;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ['access-lists'],
    queryFn: () => api.accessLists.list(),
    staleTime: 60_000,
  });

  return {
    accessLists: data?.accessLists ?? [],
    supported: data?.supported ?? false,
    isLoading,
  };
}
