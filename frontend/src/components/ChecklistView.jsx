import { FileText, GraduationCap, KeyRound, Laptop, ListChecks, Users } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import TaskCard from '@/components/TaskCard';
import { titleCase } from '@/lib/utils';

const CATEGORIES = [
  { key: 'documents', icon: FileText },
  { key: 'equipment', icon: Laptop },
  { key: 'training', icon: GraduationCap },
  { key: 'access', icon: KeyRound },
  { key: 'introductions', icon: Users },
];

/** Tasks grouped by category. Remaining props are forwarded to each TaskCard. */
export default function ChecklistView({ tasks, emptyTitle = 'No tasks', emptyDescription, canAct, ...cardProps }) {
  if (!tasks.length) return <EmptyState icon={ListChecks} title={emptyTitle} description={emptyDescription} />;

  return (
    <div className="space-y-6">
      {CATEGORIES.map(({ key, icon: Icon }) => {
        const group = tasks.filter((t) => t.category === key);
        if (!group.length) return null;
        const done = group.filter((t) => t.status === 'completed').length;
        return (
          <section key={key} aria-label={titleCase(key)}>
            <div className="mb-2 flex items-center gap-2">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">{titleCase(key)}</h3>
              <span className="text-xs text-muted-foreground">
                {cardProps.mode === 'review' ? `${group.length} tasks` : `${done}/${group.length} done`}
              </span>
            </div>
            <div className="grid gap-2 lg:grid-cols-2">
              {group.map((t) => (
                <TaskCard key={t.id} task={t} canAct={typeof canAct === 'function' ? canAct(t) : canAct} {...cardProps} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
