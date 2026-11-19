import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export default function StatCard({ label, value, hint, icon: Icon, tone, loading }) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-20" />
          ) : (
            <p className={cn('mt-1 text-2xl font-semibold tabular-nums', tone)}>{value}</p>
          )}
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />}
      </CardContent>
    </Card>
  );
}
