import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function EmptyState({ icon: Icon, title, description, className, children }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center', className)}>
      {Icon && <Icon className="h-8 w-8 text-muted-foreground" />}
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {children}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }) {
  return (
    <div className={cn('flex flex-col items-center gap-2 rounded-lg border border-red-200 bg-red-50 py-8 text-center', className)}>
      <AlertCircle className="h-7 w-7 text-red-600" />
      <p className="text-sm font-medium text-red-800">{error?.message ?? 'Something went wrong'}</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
