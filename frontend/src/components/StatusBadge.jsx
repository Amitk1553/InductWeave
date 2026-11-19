import { Badge } from '@/components/ui/badge';
import { cn, titleCase } from '@/lib/utils';

const TONES = {
  green: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  yellow: 'bg-amber-100 text-amber-800 border-amber-200',
  red: 'bg-red-100 text-red-800 border-red-200',
  blue: 'bg-sky-100 text-sky-800 border-sky-200',
  indigo: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  orange: 'bg-orange-100 text-orange-800 border-orange-200',
};

const STATUS_TONE = {
  // tasks
  pending: 'slate', active: 'blue', in_progress: 'indigo', completed: 'green', overdue: 'orange', escalated: 'red',
  // plans
  draft: 'yellow', approved: 'blue', rejected: 'red', preparing: 'yellow',
  // employees
  onboarding: 'indigo', cancelled: 'slate',
};

const LABELS = { draft: 'Awaiting approval', preparing: 'Being prepared', onboarding: 'Onboarding' };

export function Tone({ tone = 'slate', className, children, ...props }) {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap font-medium', TONES[tone], className)} {...props}>
      {children}
    </Badge>
  );
}

export default function StatusBadge({ status, className }) {
  if (!status) return <Tone tone="slate" className={className}>None</Tone>;
  return (
    <Tone tone={STATUS_TONE[status] ?? 'slate'} className={className}>
      {LABELS[status] ?? titleCase(status)}
    </Tone>
  );
}
