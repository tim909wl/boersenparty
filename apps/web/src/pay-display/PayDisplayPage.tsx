import { useEffect, useMemo, useRef, useState } from 'react';
import { Api, ApiError, type PendingCharge } from '../api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { euro } from '../terminal/feedback';

const TERMINALS = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Bar A' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Bar B' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Zentrale Aufladung' },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Admin' },
];

// Guest-facing tap-to-pay screen: pairs with a cashier terminal that was logged into the SAME
// terminal (Bar A's Bezahldisplay pairs with Bar A's cashier tablet). Once logged in it runs
// unattended for the rest of the shift — poll for a pending charge, wait for an NFC tap, resolve
// it automatically, flash green/red, go back to idle. Same mechanism for purchases and top-ups.
export default function PayDisplayPage() {
  const api = useMemo(() => new Api(), []);
  const [authed, setAuthed] = useState(api.hasToken());
  if (!authed) return <DisplayLogin api={api} done={() => setAuthed(true)} />;
  return <DisplayRuntime api={api} />;
}

function DisplayLogin({ api, done }: { api: Api; done: () => void }) {
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [terminal, setTerminal] = useState(TERMINALS[0].id);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); setError('');
    try { const r = await api.login(user, password, terminal); api.setToken(r.accessToken); done() }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="min-h-dvh flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Bezahldisplay anmelden</CardTitle>
          <CardDescription>Dasselbe Terminal wie die zugehörige Kassen-Kasse wählen.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2"><Label>Benutzer</Label><Input value={user} onChange={e => setUser(e.target.value)} autoFocus /></div>
          <div className="flex flex-col gap-2"><Label>Passwort</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} /></div>
          <div className="flex flex-col gap-2">
            <Label>Terminal</Label>
            <Select value={terminal} onValueChange={setTerminal}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TERMINALS.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" size="lg" onClick={submit} disabled={busy}>Anmelden</Button>
        </CardContent>
      </Card>
    </div>
  );
}

type Flash = { tone: 'green' | 'red'; headline: string; sub: string };

function DisplayRuntime({ api }: { api: Api }) {
  const terminalId = api.terminalId();
  const [charge, setCharge] = useState<PendingCharge | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const submittingRef = useRef(false);
  const chargeRef = useRef<PendingCharge | null>(null);
  chargeRef.current = charge;

  useEffect(() => {
    if (!terminalId) return;
    let active = true,inFlight=false;
    const poll = async () => {if(inFlight)return;inFlight=true;try { const c = await api.getPendingCharge(terminalId); if (active) setCharge(c && (c as any).type ? c as PendingCharge : null) } catch {if(active)setCharge(null)}finally{inFlight=false} };
    void poll();
    const t = setInterval(poll, 1200);
    return () => { active = false; clearInterval(t) };
  }, [terminalId, api]);

  async function attemptPay(uid: string) {
    const current = chargeRef.current;
    if (!current || current.type!=='purchase' || submittingRef.current || !terminalId) return;
    submittingRef.current = true;
    try {
      const key=current.quoteId;
      let result:any;
      // Always check the original key first, also after a reload or interrupted response.
      try{const prior=await api.transactionStatus(key);if(prior.status==='COMMITTED')result=prior.response;else throw new Error('Vorgang nicht abgeschlossen. Kasse informieren.');}catch(error){if(!(error instanceof ApiError&&error.code==='TRANSACTION_NOT_FOUND'))throw error;}
      if(!result){const wallet=await api.lookupWallet(uid);try{result=await api.purchase(uid,current.quoteId,key,wallet.walletId)}catch(error){try{const prior=await api.transactionStatus(key);if(prior.status==='COMMITTED')result=prior.response;else throw error;}catch{throw new Error('Buchung nicht bestätigt. Kasse informieren; nicht erneut scannen.');}}}
      if(result?.status!=='COMMITTED'||!result.operationId)throw new Error('Buchungsstatus unklar');
      setFlash({tone:'green',headline:euro(result.totalCents),sub:'Zahlung gebucht'});
      // A failed display reset must never turn a confirmed debit into a red failure.
      await api.clearPendingCharge(terminalId,current.quoteId).catch(()=>{});
      setCharge(null);
    } catch (e) {
      setFlash({tone:'red',headline:'Kasse informieren',sub:(e as Error).message});
    } finally {submittingRef.current=false;setTimeout(()=>setFlash(null),3500);}
  }

  useEffect(() => {
    window.onNfcUid = (x) => void attemptPay(x);
    return () => { delete window.onNfcUid };
  }, [api, terminalId]);
  useEffect(() => {
    if (typeof window === 'undefined' || !('NDEFReader' in window) || !window.isSecureContext) return;
    let cancelled = false;const controller=new AbortController();
    (async () => {
      try {
        const reader = new window.NDEFReader!();
        await reader.scan({signal:controller.signal});
        if (cancelled) return;
        reader.onreading = (e: any) => { const raw = String(e.serialNumber ?? '').replace(/[:-]/g, '').toUpperCase(); if (raw) void attemptPay(raw) };
      } catch { /* no NFC hardware / permission denied — manual entry still works below */ }
    })();
    return () => { cancelled = true;controller.abort() };
  }, []);

  if (flash) return (
    <div className={`fixed inset-0 z-30 flex flex-col items-center justify-center gap-[2vh] px-6 text-center text-white animate-ticker-enter ${flash.tone === 'green' ? 'bg-ticker-up' : 'bg-ticker-down'}`}>
      <p className="font-ticker-display font-bold text-[length:clamp(56px,13vh,160px)] tracking-[-0.02em]">{flash.headline}</p>
      <p className="font-ticker-display font-semibold text-[length:clamp(18px,3vh,32px)] opacity-90">{flash.sub}</p>
    </div>
  );

  const itemCount = charge?.type === 'purchase' ? charge.items.reduce((sum, item) => sum + item.quantity, 0) : 0;
  return (
    <div className="kiosk-lock h-dvh w-full overflow-hidden bg-ticker-bg text-ticker-fg font-ticker-body">
      {charge ? (
        <main className="mx-auto flex h-full w-full max-w-5xl flex-col px-[clamp(18px,5vw,72px)] py-[clamp(18px,4vh,48px)] animate-ticker-enter">
          <header className="flex items-end justify-between gap-4 border-b border-ticker-line pb-[clamp(12px,2vh,24px)]">
            <div>
              <span className="font-ticker-display text-[length:clamp(12px,1.8vh,18px)] font-bold uppercase tracking-[0.12em] text-ticker-gold">Bitte prüfen</span>
              <h1 className="mt-1 font-ticker-display text-[length:clamp(28px,5vh,58px)] font-bold leading-none">{charge.type === 'purchase' ? 'Das bekommst du' : 'Deine Aufladung'}</h1>
            </div>
            <span className="shrink-0 font-ticker-display text-[length:clamp(14px,2vh,22px)] font-semibold text-ticker-muted">{charge.type === 'purchase' ? `${itemCount} ${itemCount === 1 ? 'Getränk' : 'Getränke'}` : 'Guthaben'}</span>
          </header>
          <div className="my-[clamp(10px,2vh,24px)] flex min-h-0 flex-1 flex-col overflow-auto">
            {charge.type === 'purchase'
              ? charge.items.map((it, i) => (
                  <div className="flex items-baseline gap-[0.8em] border-b border-ticker-line py-[clamp(9px,1.4vh,18px)] text-[length:clamp(18px,3vh,34px)]" key={i}>
                    <span className="min-w-[2.1em] shrink-0 font-bold text-ticker-gold">{it.quantity}×</span>
                    <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-semibold">{it.name}</span>
                    <span className="hidden shrink-0 text-[0.55em] text-ticker-muted sm:block">je {euro(it.unitPriceCents)}</span>
                    <span className="shrink-0 font-ticker-display font-bold tabular-nums">{euro(it.unitPriceCents * it.quantity)}</span>
                  </div>
                ))
              : <div className="flex flex-1 flex-col items-center justify-center"><span className="font-ticker-display text-[length:clamp(18px,3vh,32px)] font-semibold text-ticker-muted">Du bekommst</span><strong className="font-ticker-display text-[length:clamp(62px,16vh,170px)] leading-none text-ticker-up">+{euro(charge.amountCents)}</strong><span className="mt-2 text-[length:clamp(16px,2.5vh,26px)] text-ticker-muted">auf dein Armband</span></div>}
          </div>
          {charge.type === 'purchase' && <div className="flex items-baseline justify-between border-t-2 border-ticker-fg pt-[clamp(12px,2vh,24px)]">
            <span className="font-ticker-display text-[length:clamp(18px,3vh,32px)] font-semibold text-ticker-muted">Du zahlst</span>
            <span className="font-ticker-display text-[length:clamp(44px,10vh,120px)] font-bold leading-none tracking-[-0.02em] tabular-nums">{euro(charge.totalCents)}</span>
          </div>}
          <div className="mt-[clamp(18px,3vh,36px)] flex items-center justify-center gap-[clamp(12px,2vw,28px)] rounded-2xl border border-ticker-gold/35 bg-ticker-gold/5 px-4 py-[clamp(12px,2vh,22px)]">
            <div className="relative h-[3.4em] w-[3.4em] shrink-0 rounded-full border-[3px] border-ticker-line">
              <span className="absolute -inset-[3px] rounded-full border-[3px] border-ticker-gold opacity-0 animate-ticker-ping" />
              <span className="absolute -inset-[3px] rounded-full border-[3px] border-ticker-gold opacity-0 animate-ticker-ping [animation-delay:1.1s]" />
              <span className="absolute inset-[0.9em] -rotate-12 rounded-[0.3em] border-[3px] border-ticker-fg" />
            </div>
            <div><p className="font-ticker-display text-[length:clamp(18px,3vh,30px)] font-bold">{charge.type==='purchase'?'Jetzt Armband auflegen':'Zahlung an der Kasse bestätigen'}</p><p className="mt-1 text-[length:clamp(12px,1.7vh,17px)] text-ticker-muted">{charge.type==='purchase'?'Erst danach wird der Vorgang abgeschlossen.':'Das Personal bucht die Aufladung.'}</p></div>
          </div>
          <p className="mt-3 text-center text-sm text-ticker-muted">Armband kann nicht gelesen werden? Bitte an die Kasse wenden.</p>
        </main>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-[2vh] px-6 text-center">
          <p className="font-ticker-display font-bold text-[length:clamp(28px,6vh,72px)] tracking-[-0.01em]">Börsen<em className="not-italic text-ticker-gold">party</em></p>
          <p className="flex items-center gap-[0.6em] text-ticker-muted text-[length:clamp(16px,2.4vh,26px)]">
            <span className="w-[0.6em] h-[0.6em] rounded-full bg-ticker-up animate-ticker-pulse" />Bereit – wartet auf die Kasse …
          </p>
        </div>
      )}
    </div>
  );
}
