import { useState } from 'react';
import { BookOpen, CalendarDays, Check, Flag, Lock, Pencil, ShieldCheck, Trash2, User, X } from 'lucide-react';
import ConfidenceBadge from '@/components/ConfidenceBadge';
import StatusBadge, { Tone } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, formatDate, titleCase } from '@/lib/utils';

const SOURCE = {
  ai: { label: 'AI suggested', tone: 'indigo' },
  rule: { label: 'Required', tone: 'slate' },
  hr_added: { label: 'Added by HR', tone: 'blue' },
};

const ROLES = ['hr', 'it', 'manager', 'employee'];

function EditForm({ task, onSave, onCancel, busy }) {
  const [form, setForm] = useState({
    title: task.title,
    description: task.description,
    dueDate: String(task.dueDate).slice(0, 10),
    assignedToRole: task.assignedToRole,
    priority: String(task.priority),
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target?.value ?? e }));

  return (
    <div className="mt-2 space-y-2">
      <Input value={form.title} onChange={set('title')} aria-label="Title" />
      <Textarea value={form.description} onChange={set('description')} rows={2} aria-label="Description" />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Input type="date" value={form.dueDate} onChange={set('dueDate')} aria-label="Due date" />
        <Select value={form.assignedToRole} onValueChange={set('assignedToRole')}>
          <SelectTrigger aria-label="Assignee role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {r === 'it' ? 'IT' : titleCase(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={form.priority} onValueChange={set('priority')}>
          <SelectTrigger aria-label="Priority">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5].map((p) => (
              <SelectItem key={p} value={String(p)}>
                Priority {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy || !form.title.trim()}
          onClick={() => onSave({ ...form, title: form.title.trim(), priority: Number(form.priority) })}
        >
          <Check className="mr-1 h-4 w-4" /> Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="mr-1 h-4 w-4" /> Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * mode: 'review' (HR editing a draft) | 'view' (read-only) | 'work' (assignee actions)
 */
export default function TaskCard({ task, mode = 'view', showConfidence = false, canAct = false, busy = false, onEdit, onDelete, onConfirm, onStatus }) {
  const [editing, setEditing] = useState(false);
  const blockedBy = task.blockedBy ?? [];
  const blocked = mode !== 'review' && task.status === 'pending' && blockedBy.length > 0;
  const late = ['overdue', 'escalated'].includes(task.status);
  const needsConfirm = mode === 'review' && task.requiresReview && task.confidence < 0.3 && !task.reviewConfirmed;
  const source = SOURCE[task.source] ?? SOURCE.rule;

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3 shadow-sm transition-colors',
        blocked && 'bg-muted/60 opacity-70',
        late && 'border-orange-300 bg-orange-50/60',
        needsConfirm && 'border-red-300 bg-red-50/50',
        task.status === 'completed' && 'bg-emerald-50/40',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          {blocked && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Blocked" />
              </TooltipTrigger>
              <TooltipContent>Waiting on: {blockedBy.map((b) => b.title).join(', ')}</TooltipContent>
            </Tooltip>
          )}
          <p className={cn('font-medium leading-snug', task.status === 'completed' && 'text-muted-foreground line-through')}>{task.title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {mode !== 'review' && <StatusBadge status={task.status} />}
          <Tone tone={source.tone}>{source.label}</Tone>
          {showConfidence && <ConfidenceBadge confidence={task.confidence} />}
          {(mode === 'review' || showConfidence) && task.requiresReview &&
            (task.reviewConfirmed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <ShieldCheck className="h-4 w-4 text-emerald-600" aria-label="Review confirmed" />
                </TooltipTrigger>
                <TooltipContent>Reviewed and confirmed by HR</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Flag className={cn('h-4 w-4', task.confidence < 0.3 ? 'text-red-600' : 'text-amber-600')} aria-label="Needs review" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{task.reviewReason ?? 'Flagged for review'}</TooltipContent>
              </Tooltip>
            ))}
        </div>
      </div>

      {editing ? (
        <EditForm
          task={task}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSave={(patch) => {
            onEdit?.(task.id, patch);
            setEditing(false);
          }}
        />
      ) : (
        <>
          {task.description && <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              {task.assignedToName ? `${task.assignedToName} (${task.assignedToRole === 'it' ? 'IT' : titleCase(task.assignedToRole)})` : task.assignedToRole === 'it' ? 'IT' : titleCase(task.assignedToRole)}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              Due {formatDate(task.dueDate)}
            </span>
            <span>Priority {task.priority}</span>
            {task.policyReference && (
              <span className="inline-flex items-center gap-1 text-indigo-700">
                <BookOpen className="h-3.5 w-3.5" />
                {task.policyReference}
              </span>
            )}
            {task.hrModified && <span className="italic">Edited by HR</span>}
          </div>
          {task.requiresReview && !task.reviewConfirmed && mode === 'review' && task.reviewReason && (
            <p className="mt-2 flex items-center gap-1 text-xs text-amber-800">
              <Flag className="h-3.5 w-3.5" /> {task.reviewReason}
            </p>
          )}
          {blocked && <p className="mt-2 text-xs text-muted-foreground">Waiting on: {blockedBy.map((b) => b.title).join(', ')}</p>}
        </>
      )}

      {!editing && mode === 'review' && (
        <div className="mt-2 flex flex-wrap gap-2">
          {task.requiresReview && !task.reviewConfirmed && (
            <Button size="sm" variant={needsConfirm ? 'default' : 'outline'} disabled={busy} onClick={() => onConfirm?.(task.id)}>
              <ShieldCheck className="mr-1 h-4 w-4" /> Confirm reviewed
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)}>
            <Pencil className="mr-1 h-4 w-4" /> Edit
          </Button>
          <Button size="sm" variant="ghost" className="text-red-700 hover:text-red-800" disabled={busy} onClick={() => onDelete?.(task.id)}>
            <Trash2 className="mr-1 h-4 w-4" /> Delete
          </Button>
        </div>
      )}

      {mode === 'work' && canAct && ['active', 'in_progress', 'overdue', 'escalated'].includes(task.status) && (
        <div className="mt-2 flex gap-2">
          {task.status !== 'in_progress' && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onStatus?.(task.id, 'in_progress')}>
              Start
            </Button>
          )}
          <Button size="sm" disabled={busy} onClick={() => onStatus?.(task.id, 'completed')}>
            <Check className="mr-1 h-4 w-4" /> Mark complete
          </Button>
        </div>
      )}
    </div>
  );
}
