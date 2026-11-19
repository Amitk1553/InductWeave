import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/services/api';

export const useTasks = (params = {}, options = {}) =>
  useQuery({ queryKey: ['tasks', params], queryFn: () => api.tasks(params), ...options });

export function useSetTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => api.setTaskStatus(id, status),
    onSuccess: (data, { status }) => {
      for (const key of ['tasks', 'employees', 'stats', 'escalations']) qc.invalidateQueries({ queryKey: [key] });
      if (status === 'completed') {
        const n = data.unblocked.length;
        toast.success(n ? `Task completed. ${n} dependent task${n > 1 ? 's' : ''} unlocked.` : 'Task completed.');
      }
    },
  });
}
