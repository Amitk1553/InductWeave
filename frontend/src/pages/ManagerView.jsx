import { AlertTriangle, ClipboardList, Users } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import ChecklistView from '@/components/ChecklistView';
import EscalationAlerts from '@/components/EscalationAlerts';
import StatCard from '@/components/StatCard';
import StatusBadge from '@/components/StatusBadge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useEmployees } from '@/hooks/useEmployees';
import { useSetTaskStatus, useTasks } from '@/hooks/useTasks';
import { formatDate } from '@/lib/utils';

function TeamTable({ employees }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your new hires</CardTitle>
        <CardDescription>{employees.length} on your team</CardDescription>
      </CardHeader>
      <CardContent>
        {employees.length === 0 ? (
          <EmptyState icon={Users} title="No new hires yet" description="New hires assigned to you will appear here once HR adds them." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Role</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="min-w-[140px]">Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((e) => {
                  const percent = e.totalTasks ? Math.round((e.completedTasks / e.totalTasks) * 100) : 0;
                  return (
                    <TableRow key={e.id} className={e.overdueTasks > 0 ? 'bg-orange-50/60' : ''}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell className="hidden md:table-cell">{e.role}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(e.startDate)}</TableCell>
                      <TableCell><StatusBadge status={e.planStatus} /></TableCell>
                      <TableCell>
                        {e.totalTasks ? (
                          <div className="space-y-1">
                            <Progress value={percent} className="h-2" />
                            <p className="flex justify-between text-xs text-muted-foreground">
                              <span>{e.completedTasks}/{e.totalTasks}</span>
                              {e.overdueTasks > 0 && <span className="font-medium text-orange-700">{e.overdueTasks} overdue</span>}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Plan pending HR approval</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ManagerView() {
  const employees = useEmployees();
  const tasks = useTasks({ assignedToRole: 'manager' });
  const setStatus = useSetTaskStatus();

  const mine = tasks.data?.tasks ?? [];
  const open = mine.filter((t) => t.status !== 'completed');
  const overdue = mine.filter((t) => ['overdue', 'escalated'].includes(t.status));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My team</h1>
        <p className="text-sm text-muted-foreground">Your new hires and the onboarding tasks that need you.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="New hires" value={employees.data?.length ?? 0} icon={Users} loading={employees.isLoading} />
        <StatCard label="My open tasks" value={open.length} icon={ClipboardList} loading={tasks.isLoading} />
        <StatCard label="My overdue tasks" value={overdue.length} icon={AlertTriangle} tone={overdue.length ? 'text-orange-600' : undefined} loading={tasks.isLoading} />
        <StatCard
          label="Team progress"
          value={(() => {
            const list = employees.data ?? [];
            const total = list.reduce((s, e) => s + e.totalTasks, 0);
            return total ? `${Math.round((list.reduce((s, e) => s + e.completedTasks, 0) / total) * 100)}%` : '—';
          })()}
          loading={employees.isLoading}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          {employees.isLoading ? <Skeleton className="h-64 w-full" /> : employees.error ? <ErrorState error={employees.error} onRetry={employees.refetch} /> : <TeamTable employees={employees.data} />}
        </div>
        <EscalationAlerts />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tasks assigned to me</CardTitle>
          <CardDescription>Overdue items are highlighted. Tasks waiting on others are locked.</CardDescription>
        </CardHeader>
        <CardContent>
          {tasks.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : tasks.error ? (
            <ErrorState error={tasks.error} onRetry={tasks.refetch} />
          ) : (
            <ChecklistView
              tasks={mine.map((t) => ({ ...t, title: `${t.title} · ${t.employeeName}` }))}
              mode="work"
              canAct
              busy={setStatus.isPending}
              onStatus={(id, status) => setStatus.mutate({ id, status })}
              emptyTitle="No tasks for you right now"
              emptyDescription="Tasks appear here after HR approves a new hire's plan."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
