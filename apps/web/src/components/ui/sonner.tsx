import type { ComponentProps, CSSProperties } from 'react';
import { Toaster as Sonner } from 'sonner';
// Sonner ships its positioning CSS (position: fixed, placement, stacking, …) as a separate
// stylesheet rather than injecting it at runtime — without this import the toast list has no
// layout at all and renders inline wherever <Toaster/> sits in the tree.
import 'sonner/dist/styles.css';

type ToasterProps = ComponentProps<typeof Sonner>;

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      style={{
        // Sonner's own CSS variables for the default ("normal") toast — belt-and-suspenders
        // alongside classNames below, since not every internal element (e.g. the close button's
        // own background) is reachable through classNames alone.
        '--normal-bg': 'var(--card)',
        '--normal-border': 'var(--border)',
        '--normal-text': 'var(--card-foreground)',
      } as CSSProperties}
      toastOptions={{
        classNames: {
          toast: 'group toast bg-card! text-card-foreground! border! border-border! shadow-lg rounded-xl',
          title: 'text-card-foreground',
          description: 'text-muted-foreground',
          icon: 'text-current',
          closeButton: 'bg-card! border-border! text-card-foreground!',
          actionButton: 'bg-primary! text-primary-foreground!',
          cancelButton: 'bg-muted! text-muted-foreground!',
        },
      }}
      closeButton
      {...props}
    />
  );
}

export { Toaster };
