import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/services/api';

export const useEmployees = () =>
  useQuery({ queryKey: ['employees'], queryFn: api.employees, select: (d) => d.employees });

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, simulate }) => api.createEmployee(body, simulate),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['escalations'] });
      if (data.plan) {
        toast.success(
          data.mode === 'ai'
            ? `${data.employee.name} added — ${data.tasksCreated} tasks drafted. Open the plan and click "Approve" to send tasks to the employee.`
            : `${data.employee.name} added with a template plan. Open it and click "Approve" to send tasks to the employee.`,
          { duration: 6000 },
        );
      } else {
        toast.warning(data.planError ?? 'Employee created without a plan.');
      }
    },
  });
}

/** Quick-approve a draft plan straight from the HR dashboard table. */
export function useQuickApprovePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId) => api.approvePlan(planId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['escalations'] });
      toast.success('Plan approved — tasks are now assigned to the employee.');
    },
    onError: (err) => {
      // 409 = low-confidence tasks need manual confirmation first
      toast.error(err?.message ?? 'Could not approve plan. Open it to review flagged tasks.');
    },
  });
}
