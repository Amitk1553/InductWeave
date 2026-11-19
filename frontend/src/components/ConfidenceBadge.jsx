import { Tone } from '@/components/StatusBadge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Green >= 0.8, yellow 0.5-0.8, red < 0.5. */
export function confidenceTone(c) {
  if (c === null || c === undefined) return 'slate';
  if (c >= 0.8) return 'green';
  if (c >= 0.5) return 'yellow';
  return 'red';
}

const HINT = {
  green: 'High confidence',
  yellow: 'Medium confidence: review recommended',
  red: 'Low confidence: needs human review',
  slate: 'No confidence score',
};

export default function ConfidenceBadge({ confidence, className }) {
  const tone = confidenceTone(confidence);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Tone tone={tone} className={className}>
            {confidence === null || confidence === undefined ? 'n/a' : `${Math.round(confidence * 100)}%`}
          </Tone>
        </span>
      </TooltipTrigger>
      <TooltipContent>{HINT[tone]}</TooltipContent>
    </Tooltip>
  );
}
