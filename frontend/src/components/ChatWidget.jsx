import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, MessageCircle, RefreshCw, Send, X } from 'lucide-react';
import AiBadge from '@/components/AiBadge';
import CitationChip from '@/components/CitationChip';
import ConfidenceBadge from '@/components/ConfidenceBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChatHistory, useSendMessage } from '@/hooks/useChat';
import { cn } from '@/lib/utils';

const STARTER_QUESTIONS = [
  'What is the policy of your company?',
  'What documents do I need on day one?',
  'How do I enroll in health insurance?',
  'What is the dress code?',
  'Who do I contact for laptop setup?',
];

function Bubble({ message }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm',
          isUser
            ? 'rounded-br-sm bg-primary text-primary-foreground'
            : 'rounded-bl-sm border bg-card text-card-foreground',
        )}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{message.message}</p>
        {!isUser && (
          <div className="mt-2 space-y-1.5 pt-1 border-t border-muted/40">
            {message.citations?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {message.citations.map((c, i) => (
                  <CitationChip key={`${c.doc_name}-${c.section}-${i}`} citation={c} />
                ))}
              </div>
            )}
            {message.confidence != null && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>Answer confidence:</span>
                <ConfidenceBadge confidence={message.confidence} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const { data: messages = [], isLoading, isError, refetch } = useChatHistory(open);
  const send = useSendMessage();
  const endRef = useRef(null);

  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, send.isPending, open]);

  function submit(value) {
    const q = (value || text).trim();
    if (!q || send.isPending) return;
    setText('');
    send.mutate(q);
  }

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Nimbus Company Policy Assistant"
          className="fixed bottom-24 right-4 z-40 flex h-[560px] max-h-[calc(100vh-8rem)] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl sm:right-6"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b bg-card px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">Policy Assistant</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Answers strictly from Nimbus policies</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AiBadge />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Message List */}
          <div className="flex-1 space-y-3.5 overflow-y-auto p-4">
            {isLoading && (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-xs">Loading message history...</p>
              </div>
            )}

            {isError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center text-xs text-red-800">
                <p>Failed to load chat history.</p>
                <Button size="sm" variant="ghost" onClick={() => refetch()} className="mt-1 h-6 text-xs text-red-900">
                  <RefreshCw className="mr-1 h-3 w-3" /> Retry
                </Button>
              </div>
            )}

            {!isLoading && !isError && messages.length === 0 && (
              <div className="space-y-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Hello! I can answer questions about documents, equipment, benefits, and company policies. Try asking:
                </p>
                <div className="flex flex-col gap-1.5">
                  {STARTER_QUESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => submit(s)}
                      className="rounded-xl border border-muted bg-card px-3 py-2 text-left text-xs transition-colors hover:border-primary/40 hover:bg-muted"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <Bubble key={m.id} message={m} />
            ))}

            {/* Typing Indicator */}
            {send.isPending && (
              <div className="flex justify-start" aria-live="polite">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border bg-card px-3.5 py-3 shadow-sm">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="h-2 w-2 animate-bounce rounded-full bg-primary/70"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input Footer */}
          <form
            className="flex gap-2 border-t bg-card p-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask a policy question…"
              maxLength={1000}
              aria-label="Your question"
              disabled={send.isPending}
              className="text-xs"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!text.trim() || send.isPending}
              aria-label="Send"
              className="shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}

      {/* Floating Action Button */}
      <Button
        size="icon"
        className="fixed bottom-6 right-4 z-40 h-14 w-14 rounded-full shadow-xl transition-transform hover:scale-105 sm:right-6"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close policy assistant' : 'Open policy assistant'}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </Button>
    </>
  );
}
