import { Toaster as Sonner } from 'sonner';

const Toaster = (props) => (
  <Sonner
    theme="light"
    richColors
    closeButton
    position="top-right"
    toastOptions={{
      classNames: {
        toast: 'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
      },
    }}
    {...props}
  />
);

export { Toaster };
