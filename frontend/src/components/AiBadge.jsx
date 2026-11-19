import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AiBadge({ className, label = 'Powered by AI' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700',
        className,
      )}
    >
      <Sparkles className="h-3 w-3" />
      {label}
    </span>
  );
}
