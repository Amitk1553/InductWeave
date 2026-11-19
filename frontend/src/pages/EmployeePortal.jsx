import { Hourglass } from 'lucide-react';
import AiBadge from '@/components/AiBadge';
import ChatWidget from '@/components/ChatWidget';
import ChecklistView from '@/components/ChecklistView';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import ProgressTracker from '@/components/ProgressTracker';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/hooks/useMe';
import { useSetTaskStatus, useTasks } from '@/hooks/useTasks';

export default function EmployeePortal() {
  const { data: me } = useMe();
  const { data, isLoading, error, refetch } = useTasks();
  const setStatus = useSetTaskStatus();

  const tasks = data?.tasks ?? [];
  const preparing = !isLoading && !error && (!data?.plan || data.plan.status === 'preparing' || tasks.length === 0);
  const firstName = me?.name?.split(' ')[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome{firstName ? `, ${firstName}` : ''}</h1>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          Your personalised onboarding checklist <AiBadge />
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : preparing ? (
        <EmptyState
          icon={Hourglass}
          className="py-16"
          title="Your onboarding plan is being prepared"
          description={
            me?.employeeId
              ? 'HR is reviewing your checklist. Your tasks will appear here as soon as it is approved. You can already ask the assistant about company policies.'
              : 'We could not find an employee record for your account email. Please contact HR.'
          }
        />
      ) : (
        <>
          <Card>
            <CardContent className="p-5">
              <ProgressTracker tasks={tasks} progress={data.plan.progress} />
            </CardContent>
          </Card>
          <ChecklistView
            tasks={tasks}
            mode="work"
            canAct={(t) => t.assignedToRole === 'employee'}
            busy={setStatus.isPending}
            onStatus={(id, status) => setStatus.mutate({ id, status })}
          />
        </>
      )}
    </div>
  );
}
