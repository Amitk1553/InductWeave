import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

export const useMe = () =>
  useQuery({ queryKey: ['me'], queryFn: api.me, select: (d) => d.user, staleTime: 60_000, retry: 1 });
