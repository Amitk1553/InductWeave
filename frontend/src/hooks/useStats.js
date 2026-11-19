import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/services/api';

export const useStats = (options = {}) => useQuery({ queryKey: ['stats'], queryFn: api.dashboardStats, ...options });

export const useMetrics = () => useQuery({ queryKey: ['metrics'], queryFn: api.metrics });

export const useAudit = (employeeId) =>
  useQuery({ queryKey: ['audit', employeeId], queryFn: () => api.audit(employeeId), select: (d) => d.events, enabled: Boolean(employeeId) });

export const useEscalations = (status = 'open') =>
  useQuery({ queryKey: ['escalations', status], queryFn: () => api.escalations(status), select: (d) => d.escalations });

export function useResolveEscalation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.resolveEscalation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['escalations'] });
      qc.invalidateQueries({ queryKey: ['audit'] });
      toast.success('Escalation resolved.');
    },
  });
}

export function useRunScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.scanEscalations,
    onSuccess: (d) => {
      for (const key of ['escalations', 'employees', 'stats', 'tasks']) qc.invalidateQueries({ queryKey: [key] });
      toast.success(`Scan finished: ${d.summary.created} new escalation${d.summary.created === 1 ? '' : 's'}.`);
    },
  });
}
