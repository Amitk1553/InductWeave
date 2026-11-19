import { useEffect, useRef, useState } from 'react';
import { BookOpen, Bot, HelpCircle, Loader2, MessageCircle, Send, X } from 'lucide-react';
import AiBadge from '@/components/AiBadge';
import ConfidenceBadge from '@/components/ConfidenceBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useChatHistory, useContactHr, useSendMessage } from '@/hooks/useChat';
import { cn } from '@/lib/utils';

const STARTERS = [
  'What documents do I need on day 1?',
  'How do I enroll in health insurance?',
  'What is the dress code?',
  'Who do I contact for laptop setup?',
];

function Citations({ citations }) {
  if (!citations?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {citations.map((c, i) => (
        <Tooltip key={`${c.doc_name}-${c.section}-${i}`}>
          <TooltipTrigger asChild>
            <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-800">
              <BookOpen className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {c.doc_name} · {c.section}
              </span>
            </span>
          </TooltipTrigger>
          {c.quote && <TooltipContent className="max-w-xs">“{c.quote}”</TooltipContent>}
        </Tooltip>
      ))}
    </div>
  );
}

function Bubble({ message, onContactHr, contacting }) {
  const mine = message.role === 'user';
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[88%] rounded-2xl px-3 py-2 text-sm', mine ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm border bg-card')}>
        <p className="whitespace-pre-wrap">{message.message}</p>
        {!mine && (
          <>
            <Citations citations={message.citations} />
            {message.confidence != null && (
              <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                Answer confidence <ConfidenceBadge confidence={message.confidence} />
              </div>
            )}
            {message.escalated && !String(message.id).startsWith('tmp') && (
              <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" disabled={contacting} onClick={() => onContactHr(message.id)}>
                <HelpCircle className="mr-1 h-3.5 w-3.5" /> Contact HR about this question
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const { data: messages = [], isLoading } = useChatHistory();
  const send = useSendMessage();
  const contact = useContactHr();
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, send.isPending, open]);

  function submit(value) {
    const q = value.trim();
    if (!q || send.isPending) return;
    setText('');
    send.mutate(q);
  }

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Onboarding policy assistant"
          className="fixed bottom-24 right-4 z-40 flex h-[540px] max-h-[calc(100vh-8rem)] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl sm:right-6"
        >
          <div className="flex items-center justify-between border-b bg-card px-4 py-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold leading-none">Policy assistant</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Answers only from company policies</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AiBadge />
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOpen(false)} aria-label="Close chat">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />}
            {!isLoading && messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Hi! Ask me anything about your onboarding. For example:</p>
                <div className="flex flex-wrap gap-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => submit(s)}
                      className="rounded-full border bg-card px-3 py-1.5 text-left text-xs hover:bg-muted"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <Bubble key={m.id} message={m} contacting={contact.isPending} onContactHr={(id) => contact.mutate(id)} />
            ))}
            {send.isPending && (
              <div className="flex justify-start" aria-live="polite">
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border bg-card px-3 py-3">
                  {[0, 150, 300].map((d) => (
                    <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="flex gap-2 border-t bg-card p-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit(text);
            }}
          >
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about a policy…" maxLength={1000} aria-label="Your question" />
            <Button type="submit" size="icon" disabled={!text.trim() || send.isPending} aria-label="Send">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}

      <Button
        size="icon"
        className="fixed bottom-6 right-4 z-40 h-14 w-14 rounded-full shadow-lg sm:right-6"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close assistant' : 'Open policy assistant'}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </Button>
    </>
  );
}
