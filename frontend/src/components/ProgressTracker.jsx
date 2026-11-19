import { CheckCircle2, Circle, CircleDot, Clock3, Lock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export default function ProgressTracker({ tasks, progress }) {
  const total = progress?.total ?? tasks.length;
  const completed = progress?.completed ?? tasks.filter((t) => t.status === 'completed').length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  const count = (fn) => tasks.filter(fn).length;

  const items = [
    { icon: CheckCircle2, label: 'Completed', value: completed, tone: 'text-emerald-600' },
    { icon: CircleDot, label: 'In progress', value: count((t) => t.status === 'in_progress'), tone: 'text-indigo-600' },
    { icon: Circle, label: 'Ready to start', value: count((t) => t.status === 'active'), tone: 'text-sky-600' },
    { icon: Lock, label: 'Waiting', value: count((t) => t.status === 'pending'), tone: 'text-slate-500' },
    { icon: Clock3, label: 'Overdue', value: count((t) => ['overdue', 'escalated'].includes(t.status)), tone: 'text-orange-600' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <p className="text-sm font-medium">Overall progress</p>
        <p className="text-2xl font-semibold tabular-nums">{percent}%</p>
      </div>
      <Progress value={percent} className="h-2.5" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {items.map(({ icon: Icon, label, value, tone }) => (
          <div key={label} className="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
            <Icon className={`h-4 w-4 ${tone}`} />
            <div>
              <p className="text-lg font-semibold leading-none tabular-nums">{value}</p>
              <p className="text-[11px] text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
