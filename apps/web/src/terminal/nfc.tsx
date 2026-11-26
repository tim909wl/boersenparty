import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Keyboard, Loader2, Nfc, ShieldCheck, WifiOff } from 'lucide-react';
import { Api, ApiError,type HistoryEntry, type WalletIdentity } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { euro, feedback, scannerValue } from './feedback';

export const nfcSupported = typeof window !== 'undefined' && 'NDEFReader' in window && window.isSecureContext;

export type NfcState = 'unsupported' | 'needs-activation' | 'starting' | 'ready' | 'read-error' | 'denied';

// One controlled reader for the whole app. Web NFC has no stop() — the scan is cancelled through
// the AbortSignal it was started with, so every start aborts the previous one instead of leaving
// a second NDEFReader alive that keeps firing into a stale callback.
export function useNfcScanner(onScan: (uid: string) => void) {
  const [state, setState] = useState<NfcState>(() => (nfcSupported ? 'needs-activation' : 'unsupported'));
  const [detail, setDetail] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan });

  const start = useCallback(async () => {
    if (!nfcSupported) { setState('unsupported'); return }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState('starting'); setDetail('');
    try {
      const reader = new window.NDEFReader!();
      await reader.scan({ signal: controller.signal });
      if(controller.signal.aborted||abortRef.current!==controller)return;
      reader.onreading = (event: any) => {
        if(controller.signal.aborted||abortRef.current!==controller)return;
        const raw = String(event?.serialNumber ?? '');
        if (raw) onScanRef.current(scannerValue(raw));
      };
      reader.onreadingerror = () => { setState('read-error'); setDetail('Das Armband konnte nicht gelesen werden.') };
      setState('ready');
    } catch (error) {
      if(controller.signal.aborted||abortRef.current!==controller)return;
      const reason = error instanceof Error ? error : new Error(String(error));
      const denied = reason.name === 'NotAllowedError';
      setState(denied ? 'denied' : 'read-error');
      setDetail(denied ? 'Der Browser hat den NFC-Zugriff abgelehnt.' : reason.message);
    }
  }, []);

  // A permission the user already granted should not need a second tap every page load.
  useEffect(() => {
    if (!nfcSupported) return;
    let cancelled = false;
    void navigator.permissions?.query({ name: 'nfc' as PermissionName })
      .then(status => { if (!cancelled && status.state === 'granted') void start() })
      .catch(() => {});
    return () => { cancelled = true };
  }, [start]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { state, detail, start };
}

type Resolution =
  | { kind: 'empty' }
  | { kind: 'resolving' }
  | { kind: 'found'; wallet: WalletIdentity }
  | { kind: 'unknown' }
  | { kind: 'offline'; message: string };

const STATUS: Record<NfcState, { tone: 'ok' | 'warn' | 'bad'; label: string }> = {
  unsupported: { tone: 'warn', label: 'NFC in diesem Browser nicht verfügbar' },
  'needs-activation': { tone: 'warn', label: 'NFC-Scanner noch nicht aktiviert' },
  starting: { tone: 'warn', label: 'NFC-Scanner startet …' },
  ready: { tone: 'ok', label: 'NFC-Scanner bereit' },
  'read-error': { tone: 'bad', label: 'Armband konnte nicht gelesen werden' },
  denied: { tone: 'bad', label: 'NFC-Zugriff vom Browser abgelehnt' },
};

const TONE_CLASS = { ok: 'text-success', warn: 'text-primary', bad: 'text-destructive' } as const;

/**
 * The single scan surface used by Kasse, Aufladung and Armbandservice. It owns one job: turn a
 * wristband into a resolved wallet, and make the current state unmistakable while doing it.
 */
export function NfcScanField({ uid, setUid, api, nfc, onResolved, title, hint,historyMode=false,onHistory }: {
  uid: string;
  setUid: (value: string) => void;
  api: Api;
  nfc: ReturnType<typeof useNfcScanner>;
  onResolved: (wallet: WalletIdentity | null) => void;
  title: string;
  hint: string;
  historyMode?:boolean;onHistory?:(result:{wallet:WalletIdentity;entries:HistoryEntry[];truncated?:boolean})=>void;
}) {
  const [resolution, setResolution] = useState<Resolution>({ kind: 'empty' });
  const [manual, setManual] = useState(false);
  const [manualValue,setManualValue]=useState('');
  const onResolvedRef = useRef(onResolved),onHistoryRef=useRef(onHistory);
  useEffect(() => { onResolvedRef.current = onResolved;onHistoryRef.current=onHistory });

  useEffect(() => {
    const typed = uid.trim();
    if (!typed) { setResolution({ kind: 'empty' }); onResolvedRef.current(null); return }
    let cancelled = false;
    setResolution({ kind: 'resolving' });
    const timer = setTimeout(() => {
      (historyMode?api.walletHistory(typed):api.lookupWallet(typed).then(wallet=>({wallet,entries:[],truncated:false})))
        .then(result => {
          if (cancelled) return;const {wallet}=result;
          if(historyMode)onHistoryRef.current?.(result);
          setResolution({ kind: 'found', wallet });
          feedback('success');
          onResolvedRef.current(wallet);
        })
        .catch((error: Error) => {
          if (cancelled) return;
          const unknown = error instanceof ApiError&&error.code==='WRISTBAND_NOT_ACTIVE';
          setResolution(unknown ? { kind: 'unknown' } : { kind: 'offline', message: error.message });
          feedback('error');
          onResolvedRef.current(null);
        });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer) };
  }, [uid, api,historyMode]);

  const status = STATUS[nfc.state];
  const showManual = manual || nfc.state === 'unsupported' || nfc.state === 'denied';

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div className={`relative flex size-40 items-center justify-center rounded-full border-2 ${nfc.state === 'ready' ? 'border-success/40' : 'border-border'}`}>
        {nfc.state === 'ready' && <span className="absolute inset-0 animate-ping rounded-full border-2 border-success/30" />}
        {resolution.kind === 'resolving'
          ? <Loader2 className="size-16 animate-spin text-primary" />
          : resolution.kind === 'found'
            ? <ShieldCheck className="size-16 text-success" />
            : <Nfc className={`size-16 ${nfc.state === 'ready' ? 'text-success' : 'text-muted-foreground'}`} />}
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className={`text-sm font-semibold ${TONE_CLASS[status.tone]}`}>{status.label}</p>
        <p className="text-sm text-muted-foreground">{nfc.detail || hint}</p>
      </div>

      {resolution.kind === 'unknown' && (
        <p className="flex items-center gap-2 rounded-xl border border-destructive bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          <AlertTriangle className="size-4 shrink-0" />{historyMode?'Armband nicht gefunden. Bitte Nummer kontrollieren.':'Armband nicht registriert oder gesperrt. Bitte zum Armbandservice.'}
        </p>
      )}
      {resolution.kind === 'offline' && (
        <p className="flex items-center gap-2 rounded-xl border border-destructive bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          <WifiOff className="size-4 shrink-0" />{resolution.message}
        </p>
      )}
      {resolution.kind === 'found' && (
        <p className="text-sm text-muted-foreground">Armband {resolution.wallet.bandNumber} · <span className="font-bold text-primary">{euro(resolution.wallet.balanceCents)}</span></p>
      )}

      <div className="flex w-full max-w-sm flex-col gap-2">
        {(nfc.state === 'needs-activation' || nfc.state === 'read-error' || nfc.state === 'denied') && nfcSupported && (
          <Button size="lg" className="h-14" onClick={() => void nfc.start()}><Nfc className="size-5" />NFC-Scanner aktivieren</Button>
        )}
        {!showManual && (
          <Button variant="outline" size="lg" className="h-14" onClick={() => setManual(true)}><Keyboard className="size-5" />Armbandnummer eingeben</Button>
        )}
        {showManual && (
          <div className="flex flex-col gap-2 text-left">
            <Label htmlFor="band-input">Aufgedruckte Armbandnummer oder UID</Label>
            <form className="flex flex-col gap-2" onSubmit={e=>{e.preventDefault();if(manualValue.trim())setUid(manualValue.trim())}}><Input id="band-input" value={manualValue} onChange={event => setManualValue(event.target.value)} placeholder="z. B. 10284" autoCapitalize="characters" className="h-14 text-center font-mono text-lg" autoFocus /><Button type="submit" className="h-12" disabled={!manualValue.trim()}>Armband auswählen</Button></form>
          </div>
        )}
      </div>
    </div>
  );
}

/** Compact header shown once a band is bound to the running transaction. */
export function BoundBandBar({ wallet, onRelease,disabled=false }: { wallet: WalletIdentity; onRelease: () => void;disabled?:boolean }) {
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">Armband {wallet.bandNumber}{wallet.uidHex ? ` · ${wallet.uidHex}` : ' · ohne Chip'}</p>
        <p className="text-3xl font-bold tabular-nums text-primary">{euro(wallet.balanceCents)}</p>
        <p className="text-xs text-muted-foreground">Verfügbares Guthaben</p>{wallet.freeDrinkStatus==='AVAILABLE'&&<p className="font-semibold text-success text-sm">🎁 1 Freigetränk verfügbar</p>}{wallet.freeDrinkStatus==='REDEEMED'&&<p className="text-xs text-muted-foreground">Freigetränk eingelöst</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <ShieldCheck className="size-6 text-success" />
        <Button variant="outline" size="sm" disabled={disabled} onClick={onRelease}>× Armband abwählen</Button>
      </div>
    </div>
  );
}
