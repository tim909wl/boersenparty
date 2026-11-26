import React from 'react';
import { createRoot } from 'react-dom/client';
import './globals.css';
import App from './App';

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error('Application startup failed', error) }
  render() {
    if (!this.state.error) return this.props.children;
    return <main className="flex min-h-dvh items-center justify-center bg-background p-5 text-foreground">
      <section className="w-full max-w-lg border-t-2 border-destructive pt-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-destructive">Startfehler</p>
        <h1 className="mt-2 text-2xl font-bold">Die Oberfläche konnte nicht geladen werden.</h1>
        <p className="mt-3 text-sm text-muted-foreground">Bitte Seite neu laden. Falls der Fehler bleibt, diese Meldung fotografieren:</p>
        <pre className="mt-4 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-card p-3 text-xs text-destructive">{this.state.error.message}</pre>
        <button className="mt-5 min-h-12 w-full rounded-lg bg-primary px-4 font-bold text-primary-foreground" onClick={() => location.reload()}>Neu laden</button>
      </section>
    </main>;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element fehlt');
createRoot(root).render(<React.StrictMode><AppErrorBoundary><App/></AppErrorBoundary></React.StrictMode>);
