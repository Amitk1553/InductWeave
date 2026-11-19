import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/services/api';

export const useChatHistory = () =>
  useQuery({ queryKey: ['chat'], queryFn: api.chatHistory, select: (d) => d.messages });

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.chatSend,
    meta: { silent: true },
    // Show the user's question immediately; the server reply replaces the optimistic copy.
    onMutate: async (text) => {
      await qc.cancelQueries({ queryKey: ['chat'] });
      const previous = qc.getQueryData(['chat']);
      qc.setQueryData(['chat'], (old) => ({
        messages: [...(old?.messages ?? []), { id: `tmp-${Date.now()}`, role: 'user', message: text, createdAt: new Date().toISOString() }],
      }));
      return { previous };
    },
    onError: (err, _text, ctx) => {
      if (ctx?.previous) qc.setQueryData(['chat'], ctx.previous);
      toast.error(err.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['chat'] }),
  });
}

export const useContactHr = () =>
  useMutation({
    mutationFn: api.contactHr,
    onSuccess: (d) => toast.success(d.alreadyRaised ? 'HR has already been notified.' : 'HR has been notified and will follow up.'),
  });
