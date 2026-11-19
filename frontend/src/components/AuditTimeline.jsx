import { AlertTriangle, Bot, CheckCircle2, FileText, MessageCircleQuestion, Pencil, ShieldAlert, Trash2, UserPlus, XCircle, Zap } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { useAudit } from '@/hooks/useStats';
import { cn, formatDateTime, titleCase } from '@/lib/utils';

const EVENT_STYLE = {
  employee_created: { icon: UserPlus, tone: 'bg-sky-100 text-sky-700' },
  ai_checklist_generated: { icon: Bot, tone: 'bg-indigo-100 text-indigo-700' },
  ai_checklist_failed: { icon: XCircle, tone: 'bg-red-100 text-red-700' },
  fallback_plan_generated: { icon: FileText, tone: 'bg-amber-100 text-amber-700' },
  plan_approved: { icon: CheckCircle2, tone: 'bg-emerald-100 text-emerald-700' },
  plan_rejected: { icon: XCircle, tone: 'bg-red-100 text-red-700' },
  task_added: { icon: UserPlus, tone: 'bg-sky-100 text-sky-700' },
  task_modified: { icon: Pencil, tone: 'bg-slate-100 text-slate-700' },
  task_deleted: { icon: Trash2, tone: 'bg-slate-100 text-slate-700' },
  task_status_changed: { icon: Zap, tone: 'bg-slate-100 text-slate-700' },
  chat_query: { icon: MessageCircleQuestion, tone: 'bg-indigo-100 text-indigo-700' },
  chat_unanswered: { icon: MessageCircleQuestion, tone: 'bg-amber-100 text-amber-700' },
  prompt_injection_suspected: { icon: ShieldAlert, tone: 'bg-red-100 text-red-700' },
  escalation_raised: { icon: AlertTriangle, tone: 'bg-orange-100 text-orange-700' },
  escalation_resolved: { icon: CheckCircle2, tone: 'bg-emerald-100 text-emerald-700' },
};

function MetaChips({ metadata }) {
  if (!metadata) return null;
  const chips = [
    metadata.llm_model && `model ${metadata.llm_model}`,
    metadata.prompt_version && `prompt ${metadata.prompt_version}`,
    metadata.latency_ms != null && `${metadata.latency_ms} ms`,
    metadata.tokens_used != null && `${metadata.tokens_used} tokens`,
    metadata.overall_confidence != null && `confidence ${Math.round(metadata.overall_confidence * 100)}%`,
    metadata.tasks_generated != null && `${metadata.tasks_generated} tasks`,
    metadata.tasks_flagged != null && `${metadata.tasks_flagged} flagged`,
    metadata.rejected_tasks?.length > 0 && `${metadata.rejected_tasks.length} rejected by guardrails`,
  ].filter(Boolean);
  if (!chips.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {chips.map((c) => (
        <span key={c} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {c}
        </span>
      ))}
    </div>
  );
}

export default function AuditTimeline({ employeeId }) {
  const { data, isLoading, error, refetch } = useAudit(employeeId);

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data?.length) return <EmptyState title="No audit events yet" />;

  return (
    <ol className="relative space-y-4 border-l pl-6">
      {data.map((e) => {
        const style = EVENT_STYLE[e.eventType] ?? { icon: Zap, tone: 'bg-slate-100 text-slate-700' };
        const Icon = style.icon;
        return (
          <li key={e.id} className="relative">
            <span className={cn('absolute -left-[37px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-background', style.tone)}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{titleCase(e.eventType)}</p>
              <time className="text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</time>
            </div>
            <p className="text-sm text-muted-foreground">{e.details}</p>
            <p className="text-xs text-muted-foreground">
              by {e.actor === 'ai' || e.actor === 'system' ? e.actor : e.actor.length > 18 ? `${e.actor.slice(0, 14)}…` : e.actor}
            </p>
            <MetaChips metadata={e.metadata} />
          </li>
        );
      })}
    </ol>
  );
}
