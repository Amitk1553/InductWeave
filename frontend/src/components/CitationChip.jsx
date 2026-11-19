import { BookOpen } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export default function CitationChip({ citation }) {
  if (!citation) return null;

  const docLabel = citation.doc_title || citation.doc_name || 'Policy';
  const label = `${docLabel} · ${citation.section}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50/80 px-2.5 py-0.5 text-[11px] font-medium text-indigo-800 transition-colors hover:bg-indigo-100">
          <BookOpen className="h-3 w-3 shrink-0 text-indigo-600" />
          <span className="truncate">{label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        <p className="font-semibold">{citation.doc_title || citation.doc_name}</p>
        <p className="text-muted-foreground">{citation.section}</p>
        {citation.quote && <p className="mt-1 italic">“{citation.quote}”</p>}
      </TooltipContent>
    </Tooltip>
  );
}
