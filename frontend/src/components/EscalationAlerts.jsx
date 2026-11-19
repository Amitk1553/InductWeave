import { AlertOctagon, AlertTriangle, BellRing, CheckCheck, Loader2, ScanSearch } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useEscalations, useResolveEscalation, useRunScan } from '@/hooks/useStats';
import { cn, formatDateTime, titleCase } from '@/lib/utils';

const SEVERITY = {
  critical: { icon: AlertOctagon, box: 'border-red-200 bg-red-50', text: 'text-red-700' },
  warning: { icon: AlertTriangle, box: 'border-amber-200 bg-amber-50', text: 'text-amber-700' },
};

/** canResolve / canScan are for HR; managers see their team's alerts read-only. */
export default function EscalationAlerts({ canResolve = false, canScan = false, className }) {
  const { data, isLoading, error, refetch } = useEscalations('open');
  const resolve = useResolveEscalation();
  const scan = useRunScan();

  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="h-4 w-4" /> Escalations
            {data?.length > 0 && <span className="rounded-full bg-red-600 px-2 text-xs font-semibold text-white">{data.length}</span>}
          </CardTitle>
          <CardDescription>Overdue, blocked or risky items needing attention</CardDescription>
        </div>
        {canScan && (
          <Button size="sm" variant="outline" onClick={() => scan.mutate()} disabled={scan.isPending}>
            {scan.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-1 h-4 w-4" />}
            Run scan
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : data.length === 0 ? (
          <EmptyState icon={CheckCheck} title="No open escalations" description="Everything is on track." />
        ) : (
          <ScrollArea className="max-h-[360px] pr-3">
            <ul className="space-y-2">
              {data.map((e) => {
                const s = SEVERITY[e.severity] ?? SEVERITY.warning;
                const Icon = s.icon;
                return (
                  <li key={e.id} className={cn('flex items-start gap-3 rounded-lg border p-3', s.box)}>
                    <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', s.text)} />
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-xs font-semibold uppercase tracking-wide', s.text)}>{titleCase(e.type)}</p>
                      <p className="text-sm">{e.message}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {e.employeeName} · {formatDateTime(e.createdAt)}
                      </p>
                    </div>
                    {canResolve && (
                      <Button size="sm" variant="outline" className="shrink-0 bg-white" disabled={resolve.isPending} onClick={() => resolve.mutate(e.id)}>
                        Resolve
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
