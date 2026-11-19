import { UserButton } from '@clerk/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, FlaskConical, LayoutDashboard, ListChecks, Users } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Tone } from '@/components/StatusBadge';
import ChatWidget from '@/components/ChatWidget';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { HOME_BY_ROLE, NAV_BY_ROLE, ROLE_LABEL } from '@/lib/roles';
import { api } from '@/services/api';

const ICONS = { dashboard: LayoutDashboard, activity: Activity, users: Users, checklist: ListChecks };

// Visible only in Vite dev builds; the backend also refuses the endpoint outside NODE_ENV=development.
function DevRoleSwitcher({ role }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: api.setDevRole,
    onSuccess: async (data) => {
      await qc.invalidateQueries();
      toast.success(`Now viewing as ${ROLE_LABEL[data.role]}`);
      navigate(HOME_BY_ROLE[data.role], { replace: true });
    },
  });

  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-amber-400 bg-amber-50 px-2 py-1">
      <FlaskConical className="h-3.5 w-3.5 text-amber-700" />
      <span className="hidden text-[11px] font-semibold uppercase tracking-wide text-amber-800 sm:inline">Dev only</span>
      <Select value={role} onValueChange={(v) => mutation.mutate(v)} disabled={mutation.isPending}>
        <SelectTrigger className="h-7 w-[110px] border-amber-300 bg-white text-xs" aria-label="Switch role (dev only)">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(ROLE_LABEL).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NavItems({ role, className, linkClass }) {
  return (
    <nav className={className}>
      {NAV_BY_ROLE[role].map(({ to, label, icon, end }) => {
        const Icon = ICONS[icon];
        return (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                linkClass,
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        );
      })}
    </nav>
  );
}

export default function Layout({ me, children }) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r bg-card md:flex md:flex-col">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">O</div>
          <span className="text-sm font-semibold leading-tight">Onboarding Orchestrator</span>
        </div>
        <NavItems role={me.role} className="flex flex-col gap-1 p-3" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b bg-card/95 px-4 backdrop-blur">
          <NavItems role={me.role} className="flex gap-1 md:hidden" />
          <div className="hidden md:block" />
          <div className="flex items-center gap-3">
            {import.meta.env.DEV && <DevRoleSwitcher role={me.role} />}
            <Tone tone="indigo">{ROLE_LABEL[me.role]}</Tone>
            <span className="hidden text-sm text-muted-foreground lg:inline">{me.name}</span>
            <UserButton />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">{children}</main>
        <ChatWidget />
      </div>
    </div>
  );
}
