import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/services/api';

export const usePlan = (planId) =>
  useQuery({ queryKey: ['plan', planId], queryFn: () => api.plan(planId), enabled: Boolean(planId) });

function useInvalidatingMutation(fn, { planId, success } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data, vars) => {
      if (planId) qc.invalidateQueries({ queryKey: ['plan', planId] });
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['audit'] });
      qc.invalidateQueries({ queryKey: ['escalations'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      const msg = typeof success === 'function' ? success(data, vars) : success;
      if (msg) toast.success(msg);
    },
  });
}

export const useApprovePlan = (planId) =>
  useInvalidatingMutation(() => api.approvePlan(planId), { planId, success: 'Plan approved. Tasks are now assigned.' });

export const useRejectPlan = (planId) =>
  useInvalidatingMutation((reason) => api.rejectPlan(planId, reason), { planId, success: 'Plan rejected.' });

export const useGeneratePlan = () =>
  useInvalidatingMutation(({ employeeId, simulate }) => api.generatePlan(employeeId, simulate), {
    success: (d) => `New draft (v${d.plan.version}) generated in ${d.mode === 'ai' ? 'AI' : 'fallback'} mode.`,
  });

export const useAddTask = (planId) =>
  useInvalidatingMutation((body) => api.createTask({ ...body, planId }), { planId, success: 'Task added.' });

export const useEditTask = (planId) =>
  useInvalidatingMutation(({ id, patch }) => api.patchTask(id, patch), { planId, success: 'Task updated.' });

export const useConfirmTask = (planId) =>
  useInvalidatingMutation((id) => api.confirmTask(id), { planId, success: 'Task confirmed.' });

export const useDeleteTask = (planId) =>
  useInvalidatingMutation((id) => api.deleteTask(id), { planId, success: 'Task deleted.' });
