import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ConfidenceBadge from '@/components/ConfidenceBadge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useApprovePlan, useConfirmTask, useRejectPlan } from '@/hooks/usePlan';

/** Approve-all / reject flow. Server rules (409 on unconfirmed low-confidence tasks) are mirrored here for guidance. */
export default function ApprovalDialog({ open, onOpenChange, detail }) {
  const { plan, tasks, compliance } = detail;
  const navigate = useNavigate();
  const approve = useApprovePlan(plan.id);
  const reject = useRejectPlan(plan.id);
  const confirm = useConfirmTask(plan.id);
  const [reason, setReason] = useState('');

  const flagged = tasks.filter((t) => t.requiresReview);
  const blockers = tasks.filter((t) => t.requiresReview && t.confidence < 0.3 && !t.reviewConfirmed);
  const unconfirmedFlagged = flagged.filter((t) => !t.reviewConfirmed).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review plan v{plan.version}</DialogTitle>
          <DialogDescription>
            Approving assigns tasks to HR, IT, the manager and the new hire. Tasks with no unmet dependencies become active immediately.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="approve">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="approve">Approve all</TabsTrigger>
            <TabsTrigger value="reject">Reject</TabsTrigger>
          </TabsList>

          <TabsContent value="approve" className="space-y-3 pt-2">
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-center justify-between rounded-md border px-3 py-2">
                <span>Total tasks</span>
                <strong>{tasks.length}</strong>
              </li>
              <li className="flex items-center justify-between rounded-md border px-3 py-2">
                <span>Flagged for review (not yet confirmed)</span>
                <strong>{unconfirmedFlagged}</strong>
              </li>
              <li className="flex items-center justify-between rounded-md border px-3 py-2">
                <span>Compliance with mandatory rules</span>
                <strong>{Math.round(compliance.score * 100)}%</strong>
              </li>
            </ul>

            {blockers.length > 0 ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-red-800">
                  <AlertTriangle className="h-4 w-4" /> Confirm these low-confidence tasks first
                </p>
                <ul className="mt-2 space-y-2">
                  {blockers.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <ConfidenceBadge confidence={t.confidence} />
                      <Button size="sm" variant="outline" className="bg-white" disabled={confirm.isPending} onClick={() => confirm.mutate(t.id)}>
                        <ShieldCheck className="mr-1 h-4 w-4" /> Confirm
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="flex items-center gap-1.5 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> No blocking issues. Review flagged tasks in the list if you have not already.
              </p>
            )}

            <DialogFooter>
              <Button
                disabled={blockers.length > 0 || approve.isPending}
                onClick={() => approve.mutate(undefined, { onSuccess: () => onOpenChange(false) })}
              >
                {approve.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Approve all tasks
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="reject" className="space-y-3 pt-2">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this plan being rejected?" rows={4} aria-label="Rejection reason" />
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={reason.trim().length < 3 || reject.isPending}
                onClick={() =>
                  reject.mutate(reason.trim(), {
                    onSuccess: () => {
                      onOpenChange(false);
                      navigate('/hr');
                    },
                  })
                }
              >
                {reject.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Reject plan
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
