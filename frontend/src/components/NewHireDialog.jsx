import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Loader2, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AiBadge from '@/components/AiBadge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCreateEmployee } from '@/hooks/useEmployees';

const ROLES = ['Software Engineer', 'Senior Software Engineer', 'Engineering Manager', 'Sales Representative', 'Account Executive', 'Product Designer', 'HR Specialist', 'Financial Analyst', 'Marketing Specialist', 'Marketing Intern'];
const DEPARTMENTS = ['Engineering', 'Sales', 'Product', 'Design', 'HR', 'Finance', 'Marketing', 'Operations'];
const LOCATIONS = ['Bangalore', 'Mumbai', 'New York', 'London', 'Toronto'];

const EMPTY = { name: '', email: '', role: '', department: '', location: '', managerName: '', managerEmail: '' };

function Field({ id, label, error, children }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function NewHireDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [startDate, setStartDate] = useState(null);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [errors, setErrors] = useState({});
  const create = useCreateEmployee();
  const navigate = useNavigate();

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function validate() {
    const e = {};
    for (const k of ['name', 'role', 'department', 'location']) if (!form[k].trim()) e[k] = 'Required';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email';
    if (form.managerEmail && !/^\S+@\S+\.\S+$/.test(form.managerEmail)) e.managerEmail = 'Enter a valid email';
    if (!startDate) e.startDate = 'Pick a start date';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit(ev) {
    ev.preventDefault();
    if (!validate()) return;
    const body = {
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role.trim(),
      department: form.department.trim(),
      location: form.location.trim(),
      startDate: format(startDate, 'yyyy-MM-dd'),
      ...(form.managerName.trim() && { managerName: form.managerName.trim() }),
      ...(form.managerEmail.trim() && { managerEmail: form.managerEmail.trim() }),
    };
    create.mutate(
      { body, simulate: simulateFailure ? 'failure' : undefined },
      {
        onSuccess: (data) => {
          setOpen(false);
          setForm(EMPTY);
          setStartDate(null);
          setSimulateFailure(false);
          if (data.plan) navigate(`/hr/onboarding/${data.plan.id}`);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !create.isPending && setOpen(v)}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1.5 h-4 w-4" /> Add New Hire
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a new hire</DialogTitle>
          <DialogDescription>
            A personalised draft checklist is generated for HR review. Nothing is assigned until you approve it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="nh-name" label="Full name" error={errors.name}>
              <Input id="nh-name" value={form.name} onChange={set('name')} placeholder="Priya Sharma" />
            </Field>
            <Field id="nh-email" label="Work email" error={errors.email}>
              <Input id="nh-email" type="email" value={form.email} onChange={set('email')} placeholder="priya@company.com" />
            </Field>
            <Field id="nh-role" label="Role" error={errors.role}>
              <Input id="nh-role" list="nh-roles" value={form.role} onChange={set('role')} placeholder="Software Engineer" />
              <datalist id="nh-roles">{ROLES.map((r) => <option key={r} value={r} />)}</datalist>
            </Field>
            <Field id="nh-dept" label="Department" error={errors.department}>
              <Input id="nh-dept" list="nh-depts" value={form.department} onChange={set('department')} placeholder="Engineering" />
              <datalist id="nh-depts">{DEPARTMENTS.map((r) => <option key={r} value={r} />)}</datalist>
            </Field>
            <Field id="nh-loc" label="Location" error={errors.location}>
              <Input id="nh-loc" list="nh-locs" value={form.location} onChange={set('location')} placeholder="Bangalore" />
              <datalist id="nh-locs">{LOCATIONS.map((r) => <option key={r} value={r} />)}</datalist>
            </Field>
            <Field id="nh-start" label="Start date" error={errors.startDate}>
              <Popover>
                <PopoverTrigger asChild>
                  <Button id="nh-start" type="button" variant="outline" className="w-full justify-start font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'PPP') : <span className="text-muted-foreground">Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate ?? undefined} onSelect={(d) => setStartDate(d ?? null)} />
                </PopoverContent>
              </Popover>
            </Field>
            <Field id="nh-mgr" label="Manager name (optional)">
              <Input id="nh-mgr" value={form.managerName} onChange={set('managerName')} placeholder="Meera Nair" />
            </Field>
            <Field id="nh-mgr-email" label="Manager email (optional)" error={errors.managerEmail}>
              <Input id="nh-mgr-email" type="email" value={form.managerEmail} onChange={set('managerEmail')} placeholder="meera@company.com" />
            </Field>
          </div>

          <p className="text-xs text-muted-foreground">
            Roles and locations are suggestions only. Free text is accepted; unrecognised values get a generic checklist flagged for review.
          </p>

          {import.meta.env.DEV && (
            <label className="flex items-center gap-2 rounded-md border border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-xs">
              <Checkbox checked={simulateFailure} onCheckedChange={(v) => setSimulateFailure(v === true)} />
              <span>
                <strong className="uppercase tracking-wide text-amber-800">Dev only:</strong> simulate an AI failure to demo the fallback plan
              </span>
            </label>
          )}

          <DialogFooter className="items-center gap-2 sm:justify-between">
            <AiBadge label="Checklist drafted by AI" />
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating plan…
                </>
              ) : (
                'Create and generate plan'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
