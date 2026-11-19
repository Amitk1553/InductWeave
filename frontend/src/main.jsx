import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider, useAuth } from '@clerk/react';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { toast } from 'sonner';
import App from '@/App';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { setTokenGetter } from '@/services/api';
import '@/index.css';

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      if (!mutation.meta?.silent) toast.error(err.message);
    },
  }),
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } },
});

// Assigned during render so queries fired by children already have a token getter.
function TokenBridge({ children }) {
  const { getToken } = useAuth();
  setTokenGetter(() => getToken());
  return children;
}

function MissingConfig() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md rounded-lg border bg-card p-6 text-sm">
        <h1 className="mb-2 text-lg font-semibold">Clerk is not configured</h1>
        <p className="text-muted-foreground">
          Copy <code>frontend/.env.example</code> to <code>frontend/.env</code> and set <code>VITE_CLERK_PUBLISHABLE_KEY</code>, then restart Vite.
        </p>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {clerkKey ? (
      <BrowserRouter>
        <ClerkProvider
          publishableKey={clerkKey}
          afterSignOutUrl="/"
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
        >
          <QueryClientProvider client={queryClient}>
            <TokenBridge>
              <TooltipProvider delayDuration={150}>
                <App />
                <Toaster />
              </TooltipProvider>
            </TokenBridge>
          </QueryClientProvider>
        </ClerkProvider>
      </BrowserRouter>
    ) : (
      <MissingConfig />
    )}
  </React.StrictMode>,
);
