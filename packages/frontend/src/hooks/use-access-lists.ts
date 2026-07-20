import { useQuery } from '@tanstack/react-query';
import { api, type AccessListRecord } from '../lib/api';

export function useAccessLists(): {
  accessLists: AccessListRecord[];
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ['access-lists'],
    queryFn: () => api.accessLists.list(),
    staleTime: 60_000,
  });

  return {
    accessLists: data?.accessLists ?? [],
    isLoading,
  };
}

export function useAccessListName(
  accessListId: number | null | undefined,
  accessLists: AccessListRecord[]
): string | null {
  if (!accessListId) return null;
  return accessLists.find(al => al.id === accessListId)?.name ?? null;
}
