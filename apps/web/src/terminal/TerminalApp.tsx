import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Beer, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Cpu, CreditCard, Home, Landmark, Lightbulb, LineChart, Loader2, Lock, LogOut, Menu, Minus, MoreHorizontal, Nfc, Plus, Receipt, Repeat, Settings2, ShieldCheck, Unlock, Users, Wallet,
} from 'lucide-react';
import { Api, ApiError, type AdminProduct, type ChipDevice, type DeviceRecord, type EventPhase, type EventState, type OpenCashSession, type HistoryEntry, type Product, type Quote, type WalletIdentity, type Wristband, uuid } from '@/api';
import { Button, buttonVariants } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Toaster } from '@/components/ui/sonner';
import { euro, feedback, scannerValue, toCents } from './feedback';
import { BoundBandBar, NfcScanField, nfcSupported, useNfcScanner } from './nfc';

type PendingOperation = { type: 'purchase'; expectedWalletId?:string; operatorId?:string; terminalId?:string; key: string; uid: string; quoteId: string; freeDrink?:true } | { type: 'topup'; expectedWalletId?:string; operatorId?:string; terminalId?:string; key: string; uid: string; amountCents: number; fundingMethod: 'CASH' | 'CARD_VERIFIED'; paymentReference?: string };
const loadPending = () => { try { return JSON.parse(localStorage.getItem('pending-operation') ?? 'null') as PendingOperation | null } catch { return null } };

type View = 'home' | 'pos' | 'topup' | 'customer' | 'products' | 'market' | 'ops';
// `lead: true` keeps a nav entry out of a plain bartender's view. The server enforces the same
// roles on every endpoint behind these screens; hiding them here is purely so nobody has to wade
// past controls they are not allowed to use anyway.
const NAV: { id: View; label: string; icon: typeof Beer; group: 'Thekenbetrieb' | 'Veranstaltungsleitung'; lead?: boolean }[] = [
  { id: 'pos', label: 'Verkaufen', icon: Beer, group: 'Thekenbetrieb' },
  { id: 'topup', label: 'Aufladen', icon: Wallet, group: 'Thekenbetrieb' },
  { id: 'customer', label: 'Service', icon: Receipt, group: 'Thekenbetrieb' },
  { id: 'market', label: 'Kurse', icon: LineChart, group: 'Veranstaltungsleitung' },
  { id: 'products', label: 'Sortiment', icon: Settings2, group: 'Veranstaltungsleitung', lead: true },
  { id: 'ops', label: 'Betrieb', icon: ShieldCheck, group: 'Veranstaltungsleitung', lead: true },
];

function allowedView(view:View,roles:string[]){const has=(...r:string[])=>r.some(x=>roles.includes(x));return view==='home'||view==='market'||(view==='pos'&&has('BAR','ADMIN'))||(view==='topup'&&has('TOPUP','PAYMENT_LEAD','ADMIN'))||(view==='customer'&&has('BAR','TOPUP','PAYMENT_LEAD','ADMIN','AUDITOR'))||(view==='products'&&has('MARKET_MANAGER','ADMIN'))||(view==='ops'&&has('TOPUP','MARKET_MANAGER','PAYMENT_LEAD','ADMIN','AUDITOR'));}

const VIEW_META: Record<View, { eyebrow: string; title: string; description: string }> = {
  home: { eyebrow: 'Start', title: 'Börsenparty', description: 'Wähle deine Aufgabe.' },
  pos: { eyebrow: 'Thekenbetrieb', title: 'Kasse', description: 'Armband scannen, Getränke erfassen, Gast bestätigen lassen.' },
  topup: { eyebrow: 'Thekenbetrieb', title: 'Guthaben aufladen', description: 'Armband scannen, Betrag wählen, Bargeld oder PayPal annehmen.' },
  customer: { eyebrow: 'Thekenbetrieb', title: 'Armbandservice', description: 'Guthaben prüfen, Verlauf ansehen, Storno oder Armbandwechsel anstoßen.' },
  products: { eyebrow: 'Veranstaltungsleitung', title: 'Sortiment', description: 'Preisspannen, Verfügbarkeit und Produkte zentral verwalten.' },
  market: { eyebrow: 'Veranstaltungsleitung', title: 'Aktuelle Kurse', description: 'Alle Getränkepreise kompakt nach Kategorie sortiert.' },
  ops: { eyebrow: 'Veranstaltungsleitung', title: 'Betrieb', description: 'Kasse, Geräte, Team und Veranstaltungsstatus steuern.' },
};

const HOME_TASKS: { id: View; title: string; subtitle: string; icon: typeof Beer }[] = [
  { id: 'pos', title: 'Getränke verkaufen', subtitle: 'Armband scannen und Getränke abbuchen.', icon: Beer },
  { id: 'topup', title: 'Guthaben aufladen', subtitle: 'Bargeld oder PayPal entgegennehmen.', icon: Wallet },
  { id: 'customer', title: 'Armbandservice', subtitle: 'Guthaben prüfen und Probleme lösen.', icon: Receipt },
];

function HomeView({ setView, connected, mode, nfc, terminalName, roles }: {
  setView: (v: View) => void; connected: boolean; mode: string; nfc: ReturnType<typeof useNfcScanner>; terminalName: string; roles:string[];
}) {
  const nfcReady = nfc.state === 'ready';
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <h2 className="text-3xl font-bold">Was möchtest du machen?</h2>
      {HOME_TASKS.filter(task=>allowedView(task.id,roles)).map((task, index) => (
        <button key={task.id} onClick={() => setView(task.id)}
          className={`flex min-h-24 items-center gap-4 rounded-xl border p-5 text-left transition-colors ${index === 0 ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-accent'}`}>
          <task.icon className={`size-9 shrink-0 ${index === 0 ? '' : 'text-primary'}`} />
          <div className="min-w-0 flex-1">
            <p className="text-xl font-bold">{task.title}</p>
            <p className={`text-sm ${index === 0 ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{task.subtitle}</p>
          </div>
          <ChevronRight className="size-6 shrink-0 opacity-60" />
        </button>
      ))}
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-2 text-sm">
        <span className="flex items-center gap-2"><span className={`size-2.5 rounded-full ${connected ? 'bg-success' : 'bg-destructive'}`} />{connected ? `Server verbunden · ${mode}` : 'Keine Serververbindung'}</span>
        <span className="flex items-center gap-2"><span className={`size-2.5 rounded-full ${nfcReady ? 'bg-success' : 'bg-primary'}`} />{nfcReady ? 'NFC bereit' : 'NFC noch nicht aktiv'}</span>
        <span className="text-muted-foreground">{terminalName}</span>
      </div>
    </div>
  );
}

export default function TerminalApp() {
  const api = useMemo(() => new Api(), []);
  const [authenticated, setAuthenticated] = useState(api.hasToken());
  const [roles,setRoles]=useState(()=>api.roles());
  const [view, setCurrentView] = useState<View>('home');
  const [uid, setUid] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [health, setHealth] = useState<any>();
  const [pending, setPending] = useState<PendingOperation | null>(loadPending);
  // Drives a visible "wird bezahlt…" state on the primary action buttons — distinct from
  // submittingRef (a synchronous double-submit guard): in a hectic bar rush, staff need to SEE
  // that a tap registered and something is happening, not just be silently blocked on a double-tap.
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === '1');
  const submittingRef = useRef(false);
  const pendingRef = useRef(pending);
  useEffect(()=>{const changed=(e:StorageEvent)=>{if(e.key==='pending-operation'){const next=loadPending();pendingRef.current=next;setPending(next)}};window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed)},[]);
  const scanLocked = useRef(false);
  const keyboardScannerRef = useRef({ value: '', lastKeyAt: 0 });
  const lastScanRef = useRef({ value: '', at: 0 });
  function setView(next:View){if(submittingRef.current||next===view||!allowedView(next,roles))return;scanLocked.current=false;setUid('');setCart({});setCurrentView(next)}
  function toggleCollapsed() { setCollapsed(c => { localStorage.setItem('sidebar-collapsed', c ? '0' : '1'); return !c }) }

  // A wristband held against the phone fires repeatedly while it rests there; without this
  // debounce the same band would re-bind mid-order and could land the next round on it.
  function acceptScan(raw: string) {
    if(scanLocked.current || submittingRef.current || pendingRef.current) return;
    const value = scannerValue(raw);
    if (value.length < 4) return;
    const now = Date.now();
    if (lastScanRef.current.value === value && now - lastScanRef.current.at < 1500) return;
    lastScanRef.current = { value, at: now };
    setUid(value);
    feedback('scan');
  }
  const nfc = useNfcScanner(acceptScan);

  useEffect(() => {
    window.onNfcUid = acceptScan;
    return () => { delete window.onNfcUid };
  });
  // USB NFC readers used on the MacBook behave like a very fast keyboard: they type the UID and
  // finish with Enter. Capture that sequence globally in the transaction views, so staff do
  // not have to focus the UID field before presenting a wristband. Phone/tablet Web NFC continues
  // to use NDEFReader below and ends up in the same `uid` state.
  useEffect(() => {
    if (!authenticated || (view !== 'pos' && view !== 'topup' && view !== 'customer')) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || scanLocked.current || submittingRef.current || pendingRef.current) return;
      const focused=event.target as HTMLElement|null;if(focused?.closest('input,textarea,select,button,[contenteditable=true]'))return;
      const scanner = keyboardScannerRef.current;
      const now = Date.now();
      if (event.key === 'Enter' || event.code === 'NumpadEnter') {
        const scanned = scanner.value;
        scanner.value = '';
        scanner.lastKeyAt = 0;
        if (scanned.length < 4) return;
        event.preventDefault();
        acceptScan(scanned);
        return;
      }
      if (event.key.length !== 1) return;
      if (now - scanner.lastKeyAt > 500) scanner.value = '';
      scanner.value += event.key;
      scanner.lastKeyAt = now;
      const target = event.target as HTMLElement | null;
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      keyboardScannerRef.current = { value: '', lastKeyAt: 0 };
    };
  }, [authenticated, view]);
  useEffect(() => {
    if (!authenticated) return;
    let refreshing=false,active=true;
    const applyProducts=(next:Product[])=>{if(active)setProducts(old=>!old.length||!next.length||(next[0].version??0)>=(old[0].version??0)?next:old)};
    const disconnect = api.subscribeProducts(applyProducts);
    const refreshHealth = async () => {if(refreshing)return;refreshing=true;try{const [h,s,prices]=await Promise.all([api.health(),api.session(),api.products()]);if(active){setHealth(h);setRoles(s.roles);applyProducts(prices)}}catch(e){if(active){setHealth({ok:false});if(e instanceof ApiError&&e.status===401){api.setToken('');setAuthenticated(false);setRoles([]);scanLocked.current=false;setUid('');setCart({});setCurrentView('home')}}}finally{refreshing=false}};
    refreshHealth();
    const timer = setInterval(refreshHealth, 5000);
    return () => { active=false;disconnect(); clearInterval(timer) };
  }, [api, authenticated]);

  function remember(x: PendingOperation | null) {
    pendingRef.current=x; setPending(x);
    if (x) localStorage.setItem('pending-operation', JSON.stringify(x));
    else localStorage.removeItem('pending-operation');
  }

  async function execute(x: PendingOperation) {
    if((x.operatorId&&x.operatorId!==api.operatorId())||(x.terminalId&&x.terminalId!==api.terminalId()))throw new Error('Mit dem ursprünglichen Mitarbeiter am ursprünglichen Terminal anmelden.');
    try {
      const result = x.type === 'purchase'
        ? await api.purchase(x.uid, x.quoteId, x.key, x.expectedWalletId,x.freeDrink)
        : await api.topup(x.uid, x.amountCents, x.fundingMethod ?? 'CASH', x.paymentReference, x.key, x.expectedWalletId);
      if(result?.status!=='COMMITTED'||!result.operationId||!Number.isInteger(result.balanceCents))throw new Error('Buchungsbestätigung fehlt');
      remember(null);
      return result;
    } catch (originalError) {
      try {
        const status = await api.transactionStatus(x.key);
        if (status.status === 'COMMITTED' && status.response?.operationId && Number.isInteger(status.response.balanceCents)) { remember(null); return status.response }
        if(status.status==='REJECTED')remember(null);
      } catch (statusError) {
        // Only a known server-side rejection plus an authoritative NOT_FOUND permits abandoning the key.
        if(statusError instanceof ApiError && statusError.code==='TRANSACTION_NOT_FOUND' && originalError instanceof ApiError && ['CASH_SESSION_REQUIRED','LEDGER_MISCONFIGURED','EVENT_NOT_OPEN','PAYMENT_STOP','INVALID_AMOUNT','INSUFFICIENT_FUNDS','QUOTE_INVALID','WALLET_CHANGED','WALLET_UNAVAILABLE','WRISTBAND_NOT_ACTIVE','PAYMENT_REFERENCE_REUSED','AMBIGUOUS_UID','FREE_DRINK_UNAVAILABLE','FREE_DRINK_ITEM','PRODUCT_SOLD_OUT','PRODUCT_UNAVAILABLE'].includes(originalError.code??'')){
          // Atomically reserve the failed key before clearing it; delayed requests cannot book it.
          try{const cancelled=await api.cancelTransaction(x.key,x.type==='topup'?'TOPUP':'PURCHASE',x.type==='purchase'?x.quoteId:undefined);if(cancelled.status==='COMMITTED'&&cancelled.response?.operationId&&Number.isInteger(cancelled.response.balanceCents)){remember(null);return cancelled.response}if(cancelled.status==='REJECTED')remember(null)}catch{/* keep pending if reservation cannot be confirmed */}
        }
      }
      throw originalError;
    }
  }

  async function pay(quoteId: string, wallet:WalletIdentity,freeDrink?:true) {
    if (pendingRef.current || loadPending() || submittingRef.current) throw new Error('Zuerst den ungeklärten Vorgang prüfen.');
    submittingRef.current = true; setBusy(true);
    try {
      const x: PendingOperation = { type: 'purchase', key: uuid(), uid:wallet.uidHex??wallet.bandNumber, expectedWalletId:wallet.walletId,operatorId:api.operatorId(),terminalId:api.terminalId(), quoteId,freeDrink };
      remember(x); return await execute(x);
    } finally { submittingRef.current = false; setBusy(false) }
  }

  async function topup(amount: number, fundingMethod: 'CASH' | 'CARD_VERIFIED', wallet:WalletIdentity) {
    if (pendingRef.current || loadPending() || submittingRef.current) throw new Error('Zuerst den ungeklärten Vorgang prüfen.');
    submittingRef.current = true; setBusy(true);
    try {
      const x: PendingOperation = { type: 'topup', key: uuid(), uid:wallet.uidHex??wallet.bandNumber, expectedWalletId:wallet.walletId,operatorId:api.operatorId(),terminalId:api.terminalId(), amountCents: amount, fundingMethod };
      remember(x); return await execute(x);
    } finally { submittingRef.current = false; setBusy(false) }
  }

  async function resolvePending(retry=false,cancel=false) {
    const x=pendingRef.current;if(!x||submittingRef.current)return;
    submittingRef.current=true;setBusy(true);
    try {
      if(retry){const result=await execute(x);toast.success(`Gebucht · Guthaben ${euro(result.balanceCents)}`);setUid('');setCart({});scanLocked.current=false;setCurrentView('home');return;}
      const status=cancel?await api.cancelTransaction(x.key,x.type==='topup'?'TOPUP':'PURCHASE',x.type==='purchase'?x.quoteId:undefined):await api.transactionStatus(x.key);
      if(status.status==='COMMITTED'&&status.response?.operationId){remember(null);toast.success(`Bereits gebucht · Guthaben ${euro(status.response.balanceCents)}`);setUid('');setCart({});scanLocked.current=false;setCurrentView('home');}
      else if(status.status==='REJECTED'){remember(null);toast.info('Buchung abgelehnt.');}
      else toast.warning('Buchung noch nicht geklärt.');
    } catch(e){toast.error(e instanceof ApiError&&e.code==='TRANSACTION_NOT_FOUND'?'Nicht gebucht gefunden. Nur bei bestätigter Zahlung mit demselben Schlüssel erneut senden.':(e as Error).message);}
    finally{submittingRef.current=false;setBusy(false)}
  }
  if (!authenticated) return <Login api={api} done={() => {setRoles(api.roles());setAuthenticated(true)}} />;

  // Staff should read the event's state, not the internal payment-gate mode: "Veranstaltung läuft"
  // tells a bartender what they can do, "NORMAL" does not.
  const phase = health?.state?.eventPhase as EventPhase | undefined;
  const mode = health ? (phase ? (PHASE_META[phase]?.label??'Unbekannt') : (health.state?.mode ?? 'Unbekannt')) : 'Verbindung …';
  const connected = Boolean(health?.ok);
  const selling = phase === 'OPEN' && health?.state?.mode!=='PAYMENT_STOP' && connected;
  const terminalName = TERMINALS.find(t => t.id === api.terminalId())?.name ?? 'Station';
  const visibleNav = NAV.filter(n=>allowedView(n.id,roles));

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col sm:flex-row">
      <Toaster position="top-center" richColors closeButton />
      {/* Sidebar on tablet/desktop */}
      <aside className={`hidden sm:sticky sm:top-0 sm:flex sm:h-dvh sm:flex-col sm:border-r sm:border-border sm:bg-card/40 sm:p-4 sm:gap-1 transition-[width] shrink-0 ${collapsed ? 'sm:w-20' : 'sm:w-64'}`}>
        <div className={`flex min-h-16 items-center px-1 pb-5 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <div>
              <p className="text-xl font-bold tracking-tight">Börsen<span className="text-primary">party</span></p>
              <p className="mt-1 text-xs text-muted-foreground">Event Operations</p>
            </div>
          )}
          <Button variant="ghost" size="icon" className="size-9 shrink-0" onClick={toggleCollapsed} title={collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}>
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
        <div className={`mb-4 flex items-center rounded-lg border border-border bg-background/50 ${collapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2.5'}`}>
          <span className={`size-2 rounded-full ${connected ? 'bg-success' : 'bg-destructive'}`} />
          {!collapsed && <div className="min-w-0"><p className="text-xs font-semibold">Systemstatus</p><p className="truncate text-xs text-muted-foreground">{mode}</p></div>}
        </div>
        <button onClick={() => setView('home')} title="Start"
          className={`mb-1 flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${collapsed ? 'justify-center' : ''} ${view === 'home' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
          <Home className="h-4 w-4 shrink-0" /> {!collapsed && 'Start'}
        </button>
        {(['Thekenbetrieb', 'Veranstaltungsleitung'] as const).map(group => {
          const items = visibleNav.filter(n => n.group === group);
          if (!items.length) return null;
          return (
            <div key={group} className="flex flex-col gap-1">
              {!collapsed && <p className="mt-3 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{group}</p>}
              {items.map(n => (
                <button key={n.id} onClick={() => setView(n.id)} title={n.label}
                  className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${collapsed ? 'justify-center' : ''} ${view === n.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
                  <n.icon className="h-4 w-4 shrink-0" /> {!collapsed && n.label}
                </button>
              ))}
            </div>
          );
        })}
        <div className="mt-auto flex flex-col gap-2 pt-4">
          {nfcSupported && <Button variant={nfc.state === 'ready' ? 'success' : 'outline'} size="sm" onClick={() => void nfc.start()} disabled={nfc.state === 'ready' || nfc.state === 'starting'} title="NFC aktivieren" className={collapsed ? 'px-0' : ''}><Nfc className="h-4 w-4 shrink-0" />{!collapsed && (nfc.state === 'ready' ? 'NFC aktiv' : 'NFC aktivieren')}</Button>}
          <Button variant="ghost" size="sm" onClick={() => { api.setToken(''); location.reload() }} title="Abmelden" className={collapsed ? 'px-0' : ''}><LogOut className="h-4 w-4 shrink-0" />{!collapsed && 'Abmelden'}</Button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sm:hidden sticky top-0 z-30 flex min-h-14 items-center justify-between border-b border-border bg-background/92 px-4 py-2 backdrop-blur">
        <p className="font-bold">Börsen<span className="text-primary">party</span></p>
        <div className="flex items-center gap-2">
          {nfcSupported && <Button variant={nfc.state === 'ready' ? 'success' : 'outline'} size="sm" onClick={() => void nfc.start()} disabled={nfc.state === 'ready' || nfc.state === 'starting'}><Nfc className="h-4 w-4" /></Button>}
          <Badge variant={connected ? 'success' : 'destructive'}>{mode}</Badge><Button variant="ghost" size="icon" aria-label="Abmelden" disabled={busy} onClick={()=>{api.setToken('');location.reload()}}><LogOut className="h-4 w-4"/></Button>
        </div>
      </header>

      <main className="min-w-0 flex-1 overflow-y-auto px-4 pb-28 pt-4 sm:px-6 sm:pb-8 sm:pt-7 lg:px-10">
        <div className="mx-auto w-full max-w-7xl">
        <header className="mb-5 flex flex-col gap-1 border-b border-border pb-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:pb-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{VIEW_META[view].eyebrow}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-4xl">{VIEW_META[view].title}</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-snug text-muted-foreground sm:mt-2 sm:text-base">{VIEW_META[view].description}</p>
          </div>
          <Badge variant={connected ? 'success' : 'destructive'} className="mt-3 w-fit sm:mt-0">{connected ? 'Online' : 'Offline'}</Badge>
        </header>
        {phase && !selling && view !== 'ops' && view !== 'home' && (
          <Card className="mb-4 border-destructive/60 bg-destructive/5">
            <CardContent className="py-4">
              <p className="text-sm font-semibold text-destructive">{phase==='OPEN' ? 'Zahlungen sind gesperrt oder die Buchhaltung ist nicht einsatzbereit.' : phase === 'PREPARING' ? 'Die Veranstaltung ist noch nicht eröffnet.' : phase === 'CLOSING' ? 'Das Verkaufsende wurde eingeleitet.' : 'Die Veranstaltung ist abgeschlossen.'}</p>
              <p className="text-xs text-muted-foreground">Verkauf und Aufladung sind gesperrt. Die Veranstaltungsleitung gibt sie unter Betrieb → Veranstaltung frei.</p>
            </CardContent>
          </Card>
        )}
        {pending && (
          <Card className="mb-4 border-primary/50">
            <CardContent className="flex items-center justify-between py-4 gap-3">
              <div>
                <p className="text-sm font-medium">Ungeklärter Vorgang vom letzten Versuch</p>
                <p className="text-xs text-muted-foreground">{pending.type === 'purchase' ? 'Zahlung' : 'Aufladung'} · Armband {pending.uid}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void resolvePending()}>Status prüfen</Button>
                <Button size="sm" disabled={busy} onClick={() => {if(window.confirm('Nur erneut senden, wenn die ursprüngliche Zahlung weiterhin korrekt ist.'))void resolvePending(true)}}>Erneut senden</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={()=>{if(window.confirm('Nur abbrechen, wenn kein Geld angenommen bzw. das Geld zurückgegeben und keine Ware ausgegeben wurde. Der Server sperrt den ursprünglichen Schlüssel endgültig.'))void resolvePending(false,true)}}>Sicher abbrechen</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {view === 'home' && <HomeView setView={setView} connected={connected} mode={mode} nfc={nfc} terminalName={terminalName} roles={roles} />}
        {view === 'pos' && <PosView uid={uid} setUid={setUid} products={products} cart={cart} setCart={setCart} onPay={pay} scanLocked={scanLocked} disabled={Boolean(pending)||!selling||!connected} busy={busy} api={api} setView={setView} nfc={nfc} terminalName={terminalName} />}
        {view === 'topup' && <TopupView uid={uid} setUid={setUid} onTopup={topup} scanLocked={scanLocked} disabled={Boolean(pending)||!selling||!connected} busy={busy} api={api} setView={setView} nfc={nfc} terminalName={terminalName} />}
        {view === 'customer' && <CustomerView scanLocked={scanLocked} uid={uid} setUid={setUid} api={api} setView={setView} nfc={nfc} />}
        {view === 'products' && <ProductsView api={api} />}
        {view === 'market' && <MarketView products={products} />}
        {view === 'ops' && <OpsView api={api} health={health} />}
        </div>
      </main>

      {/* Phones get the three bar tasks plus one "Mehr" entry; the management screens are not
          something anyone operates one-handed between two orders. */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-4 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        {visibleNav.filter(n => n.group === 'Thekenbetrieb').map(n => (
          <button key={n.id} onClick={() => setView(n.id)} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-semibold ${view === n.id ? 'text-primary' : 'text-muted-foreground'}`}>
            <n.icon className="h-5 w-5" /> {n.label}
          </button>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-semibold ${['home', 'market', 'products', 'ops'].includes(view) ? 'text-primary' : 'text-muted-foreground'}`}>
              <Menu className="h-5 w-5" /> Mehr
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top">
            <DropdownMenuItem onClick={() => setView('home')}><Home className="h-4 w-4" />Start</DropdownMenuItem>
            {visibleNav.filter(n => n.group === 'Veranstaltungsleitung').map(n => (
              <DropdownMenuItem key={n.id} onClick={() => setView(n.id)}><n.icon className="h-4 w-4" />{n.label}</DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => { api.setToken(''); location.reload() }}><LogOut className="h-4 w-4" />Abmelden</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </div>
  );
}

const CUSTOM_REASON = '__custom__';
// A dropdown of standard reasons plus a "custom" escape hatch — picking any preset fills the
// field instantly (no typing) for the fast, repetitive decisions staff make all night; typing
// something else switches the field to free text automatically.
function ReasonPicker({ label, value, onChange, presets }: { label: string; value: string; onChange: (v: string) => void; presets: string[] }) {
  const isPreset = presets.includes(value);
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Select value={isPreset ? value : CUSTOM_REASON} onValueChange={v => onChange(v === CUSTOM_REASON ? '' : v)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {presets.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          <SelectItem value={CUSTOM_REASON}>Eigener Text…</SelectItem>
        </SelectContent>
      </Select>
      {!isPreset && <Input value={value} onChange={e => onChange(e.target.value)} placeholder="Grund eingeben" autoFocus />}
    </div>
  );
}

// Resolves whatever is currently in the field (an NFC-scanned UID, or a Tyvek band number typed
// by hand — iPhones can't read Web NFC at all, so typing must always work) and shows the
// customer's balance/band/status right away, before any purchase or top-up is attempted.
function UidScanner({ uid, setUid, api, hideNotFoundHint, hideIdentitySummary, onIdentityChange }: {
  uid: string; setUid: (x: string) => void; api: Api; hideNotFoundHint?: boolean; hideIdentitySummary?: boolean;
  onIdentityChange?: (identity: WalletIdentity | null) => void;
}) {
  const [identity, setIdentity] = useState<WalletIdentity | null>(null);
  const [notFound, setNotFound] = useState(false);
  const onIdentityChangeRef = useRef(onIdentityChange);
  useEffect(() => { onIdentityChangeRef.current = onIdentityChange }, [onIdentityChange]);
  useEffect(() => {
    const trimmed = uid.trim();
    if (trimmed.length < 4) { setIdentity(null); setNotFound(false); onIdentityChangeRef.current?.(null); return }
    let cancelled = false;
    const t = setTimeout(() => {
      api.lookupWallet(trimmed)
        .then(r => { if (!cancelled) { setIdentity(r); setNotFound(false); onIdentityChangeRef.current?.(r) } })
        .catch(() => { if (!cancelled) { setIdentity(null); setNotFound(true); onIdentityChangeRef.current?.(null) } });
    }, 300);
    return () => { cancelled = true; clearTimeout(t) };
  }, [uid, api]);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="uid">Armband scannen oder Nummer eingeben</Label>
      <div className="relative">
        <Nfc className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input id="uid" value={uid} onChange={e => setUid(e.target.value)} placeholder="NFC-UID oder Armbandnummer" autoCapitalize="characters" className="pl-10 font-mono text-lg h-14" />
      </div>
      {identity && !hideIdentitySummary && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <div>
            <p className="text-xs text-muted-foreground">Armband {identity.bandNumber}</p>
            <p className="text-xl font-bold">{euro(identity.balanceCents)}</p>
          </div>
          <Badge variant={identity.status === 'ACTIVE' ? 'success' : 'destructive'}>{identity.status}</Badge>
        </div>
      )}
      {notFound && !hideNotFoundHint && <p className="text-sm text-destructive">Kein aktives Armband mit dieser Nummer/UID gefunden.</p>}
    </div>
  );
}

const TERMINALS = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Bar A' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Bar B' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Zentrale Aufladung' },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Admin' },
];

function Login({ api, done }: { api: Api; done: () => void }) {
  const [user, setUser] = useState('');
  const [personal, setPersonal] = useState(false);
  const loginLock = useRef(false);
  const [password, setPassword] = useState('');
  const [terminal, setTerminal] = useState(() => localStorage.getItem('last-terminal') ?? '11111111-1111-4111-8111-111111111111');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const terminals = [
    { id: '11111111-1111-4111-8111-111111111111', name: 'Bar A' },
    { id: '22222222-2222-4222-8222-222222222222', name: 'Bar B' },
    { id: '33333333-3333-4333-8333-333333333333', name: 'Zentrale Aufladung' },
    { id: '44444444-4444-4444-8444-444444444444', name: 'Admin' },
  ];
  async function submit() {
    if (loginLock.current || !user.trim() || (!personal && !/^\d{4}$/.test(password))) return;
    loginLock.current = true; setBusy(true); setError('');
    try { const r = await api.login(user, password, terminal); api.setToken(r.accessToken); localStorage.setItem('last-terminal', terminal); done() }
    catch (e) { setError((e as Error).message) } finally { loginLock.current = false; setBusy(false) }
  }
  return (
    <div className="min-h-dvh flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Terminal anmelden</CardTitle>
          <CardDescription>Börsenparty</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <Label htmlFor="user">Benutzer</Label>
            <Input id="user" value={user} onChange={e => setUser(e.target.value)} autoFocus />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pw">{personal ? 'Persönliches Passwort' : 'Team-PIN (4 Ziffern)'}</Label>
            <Input id="pw" type="password" inputMode={personal ? 'text' : 'numeric'} maxLength={personal ? 128 : 4} autoComplete="current-password" value={password} onChange={e => setPassword(personal ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, 4))} onKeyDown={e => e.key === 'Enter' && submit()} />
            <Button type="button" variant="ghost" size="sm" onClick={() => { setPersonal(!personal); setPassword(''); setError('') }}>{personal ? 'Mit Team-PIN anmelden' : 'Leitung / persönliches Passwort'}</Button>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Terminal</Label>
            <Select value={terminal} onValueChange={setTerminal}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{terminals.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter>
          <Button className="w-full" size="lg" onClick={submit} disabled={busy || !user.trim() || (personal ? !password : password.length !== 4)}>{busy ? 'Anmeldung…' : 'Anmelden'}</Button>
        </CardFooter>
      </Card>
    </div>
  );
}


// Full technical detail, shown only in Armbandservice where staff are deliberately slowing down
// to investigate one person. The transaction views use BoundBandBar instead.
function WalletStrip({ wallet }: { wallet: WalletIdentity }) {
  return <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border text-center sm:grid-cols-4">
    <div className="bg-card px-2 py-3"><p className="text-[11px] uppercase text-muted-foreground">Guthaben</p><p className="mt-1 text-lg font-bold tabular-nums text-primary">{euro(wallet.balanceCents)}</p></div>
    <div className="bg-card px-2 py-3"><p className="text-[11px] uppercase text-muted-foreground">Tyvek-Nr.</p><p className="mt-1 truncate font-bold">{wallet.bandNumber}</p></div>
    <div className="bg-card px-2 py-3"><p className="text-[11px] uppercase text-muted-foreground">NFC-UID</p><p className="mt-1 truncate font-mono text-xs font-bold">{wallet.uidHex ?? 'ohne Chip'}</p></div>
    <div className="bg-card px-2 py-3"><p className="text-[11px] uppercase text-muted-foreground">Konto</p><p className="mt-1 truncate font-mono text-xs font-bold">{wallet.walletId.slice(0, 8)}</p></div>
  </div>;
}

// Untrained staff think "scan the band, then decide what to do with it" — not "pick a sidebar tab,
// then scan". The uid is already shared app-wide state, so switching here just re-resolves the
// same wallet in the new view without asking anyone to scan twice.
const TRANSACTION_VIEWS: View[] = ['pos', 'topup', 'customer'];
function TransactionSwitcher({ view, setView }: { view: View; setView: (v: View) => void }) {
  const roles=new Api().roles();const items = NAV.filter(n => TRANSACTION_VIEWS.includes(n.id)&&allowedView(n.id,roles));
  return <div className="grid grid-cols-3 gap-2">
    {items.map(n => (
      <Button key={n.id} type="button" variant={view === n.id ? 'default' : 'outline'} className="h-14 flex-col gap-1 text-xs" onClick={() => setView(n.id)}>
        <n.icon className="h-5 w-5" />{n.label}
      </Button>
    ))}
  </div>;
}

function QuantityButtons({ quantity, name, onMinus, onPlus }: { quantity: number; name: string; onMinus: () => void; onPlus: () => void }) {
  return <div className="flex items-center gap-1">
    <Button type="button" size="icon" variant="outline" className="size-11" onClick={onMinus} disabled={quantity === 0} aria-label={`${name} entfernen`}><Minus className="h-5 w-5"/></Button>
    <span className="w-8 text-center text-lg font-bold tabular-nums">{quantity}</span>
    <Button type="button" size="icon" className="size-11" onClick={onPlus} aria-label={`${name} hinzufügen`}><Plus className="h-5 w-5"/></Button>
  </div>;
}

function StepBar({ steps, current }: { steps: string[]; current: number }) {
  return <div className="flex gap-1.5">
    {steps.map((step, index) => (
      <div key={step} className="flex-1">
        <div className={`h-1 rounded-full ${index <= current ? 'bg-primary' : 'bg-border'}`} />
        <p className={`mt-1.5 text-[11px] font-semibold ${index === current ? 'text-primary' : 'text-muted-foreground'}`}>{step}</p>
      </div>
    ))}
  </div>;
}

function ProductTile({ product, quantity, onAdd, onRemove }: { product: Product; quantity: number; onAdd: () => void; onRemove: () => void }) {
  return (
    <div className={`flex flex-col justify-between gap-2 rounded-xl border p-3 transition-colors ${quantity > 0 ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}>
      <button type="button" className="min-h-12 text-left disabled:opacity-50" disabled={product.soldOut} onClick={onAdd}>
        <p className="line-clamp-2 text-sm font-semibold leading-tight">{product.name}</p>
        <p className={`mt-1 text-base font-bold tabular-nums ${product.soldOut ? 'text-destructive' : 'text-primary'}`}>{product.soldOut ? 'Ausverkauft' : euro(product.priceCents)}</p>
      </button>
      <div className="flex items-center justify-between gap-1">
        <Button type="button" size="icon" variant="outline" className="size-11" onClick={onRemove} disabled={quantity === 0} aria-label={`${product.name} entfernen`}><Minus className="h-5 w-5" /></Button>
        <span className="w-6 text-center text-lg font-bold tabular-nums">{quantity}</span>
        <Button type="button" size="icon" className="size-11" onClick={onAdd} disabled={product.soldOut} aria-label={`${product.name} hinzufügen`}><Plus className="h-5 w-5" /></Button>
      </div>
    </div>
  );
}

// Guided sale: scan → order → the guest confirms on screen → charge. The band is bound on the
// first scan and stays bound until the sale ends, so a second wristband held near the phone
// mid-order can never take over the running order.
function PosView({ uid, setUid, products, cart, setCart, onPay, disabled, busy, api, setView, nfc, terminalName, scanLocked }: {
  uid: string; setUid: (value: string) => void; products: Product[]; cart: Record<string, number>;
  setCart: (change: (cart: Record<string, number>) => Record<string, number>) => void;
  onPay: (quoteId: string, wallet:WalletIdentity,freeDrink?:true) => Promise<any>; scanLocked:{current:boolean}; disabled: boolean; busy: boolean; api: Api; setView: (v: View) => void;
  nfc: ReturnType<typeof useNfcScanner>; terminalName: string;
}) {
  const [wallet, setWallet] = useState<WalletIdentity | null>(null);
  const [stage, setStage] = useState<'scan' | 'order' | 'confirm' | 'success'>('scan');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [freeDrink,setFreeDrink]=useState(false);
  const [quoting, setQuoting] = useState(false);
  const quoteGeneration=useRef(0);const successTimer=useRef<number|undefined>(undefined);useEffect(()=>()=>{window.clearTimeout(successTimer.current)},[]);
  const [charging, setCharging] = useState(false);
  const [receipt, setReceipt] = useState<{ totalCents: number; balanceCents: number;freeDrink?:boolean } | null>(null);
  const [error, setError] = useState('');

  const itemCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  const localTotal = products.reduce((sum, product) => sum + product.priceCents * (cart[product.id] ?? 0), 0);
  const useFree=freeDrink&&wallet?.freeDrinkStatus==='AVAILABLE'&&itemCount===1&&(quote?.totalCents??localTotal)>0;
  const total = useFree?0:quote?.totalCents ?? localTotal;
  const categories = [...new Set(products.map(product => product.category))];
  const remaining = (wallet?.balanceCents ?? 0) - total;
  const missing = Math.max(0, -remaining);

  function reset() { setFreeDrink(false);quoteGeneration.current++;setQuoting(false);scanLocked.current=false; setCart(() => ({})); setUid(''); setWallet(null); setQuote(null); setError(''); setStage('scan') }

  useEffect(()=>()=>{scanLocked.current=false},[scanLocked]);
  function bind(found: WalletIdentity | null) {
    if (!found || stage !== 'scan' || scanLocked.current) return;
    scanLocked.current=true;
    setWallet(found);
    setStage('order');
  }

  function changeQuantity(productId: string, delta: number) {
    if(charging||busy||quoting)return;
    const next={...cart};const quantity=Math.max(0,Math.min(20,(next[productId]??0)+delta));
    if(quantity)next[productId]=quantity;else delete next[productId];
    setCart(()=>next);setQuote(null);setFreeDrink(false);
    if(stage==='confirm')void refreshQuote(next);
  }

  async function refreshQuote(nextCart: Record<string, number>) {
    const generation=++quoteGeneration.current;
    const items = Object.entries(nextCart).filter(([, quantity]) => quantity > 0).map(([productId, quantity]) => ({ productId, quantity }));
    if (!items.length) { setQuote(null);setQuoting(false);setStage('order');return null }
    setQuoting(true); setError('');
    try { const fresh = await api.quote(items);if(generation!==quoteGeneration.current)return null;setQuote(fresh); return fresh }
    catch (reason) { if(generation===quoteGeneration.current){setQuote(null);setError((reason as Error).message);feedback('error')}return null }
    finally { if(generation===quoteGeneration.current)setQuoting(false) }
  }

  async function toConfirm() {
    if (!wallet || !itemCount || disabled) return;
    if (await refreshQuote(cart)) setStage('confirm');
  }

  async function pay() {
    if (!wallet || !quote || quoting || charging || busy || disabled) return;
    setCharging(true); setError('');
    try {
      // A quote only holds its prices for a short window; refreshing a stale one here keeps the
      // guest from hitting a dead "Preise abgelaufen" screen after taking a moment to confirm.
      if(quote.expiresAt<=Date.now()){await refreshQuote(cart);setError('Preise aktualisiert. Bitte erneut bestätigen.');return;}
      const usable=quote;
      if (!useFree && wallet.balanceCents < usable.totalCents) { setError(`Es fehlen noch ${euro(usable.totalCents - wallet.balanceCents)}.`); feedback('error'); return }
      const result = await onPay(usable.quoteId,wallet,useFree?true:undefined);
      feedback('success');
      setReceipt({ totalCents: result.totalCents, balanceCents: result.balanceCents,freeDrink:Boolean(result.freeDrink) });
      setStage('success');
      successTimer.current=window.setTimeout(reset, 1800);
    } catch (reason) { setError((reason as Error).message); feedback('error') }
    finally { setCharging(false) }
  }

  if (stage === 'success') return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 text-center">
      <div className="flex size-24 items-center justify-center rounded-full bg-success/15"><ShieldCheck className="size-14 text-success" /></div>
      <p className="text-3xl font-bold text-success">{receipt?.freeDrink?'Freigetränk ausgegeben':'Erfolgreich abgebucht'}</p>
      <p className="text-5xl font-bold tabular-nums">{euro(receipt?.totalCents ?? 0)}</p>
      <p className="text-lg text-muted-foreground">Restguthaben <span className="font-bold text-foreground">{euro(receipt?.balanceCents ?? 0)}</span></p>
    </div>
  );

  if (stage === 'confirm' && wallet) return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 pb-32">
      <StepBar steps={['Armband', 'Bestellung', 'Bezahlung']} current={2} />
      <BoundBandBar wallet={wallet} onRelease={reset} disabled={charging||busy}/><h2 className="text-center text-2xl font-bold">Bestellung prüfen</h2>
      <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
        {products.filter(product => cart[product.id]).map(product => {
          const line = quote?.items.find(item => item.productId === product.id);
          const unit = line?.unitPriceCents ?? product.priceCents;
          return (
            <div key={product.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{product.name}</p>
                <p className="text-sm tabular-nums text-muted-foreground">{euro(unit)} × {cart[product.id]} = <span className="font-semibold text-foreground">{euro(unit * cart[product.id])}</span></p>
              </div>
              <QuantityButtons quantity={cart[product.id]} name={product.name} onMinus={() => changeQuantity(product.id, -1)} onPlus={() => changeQuantity(product.id, 1)} />
            </div>
          );
        })}
      </div>
      {wallet.freeDrinkStatus==='AVAILABLE'&&itemCount===1&&Boolean(quote&&quote.totalCents>0)&&<Button className="h-14" variant={useFree?'default':'outline'} disabled={charging||busy||disabled||quoting} onClick={()=>setFreeDrink(v=>!v)}>{useFree?'✓ Freigetränk wird eingelöst – abwählen':'🎁 Freigetränk einlösen (0 €)'}</Button>}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Aktuelles Guthaben</span><span className="tabular-nums">{euro(wallet.balanceCents)}</span></div>
        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Bestellung</span><span className="tabular-nums text-primary">−{euro(total)}</span></div>
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="font-semibold">Verbleibendes Guthaben</span>
          <span className={`text-3xl font-bold tabular-nums ${remaining < 0 ? 'text-destructive' : 'text-success'}`}>{euro(remaining)}</span>
        </div>
      </div>
      {missing > 0 && <p className="rounded-xl border border-destructive bg-destructive/10 p-3 text-center text-sm font-semibold text-destructive">Es fehlen noch {euro(missing)}. Bestellung reduzieren oder Armband aufladen.</p>}
      {error && <p className="text-center font-semibold text-destructive">{error}</p>}
      <div className="fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-30 flex flex-col gap-2 border-t border-border bg-background/95 p-3 backdrop-blur sm:bottom-0">
        <Button size="lg" className="h-14 w-full text-lg" disabled={disabled || !quote || missing > 0 || charging || busy || quoting} onClick={() => void pay()}>
          {charging ? <><Loader2 className="animate-spin" />Zahlung wird verarbeitet</> : missing > 0 ? 'Guthaben unzureichend' : useFree?'Freigetränk ausgeben · 0,00 €':`Jetzt bezahlen · ${euro(total)}`}
        </Button>
        <Button variant="ghost" size="sm" disabled={charging} onClick={() => setStage('order')}>Bestellung bearbeiten</Button>
      </div>
    </div>
  );

  if (stage === 'scan' || !wallet) return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between"><StepBar steps={['Armband', 'Bestellung', 'Bezahlung']} current={0} /></div>
      <NfcScanField uid={uid} setUid={setUid} api={api} nfc={nfc} onResolved={bind} title="Armband anhalten" hint={`${terminalName} · Halte das Armband an die Rückseite des Smartphones.`} />
      <TransactionSwitcher view="pos" setView={setView} />
    </div>
  );

  return <div className="flex flex-col gap-4 pb-28">
    <StepBar steps={['Armband', 'Bestellung', 'Bezahlung']} current={1} />
    <BoundBandBar wallet={wallet} onRelease={reset} disabled={charging||busy} />
    {wallet.freeDrinkStatus==='AVAILABLE'&&<p className="rounded-xl border border-success/40 bg-success/10 p-3 text-sm font-semibold text-success">1 Freigetränk verfügbar. Wähle ein einzelnes Getränk aus und aktiviere bei der Bestätigung „Freigetränk einlösen“. Weitere Getränke danach separat buchen.</p>}
    {categories.map(category => (
      <section key={category}>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">{category}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {products.filter(product => product.category === category).map(product => (
            <ProductTile key={product.id} product={product} quantity={cart[product.id] ?? 0} onAdd={() => changeQuantity(product.id, 1)} onRemove={() => changeQuantity(product.id, -1)} />
          ))}
        </div>
      </section>
    ))}
    {error && <p className="text-center font-semibold text-destructive">{error}</p>}
    <div className="fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 border-t border-border bg-background/95 p-3 backdrop-blur sm:bottom-0">
      <div className="min-w-24"><p className="text-xs text-muted-foreground">{itemCount} Getränke</p><p className="text-xl font-bold tabular-nums">{euro(localTotal)}</p></div>
      <Button size="lg" className="h-14 flex-1 text-lg" disabled={!itemCount || disabled || quoting} onClick={() => void toConfirm()}>{quoting ? <><Loader2 className="animate-spin" />Preise werden geprüft</> : 'Bezahlen'}</Button>
    </div>
  </div>;
}

const TOPUP_AMOUNTS = [500, 1000, 1500, 2000, 3000, 5000];

// Scan → amount → take the money → done. Nothing is preselected: a preselected amount on a screen
// with no band scanned yet was the single most confusing thing staff reported here.
function TopupView({ uid, setUid, onTopup, disabled, busy, api, setView, nfc, terminalName, scanLocked }: {
  uid: string; setUid: (value: string) => void; onTopup: (amount: number, method: 'CASH' | 'CARD_VERIFIED', wallet:WalletIdentity) => Promise<any>; scanLocked:{current:boolean};
  disabled: boolean; busy: boolean; api: Api; setView: (v: View) => void; nfc: ReturnType<typeof useNfcScanner>; terminalName: string;
}) {
  const [wallet, setWallet] = useState<WalletIdentity | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [method, setMethod] = useState<'CASH' | 'CARD_VERIFIED'>('CASH');
  const [confirmedBalance,setConfirmedBalance]=useState<number|null>(null);const bookingLock=useRef(false);const topupTimer=useRef<number|undefined>(undefined);useEffect(()=>()=>window.clearTimeout(topupTimer.current),[]);
  const [cashOpen,setCashOpen]=useState<boolean|null>(null);
  const [openingCash,setOpeningCash]=useState('0');const [openingBusy,setOpeningBusy]=useState(false);
  async function openCash(){if(openingBusy)return;const cents=cashAmount(openingCash);if(!Number.isInteger(cents)||cents<0||cents>100000){setError('Anfangsbestand muss zwischen 0 und 1000 € liegen.');return;}setOpeningBusy(true);try{await api.openCashSession(cents);setCashOpen(true);setError('');toast.success('Bargeldkasse eröffnet')}catch(e){setError((e as Error).message)}finally{setOpeningBusy(false)}}
  useEffect(()=>{let active=true;const refresh=()=>void api.cashSession().then(s=>{if(active)setCashOpen(Boolean(s))}).catch(()=>{if(active)setCashOpen(null)});refresh();const t=setInterval(refresh,5000);return()=>{active=false;clearInterval(t)}},[api]);
  const [stage, setStage] = useState<'scan' | 'amount' | 'payment' | 'success'>('scan');
  const [error, setError] = useState('');
  const selectedAmount = showCustom ? (cashAmount(custom)||0) : amount ?? 0;
  const amountValid = Number.isSafeInteger(selectedAmount) && selectedAmount >= 100 && selectedAmount <= 20000;
  const cashBlocked = method==='CASH' && cashOpen!==true;

  function reset() { bookingLock.current=false;scanLocked.current=false; setUid(''); setWallet(null); setAmount(null); setCustom(''); setShowCustom(false); setConfirmedBalance(null); setMethod('CASH'); setStage('scan'); setError('') }

  useEffect(()=>()=>{scanLocked.current=false},[scanLocked]);
  function bind(found: WalletIdentity | null) {
    if (!found || stage !== 'scan' || scanLocked.current) return;
    scanLocked.current=true;
    setWallet(found);
    setStage('amount');
  }

  async function book() {
    if (!wallet || bookingLock.current || busy || !amountValid || cashBlocked || disabled) return;
    bookingLock.current=true;setError('');
    try {
      const result=await onTopup(selectedAmount,method,wallet);setConfirmedBalance(result.balanceCents);
      feedback('success'); setStage('success'); topupTimer.current=window.setTimeout(reset, 1800);
    } catch (reason) { bookingLock.current=false;setError((reason as Error).message); feedback('error') }
  }

  if (stage === 'success') return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 text-center">
      <div className="flex size-24 items-center justify-center rounded-full bg-success/15"><ShieldCheck className="size-14 text-success" /></div>
      <p className="text-3xl font-bold text-success">Erfolgreich aufgeladen</p>
      <p className="text-5xl font-bold tabular-nums">{euro(selectedAmount)}</p>
      <p className="text-lg text-muted-foreground">Neues Guthaben <span className="font-bold text-foreground">{euro(confirmedBalance ?? 0)}</span></p>
    </div>
  );

  if (stage === 'scan' || !wallet) return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <StepBar steps={['Armband', 'Betrag', 'Zahlung']} current={0} />
      <NfcScanField uid={uid} setUid={setUid} api={api} nfc={nfc} onResolved={bind} title="Armband anhalten" hint={`${terminalName} · Scanne das Armband des Gastes.`} />
      <TransactionSwitcher view="topup" setView={setView} />
    </div>
  );

  if (stage === 'payment') return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 pb-32">
      <StepBar steps={['Armband', 'Betrag', 'Zahlung']} current={2} />
      <BoundBandBar wallet={wallet} onRelease={reset} disabled={busy||bookingLock.current} />
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center">
        {method === 'CASH' ? <Landmark className="size-14 text-primary" /> : <CreditCard className="size-14 text-primary" />}
        <p className="text-5xl font-bold tabular-nums">{euro(selectedAmount)}</p>
        <p className="text-xl font-semibold">{method === 'CASH' ? 'Bargeld entgegennehmen' : 'PayPal-Zahlung prüfen'}</p>
        <p className="text-sm text-muted-foreground">{method === 'CASH' ? 'Bestätige erst, wenn das Bargeld vollständig vorliegt.' : 'Bestätige erst, wenn die Zahlung in PayPal sichtbar eingegangen ist.'}</p>
      </div>
      {method === 'CARD_VERIFIED' && <p className="text-sm text-muted-foreground">Manuell bestätigt – keine automatische PayPal-Verifizierung. Zahlungseingang und Betrag vor Buchung im Empfängerkonto prüfen.</p>}
      {cashBlocked && <p className="text-sm text-destructive">Bargeldkasse nicht geöffnet oder Status unbekannt. Gehe zurück zur Betragsauswahl und eröffne dort die Kasse.</p>}
      <div className="flex justify-between rounded-xl border border-border bg-card p-4 text-sm">
        <span className="text-muted-foreground">Guthaben danach</span>
        <span className="text-xl font-bold tabular-nums text-success">{euro(wallet.balanceCents + selectedAmount)}</span>
      </div>
      {error && <p className="text-center font-semibold text-destructive">{error}</p>}
      <div className="fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-30 flex flex-col gap-2 border-t border-border bg-background/95 p-3 backdrop-blur sm:bottom-0">
        <Button size="lg" className="h-14 w-full text-lg" disabled={busy || disabled || cashBlocked} onClick={() => void book()}>
          {busy ? <><Loader2 className="animate-spin" />Wird gebucht</> : method === 'CASH' ? 'Bargeld erhalten – Guthaben buchen' : 'Zahlung erhalten – Guthaben buchen'}
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setStage('amount')}>Betrag ändern</Button>
      </div>
    </div>
  );

  return <div className="mx-auto flex w-full max-w-xl flex-col gap-5 pb-32">
    <StepBar steps={['Armband', 'Betrag', 'Zahlung']} current={1} />
    <BoundBandBar wallet={wallet} onRelease={reset} disabled={busy||bookingLock.current} />
    <h2 className="text-xl font-bold">Wie viel möchtest du aufladen?</h2>
    <div className="grid grid-cols-3 gap-2">
      {TOPUP_AMOUNTS.map(value => (
        <Button key={value} size="lg" variant={!showCustom && amount === value ? 'default' : 'outline'} className="h-16 text-lg" onClick={() => { setAmount(value); setShowCustom(false); setCustom('') }}>{euro(value)}</Button>
      ))}
    </div>
    {showCustom
      ? <div className="flex flex-col gap-2"><Label htmlFor="custom-topup">Anderer Betrag (€)</Label><Input id="custom-topup" inputMode="decimal" value={custom} onChange={event => setCustom(event.target.value)} placeholder="0,00" className="h-14 text-lg" autoFocus /></div>
      : <Button variant="ghost" onClick={() => { setShowCustom(true); setAmount(null) }}>Anderer Betrag</Button>}
    <div className="grid grid-cols-2 gap-2">
      <Button size="lg" className="h-14" variant={method === 'CASH' ? 'default' : 'outline'} onClick={() => setMethod('CASH')}><Landmark />Bargeld</Button>
      <Button size="lg" className="h-14" variant={method === 'CARD_VERIFIED' ? 'default' : 'outline'} onClick={() => setMethod('CARD_VERIFIED')}><CreditCard />PayPal</Button>
    </div>
    {cashBlocked && <Card><CardContent className="flex flex-col gap-2 pt-4"><p className="text-sm font-semibold">{cashOpen===null?'Kassenstatus wird geprüft …':'Bargeldkasse dieses Terminals ist nicht geöffnet.'}</p><Label>Anfangsbestand in Euro</Label><Input value={openingCash} inputMode="decimal" onChange={e=>setOpeningCash(e.target.value)}/><Button disabled={openingBusy||cashOpen===null||disabled||!Number.isSafeInteger(cashAmount(openingCash))||cashAmount(openingCash)<0||cashAmount(openingCash)>100000} onClick={()=>void openCash()}>Kasse eröffnen</Button></CardContent></Card>}
    {error&&<p className="text-destructive text-sm">{error}</p>}
    {amountValid && <div className="flex justify-between rounded-xl border border-border bg-card p-4 text-sm"><span className="text-muted-foreground">Guthaben danach</span><span className="text-xl font-bold tabular-nums text-success">{euro(wallet.balanceCents + selectedAmount)}</span></div>}
    <div className="fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-background/95 p-3 backdrop-blur sm:bottom-0">
      <Button size="lg" className="h-14 w-full text-lg" disabled={!amountValid || disabled || cashBlocked} onClick={() => setStage('payment')}>Weiter zur Zahlung</Button>
    </div>
  </div>;
}

const HISTORY_LABEL: Record<HistoryEntry['type'], string> = { PURCHASE: 'Kauf', TOPUP: 'Aufladung', REFUND: 'Storno' };
function HistoryRow({ entry, canRefund, onRefund }: { entry: HistoryEntry; canRefund: boolean; onRefund: (entry: HistoryEntry & { type: 'PURCHASE' }) => void }) {
  const time = new Date(entry.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const positive = entry.amountCents > 0;
  return <div className="flex items-center justify-between gap-3 border-b border-border py-3">
    <div className="min-w-0">
      <p className="font-bold">{entry.type==='PURCHASE'&&entry.freeDrink?'Freigetränk':HISTORY_LABEL[entry.type]}{entry.type === 'TOPUP' && ` · ${METHOD_LABEL[entry.fundingMethod] ?? entry.fundingMethod}`}</p>
      <p className="truncate text-xs text-muted-foreground">{time}{entry.type === 'REFUND' && ` · ${entry.reason}`}{entry.type === 'PURCHASE' && entry.status !== 'PAID' && ` · ${entry.status}`}</p>
    </div>
    <div className="flex shrink-0 items-center gap-3">
      <p className={`font-bold tabular-nums ${positive ? 'text-success' : ''}`}>{positive ? '+' : ''}{euro(entry.amountCents)}</p>
      {canRefund && entry.type === 'PURCHASE' && entry.refundableCents > 0 && <Button size="sm" variant="outline" onClick={() => onRefund(entry)}>Stornieren</Button>}
    </div>
  </div>;
}

// The old "Storno" form made staff hand-type an order ID and a UID they couldn't see — this view
// starts from a wristband scan instead, so every refund/replace/block action already knows which
// order and which band it's acting on. Refunds and band swaps still go through the existing
// four-eyes approval queue (Betrieb → Freigaben); this view only makes it fast to *request* them.
function CustomerView({ uid, setUid, api, setView, nfc, scanLocked }: { scanLocked:{current:boolean}; uid: string; setUid: (value: string) => void; api: Api; setView: (v: View) => void; nfc: ReturnType<typeof useNfcScanner> }) {
  const [wallet, setWallet] = useState<WalletIdentity | null>(null);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);const [truncated,setTruncated]=useState(false);const lookupGeneration=useRef(0);useEffect(()=>()=>{lookupGeneration.current++;scanLocked.current=false},[scanLocked]);
  const [loading, setLoading] = useState(false);
  const actionLock=useRef(false);const [actionBusy,setActionBusy]=useState(false);const [lookupError,setLookupError]=useState('');
  const [refundTarget, setRefundTarget] = useState<(HistoryEntry & { type: 'PURCHASE' }) | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('Fehlbuchung bestätigt');
  const [showReplace, setShowReplace] = useState(false);
  const [newBand, setNewBand] = useState('');
  const [replaceReason, setReplaceReason] = useState('Armband verloren');
  const [showBlock, setShowBlock] = useState(false);
  const [blockReason, setBlockReason] = useState('Armband verloren');
  const roles = useMemo(() => api.roles(), [api]);
  const canAct = roles.includes('PAYMENT_LEAD') || roles.includes('ADMIN');

  async function load(identifier: string) {
    const generation=++lookupGeneration.current;setLoading(true);setLookupError('');
    try { const r=await api.walletHistory(identifier);if(generation!==lookupGeneration.current)return;scanLocked.current=true;setWallet(r.wallet);setEntries(r.entries);setTruncated(Boolean(r.truncated)) }
    catch(e) {if(generation===lookupGeneration.current){scanLocked.current=false;setWallet(null);setEntries([]);setLookupError((e as Error).message)}}
    finally {if(generation===lookupGeneration.current)setLoading(false)}
  }


  async function act(fn: () => Promise<any>, message: string) {
    if(actionLock.current)return;actionLock.current=true;setActionBusy(true);const identifier=wallet?.uidHex??wallet?.bandNumber??uid.trim();try { await fn(); toast.success(message); await load(identifier) } catch (e) { toast.error((e as Error).message) }finally{actionLock.current=false;setActionBusy(false)}
  }

  // Unlike Kasse/Aufladung the service view must also find blocked bands — that is exactly when
  // someone walks up with a problem — so it resolves through the history endpoint, not lookup.
  if (!wallet) return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <NfcScanField uid={uid} setUid={setUid} api={api} nfc={nfc} historyMode onHistory={result=>{if(!scanLocked.current){scanLocked.current=true;setWallet(result.wallet);setEntries(result.entries);setTruncated(Boolean(result.truncated));setLookupError('')}}} onResolved={()=>{}} title="Armband anhalten" hint="Armband scannen oder Tyvek-Nummer eingeben, um Guthaben und Verlauf zu prüfen." />
      {loading && <p className="text-center text-sm text-muted-foreground">Verlauf wird geladen …</p>}{lookupError&&<p className="text-center text-destructive">{lookupError}</p>}
      <TransactionSwitcher view="customer" setView={setView} />
    </div>
  );

  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 pb-24">
    <BoundBandBar wallet={wallet} disabled={actionBusy} onRelease={() => { lookupGeneration.current++;scanLocked.current=false;setUid('');setWallet(null);setEntries([]);setRefundTarget(null);setShowBlock(false);setShowReplace(false);setNewBand('');setLookupError('') }} />
    {loading && <p className="text-sm text-muted-foreground">Lädt…</p>}
    {wallet && <>
      <p className="text-sm text-muted-foreground">Status: {wallet.status==='ACTIVE'?'Aktiv':wallet.status==='FROZEN'?'Gesperrt':wallet.status}</p>
      {canAct&&wallet.status==='ACTIVE'&&wallet.freeDrinkStatus==='NONE'&&<Button variant="outline" className="h-14" disabled={actionBusy||loading} onClick={()=>{if(window.confirm(`Ein Freigetränk für Armband ${wallet.bandNumber} freigeben?`))void act(()=>api.grantFreeDrink(wallet.uidHex??wallet.bandNumber,wallet.walletId),'Freigetränk freigegeben')}}>🎁 Ein Freigetränk freigeben</Button>}
      <TransactionSwitcher view="customer" setView={setView} />
      {canAct && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => { setShowReplace(v => !v); setShowBlock(false) }}><Repeat className="h-4 w-4" />Armband wechseln</Button>
          <Button variant="outline" onClick={() => { setShowBlock(v => !v); setShowReplace(false) }}><Lock className="h-4 w-4" />Sperren</Button>
        </div>
      )}
      {canAct && showReplace && (
        <Card><CardContent className="flex flex-col gap-3 pt-4">
          <p className="text-sm text-muted-foreground">Neues Armband (NFC-UID oder Tyvek-Nr.) scannen oder eingeben, Guthaben von <span className="font-bold">{wallet.bandNumber}</span> wird übernommen.</p>
          <Input value={newBand} onChange={e => setNewBand(e.target.value)} placeholder="Neue UID oder Band-Nr." className="h-12 font-mono" autoCapitalize="characters" />
          <ReasonPicker label="Wechselgrund" value={replaceReason} onChange={setReplaceReason} presets={['Armband verloren', 'Armband defekt', 'Akku/Chip beschädigt', 'Falsch zugewiesen']} />
          <Button disabled={actionBusy||!newBand.trim()} onClick={() => void act(() => api.requestBandReplacement(wallet?.uidHex??wallet?.bandNumber??uid.trim(), newBand.trim(), replaceReason), 'Armbandwechsel beantragt – Freigabe durch zweite Person nötig')}>Wechsel beantragen</Button>
        </CardContent></Card>
      )}
      {canAct && showBlock && (
        <Card><CardContent className="flex flex-col gap-3 pt-4">
          <ReasonPicker label="Sperrgrund" value={blockReason} onChange={setBlockReason} presets={['Armband verloren', 'Verdacht auf Missbrauch', 'Kunde bittet um Sperrung']} />
          <Button variant="destructive" disabled={actionBusy} onClick={() => void act(() => api.blockWristband(wallet.uidHex??wallet.bandNumber,blockReason), 'Armband gesperrt').then(() => setShowBlock(false))}>Jetzt sperren</Button>
        </CardContent></Card>
      )}
      <section className="border-t border-border pt-3">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">Verlauf</h2>{truncated&&<p className="text-xs text-muted-foreground">Die neuesten 200 Vorgänge werden angezeigt.</p>}
        {entries.length === 0 && !loading && <p className="text-sm text-muted-foreground">Noch keine Transaktionen.</p>}
        {entries.map(e => <HistoryRow key={`${e.type}-${e.id}`} entry={e} canRefund={canAct} onRefund={x => { setRefundTarget(x); setRefundAmount(''); setRefundReason('Fehlbuchung bestätigt') }} />)}
      </section>
    </>}

    <Dialog open={Boolean(refundTarget)} onOpenChange={open => { if (!open) setRefundTarget(null) }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Storno beantragen</DialogTitle><DialogDescription>Kauf vom {refundTarget && new Date(refundTarget.createdAt).toLocaleString('de-DE')} · maximal {refundTarget && euro(refundTarget.refundableCents)} erstattbar.</DialogDescription></DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5"><Label>Stornobetrag in € (leer = kompletter Rest)</Label><Input inputMode="decimal" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} placeholder={refundTarget ? euro(refundTarget.refundableCents) : ''} /></div>
          <ReasonPicker label="Stornogrund" value={refundReason} onChange={setRefundReason} presets={['Fehlbuchung bestätigt', 'Falsches Getränk kassiert', 'Kunde storniert', 'Doppelte Buchung']} />
        </div>
        <DialogFooter>
          <Button disabled={actionBusy} onClick={() => { if (!refundTarget) return; void act(() => api.requestRefund(refundTarget.id, refundReason, refundAmount ? toCents(refundAmount) : undefined), 'Storno beantragt – Freigabe durch zweite Person nötig').then(() => setRefundTarget(null)) }}>Storno beantragen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function MarketView({ products }: { products: Product[] }) {
  const byCategory = products.reduce<Record<string, Product[]>>((all, p) => { (all[p.category] ??= []).push(p); return all }, {});
  return (
    <div className="grid items-start gap-x-10 gap-y-8 md:grid-cols-2 xl:grid-cols-3">
      {Object.entries(byCategory).map(([category, items]) => (
        <section key={category} className="border-t-2 border-primary pt-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-[0.14em]">{category}</h2>
            <span className="text-xs tabular-nums text-muted-foreground">{items.length} Getränke</span>
          </div>
          <div>
            {items.map(p => (
              <div key={p.id} className="flex min-h-12 items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
                <span className="font-medium truncate min-w-0">{p.name}</span>
                <span className="shrink-0 font-bold tabular-nums text-primary">{euro(p.priceCents)}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
      {products.length === 0 && <p className="py-12 text-center text-muted-foreground md:col-span-2 xl:col-span-3">Noch keine Kursdaten vorhanden.</p>}
    </div>
  );
}

function ProductsView({ api }: { api: Api }) {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const refresh = () => api.adminProducts().then(setProducts).catch(e => toast.error(e.message)).finally(() => setLoading(false));
  useEffect(() => { void refresh() }, [api]);

  function openCreate() { setEditing(null); setOpen(true) }
  function openEdit(p: AdminProduct) { setEditing(p); setOpen(true) }

  const categories = [...new Set(products.map(p => p.category))];
  const existingCategories = categories.filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Getränke verwalten</h2>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" />Neu</Button>
      </div>
      {loading && <div className="grid gap-3 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>}
      {!loading && categories.map(category => (
        <section key={category} className="border-t-2 border-primary pt-3 first:border-t-0 first:pt-0">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">{category || 'Ohne Kategorie'}</h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {products.filter(p => p.category === category).map(p => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-4">
                <button onClick={() => openEdit(p)} className="flex-1 min-w-0 flex items-center justify-between text-left">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{p.name} {!p.active && <Badge variant="secondary" className="ml-2">Inaktiv</Badge>}</p>
                    <p className="text-xs text-muted-foreground">{euro(p.minPriceCents)}–{euro(p.maxPriceCents)} · Basis {euro(p.basePriceCents)} · <span className="font-semibold text-primary">Kurs {p.soldOut ? 'aus' : (p.currentPriceCents != null ? euro(p.currentPriceCents) : '–')}</span></p>
                  </div>
                </button>
                <Button size="sm" variant={p.soldOut ? 'destructive' : 'outline'} className="shrink-0"
                  onClick={async () => { try { await api.updateProduct(p.id, { soldOut: !p.soldOut }); toast.success(p.soldOut ? `${p.name} wieder verfügbar` : `${p.name} als ausverkauft markiert`); refresh() } catch (e) { toast.error((e as Error).message) } }}>
                  {p.soldOut ? 'Ausverkauft' : 'Verfügbar'}
                </Button>
              </div>
            ))}
          </div>
        </section>
      ))}
      {!loading && products.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Getränke angelegt.</p>}
      <ProductDialog open={open} onOpenChange={setOpen} api={api} product={editing} existingCategories={existingCategories} onSaved={refresh} />
    </div>
  );
}

// Rounds to the nearest 10 cents so a suggested price never lands on an odd amount like 1,37 €.
const roundToTenCents = (cents: number) => Math.max(10, Math.round(cents / 10) * 10);

function ProductDialog({ open, onOpenChange, api, product, existingCategories, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; api: Api; product: AdminProduct | null; existingCategories: string[]; onSaved: () => void }) {
  const [name, setName] = useState(''); const [category, setCategory] = useState('');
  const [base, setBase] = useState(''); const [min, setMin] = useState(''); const [max, setMax] = useState('');
  const [minMaxTouched, setMinMaxTouched] = useState(false);
  const [active, setActive] = useState(true); const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setName(product?.name ?? ''); setCategory(product?.category ?? existingCategories[0] ?? '');
    setBase(product ? (product.basePriceCents / 100).toFixed(2) : ''); setMin(product ? (product.minPriceCents / 100).toFixed(2) : '');
    setMax(product ? (product.maxPriceCents / 100).toFixed(2) : ''); setActive(product?.active ?? true); setError(''); setMinMaxTouched(Boolean(product));
  }, [open, product]);

  // For a brand-new drink, typing just the base price suggests a sensible ±range (60%–180%) so
  // staff aren't forced to invent three numbers by hand — they can still override either field,
  // which is what the manual-edit flag below is tracking.
  function onBaseChange(value: string) {
    setBase(value);
    if (minMaxTouched) return;
    const cents = toCents(value);
    if (!Number.isFinite(cents) || cents <= 0) return;
    setMin((roundToTenCents(cents * 0.6) / 100).toFixed(2));
    setMax((roundToTenCents(cents * 1.8) / 100).toFixed(2));
  }

  async function save() {
    try {
      const input = { name, category, basePriceCents: toCents(base), minPriceCents: toCents(min), maxPriceCents: toCents(max) };
      if (product) await api.updateProduct(product.id, { ...input, active });
      else await api.createProduct(input);
      onOpenChange(false); onSaved(); toast.success('Gespeichert');
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product ? 'Getränk bearbeiten' : 'Neues Getränk'}</DialogTitle>
          <DialogDescription>Mindest-, Basis- und Höchstpreis bestimmen die Preisspanne der Börse.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
          {existingCategories.length > 0
            ? <ReasonPicker label="Kategorie" value={category} onChange={setCategory} presets={existingCategories} />
            : <div className="flex flex-col gap-1.5"><Label>Kategorie</Label><Input value={category} onChange={e => setCategory(e.target.value)} placeholder="z. B. Bier" /></div>}
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1.5"><Label>Min (€)</Label><Input inputMode="decimal" value={min} onChange={e => { setMinMaxTouched(true); setMin(e.target.value) }} /></div>
            <div className="flex flex-col gap-1.5"><Label>Basis (€)</Label><Input inputMode="decimal" value={base} onChange={e => onBaseChange(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label>Max (€)</Label><Input inputMode="decimal" value={max} onChange={e => { setMinMaxTouched(true); setMax(e.target.value) }} /></div>
          </div>
          {!product && <p className="text-xs text-muted-foreground">Min/Max werden aus dem Basispreis vorgeschlagen (60–180 %) und können angepasst werden.</p>}
          {product && (
            <button onClick={() => setActive(a => !a)} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span>Im Verkauf aktiv</span><Badge variant={active ? 'success' : 'secondary'}>{active ? 'Aktiv' : 'Inaktiv'}</Badge>
            </button>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button onClick={save}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OpsView({ api, health }: { api: Api; health: any }) {
  const roles=api.roles(),has=(...r:string[])=>r.some(x=>roles.includes(x));
  const lead=has('ADMIN','PAYMENT_LEAD'),market=has('ADMIN','MARKET_MANAGER'),cash=has('TOPUP','ADMIN','PAYMENT_LEAD','AUDITOR');
  const tabs:Record<string,boolean>={event:lead,cash,crash:market,wristbands:has('TOPUP','ADMIN','PAYMENT_LEAD','AUDITOR'),approvals:lead,users:has('ADMIN'),report:has('ADMIN','PAYMENT_LEAD','AUDITOR'),devices:market||has('AUDITOR')};
  return (
    <Tabs defaultValue={Object.keys(tabs).find(k=>tabs[k])??'event'}>
      {/* Forcing equal-width grid columns made every label squish/wrap on phone and tablet —
          size each tab to its own content and let the row scroll horizontally instead. */}
      <TabsList className="w-full justify-start overflow-x-auto">
        {tabs["event"]&&<TabsTrigger value="event" className="flex-none">Veranstaltung</TabsTrigger>}
        {tabs["cash"]&&<TabsTrigger value="cash" className="flex-none">Kasse</TabsTrigger>}
        {tabs["crash"]&&<TabsTrigger value="crash" className="flex-none">Crash</TabsTrigger>}
        {tabs["wristbands"]&&<TabsTrigger value="wristbands" className="flex-none">Armbänder</TabsTrigger>}
        {tabs["approvals"]&&<TabsTrigger value="approvals" className="flex-none">Freigaben</TabsTrigger>}
        {tabs["users"]&&<TabsTrigger value="users" className="flex-none">Team</TabsTrigger>}
        {tabs["report"]&&<TabsTrigger value="report" className="flex-none">Bericht</TabsTrigger>}
        {tabs["devices"]&&<TabsTrigger value="devices" className="flex-none">Geräte</TabsTrigger>}
      </TabsList>
      {tabs["event"]&&<TabsContent value="event"><EventPanel api={api} /></TabsContent>}
      {tabs["cash"]&&<TabsContent value="cash"><CashPanel api={api} /></TabsContent>}
      {tabs["crash"]&&<TabsContent value="crash"><CrashPanel api={api} /></TabsContent>}
      {tabs["wristbands"]&&<TabsContent value="wristbands"><WristbandPanel api={api} /></TabsContent>}
      {tabs["approvals"]&&<TabsContent value="approvals"><ApprovalPanel api={api} /></TabsContent>}
      {tabs["users"]&&<TabsContent value="users"><UserPanel api={api} /></TabsContent>}
      {tabs["report"]&&<TabsContent value="report"><ReportPanel api={api} health={health} /></TabsContent>}
      {tabs["devices"]&&<TabsContent value="devices" className="flex flex-col gap-6"><ChipPanel api={api} /><DevicePanel api={api} /></TabsContent>}
    </Tabs>
  );
}

const PHASE_META: Record<EventPhase, { label: string; variant: 'success' | 'destructive' | 'secondary' | 'outline' }> = {
  PREPARING: { label: 'In Vorbereitung', variant: 'outline' },
  OPEN: { label: 'Veranstaltung läuft', variant: 'success' },
  CLOSING: { label: 'Abschluss läuft', variant: 'destructive' },
  CLOSED: { label: 'Geschlossen', variant: 'secondary' },
};

// The lifecycle the whole evening hangs on: preparing → open → closing → closed. Deliberately
// separate from cash sessions and from logging out, because those are three different decisions
// and conflating them is how someone ends an event by handing over a shift.
function EventPanel({ api }: { api: Api }) {
  const [state, setState] = useState<EventState | null>(null);
  const [name, setName] = useState('Börsenparty');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'begin-closing' | 'close' | 'back' | null>(null);
  const eventSequence=useRef(0);
  const refresh = async () => {const n=++eventSequence.current;try{const next=await api.eventState();if(n===eventSequence.current)setState(next)}catch(e){if(n===eventSequence.current)toast.error((e as Error).message)}};
  useEffect(() => { void refresh(); const timer = setInterval(refresh, 10000); return () => {clearInterval(timer);eventSequence.current++} }, [api]);

  async function act(fn: () => Promise<EventState>, message: string) {
    setBusy(true);
    try { const next=await fn();eventSequence.current++;setState(next);toast.success(message);await refresh() }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false); setConfirm(null) }
  }

  if (!state) return <Skeleton className="h-64 w-full rounded-xl" />;
  const meta = PHASE_META[state.phase];
  const blocking = (state.checklist??[]).filter(item => item.required && !item.ok);
  const done = (state.checklist??[]).filter(item => item.ok).length;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-xl">{state.name ?? 'Noch keine Veranstaltung'}</CardTitle>
            <Badge variant={meta.variant}>{meta.label}</Badge>
          </div>
          <CardDescription>
            {state.openedAt && `Eröffnet ${new Date(state.openedAt).toLocaleString('de-DE')}`}
            {state.closedAt && ` · Geschlossen ${new Date(state.closedAt).toLocaleString('de-DE')}`}
            {!state.openedAt && 'Die Veranstaltung wurde noch nicht eröffnet. Verkauf und Aufladung bleiben bis dahin gesperrt.'}
          </CardDescription>
        </CardHeader>
      </Card>

      {state.phase === 'PREPARING' && (
        <Card>
          <CardHeader>
            <CardTitle>Bereit für die Börsenparty?</CardTitle>
            <CardDescription>Vorbereitung {done} von {(state.checklist??[]).length} · Pflichtpunkte müssen erfüllt sein, die übrigen sind Hinweise.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {(state.checklist??[]).map(item => (
                <div key={item.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${item.ok ? 'bg-success text-success-foreground' : item.required ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground'}`}>{item.ok ? '✓' : '!'}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{item.label} {!item.required && <span className="text-xs font-normal text-muted-foreground">(optional)</span>}</p>
                    <p className="text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="event-name">Name der Veranstaltung</Label><Input id="event-name" value={name} onChange={e => setName(e.target.value)} /></div>
            <Button size="lg" disabled={busy || blocking.length > 0 || name.trim().length < 3} onClick={() => void act(() => api.openEvent(name.trim()), 'Veranstaltung eröffnet – Verkauf ist freigegeben')}>
              {blocking.length ? `Noch ${blocking.length} Pflichtpunkt(e) offen` : 'Veranstaltung eröffnen'}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-4 gap-1 text-center text-xs font-semibold" aria-label="Veranstaltungsablauf">{(['PREPARING','OPEN','CLOSING','CLOSED'] as const).map((phase,i)=><div key={phase} className={`rounded-lg border p-2 ${state.phase===phase?'border-primary bg-primary/10 text-primary':'text-muted-foreground'}`}>{i+1}. {['Vorbereitung','Verkauf','Abschluss','Fertig'][i]}</div>)}</div>
      {state.phase !== 'PREPARING' && <Button variant="outline" size="lg" disabled={busy} onClick={()=>setConfirm('back')}>{state.phase==='CLOSING'?'← Verkauf wieder aufnehmen':state.phase==='CLOSED'?'← Abschluss erneut öffnen':'← Zur Vorbereitung (nur ohne Buchungen)'}</Button>}
      {state.phase==='CLOSED'&&<p className="rounded-lg border p-4 text-sm text-muted-foreground">Veranstaltung abgeschlossen. Berichte, Kassenzählungen und Guthaben bleiben erhalten. Für eine neue Veranstaltung eine separate Datenbank verwenden.</p>}
      {state.phase==='OPEN'&&state.mode==='PAYMENT_STOP'&&<p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm font-semibold text-destructive">Verkauf bleibt gesperrt. Freigabe über Betrieb → Freigaben erforderlich.</p>}
      {state.phase === 'OPEN' && (
        <Card>
          <CardHeader><CardTitle>Veranstaltung beenden</CardTitle><CardDescription>Schritt 1 stoppt Verkauf und Aufladung. Guthaben, Verlauf und Berichte bleiben unverändert erhalten.</CardDescription></CardHeader>
          <CardContent>
            <Button variant="destructive" size="lg" disabled={busy} onClick={() => setConfirm('begin-closing')}>Verkaufsende einleiten</Button>
          </CardContent>
        </Card>
      )}

      {state.phase === 'CLOSING' && (
        <Card>
          <CardHeader><CardTitle>Abschluss läuft</CardTitle><CardDescription>Verkauf und Aufladung sind gestoppt. Vor dem endgültigen Abschluss müssen alle Kassen gezählt sein.</CardDescription></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div><p className="text-xs text-muted-foreground">Offene Kassen</p><p className="text-xl font-bold">{state.closing.openCashSessions.length}</p></div>
              <div><p className="text-xs text-muted-foreground">Offene Vorgänge</p><p className="text-xl font-bold">{state.closing.pendingOperations}</p></div>
              <div><p className="text-xs text-muted-foreground">Offene Anträge</p><p className="text-xl font-bold">{state.closing.pendingApprovals}</p></div>
              <div><p className="text-xs text-muted-foreground">Restguthaben</p><p className="text-xl font-bold tabular-nums">{euro(state.closing.outstandingCents)}</p><p className="text-xs text-muted-foreground">auf {state.closing.outstandingWallets} Armbändern</p></div>
            </div>
            {state.closing.openCashSessions.length > 0 && <div className="flex flex-col gap-2"><p className="font-semibold">Noch offen: {state.closing.openCashSessions.map(s=>s.terminalName).join(', ')}</p><CashPanel api={api} closingOnly onChanged={refresh}/></div>}
            <Button variant="destructive" size="lg" disabled={busy || state.closing.openCashSessions.length > 0 || state.closing.pendingOperations > 0 || state.closing.pendingApprovals > 0} onClick={() => setConfirm('close')}>Veranstaltung endgültig abschließen</Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={Boolean(confirm)} onOpenChange={open => { if (!open) setConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm==='back'?'Vorherigen Schritt wieder öffnen?':confirm === 'begin-closing' ? 'Verkaufsende einleiten?' : 'Veranstaltung abschließen?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm==='back'?(state.phase==='CLOSING'?'Der vorherige Betriebsmodus wird wiederhergestellt; eine vorherige Zahlungssperre bleibt aktiv. Bereits gezählte Kassen bleiben geschlossen und müssen bei Bedarf neu eröffnet werden.':'Buchungen, Guthaben, Berichte und Kassenzählungen bleiben erhalten. Der Status wird im Audit protokolliert.'):confirm === 'begin-closing'
                ? 'An allen Kassen können ab sofort keine Getränke mehr verkauft und keine Guthaben mehr aufgeladen werden. Bereits bestätigte Buchungen bleiben erhalten. Ungeklärte Vorgänge müssen geprüft werden.'
                : 'Die Veranstaltung wird als abgeschlossen vermerkt. Alle Transaktionen und Guthaben bleiben nachvollziehbar erhalten; eine erneute Eröffnung ist nur durch die Veranstaltungsleitung möglich.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm==='back'?void act(()=>api.backEvent(state.phase),'Vorheriger Schritt geöffnet'):confirm === 'begin-closing'
              ? void act(() => api.beginEventClosing(), 'Verkauf gestoppt')
              : void act(() => api.closeEvent(), 'Veranstaltung abgeschlossen')}>
              {confirm==='back'?'Schritt zurück':confirm === 'begin-closing' ? 'Verkauf stoppen' : 'Abschließen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const OP_LABEL: Record<string, string> = { TOPUP: 'Aufladungen', PURCHASE: 'Verkäufe', REFUND: 'Rückerstattungen', ADJUSTMENT: 'Korrekturen' };
const METHOD_LABEL: Record<string, string> = { CASH: 'Bar', CARD_VERIFIED: 'PayPal (manuell)' };

function ReportPanel({ api, health }: { api: Api; health: any }) {
  const [report, setReport] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [exporting,setExporting]=useState(false);
  async function exportSigned(){setExporting(true);try{const report=await api.createSignedReport();const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`boersenparty-abschluss-${report.id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast.success('Signierten Bericht separat sichern.')}catch(e){toast.error((e as Error).message)}finally{setExporting(false)}}
  const load = async () => { setBusy(true); try { setReport(await api.report()) } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) } };
  useEffect(() => { void load() }, [api]);
  const revenueCents = (report?.operations as any[] ?? []).find(o => o.type === 'PURCHASE')?.amountCents ?? 0;
  const refundCents = (report?.operations as any[] ?? []).find(o => o.type === 'REFUND')?.amountCents ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{report ? `Stand: ${new Date(report.generatedAt).toLocaleString('de-DE')}` : 'Noch kein Bericht geladen'}</p>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={load} disabled={busy}>Aktualisieren</Button>{api.roles().some(r=>r==='ADMIN'||r==='PAYMENT_LEAD')&&<Button size="sm" onClick={exportSigned} disabled={exporting}>Signierten Bericht sichern</Button>}</div>
      </div>
      {report && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Umsatz (Verkäufe)</p><p className="text-xl font-bold">{euro(revenueCents)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Rückerstattet</p><p className="text-xl font-bold text-destructive">{euro(refundCents)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Guthaben im Umlauf</p><p className="text-xl font-bold">{euro(report.wallets.liabilityCents)}</p><p className="text-xs text-muted-foreground">{report.wallets.wallets} aktive Wallets</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Umsatz nach Vorgangstyp</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {(report.operations as any[]).map(o => (
                <div key={o.type} className="flex items-center justify-between text-sm">
                  <span>{OP_LABEL[o.type] ?? o.type} <span className="text-muted-foreground">({o.count}×)</span></span>
                  <span className="font-semibold">{euro(o.amountCents)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Aufladungen nach Zahlart</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {report.integrityIssues?.length>0&&<p className="text-sm text-destructive">Buchhaltung inkonsistent: {report.integrityIssues.join(', ')}</p>}
              {report.freeDrinks&&<p className="text-sm text-muted-foreground">Freigetränke: {report.freeDrinks.redeemed} von {report.freeDrinks.granted} eingelöst · Warenwert {euro(report.freeDrinks.faceValueCents)}</p>}
              {report.startingCredit&&<p className="text-sm text-muted-foreground">Startguthaben (netto): {euro(report.startingCredit.netCents)}</p>}
              {(report.topupsByMethod as any[]).length === 0 && <p className="text-sm text-muted-foreground">Noch keine Aufladungen.</p>}
              {(report.topupsByMethod as any[]).map(m => (
                <div key={m.method} className="flex items-center justify-between text-sm">
                  <span>{METHOD_LABEL[m.method] ?? m.method} <span className="text-muted-foreground">({m.count}×)</span></span>
                  <span className="font-semibold">{euro(m.amountCents)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Meistverkauft (ohne vollständig stornierte Käufe)</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {report.refundTotals?.partialUnallocatedCents>0&&<p className="text-xs text-muted-foreground">Teilstornos ohne Artikelzuordnung: {euro(report.refundTotals.partialUnallocatedCents)}. Artikelumsätze sind vor Teilstornos.</p>}
              {(report.productSales as any[]).length === 0 && <p className="text-sm text-muted-foreground">Noch keine Verkäufe.</p>}
              {(report.productSales as any[]).map(p => (
                <div key={p.name} className="flex items-center justify-between text-sm">
                  <span>{p.name} <span className="text-muted-foreground">({p.quantity}×)</span></span>
                  <span className="font-semibold">{euro(p.revenueCents)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Kassensitzungen</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {(report.cashSessions as any[]).length === 0 && <p className="text-sm text-muted-foreground">Keine Kassensitzungen.</p>}
              {(report.cashSessions as any[]).map(s => (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <span>{s.terminalId} · {s.status === 'OPEN' ? 'offen' : 'geschlossen'}</span>
                  {s.differenceCents != null
                    ? <Badge variant={s.differenceCents === 0 ? 'success' : 'destructive'}>{s.differenceCents === 0 ? 'ausgeglichen' : `${s.differenceCents > 0 ? '+' : ''}${euro(s.differenceCents)}`}</Badge>
                    : <Badge variant="outline">offen</Badge>}
                </div>
              ))}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">{report.auditEventCount} Audit-Ereignisse protokolliert.</p>
        </>
      )}
      <button className="text-xs text-muted-foreground underline text-left" onClick={() => setShowRaw(s => !s)}>{showRaw ? 'Rohdaten ausblenden' : 'Rohdaten anzeigen'}</button>
      {showRaw && <Card><CardContent className="pt-4"><pre className="text-xs text-muted-foreground overflow-auto">{JSON.stringify(health, null, 2)}</pre></CardContent></Card>}
    </div>
  );
}

const VERDICT_LABEL: Record<string, string> = { good: 'Stabil', warn: 'Instabil', bad: 'Nicht bereit' };
const VERDICT_VARIANT: Record<string, 'success' | 'destructive' | 'outline'> = { good: 'success', warn: 'outline', bad: 'destructive' };
function relativeTime(ms: number) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return `vor ${s}s`;
  if (s < 3600) return `vor ${Math.round(s / 60)}min`;
  return `vor ${Math.round(s / 3600)}h`;
}

function DevicePanel({ api }: { api: Api }) {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [triggering, setTriggering] = useState(false);
  const refresh = () => api.devices().then(d => { setDevices(d); setNames(n => ({ ...Object.fromEntries(d.map(x => [x.id, x.name ?? ''])), ...n })) }).catch(() => {});
  useEffect(() => { refresh(); const t = setInterval(refresh, 10000); return () => clearInterval(t) }, [api]);
  async function trigger() {
    setTriggering(true);
    try { await api.triggerFleetDiagnostics(); toast.success('Leistungstest für alle Displays gestartet – startet synchronisiert in wenigen Sekunden.') }
    catch (e) { toast.error((e as Error).message) } finally { setTriggering(false) }
  }
  async function saveName(id: string) {
    try { await api.renameDevice(id, names[id] ?? ''); toast.success('Umbenannt'); await refresh() } catch (e) { toast.error((e as Error).message) }
  }
  return (
    <div className="flex flex-col gap-4">
      <div><h2 className="text-lg font-bold">Displays</h2><p className="text-sm text-muted-foreground">Marktdisplays im Netzwerk · Statusmeldungen sind unverbindliche Geräte-Selbstauskünfte.</p></div>
      <Card className="border-primary/50 bg-primary/5">
        <CardContent className="flex items-center justify-between py-4 gap-3">
          <div>
            <p className="text-sm font-semibold">Leistungstest für alle Displays</p>
            <p className="text-xs text-muted-foreground">Farb-/Flackertest, Netzwerktest, Display-Zustände – synchron auf jedem Gerät, das gerade /market zeigt.</p>
          </div>
          <Button onClick={trigger} disabled={triggering}>Jetzt starten</Button>
        </CardContent>
      </Card>
      {devices.length === 0 && <p className="text-sm text-muted-foreground">Noch kein Gerät gesehen – ein Display muss einmal /market geladen haben.</p>}
      {devices.map(d => {
        const online = Date.now() - d.lastSeenAt < 45000;
        const net = d.diagnosticResult?.network;
        return (
          <Card key={d.id}>
            <CardContent className="pt-4 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${online ? 'bg-success' : 'bg-muted-foreground'}`} />
                  <Input value={names[d.id] ?? ''} onChange={e => setNames(n => ({ ...n, [d.id]: e.target.value }))} placeholder={d.id} className="h-8 w-48 text-sm" />
                  <Button size="sm" variant="outline" onClick={() => saveName(d.id)}>Speichern</Button>
                </div>
                <span className="text-xs text-muted-foreground">{online ? 'online' : `offline · zuletzt ${relativeTime(d.lastSeenAt)}`}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {d.screenWidth && <span>{d.screenWidth}×{d.screenHeight}</span>}
                {d.userAgent && <span className="truncate max-w-xs">{d.userAgent}</span>}
              </div>
              {d.lastDiagnosticAt && net ? (
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant={VERDICT_VARIANT[net.verdict]}>{VERDICT_LABEL[net.verdict]}</Badge>
                  <span className="text-muted-foreground">Ø {net.avgMs}ms · {net.failures} Fehler · {relativeTime(d.lastDiagnosticAt)}</span>
                </div>
              ) : <p className="text-xs text-muted-foreground">Noch kein Leistungstest.</p>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ChipPanel({ api }: { api: Api }) {
  const [chips, setChips] = useState<ChipDevice[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [changing, setChanging] = useState<string | null>(null);
  const refresh = () => api.chips().then(items => {
    setChips(items);
    setNames(current => ({ ...Object.fromEntries(items.map(item => [item.id, item.name ?? ''])), ...current }));
  }).catch(() => {});
  useEffect(() => { refresh(); const timer = setInterval(refresh, 3000); return () => clearInterval(timer) }, [api]);
  async function saveName(chip: ChipDevice) {
    try { await api.renameChip(chip.id, names[chip.id] || chip.name); toast.success('Chip umbenannt'); await refresh() }
    catch (error) { toast.error((error as Error).message) }
  }
  async function setLights(chip: ChipDevice, on: boolean) {
    if (!chip.online || changing) return;
    setChanging(chip.id);
    try {
      await api.setChipDesiredState(chip.id, { lights: on });
      toast.success(on ? 'Lichter werden eingeschaltet' : 'Lichter werden ausgeschaltet');
      await new Promise(resolve => setTimeout(resolve, 1300));
      await refresh();
    } catch (error) { toast.error((error as Error).message) }
    finally { setChanging(null) }
  }
  return <section className="flex flex-col gap-4">
    <div className="flex items-center gap-2"><Cpu className="h-5 w-5 text-primary"/><div><h2 className="text-lg font-bold">ESP32-Hardware</h2><p className="text-sm text-muted-foreground">Relay, Crash-Taster und weitere Chips.</p></div></div>
    {chips.length === 0 && <p className="text-sm text-muted-foreground">Noch kein ESP32 registriert. Discovery-Beacon und WLAN prüfen.</p>}
    {chips.map(chip => {
      const hasLights = chip.capabilities.includes('lights');
      const actualOn = chip.reportedState.lights === true, wantedOn = chip.desiredState.lights === true;
      const pendingState = hasLights && actualOn !== wantedOn;
      return <Card key={chip.id}>
        <CardContent className="flex flex-col gap-4 pt-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`size-2.5 shrink-0 rounded-full ${chip.online ? 'bg-success' : 'bg-muted-foreground'}`}/>
              <div className="min-w-0"><p className="font-semibold">{chip.name}</p><p className="truncate text-xs text-muted-foreground">{chip.type} · {chip.ipAddress ?? 'keine IP'} · Firmware {chip.firmwareVersion ?? 'unbekannt'}</p></div>
            </div>
            <Badge variant={chip.online ? 'success' : 'secondary'}>{chip.online ? 'online' : `offline · ${relativeTime(chip.lastSeenAt)}`}</Badge>
          </div>
          {hasLights && <div className="flex flex-col justify-between gap-3 border-t border-border pt-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2"><Lightbulb className={`h-5 w-5 ${actualOn ? 'text-primary' : 'text-muted-foreground'}`}/><div><p className="text-sm font-semibold">Lichter: {actualOn ? 'AN' : 'AUS'}</p><p className="text-xs text-muted-foreground">{pendingState ? `Schaltbefehl ${wantedOn ? 'AN' : 'AUS'} wird übertragen…` : 'Ist- und Sollzustand synchron'}</p></div></div>
            <div className="grid grid-cols-2 gap-2 sm:w-56">
              <Button variant={actualOn ? 'default' : 'outline'} disabled={!chip.online || changing === chip.id} onClick={() => void setLights(chip, true)}>AN</Button>
              <Button variant={!actualOn ? 'secondary' : 'outline'} disabled={!chip.online || changing === chip.id} onClick={() => void setLights(chip, false)}>AUS</Button>
            </div>
          </div>}
          <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row">
            <Input value={names[chip.id] ?? ''} onChange={event => setNames(value => ({ ...value, [chip.id]: event.target.value }))} className="h-9" aria-label="Chip-Name"/>
            <Button size="sm" variant="outline" onClick={() => void saveName(chip)}>Name speichern</Button>
          </div>
        </CardContent>
      </Card>;
    })}
  </section>;
}

// Every wristband — single registration or bulk import — starts with this fixed amount; see the
// matching constant and comment in wristband-import.service.ts on the backend.
const STARTING_BALANCE_CENTS = 500;
const WRISTBAND_PAGE_SIZE = 25;

function WristbandPanel({ api }: { api: Api }) {
  const [bandNumber, setBandNumber] = useState(''); const [uid, setUid] = useState('');
  const [kind, setKind] = useState<'NFC' | 'TYVEK'>('NFC');
  const [grantDrink,setGrantDrink]=useState(false),[registering,setRegistering]=useState(false);const registrationLock=useRef(false);const canGrant=api.roles().some(r=>r==='ADMIN'||r==='PAYMENT_LEAD');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | Wristband['status']>('ALL');
  const [page, setPage] = useState(0);
  const [wristbands, setWristbands] = useState<Wristband[]>([]);
  const [loading, setLoading] = useState(true);
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => api.wristbands().then(setWristbands).catch(e => toast.error(e.message)).finally(() => setLoading(false));
  useEffect(() => { void refresh() }, [api]);

  async function register() {
    if(registrationLock.current)return;registrationLock.current=true;setRegistering(true);
    try {
      await api.registerWristband({ bandNumber, kind, uid: kind === 'NFC' ? uid : undefined, initialBalanceCents: canGrant?STARTING_BALANCE_CENTS:0,freeDrink:canGrant&&grantDrink });
      toast.success(`${kind === 'TYVEK' ? 'Tyvek-Armband' : 'NFC-Armband'} ${bandNumber} mit ${euro(canGrant?STARTING_BALANCE_CENTS:0)} Startguthaben registriert`);
      setBandNumber(''); setUid('');setGrantDrink(false); await refresh();
    } catch (e) { toast.error((e as Error).message) }finally{registrationLock.current=false;setRegistering(false)}
  }

  async function importFile(file: File) {
    setImporting(true); setImportResult(null);
    try {
      const result = await api.importWristbands(file);
      setImportResult(result);
      if (result.errors.length) toast.warning(`${result.imported} importiert, ${result.errors.length} Fehler`);
      else toast.success(`${result.imported} Armbänder importiert`);
      await refresh();
    } catch (e) { toast.error((e as Error).message) } finally { setImporting(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const counts = wristbands.reduce<Record<string, number>>((all, w) => { all[w.status] = (all[w.status] ?? 0) + 1; return all }, {});
  const matching = wristbands.filter(band => {
    if (statusFilter !== 'ALL' && band.status !== statusFilter) return false;
    const needle = search.trim().toLocaleLowerCase('de');
    return !needle || band.bandNumber.toLocaleLowerCase('de').includes(needle) || band.uidHex?.toLocaleLowerCase('de').includes(needle) || band.kind.toLocaleLowerCase('de').includes(needle) || band.status.toLocaleLowerCase('de').includes(needle);
  });
  // Several hundred rows at once is what made this page crawl on the older phones; one page of
  // 25 keeps the DOM small and the search is the primary way in anyway.
  const pageCount = Math.max(1, Math.ceil(matching.length / WRISTBAND_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleWristbands = matching.slice(safePage * WRISTBAND_PAGE_SIZE, (safePage + 1) * WRISTBAND_PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      {api.roles().some(r=>["TOPUP","ADMIN","PAYMENT_LEAD"].includes(r))&&<Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Nfc className="h-4 w-4" />Armband hinzufügen</CardTitle><CardDescription>NFC-Armband scannen oder ein Tyvek-Armband nur über seine aufgedruckte Nummer anlegen.</CardDescription></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={kind === 'NFC' ? 'default' : 'outline'} onClick={() => setKind('NFC')}><Nfc className="h-4 w-4"/>NFC</Button>
            <Button type="button" variant={kind === 'TYVEK' ? 'default' : 'outline'} onClick={() => { setKind('TYVEK'); setUid('') }}>Tyvek</Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5"><Label htmlFor="new-band-number">Aufgedruckte Armbandnummer</Label><Input id="new-band-number" value={bandNumber} onChange={e => setBandNumber(e.target.value)} placeholder={kind === 'TYVEK' ? 'z. B. T-0123' : 'z. B. 0123'} /></div>
            <div className="flex flex-col gap-1.5"><Label>Startguthaben</Label><div className="flex h-11 items-center rounded-md border border-input bg-muted/40 px-3 font-bold tabular-nums">{euro(canGrant?STARTING_BALANCE_CENTS:0)}</div><p className="text-xs text-muted-foreground">Kostenloses Startguthaben kann nur die Leitung vergeben.</p></div>
          </div>
          {kind === 'NFC'
            ? <UidScanner uid={uid} setUid={setUid} api={api} hideNotFoundHint />
            : <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">Tyvek benötigt keinen Chip. Bezahlt wird später durch Eingabe oder Scan der aufgedruckten Nummer.</div>}
          {canGrant&&<label className="flex items-center gap-3 rounded-xl border p-3 text-sm font-semibold"><input type="checkbox" className="size-6" checked={grantDrink} disabled={registering} onChange={e=>setGrantDrink(e.target.checked)}/>Ein Freigetränk zusätzlich freigeben</label>}
          <Button size="lg" disabled={registering||!bandNumber.trim() || (kind === 'NFC' && !uid)} onClick={register}>{kind === 'TYVEK' ? 'Tyvek-Armband anlegen' : 'NFC-Armband registrieren'}</Button>
        </CardContent>
      </Card>}

      {api.roles().includes("ADMIN")&&<Card>
        <CardHeader><CardTitle>Massenimport (Excel oder CSV)</CardTitle><CardDescription>Spalten Armbandnummer/Band_Number und UID/NFC_UID. Jedes importierte Armband bekommt automatisch {euro(STARTING_BALANCE_CENTS)} Startguthaben. Alles-oder-nichts – bei Fehlern wird nichts übernommen.</CardDescription></CardHeader>
        <CardContent>
          <input ref={fileRef} type="file" accept=".xlsx,.csv" disabled={importing}
            onChange={e => { const f = e.target.files?.[0]; if (f) void importFile(f) }}
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-semibold" />
          {importResult && (
            <div className="rounded-md border border-border p-3 text-sm">
              <p className="font-semibold">{importResult.imported} Armbänder importiert</p>
              {importResult.errors.length > 0 && <ul className="mt-2 flex flex-col gap-1 text-destructive text-xs max-h-40 overflow-auto">{importResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
            </div>
          )}
        </CardContent>
      </Card>}

      <section className="border-t-2 border-primary pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="text-lg font-bold">Alle Armbänder ({wristbands.length})</h2><p className="text-sm text-muted-foreground">Vollständige Admin-Übersicht inklusive Start- und aktuellem Guthaben.</p></div>
          <Input value={search} onChange={event => { setSearch(event.target.value); setPage(0) }} placeholder="Nummer, UID, Typ oder Status suchen" className="sm:max-w-sm" aria-label="Armbänder durchsuchen"/>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(['ALL', 'ACTIVE', 'BLOCKED', 'RETIRED', 'IMPORTED'] as const).map(status => (
            <Button key={status} size="sm" variant={statusFilter === status ? 'default' : 'outline'} onClick={() => { setStatusFilter(status); setPage(0) }}>
              {status === 'ALL' ? `Alle: ${wristbands.length}` : `${status}: ${counts[status] ?? 0}`}
            </Button>
          ))}
          <Badge variant="outline" className="self-center">NFC: {wristbands.filter(band => band.kind === 'NFC').length}</Badge>
          <Badge variant="outline" className="self-center">Tyvek: {wristbands.filter(band => band.kind === 'TYVEK').length}</Badge>
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nummer</TableHead><TableHead>Typ</TableHead><TableHead>UID</TableHead><TableHead>Status</TableHead>
                <TableHead className="text-right">Start</TableHead><TableHead className="text-right">Aktuell</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && Array.from({ length: 4 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 6 }).map((__, c) => <TableCell key={c}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>)}
              {!loading && visibleWristbands.map(band => <TableRow key={band.id}>
                <TableCell><p className="font-bold">{band.bandNumber}</p>{band.freeDrinkStatus==='AVAILABLE'&&<p className="text-xs font-semibold text-success">Freigetränk offen</p>}{band.freeDrinkStatus==='REDEEMED'&&<p className="text-xs text-muted-foreground">Freigetränk eingelöst</p>}<p className="text-xs text-muted-foreground">angelegt {new Date(band.createdAt).toLocaleDateString('de-DE')}</p></TableCell>
                <TableCell><Badge variant="outline">{band.kind === 'TYVEK' ? 'Tyvek' : 'NFC'}</Badge></TableCell>
                <TableCell className="max-w-40 truncate font-mono text-xs">{band.uidHex ?? '– ohne Chip –'}</TableCell>
                <TableCell><Badge variant={band.status === 'ACTIVE' ? 'success' : band.status === 'BLOCKED' ? 'destructive' : 'secondary'}>{band.status}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{euro(band.initialBalanceCents ?? 0)}</TableCell>
                <TableCell className="text-right font-bold tabular-nums text-primary">{band.balanceCents == null ? '–' : euro(band.balanceCents)}</TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
          {!loading && visibleWristbands.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">Keine passenden Armbänder gefunden.</p>}
        </div>
        {pageCount > 1 && (
          <div className="mt-3 flex items-center justify-between">
            <Button size="sm" variant="outline" disabled={safePage === 0} onClick={() => setPage(p => Math.max(0, p - 1))}><ChevronLeft className="h-4 w-4" />Zurück</Button>
            <p className="text-sm text-muted-foreground">Seite {safePage + 1} von {pageCount} · {matching.length} Treffer</p>
            <Button size="sm" variant="outline" disabled={safePage >= pageCount - 1} onClick={() => setPage(p => p + 1)}>Weiter<ChevronRight className="h-4 w-4" /></Button>
          </div>
        )}ja 
      </section>
    </div>
  );
}

function cashAmount(value:string){return /^\d+(?:[.,]\d{1,2})?$/.test(value.trim())?toCents(value):NaN}
function CashCloseCard({api,session,onChanged,readOnly}:{api:Api;session:OpenCashSession;onChanged:()=>Promise<void>;readOnly:boolean}){
  const [counted,setCounted]=useState('');const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);const guard=useRef(false);
  const amount=cashAmount(counted), valid=Number.isSafeInteger(amount)&&amount>=0&&amount<=1000000;
  const difference=amount-session.expectedCashCents;
  async function close(){if(guard.current||!valid||readOnly||(difference!==0&&reason.trim().length<5))return;guard.current=true;setBusy(true);try{const r=await api.closeCashSession(session.id,session.expectedCashCents,amount,reason.trim()||undefined);toast.success(`${session.terminalName}: geschlossen · Differenz ${euro(r.differenceCents)}`);setCounted('');setReason('');await onChanged()}catch(e){toast.error((e as Error).message);await onChanged()}finally{guard.current=false;setBusy(false)}}
  return <Card><CardHeader><CardTitle>{session.terminalName}</CardTitle><CardDescription>{session.operatorName} · seit {new Date(session.openedAt).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</CardDescription></CardHeader><CardContent><div className="grid grid-cols-3 gap-2 text-sm"><div>Start<p className="font-bold">{euro(session.openingCashCents)}</p></div><div>Bewegungen<p className="font-bold">{euro(session.movementsCents)}</p></div><div>Soll<p className="font-bold text-primary">{euro(session.expectedCashCents)}</p></div></div>{!readOnly&&<><Label>Gezähltes Bargeld (€)</Label><Input aria-label={`Gezähltes Bargeld ${session.terminalName}`} inputMode="decimal" placeholder="Tatsächlichen Bestand eingeben" value={counted} disabled={busy} onChange={e=>setCounted(e.target.value)}/>{valid&&difference!==0&&<><p className="text-sm text-destructive">Differenz: {euro(difference)}</p><Label>Grund für die Differenz</Label><Input aria-label="Grund für die Differenz" value={reason} maxLength={500} disabled={busy} onChange={e=>setReason(e.target.value)}/></>}<Button disabled={busy||!valid||(difference!==0&&reason.trim().length<5)} onClick={()=>void close()}>{busy?'Wird geschlossen…':'Kasse schließen'}</Button></>}</CardContent></Card>
}
function CashPanel({api,closingOnly=false,onChanged}:{api:Api;closingOnly?:boolean;onChanged?:()=>Promise<void>}){
  const roles=api.roles(),lead=roles.some(r=>r==='ADMIN'||r==='PAYMENT_LEAD'),all=lead||roles.includes('AUDITOR'),canOpen=lead||roles.includes('TOPUP');
  const [sessions,setSessions]=useState<OpenCashSession[]|null>(null);const [phase,setPhase]=useState<EventPhase|null>(null);const [opening,setOpening]=useState('0');const [busy,setBusy]=useState(false);const guard=useRef(false);const sequence=useRef(0);const [error,setError]=useState('');
  async function refresh(){const n=++sequence.current;try{const [rows,event]=await Promise.all([all?api.cashSessions():api.cashSession().then(x=>x?[x]:[]),api.eventState()]);if(n===sequence.current){setSessions(rows);setPhase(event.phase);setError('')}}catch(e){if(n===sequence.current)setError((e as Error).message)}}
  useEffect(()=>{void refresh();const timer=setInterval(refresh,5000);return()=>{clearInterval(timer);sequence.current++}},[api,all]);
  async function changed(){await refresh();await onChanged?.()}
  const own=sessions?.some(s=>s.terminalId===api.terminalId());const cents=cashAmount(opening);
  async function open(){if(guard.current||!canOpen||!Number.isSafeInteger(cents)||cents<0||cents>100000)return;guard.current=true;setBusy(true);try{await api.openCashSession(cents);toast.success('Kasse geöffnet');await changed()}catch(e){toast.error((e as Error).message);await refresh()}finally{guard.current=false;setBusy(false)}}
  return <div className="flex flex-col gap-3">{error&&<p role="alert" className="text-sm text-destructive">{error} <Button variant="outline" size="sm" onClick={()=>void refresh()}>Neu laden</Button></p>}{sessions===null?<Skeleton className="h-24 w-full"/>:sessions.length===0?<p className="rounded-lg border p-3 text-sm font-semibold">Keine offene Kasse.</p>:sessions.map(s=><CashCloseCard key={`${s.id}:${s.expectedCashCents}`} api={api} session={s} onChanged={changed} readOnly={!lead&&!(roles.includes('TOPUP')&&s.terminalId===api.terminalId())}/>)}{!closingOnly&&!own&&sessions!==null&&canOpen&&(phase==='PREPARING'||phase==='OPEN')&&<Card><CardHeader><CardTitle>Eigene Kasse eröffnen</CardTitle><CardDescription>Nur falls an diesem Terminal Bargeld angenommen wird.</CardDescription></CardHeader><CardContent><Label>Startbestand (€)</Label><Input inputMode="decimal" value={opening} disabled={busy} onChange={e=>setOpening(e.target.value)}/><Button disabled={busy||!Number.isSafeInteger(cents)||cents<0||cents>100000} onClick={()=>void open()}>Kasse eröffnen</Button></CardContent></Card>}</div>
}

// Mirrors CRASH_DEFAULT_MINUTES on the API, which the physical crash button uses.
const CRASH_DEFAULT_MINUTES = 2;
const SELLOUT_DEFAULT_MINUTES = 20;

function CrashPanel({ api }: { api: Api }) {
  const [minutes, setMinutes] = useState(String(CRASH_DEFAULT_MINUTES));
  const [health, setHealth] = useState<any>();
  const [confirmKind, setConfirmKind] = useState<'CRASH' | 'AUSVERKAUF' | null>(null);
  const refresh = () => api.health().then(setHealth).catch(e => toast.error(e.message));
  useEffect(() => { void refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t) }, [api]);
  const crashUntil = health?.state?.crashUntil ?? 0, crashing = crashUntil > Date.now();
  const action = async (fn: () => Promise<any>, message: string) => { try { await fn(); toast.success(message); await refresh() } catch (e) { toast.error((e as Error).message) } };
  const clampedMinutes = Math.max(1, Math.min(30, Number(minutes) || (confirmKind === 'AUSVERKAUF' ? SELLOUT_DEFAULT_MINUTES : CRASH_DEFAULT_MINUTES)));
  return (
    <Card>
      <CardHeader><CardTitle>Börsencrash</CardTitle><CardDescription>Alle Preise für ein paar Minuten auf Tiefstpreis – das Display kündigt es groß an.</CardDescription></CardHeader>
      <CardContent>
        {crashing && <Badge variant="destructive">{health.state.crashKind === 'AUSVERKAUF' ? 'Ausverkauf' : 'Crash'} läuft noch bis {new Date(crashUntil).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</Badge>}
        <div className="flex flex-col gap-1.5">
          <Label>Minuten</Label>
          <Input inputMode="numeric" value={minutes} onChange={e => setMinutes(e.target.value)} />
          <div className="flex gap-1.5 flex-wrap">
            {[2, 3, 5, 10, 15, 20].map(n => (
              <Button key={n} type="button" size="sm" variant={minutes === String(n) ? 'default' : 'outline'} onClick={() => setMinutes(String(n))}>{n}′</Button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="destructive" disabled={crashing} onClick={() => setConfirmKind('CRASH')}>Crash auslösen</Button>
          <Button variant="secondary" disabled={crashing} onClick={() => setConfirmKind('AUSVERKAUF')}>Ausverkauf starten</Button>
        </div>
        <Button variant="outline" disabled={!crashing} onClick={() => action(() => api.stopCrash(), 'Beendet')}>Beenden</Button>
      </CardContent>

      <AlertDialog open={Boolean(confirmKind)} onOpenChange={open => { if (!open) setConfirmKind(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmKind === 'CRASH' ? 'Börsencrash' : 'Ausverkauf'} für {clampedMinutes} Minuten auslösen?</AlertDialogTitle>
            <AlertDialogDescription>Das öffentliche Display kündigt es sofort groß an und alle Preise fallen auf Tiefstpreis. Das betrifft alle Gäste live.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (!confirmKind) return; void action(() => api.startCrash(clampedMinutes, confirmKind), confirmKind === 'CRASH' ? 'Crash gestartet' : 'Ausverkauf gestartet').then(() => setConfirmKind(null)) }}>Jetzt auslösen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

const APPROVAL_TYPE_LABEL: Record<string, string> = { REFUND: 'Storno', WRISTBAND_REPLACE: 'Armbandwechsel', ACTIVATE_NORMAL: 'NORMAL aktivieren' };
// Renders what's actually in each approval's payload instead of a raw JSON dump, so the second
// reviewer can judge the request (amount, which bands, which reason) at a glance.
function ApprovalPayload({ type, payload }: { type: string; payload: any }) {
  if (type === 'REFUND') return <p className="text-sm">Bestellung <span className="font-mono text-xs">{String(payload.orderId).slice(0, 8)}</span> · <span className="font-bold">{euro(payload.amountCents)}</span> · {payload.reason}</p>;
  if (type === 'WRISTBAND_REPLACE') return <p className="text-sm"><span className="font-mono text-xs">{payload.oldUid}</span> → <span className="font-mono text-xs">{payload.newUid}</span> · {payload.reason}</p>;
  if (type === 'ACTIVATE_NORMAL') return <p className="text-sm">{payload.reason}{payload.previousMode && <span className="text-muted-foreground"> · bisher {payload.previousMode}</span>}</p>;
  return <p className="text-xs text-muted-foreground break-all">{JSON.stringify(payload)}</p>;
}

function ApprovalPanel({ api }: { api: Api }) {
  const [items, setItems] = useState<any[]>([]);
  const [normalReason, setNormalReason] = useState('Vor-Ort-Prüfung erfolgreich');
  const [rejectReason, setRejectReason] = useState('Antrag nicht freigegeben');
  const [confirmTarget, setConfirmTarget] = useState<{ item: any; kind: 'approve' | 'reject' } | null>(null);
  const [backups, setBackups] = useState<any[]>([]); const [reports, setReports] = useState<any[]>([]);
  const refresh = async () => { try { setItems(await api.approvals()); setBackups(await api.backups()); setReports(await api.signedReports()) } catch (e) { toast.error((e as Error).message) } };
  useEffect(() => { void refresh() }, [api]);
  const action = async (fn: () => Promise<any>, message: string) => { try { await fn(); toast.success(message); await refresh() } catch (e) { toast.error((e as Error).message) } };
  const pending = items.filter(x => x.status === 'PENDING');
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Lock className="h-4 w-4" />NORMAL-Betrieb beantragen</CardTitle><CardDescription>Storno und Armbandwechsel werden jetzt direkt in der Kunde-Ansicht beantragt (Armband scannen). Beides landet hier zur Freigabe.</CardDescription></CardHeader>
        <CardContent>
          <ReasonPicker label="NORMAL-Begründung" value={normalReason} onChange={setNormalReason} presets={['Vor-Ort-Prüfung erfolgreich', 'Kassensturz abgeschlossen', 'Testphase beendet']} />
          <Button size="sm" variant="outline" onClick={() => action(() => api.requestNormalMode(normalReason), 'NORMAL-Freigabe beantragt')}>NORMAL beantragen</Button>
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Offene Anträge ({pending.length})</CardTitle></CardHeader>
          <CardContent>
            <ReasonPicker label="Ablehnungsgrund" value={rejectReason} onChange={setRejectReason} presets={['Antrag nicht freigegeben', 'Nicht plausibel', 'Rücksprache nötig']} />
            <div className="flex flex-col gap-2">
              {pending.map(x => (
                <div key={x.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Badge variant="outline" className="mb-1">{APPROVAL_TYPE_LABEL[x.type] ?? x.type}</Badge>
                    <ApprovalPayload type={x.type} payload={x.payload} />
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" onClick={() => setConfirmTarget({ item: x, kind: 'approve' })}><Unlock className="h-4 w-4" />Freigeben</Button>
                    <Button size="sm" variant="outline" onClick={() => setConfirmTarget({ item: x, kind: 'reject' })}>Ablehnen</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Abschlussnachweise &amp; Sicherungen</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between"><p className="text-sm">{reports.length} signierte Berichte</p><Button size="sm" variant="outline" onClick={() => action(() => api.createSignedReport(), 'Signierter Abschlussbericht erstellt')}>Bericht signieren</Button></div>
          <div className="flex items-center justify-between"><p className="text-sm">{backups.filter(b=>b.status==='VERIFIED').length} verifizierte Sicherungen</p><Button size="sm" variant="outline" onClick={() => action(async () => {const b=await api.createBackup();if(b.status!=='VERIFIED')throw new Error('Backup gespeichert, aber Buchhaltung inkonsistent.');}, 'Backup erstellt und geprüft')}>Backup erstellen</Button></div>
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(confirmTarget)} onOpenChange={open => { if (!open) setConfirmTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTarget?.kind === 'approve' ? 'Antrag freigeben?' : 'Antrag ablehnen?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget && <>{APPROVAL_TYPE_LABEL[confirmTarget.item.type] ?? confirmTarget.item.type}: <ApprovalPayload type={confirmTarget.item.type} payload={confirmTarget.item.payload} /></>}
              {confirmTarget?.kind === 'approve' && ' Diese Aktion wird sofort ausgeführt (Geld bewegt oder Armband getauscht) und lässt sich nicht rückgängig machen.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className={confirmTarget?.kind === 'reject' ? buttonVariants({ variant: 'outline' }) : undefined}
              onClick={() => { if (!confirmTarget) return; const { item, kind } = confirmTarget; void action(() => kind === 'approve' ? api.approve(item.id) : api.reject(item.id, rejectReason), kind === 'approve' ? 'Antrag freigegeben' : 'Antrag abgelehnt').then(() => setConfirmTarget(null)) }}
            >
              {confirmTarget?.kind === 'approve' ? 'Freigeben' : 'Ablehnen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const TEAM_ROLES = [
  {id:'BAR', label:'Kasse / Getränke verkaufen'}, {id:'TOPUP', label:'Guthaben aufladen'},
  {id:'MARKET_MANAGER', label:'Börsensteuerung'}, {id:'PAYMENT_LEAD', label:'Zahlungsleitung'},
  {id:'ADMIN', label:'Administration'}, {id:'AUDITOR', label:'Prüfung / Berichte'},
];
const teamPinRoles = (roles: string[]) => roles.length > 0 && roles.every(r => r === 'BAR' || r === 'TOPUP');
function RoleCheckboxes({ roles, change, disabled }: { roles: string[]; change: (roles: string[]) => void; disabled?: boolean }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{TEAM_ROLES.map(r => <label key={r.id} className="flex items-center gap-3 rounded-md border border-border p-3 text-sm cursor-pointer"><input type="checkbox" className="h-5 w-5 accent-primary" checked={roles.includes(r.id)} disabled={disabled} onChange={e => change(e.target.checked ? [...roles,r.id] : roles.filter(x=>x!==r.id))}/>{r.label}</label>)}</div>;
}
function UserPanel({ api }: { api: Api }) {
  const [users, setUsers] = useState<any[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<string[]>(['BAR']);
  const [editing, setEditing] = useState<any>(null);
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editPassword, setEditPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const refresh = () => api.users().then(setUsers).catch(e => toast.error(e.message));
  useEffect(() => { void refresh() }, [api]);
  const action = async (fn: () => Promise<any>, done?: () => void) => { if(lock.current)return; lock.current=true;setBusy(true);try { await fn(); done?.(); toast.success('Änderung gespeichert'); await refresh() } catch (e) { toast.error((e as Error).message) } finally { lock.current=false;setBusy(false) } };
  const needsPassword = editing && teamPinRoles(editing.roles) && !teamPinRoles(editRoles);
  return <div className="flex flex-col gap-4">
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" />Neues Konto</CardTitle><CardDescription>Bar und Aufladung verwenden die Team-PIN. Leitungsrollen benötigen ein eigenes Passwort.</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-3">
      <Label htmlFor="new-user">Benutzername</Label><Input id="new-user" value={username} onChange={e=>setUsername(e.target.value)} />
      <RoleCheckboxes roles={roles} change={setRoles} disabled={busy} />
      {!teamPinRoles(roles)&&<><Label htmlFor="new-password">Persönliches Passwort (mind. 12 Zeichen)</Label><Input id="new-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} /></>}
      <Button disabled={busy||!username.trim()||!roles.length||(!teamPinRoles(roles)&&password.length<12)} onClick={()=>action(()=>api.createUser(username,teamPinRoles(roles)?'':password,roles),()=>{setUsername('');setPassword('');setRoles(['BAR'])})}>Konto anlegen</Button>
    </CardContent></Card>
    {users.map(u=><Card key={u.id}><CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4">
      <div className="min-w-0"><p className="font-semibold break-all">{u.username}</p><p className="text-xs text-muted-foreground">{u.roles.map((r:string)=>TEAM_ROLES.find(x=>x.id===r)?.label??r).join(' · ')} · {u.active?'aktiv':'deaktiviert'}{u.lockedUntil>Date.now()?' · gesperrt':''}</p></div>
      <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={()=>{setEditing(u);setEditRoles([...u.roles]);setEditPassword('')}}>Berechtigungen</Button>
        {u.lockedUntil>Date.now()&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>action(()=>api.unlockUser(u.id))}>Entsperren</Button>}
        <Button size="sm" variant="outline" disabled={busy} onClick={()=>action(()=>api.setUserActive(u.id,!u.active))}>{u.active?'Deaktivieren':'Aktivieren'}</Button></div>
    </CardContent></Card>)}
    <Dialog open={Boolean(editing)} onOpenChange={open=>{if(!open&&!busy)setEditing(null)}}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Berechtigungen: {editing?.username}</DialogTitle><DialogDescription>Änderungen gelten sofort für laufende Sitzungen. Bei Wechsel zur Leitung ist eine neue Anmeldung erforderlich.</DialogDescription></DialogHeader>
      <RoleCheckboxes roles={editRoles} change={setEditRoles} disabled={busy}/>
      {needsPassword&&<div className="flex flex-col gap-2"><Label htmlFor="edit-password">Neues persönliches Passwort (mind. 12 Zeichen)</Label><Input id="edit-password" type="password" value={editPassword} onChange={e=>setEditPassword(e.target.value)}/></div>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setEditing(null)}>Abbrechen</Button><Button disabled={busy||!editRoles.length||Boolean(needsPassword&&editPassword.length<12)} onClick={()=>editing&&action(()=>api.setUserRoles(editing.id,editRoles,needsPassword?editPassword:undefined),()=>{setEditing(null);setEditPassword('')})}>Speichern</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
