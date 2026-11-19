import { useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, Loader2, Plus, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AiBadge from '@/components/AiBadge';
import ApprovalDialog from '@/components/ApprovalDialog';
import AuditTimeline from '@/components/AuditTimeline';
import ChecklistView from '@/components/ChecklistView';
import ConfidenceBadge from '@/components/ConfidenceBadge';
import { ErrorState } from '@/components/EmptyState';
import ProgressTracker from '@/components/ProgressTracker';
import StatusBadge, { Tone } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAddTask, useConfirmTask, useDeleteTask, useEditTask, useGeneratePlan, usePlan } from '@/hooks/usePlan';
import { formatDate, formatDateTime, titleCase } from '@/lib/utils';

const CATEGORY_OPTIONS = ['documents', 'equipment', 'training', 'access', 'introductions'];
const ROLE_OPTIONS = ['hr', 'it', 'manager', 'employee'];

function AddTaskDialog({ open, onOpenChange, planId, defaultDue }) {
  const add = useAddTask(planId);
  const [form, setForm] = useState({ title: '', description: '', category: 'documents', assignedToRole: 'hr', dueDate: defaultDue, priority: '3' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a task</DialogTitle>
          <DialogDescription>HR-added tasks are marked as such and are not AI generated.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate(
              { ...form, priority: Number(form.priority), title: form.title.trim(), description: form.description.trim() || undefined },
              { onSuccess: () => { onOpenChange(false); setForm((f) => ({ ...f, title: '', description: '' })); } },
            );
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="at-title">Title</Label>
            <Input id="at-title" value={form.title} onChange={set('title')} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="at-desc">Description</Label>
            <Textarea id="at-desc" value={form.description} onChange={set('description')} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={set('category')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{titleCase(c)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assigned to</Label>
              <Select value={form.assignedToRole} onValueChange={set('assignedToRole')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r === 'it' ? 'IT' : titleCase(r)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="at-due">Due date</Label>
              <Input id="at-due" type="date" value={form.dueDate} onChange={set('dueDate')} required />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={set('priority')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{[1, 2, 3, 4, 5].map((p) => <SelectItem key={p} value={String(p)}>Priority {p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!form.title.trim() || add.isPending}>
              {add.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Banners({ detail }) {
  const { plan, banner, compliance } = detail;
  const rawError = plan.aiRawResponse?.error;
  return (
    <div className="space-y-3">
      {banner ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <p className="font-medium text-amber-900">{banner}</p>
            <p className="text-sm text-amber-800">
              The AI service failed, so this plan only contains the mandatory rule-based tasks. Review it carefully and add any role-specific tasks.
            </p>
            {rawError && <p className="mt-1 text-xs text-amber-800/80">Reason: {rawError}</p>}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-indigo-700" />
          <div className="flex-1">
            <p className="flex flex-wrap items-center gap-2 font-medium text-indigo-900">
              Generated by AI <AiBadge /> <span className="text-sm font-normal">Overall confidence</span>
              <ConfidenceBadge confidence={plan.aiConfidence} />
            </p>
            <p className="text-sm text-indigo-800">
              Mandatory tasks come from deterministic rules; the AI adds context from company policies.
              {plan.status === 'draft' && ' Nothing is assigned until you approve.'}
            </p>
          </div>
        </div>
      )}

      <div className={`flex items-start gap-3 rounded-lg border p-4 ${compliance.missing.length ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
        {compliance.missing.length ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" /> : <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />}
        <div>
          <p className="font-medium">
            Compliance score {Math.round(compliance.score * 100)}%{' '}
            <span className="text-sm font-normal text-muted-foreground">of {compliance.requiredCount} mandatory tasks present</span>
          </p>
          {compliance.missing.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-sm text-red-800">
              {compliance.missing.map((m) => (
                <li key={m.templateId}>Missing: {m.title}{m.legal ? ' (legal)' : ''}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OnboardingDetail() {
  const planId = Number(useParams().planId);
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = usePlan(planId);
  const edit = useEditTask(planId);
  const confirm = useConfirmTask(planId);
  const remove = useDeleteTask(planId);
  const generate = useGeneratePlan();
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild><Link to="/hr"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link></Button>
        <ErrorState error={error} onRetry={refetch} />
      </div>
    );
  }

  const { plan, employee, tasks, progress, versions } = data;
  const isDraft = plan.status === 'draft';
  const canRegenerate = ['draft', 'rejected'].includes(plan.status);
  const mutating = edit.isPending || confirm.isPending || remove.isPending;
  const flagged = tasks.filter((t) => t.requiresReview && !t.reviewConfirmed).length;

  const regenerate = (simulate) =>
    generate.mutate({ employeeId: employee.id, simulate }, { onSuccess: (d) => navigate(`/hr/onboarding/${d.plan.id}`) });

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/hr"><ArrowLeft className="mr-1 h-4 w-4" /> All hires</Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{employee.name}</h1>
            <StatusBadge status={plan.status} />
            <Tone tone="slate">v{plan.version}</Tone>
          </div>
          <p className="text-sm text-muted-foreground">
            {employee.role} · {employee.department} · {employee.location} · starts {formatDate(employee.startDate)}
          </p>
          <p className="text-xs text-muted-foreground">
            Manager: {employee.managerName ?? '—'} · {employee.email}
            {plan.approvedAt && ` · approved ${formatDateTime(plan.approvedAt)}`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canRegenerate && (
            <div className="flex">
              <Button variant="outline" className={import.meta.env.DEV ? 'rounded-r-none' : ''} disabled={generate.isPending} onClick={() => regenerate(undefined)}>
                {generate.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                Regenerate
              </Button>
              {import.meta.env.DEV && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="rounded-l-none border-l-0" aria-label="Dev regenerate options"><ChevronDown className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel className="text-amber-700">Dev only</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => regenerate('failure')}>Simulate AI failure (fallback)</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => regenerate('malformed')}>Simulate malformed AI JSON</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
          {isDraft && (
            <>
              <Button variant="outline" onClick={() => setAddOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Add task</Button>
              <Button onClick={() => setApprovalOpen(true)}><CheckCircle2 className="mr-1.5 h-4 w-4" /> Review and approve</Button>
            </>
          )}
        </div>
      </div>

      {plan.status === 'rejected' && plan.notes && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Rejected: {plan.notes}</div>
      )}

      <Banners detail={data} />

      {!isDraft && ['approved', 'in_progress', 'completed'].includes(plan.status) && (
        <Card><CardContent className="p-5"><ProgressTracker tasks={tasks} progress={progress} /></CardContent></Card>
      )}

      <Tabs defaultValue="checklist">
        <TabsList>
          <TabsTrigger value="checklist">Checklist ({tasks.length})</TabsTrigger>
          <TabsTrigger value="audit">Audit trail</TabsTrigger>
          <TabsTrigger value="versions">Versions ({versions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="checklist" className="space-y-3">
          {isDraft && (
            <p className="text-sm text-muted-foreground">
              {flagged > 0 ? `${flagged} task${flagged > 1 ? 's are' : ' is'} flagged for review. ` : 'No flagged tasks. '}
              Tasks below 30% confidence must be confirmed before approval.
            </p>
          )}
          <ChecklistView
            tasks={tasks}
            mode={isDraft ? 'review' : 'view'}
            showConfidence
            busy={mutating}
            onEdit={(id, patch) => edit.mutate({ id, patch })}
            onConfirm={(id) => confirm.mutate(id)}
            onDelete={(id) => remove.mutate(id)}
            emptyTitle="This plan has no tasks"
          />
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader><CardTitle className="text-base">Audit trail</CardTitle></CardHeader>
            <CardContent><AuditTimeline employeeId={employee.id} /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="versions">
          <Card>
            <CardContent className="divide-y p-0">
              {versions.map((v) => (
                <Link key={v.id} to={`/hr/onboarding/${v.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/60">
                  <span className="font-medium">Version {v.version}{v.id === plan.id && ' (viewing)'}</span>
                  <span className="flex items-center gap-2">
                    {v.generationMode === 'fallback' ? <Tone tone="yellow">Template</Tone> : <AiBadge label="AI" />}
                    <StatusBadge status={v.status} />
                    <span className="text-xs text-muted-foreground">{formatDateTime(v.createdAt)}</span>
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {isDraft && <ApprovalDialog open={approvalOpen} onOpenChange={setApprovalOpen} detail={data} />}
      {isDraft && <AddTaskDialog open={addOpen} onOpenChange={setAddOpen} planId={planId} defaultDue={String(employee.startDate).slice(0, 10)} />}
    </div>
  );
}
