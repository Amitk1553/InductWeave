import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock, Loader2, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import AiBadge from '@/components/AiBadge';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import EscalationAlerts from '@/components/EscalationAlerts';
import NewHireDialog from '@/components/NewHireDialog';
import StatCard from '@/components/StatCard';
import StatusBadge, { Tone } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useEmployees, useQuickApprovePlan } from '@/hooks/useEmployees';
import { useStats } from '@/hooks/useStats';
import { formatDate, pct, titleCase } from '@/lib/utils';

const STATUS_COLORS = { completed: '#10b981', onboarding: '#6366f1', pending: '#f59e0b', cancelled: '#94a3b8' };

function Charts({ stats }) {
  const donut = (stats.employeeStatus ?? []).map((s) => ({ name: titleCase(s.status), value: s.count, key: s.status }));
  const overdue = (stats.completionByDepartment ?? []).filter((d) => d.overdue > 0);
  const categories = (stats.tasksByCategory ?? []).map((c) => ({ name: titleCase(c.category), Completed: c.completed, Remaining: c.total - c.completed }));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hires by status</CardTitle>
          <CardDescription>Completion across all hires</CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          {donut.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donut} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {donut.map((d) => (
                    <Cell key={d.key} fill={STATUS_COLORS[d.key] ?? '#94a3b8'} />
                  ))}
                </Pie>
                <ChartTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No hires yet" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overdue tasks by department</CardTitle>
          <CardDescription>Tasks past their due date</CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          {overdue.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overdue}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="department" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <ChartTooltip />
                <Bar dataKey="overdue" name="Overdue" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No overdue tasks 🎉" description="Every task is on schedule." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tasks by category</CardTitle>
          <CardDescription>Completed vs remaining</CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          {categories.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categories} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                <ChartTooltip />
                <Legend />
                <Bar dataKey="Completed" stackId="a" fill="#10b981" />
                <Bar dataKey="Remaining" stackId="a" fill="#cbd5e1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No tasks yet" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Awaiting approval' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
];

function EmployeeTable({ employees }) {
  const navigate = useNavigate();
  const quickApprove = useQuickApprovePlan();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  const rows = useMemo(
    () =>
      employees.filter((e) => {
        const status = e.planStatus === 'approved' ? 'in_progress' : e.planStatus;
        if (filter !== 'all' && status !== filter) return false;
        const q = query.trim().toLowerCase();
        return !q || [e.name, e.role, e.location, e.department].some((v) => v.toLowerCase().includes(q));
      }),
    [employees, filter, query],
  );

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <CardTitle className="text-base">New hires</CardTitle>
          <CardDescription>{employees.length} total</CardDescription>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList className="h-9">
              {FILTERS.map((f) => (
                <TabsTrigger key={f.value} value={f.value} className="text-xs">
                  {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="h-9 sm:w-44" aria-label="Search hires" />
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState icon={Users} title="No hires match" description="Try a different filter or add a new hire." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Role</TableHead>
                  <TableHead className="hidden lg:table-cell">Location</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="min-w-[140px]">Progress</TableHead>
                  <TableHead className="w-[110px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => {
                  const percent = e.totalTasks ? Math.round((e.completedTasks / e.totalTasks) * 100) : 0;
                  const isApprovable = e.planStatus === 'draft' && e.planId;
                  const isApproving = quickApprove.isPending && quickApprove.variables === e.planId;
                  return (
                    <TableRow
                      key={e.id}
                      className={e.planId ? 'cursor-pointer' : ''}
                      onClick={() => e.planId && navigate(`/hr/onboarding/${e.planId}`)}
                    >
                      <TableCell>
                        <p className="font-medium">{e.name}</p>
                        <p className="text-xs text-muted-foreground">{e.email}</p>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {e.role}
                        <p className="text-xs text-muted-foreground">{e.department}</p>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{e.location}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(e.startDate)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <StatusBadge status={e.planStatus} />
                          {e.generationMode === 'fallback' && <Tone tone="yellow">Template</Tone>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {e.totalTasks ? (
                          <div className="space-y-1">
                            <Progress value={percent} className="h-2" />
                            <p className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>
                                {e.completedTasks}/{e.totalTasks}
                              </span>
                              {e.overdueTasks > 0 && <span className="font-medium text-orange-700">{e.overdueTasks} overdue</span>}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No plan yet</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isApprovable && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="h-7 gap-1 px-2 text-xs"
                                  disabled={isApproving}
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    quickApprove.mutate(e.planId);
                                  }}
                                >
                                  {isApproving
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <CheckCircle2 className="h-3 w-3" />}
                                  Approve
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                Approve plan — tasks will be assigned to {e.name.split(' ')[0]}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
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

export default function HRDashboard() {
  const employees = useEmployees();
  const stats = useStats();
  const s = stats.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">HR Dashboard</h1>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            Review AI-drafted plans, track progress and handle escalations <AiBadge />
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/hr/observability">
              <Activity className="mr-1.5 h-4 w-4" /> Observability
            </Link>
          </Button>
          <NewHireDialog />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Awaiting approval" value={s?.pendingApproval ?? 0} icon={Clock} loading={stats.isLoading} tone={s?.pendingApproval ? 'text-amber-600' : undefined} />
        <StatCard label="Overdue tasks" value={s?.overdueCount ?? 0} icon={AlertTriangle} loading={stats.isLoading} tone={s?.overdueCount ? 'text-orange-600' : undefined} />
        <StatCard label="Completion rate" value={pct(s?.completionRate)} icon={CheckCircle2} loading={stats.isLoading} hint="Tasks completed, live plans" />
        <StatCard label="Avg onboarding" value={s?.avgOnboardingDays == null ? '—' : `${s.avgOnboardingDays.toFixed(1)} d`} icon={Clock} loading={stats.isLoading} hint="Approval to last task" />
        <StatCard label="Hires" value={employees.data?.length ?? 0} icon={Users} loading={employees.isLoading} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          {employees.isLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : employees.error ? (
            <ErrorState error={employees.error} onRetry={employees.refetch} />
          ) : (
            <EmployeeTable employees={employees.data} />
          )}
        </div>
        <EscalationAlerts canResolve canScan />
      </div>

      {stats.isLoading ? <Skeleton className="h-72 w-full" /> : stats.error ? <ErrorState error={stats.error} onRetry={stats.refetch} /> : <Charts stats={s} />}

      {s?.mostOverdueTasks?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Most commonly late tasks</CardTitle>
            <CardDescription>Where onboarding most often slips</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {s.mostOverdueTasks.map((t) => (
                <li key={t.title} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>{t.title}</span>
                  <Tone tone="orange">{t.count}×</Tone>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
