import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Api, type Product } from '../api';
import { BOARD_COLUMN, BoardFooter, CATEGORY_HEADING, CrashBar, MarketRow, MomentOverlay } from '../market/parts';

// Shared Tailwind class strings for this walkthrough's own chrome, so each panel stays readable.
const PANEL = 'flex-1 min-h-0 flex flex-col gap-4 rounded-[0.8em] border border-ticker-line bg-ticker-panel/40 p-[1.4em]';
const PANEL_TITLE = 'm-0 pb-[0.6em] border-b border-ticker-line font-ticker-display font-bold text-[1.4em]';
const TABLE = 'border-collapse w-full max-w-[48em] [&_td]:px-[0.8em] [&_td]:py-[0.5em] [&_td]:border-b [&_td]:border-ticker-line [&_td]:text-[0.92em] [&_td:first-child]:text-ticker-muted [&_td:first-child]:whitespace-nowrap';
const SKIP = 'self-start mt-auto px-[1.4em] py-[0.7em] rounded-[0.6em] border border-ticker-line bg-ticker-panel text-ticker-fg font-semibold cursor-pointer transition-colors hover:border-ticker-gold hover:text-ticker-gold';

// Pre-event venue-readiness walkthrough for a single physical display/terminal. Four phases, run
// in order: a color/flicker test for dead pixels and backlight issues, a dump of every reachable
// device/browser parameter, a connection stability measurement against the live API, and a guided
// preview of every visual state the market board can be in — all without touching real event data.
//
// Two ways to run it:
//  - Standalone, visited directly (?display=diagnostics): a human walks through it with manual
//    skip buttons and the full 2-minute network test.
//  - Embedded (`embedded` prop, driven by MarketDisplay after a fleet-wide trigger): fully
//    automatic, a shorter network test, and reports its result back via `onComplete` instead of
//    showing a "Done" screen — the caller returns to the normal board once that fires.
export type DiagnosticResult = { network: { avgMs: number; failures: number; samples: number; verdict: 'good' | 'warn' | 'bad' }; device: Record<string, unknown> };

type Phase = 'colors' | 'info' | 'network' | 'states' | 'done';
const PHASES: { id: Phase; label: string }[] = [
  { id: 'colors', label: 'Farben & Flackertest' },
  { id: 'info', label: 'Geräteparameter' },
  { id: 'network', label: 'Netzwerktest' },
  { id: 'states', label: 'Display-Zustände' },
  { id: 'done', label: 'Fertig' },
];

export default function DiagnosticsPage({ embedded = false, networkTestSeconds = 120, onComplete }: { embedded?: boolean; networkTestSeconds?: number; onComplete?: (result: DiagnosticResult) => void }) {
  const [phase, setPhase] = useState<Phase>('colors');
  const [deviceInfo, setDeviceInfo] = useState<Record<string, unknown>>({});
  const [networkStats, setNetworkStats] = useState<DiagnosticResult['network'] | null>(null);
  const reportedRef = useRef(false);
  const index = PHASES.findIndex(p => p.id === phase);

  useEffect(() => {
    if (phase === 'done' && embedded && onComplete && networkStats && !reportedRef.current) {
      reportedRef.current = true;
      onComplete({ network: networkStats, device: deviceInfo });
    }
  }, [phase, embedded, onComplete, networkStats, deviceInfo]);

  if (phase === 'done' && embedded) return null;

  return (
    <div className="w-full min-h-dvh flex flex-col gap-6 px-[clamp(1em,3vw,2.5em)] py-[clamp(1em,3vh,2em)] bg-ticker-bg text-ticker-fg font-ticker-body [&_*]:box-border">
      <header className="flex flex-col gap-3 border-b border-ticker-line pb-5">
        <div className="flex items-center justify-between gap-4">
          <div><p className="font-ticker-display text-[0.72em] font-bold uppercase tracking-[0.14em] text-ticker-gold">Systemdiagnose</p><h1 className="m-0 mt-1 font-ticker-display font-bold text-[1.8em]">Venue-Check</h1></div>
          <span className="text-[0.8em] font-semibold text-ticker-muted">Schritt {Math.min(index + 1, PHASES.length)} / {PHASES.length}</span>
        </div>
        <div className="flex gap-[0.6em] flex-wrap">
          {PHASES.map((p, i) => (
            <span key={p.id} className={`px-[0.8em] py-[0.35em] rounded-full border text-[0.85em] font-semibold ${i === index ? 'border-ticker-gold text-ticker-gold' : i < index ? 'border-ticker-up text-ticker-up' : 'border-ticker-line text-ticker-muted'}`}>{p.label}</span>
          ))}
        </div>
      </header>
      <div className="flex-1 min-h-0 flex flex-col">
        {phase === 'colors' && <ColorTest onDone={() => setPhase('info')} />}
        {phase === 'info' && <DeviceInfo embedded={embedded} onDone={info => { setDeviceInfo(info); setPhase('network') }} />}
        {phase === 'network' && <NetworkTest totalMs={networkTestSeconds * 1000} onDone={stats => { setNetworkStats(stats); setPhase('states') }} />}
        {phase === 'states' && <StateWalkthrough onDone={() => setPhase('done')} />}
        {phase === 'done' && <Done onRestart={() => setPhase('colors')} />}
      </div>
    </div>
  );
}

function StepFooter({ onSkip, label = 'Weiter' }: { onSkip: () => void; label?: string }) {
  return <button className={SKIP} onClick={onSkip}>{label} →</button>;
}

// A sweep through solid colors (reveals dead/stuck pixels and color-channel faults), finishing
// with a rapid black/white strobe (reveals backlight flicker and ghosting on cheap TV panels).
function ColorTest({ onDone }: { onDone: () => void }) {
  const swatches = ['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff'];
  const [i, setI] = useState(0);
  const [strobe, setStrobe] = useState(false);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (strobe) return;
    const t = setTimeout(() => { if (i < swatches.length - 1) setI(i + 1); else setStrobe(true) }, 1500);
    return () => clearTimeout(t);
  }, [i, strobe]);
  useEffect(() => {
    if (!strobe) return;
    let count = 0;
    const t = setInterval(() => { setFlash(f => !f); count++; if (count > 12) { clearInterval(t); onDone() } }, 120);
    return () => clearInterval(t);
  }, [strobe]);
  const bg = strobe ? (flash ? '#ffffff' : '#000000') : swatches[i];
  const dark = bg === '#000000' || bg === '#0000ff' || bg === '#ff00ff';
  return (
    <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-[1.5em] font-ticker-display font-bold text-[1.4em]" style={{ background: bg }}>
      <p style={{ color: dark ? '#fff' : '#000' }}>{strobe ? 'Flackertest – auf tote Pixel / Nachleuchten achten' : `Farbtest ${i + 1}/${swatches.length}`}</p>
      <button className={SKIP} style={{ color: dark ? '#fff' : '#000', borderColor: dark ? '#fff' : '#000' }} onClick={onDone}>Überspringen →</button>
    </div>
  );
}

function row(label: string, value: string | number | boolean | undefined) {
  return <tr key={label}><td>{label}</td><td>{value === undefined ? '–' : String(value)}</td></tr>;
}

function collectDeviceInfo(): Record<string, unknown> {
  const nav = navigator as any;
  const conn = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
  return {
    screen: `${screen.width}×${screen.height}@${window.devicePixelRatio}x`,
    window: `${window.innerWidth}×${window.innerHeight}`,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    languages: navigator.languages?.join(', '),
    cpuCores: navigator.hardwareConcurrency,
    deviceMemoryGb: nav.deviceMemory,
    secureContext: window.isSecureContext,
    webNfc: 'NDEFReader' in window,
    connectionType: conn?.effectiveType,
    downlinkMbps: conn?.downlink,
    estimatedRttMs: conn?.rtt,
    saveData: Boolean(conn?.saveData),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    url: location.href,
  };
}

function DeviceInfo({ embedded, onDone }: { embedded: boolean; onDone: (info: Record<string, unknown>) => void }) {
  const info = useRef(collectDeviceInfo()).current;
  useEffect(() => {
    if (!embedded) return;
    const t = setTimeout(() => onDone(info), 2500);
    return () => clearTimeout(t);
  }, [embedded]);
  return (
    <div className={PANEL}>
      <h2 className={PANEL_TITLE}>Geräteparameter</h2>
      <table className={TABLE}><tbody>
        {row('Bildschirm', info.screen as string)}
        {row('Fenster', info.window as string)}
        {row('User-Agent', info.userAgent as string)}
        {row('Plattform', info.platform as string)}
        {row('Sprachen', info.languages as string)}
        {row('CPU-Kerne', info.cpuCores as number)}
        {row('Geräte-RAM (GB)', info.deviceMemoryGb as number)}
        {row('Sicherer Kontext (HTTPS)', info.secureContext as boolean)}
        {row('Web NFC verfügbar', info.webNfc as boolean)}
        {row('Verbindungstyp', info.connectionType as string)}
        {row('Downlink (Mbit/s)', info.downlinkMbps as number)}
        {row('Geschätzte Latenz (ms)', info.estimatedRttMs as number)}
        {row('Sparmodus', info.saveData as boolean)}
        {row('Zeitzone', info.timeZone as string)}
        {row('URL', info.url as string)}
      </tbody></table>
      {!embedded && <StepFooter onSkip={() => onDone(info)} />}
    </div>
  );
}

type NetworkStats = DiagnosticResult['network'];

// Pings the live, public /operations/health endpoint every 2s and tracks round-trip latency and
// failures — a simple go/no-go read on whether the venue's network can run the event. Duration is
// the full 2 minutes for a human-run check, or a short sweep when run as part of a fleet test.
function NetworkTest({ totalMs, onDone }: { totalMs: number; onDone: (stats: NetworkStats) => void }) {
  const [samples, setSamples] = useState<number[]>([]);
  const [failures, setFailures] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const startRef = useRef(Date.now());
  const reportedRef = useRef(false);
  useEffect(() => {
    const api = new Api();
    let active = true;
    const INTERVAL_MS = Math.min(2000, Math.max(500, totalMs / 10));
    const ping = async () => {
      const t0 = performance.now();
      try { await api.health(); if (active) setSamples(s => [...s, performance.now() - t0]) }
      catch { if (active) setFailures(f => f + 1) }
    };
    void ping();
    const pingTimer = setInterval(ping, INTERVAL_MS);
    const clock = setInterval(() => {
      const e = Date.now() - startRef.current;
      setElapsed(e);
      if (e >= totalMs) { clearInterval(pingTimer); clearInterval(clock); setFinished(true) }
    }, 250);
    return () => { active = false; clearInterval(pingTimer); clearInterval(clock) };
  }, [totalMs]);
  const avg = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
  const min = samples.length ? Math.min(...samples) : 0;
  const max = samples.length ? Math.max(...samples) : 0;
  const verdict: NetworkStats['verdict'] = failures === 0 && avg < 250 ? 'good' : failures <= samples.length * 0.1 ? 'warn' : 'bad';
  const verdictText = { good: '✅ Stabil – bereit für den Betrieb', warn: '⚠️ Teilweise instabil – Netz vor Einlass prüfen', bad: '❌ Nicht einsatzbereit – Netzwerkproblem beheben' }[verdict];
  useEffect(() => {
    if (finished && !reportedRef.current) { reportedRef.current = true; onDone({ avgMs: Math.round(avg), failures, samples: samples.length, verdict }) }
  }, [finished]);
  const totalSeconds = Math.round(totalMs / 1000);
  return (
    <div className={PANEL}>
      <h2 className={PANEL_TITLE}>Netzwerktest</h2>
      <p className="text-ticker-muted">{Math.min(totalSeconds, Math.round(elapsed / 1000))}s / {totalSeconds}s · {samples.length} Anfragen · {failures} Fehler</p>
      <table className={TABLE}><tbody>
        {row('Durchschnittliche Latenz', `${avg.toFixed(0)} ms`)}
        {row('Minimum', `${min.toFixed(0)} ms`)}
        {row('Maximum', `${max.toFixed(0)} ms`)}
        {row('Fehlgeschlagene Anfragen', failures)}
      </tbody></table>
      {finished && <p className={`font-bold text-[1.2em] px-[1em] py-[0.6em] rounded-[0.6em] bg-ticker-panel w-fit ${verdict === 'good' ? 'text-ticker-up' : verdict === 'warn' ? 'text-ticker-gold' : 'text-ticker-down'}`}>{verdictText}</p>}
      <StepFooter onSkip={() => { if (!reportedRef.current) { reportedRef.current = true; onDone({ avgMs: Math.round(avg), failures, samples: samples.length, verdict }) } }} label={finished ? 'Weiter' : 'Überspringen'} />
    </div>
  );
}

// Fed through the REAL MarketRow below, so this preview can never drift from what the board
// actually renders on the night — with history attached so the sparklines show up too.
const MOCK_PRODUCTS: Product[] = [
  { id: '1', name: 'Helles 0,5 l', category: 'Bier', priceCents: 300, minPriceCents: 150, maxPriceCents: 500, soldOut: false, version: 1 },
  { id: '2', name: 'Ein ziemlich langer Produktname zum Testen', category: 'Shots', priceCents: 150, minPriceCents: 100, maxPriceCents: 300, soldOut: false, version: 1 },
  { id: '3', name: 'Radler', category: 'Bier', priceCents: 0, minPriceCents: 500, maxPriceCents: 500, soldOut: true, version: 1 },
];
const MOCK_HISTORY = [220, 240, 230, 260, 280, 300].map((p, i) => ({
  version: i + 1, effectiveAt: Date.now() - (6 - i) * 60000,
  prices: { '1': p, '2': 150 + (i % 3) * 10, '3': 500 },
}));
const STATES = [
  { id: 'normal', label: 'Normalbetrieb' },
  { id: 'soldout', label: 'Ausverkauft-Zeile (abgedunkelt)' },
  { id: 'marquee', label: 'Langer Name (Auto-Scroll)' },
  { id: 'crashbar', label: 'Crash-Leiste (oben, dauerhaft)' },
  { id: 'moment', label: 'Crash-Vollbild-Moment' },
  { id: 'offline', label: 'Verbindung getrennt (Fußzeile)' },
] as const;

function StateWalkthrough({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const state = STATES[i];
  useEffect(() => {
    const t = setTimeout(() => { if (i < STATES.length - 1) setI(i + 1); else onDone() }, 4500);
    return () => clearTimeout(t);
  }, [i]);
  return (
    <div className={PANEL}>
      <h2 className={PANEL_TITLE}>Display-Zustände: {state.label}</h2>
      <div className="flex-1 min-h-0 border border-dashed border-ticker-line rounded-[0.8em] p-[1.5em] overflow-hidden relative flex flex-col justify-center">
        {state.id === 'crashbar' && <CrashBar kind="CRASH" secondsLeft={252} />}
        {state.id === 'offline' && <BoardFooter online={false} />}
        {state.id === 'moment' && <MomentOverlay inline moment={{ tone: 'crash', title: 'Börsencrash', sub: 'Alle Preise im Keller · jetzt bestellen' }} />}
        {(state.id === 'normal' || state.id === 'soldout' || state.id === 'marquee') && (
          <div className={BOARD_COLUMN} style={{ '--u': '40px' } as CSSProperties}>
            <section>
              <h2 className={CATEGORY_HEADING}>Vorschau</h2>
              <div className="flex flex-col">
                {MOCK_PRODUCTS.map(p => <MarketRow key={p.id} product={p} history={MOCK_HISTORY} charts />)}
              </div>
            </section>
          </div>
        )}
      </div>
      <StepFooter onSkip={() => { if (i < STATES.length - 1) setI(i + 1); else onDone() }} label={i < STATES.length - 1 ? 'Nächster Zustand' : 'Abschließen'} />
    </div>
  );
}

function Done({ onRestart }: { onRestart: () => void }) {
  return (
    <div className={PANEL}>
      <h2 className={PANEL_TITLE}>Venue-Check abgeschlossen</h2>
      <p className="text-ticker-muted">Gerät ist durchgetestet. Zum normalen Display zurückkehren oder den Check erneut starten.</p>
      <div className="flex gap-4 mt-6">
        <button className={SKIP} onClick={onRestart}>Erneut starten</button>
        <a className={`${SKIP} no-underline`} href="/market">Zum Display →</a>
      </div>
    </div>
  );
}
