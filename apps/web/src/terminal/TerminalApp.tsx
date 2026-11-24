import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Beer, ChevronLeft, ChevronRight, CreditCard, Landmark, LineChart, Lock, LogOut, Nfc, Plus, Settings2, ShieldCheck, Unlock, Users, Wallet,
} from 'lucide-react';
import { Api, type AdminProduct, type Product, uuid } from '@/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Toaster } from '@/components/ui/sonner';

declare global { interface Window { onNfcUid?: (uid: string) => void; NDEFReader?: new () => { scan(): Promise<void>; onreading: ((e: any) => void) | null } } }
const nfcSupported = typeof window !== 'undefined' && 'NDEFReader' in window && window.isSecureContext;
const euro = (c: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(c / 100);
const toCents = (v: string) => Math.round(Number(v.replace(',', '.')) * 100);

type PendingOperation = { type: 'purchase'; key: string; uid: string; quoteId: string } | { type: 'topup'; key: string; uid: string; amountCents: number };
const loadPending = () => { try { return JSON.parse(localStorage.getItem('pending-operation') ?? 'null') as PendingOperation | null } catch { return null } };

type View = 'pos' | 'topup' | 'products' | 'market' | 'ops';
const NAV: { id: View; label: string; icon: typeof Beer }[] = [
  { id: 'pos', label: 'Kasse', icon: Beer },
  { id: 'topup', label: 'Aufladung', icon: Wallet },
  { id: 'products', label: 'Getränke', icon: Settings2 },
  { id: 'market', label: 'Kurse', icon: LineChart },
  { id: 'ops', label: 'Betrieb', icon: ShieldCheck },
];

export default function TerminalApp() {
  const api = useMemo(() => new Api(), []);
  const [authenticated, setAuthenticated] = useState(api.hasToken());
  const [view, setView] = useState<View>('pos');
  const [uid, setUid] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [health, setHealth] = useState<any>();
  const [pending, setPending] = useState<PendingOperation | null>(loadPending);
  const [nfcActive, setNfcActive] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === '1');
  const submittingRef = useRef(false);
  function toggleCollapsed() { setCollapsed(c => { localStorage.setItem('sidebar-collapsed', c ? '0' : '1'); return !c }) }

  useEffect(() => {
    window.onNfcUid = (x) => { setUid(x); toast.info(`Armband gelesen: ${x}`) };
    return () => { delete window.onNfcUid };
  }, []);
  useEffect(() => {
    const refresh = () => { api.products().then(setProducts).catch(() => {}); api.health().then(setHealth).catch(() => setHealth({ ok: false })) };
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [api]);

  async function startNfc() {
    try {
      const reader = new window.NDEFReader!();
      await reader.scan();
      setNfcActive(true);
      reader.onreading = (e: any) => {
        const raw = String(e.serialNumber ?? '').replace(/[:-]/g, '').toUpperCase();
        if (raw) { setUid(raw); toast.info(`Armband gelesen (Web NFC): ${raw}`) }
      };
    } catch (e) { toast.error(`NFC konnte nicht gestartet werden: ${(e as Error).message}`) }
  }

  function remember(x: PendingOperation | null) {
    setPending(x);
    if (x) localStorage.setItem('pending-operation', JSON.stringify(x));
    else localStorage.removeItem('pending-operation');
  }

  async function execute(x: PendingOperation) {
    try {
      if (x.type === 'purchase') {
        const r = await api.purchase(x.uid, x.quoteId, x.key);
        toast.success(`Bezahlt: ${euro(r.totalCents)} · Rest ${euro(r.balanceCents)}`);
        setCart({});
      } else {
        const r = await api.topup(x.uid, x.amountCents, 'CASH', undefined, x.key);
        toast.success(`Aufgeladen: ${euro(x.amountCents)} · Neu ${euro(r.balanceCents)}`);
      }
      remember(null); setUid('');
    } catch (e) {
      toast.error(`ERGEBNIS UNGEKLÄRT: ${(e as Error).message}`, { description: 'Mit „Vorgang erneut prüfen“ denselben Schlüssel wiederverwenden.', duration: 15000 });
    }
  }

  async function pay() {
    if (pending || submittingRef.current) return toast.warning('Zuerst den ungeklärten Vorgang prüfen.');
    submittingRef.current = true;
    try {
      const items = Object.entries(cart).filter(([, q]) => q).map(([productId, quantity]) => ({ productId, quantity }));
      const q = await api.quote(items);
      const x: PendingOperation = { type: 'purchase', key: uuid(), uid, quoteId: q.quoteId };
      remember(x); await execute(x);
    } catch (e) { toast.error(`NICHT BEZAHLT: ${(e as Error).message}`) } finally { submittingRef.current = false }
  }

  async function topup(amount: number) {
    if (pending || submittingRef.current) return toast.warning('Zuerst den ungeklärten Vorgang prüfen.');
    submittingRef.current = true;
    try {
      const x: PendingOperation = { type: 'topup', key: uuid(), uid, amountCents: amount };
      remember(x); await execute(x);
    } finally { submittingRef.current = false }
  }

  if (!authenticated) return <Login api={api} done={() => setAuthenticated(true)} />;

  const mode = health?.state?.mode ?? 'VERBINDUNG…';
  const connected = Boolean(health?.ok);

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col sm:flex-row">
      <Toaster position="top-center" richColors closeButton />
      {/* Sidebar on tablet/desktop */}
      <aside className={`hidden sm:flex sm:flex-col sm:border-r sm:border-border sm:p-3 sm:gap-1 transition-[width] shrink-0 ${collapsed ? 'sm:w-[4.5rem]' : 'sm:w-56'}`}>
        <div className={`flex items-center px-1 pb-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <div>
              <p className="font-bold text-lg">Börsenparty</p>
              <Badge variant={connected ? 'success' : 'destructive'} className="mt-2">{mode}</Badge>
            </div>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={toggleCollapsed} title={collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}>
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
        {collapsed && <Badge variant={connected ? 'success' : 'destructive'} className="mx-auto mb-2 px-1.5 text-[10px]">{connected ? 'OK' : '!'}</Badge>}
        {NAV.map(n => (
          <button key={n.id} onClick={() => setView(n.id)} title={n.label}
            className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${collapsed ? 'justify-center' : ''} ${view === n.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
            <n.icon className="h-4 w-4 shrink-0" /> {!collapsed && n.label}
          </button>
        ))}
        <div className="mt-auto flex flex-col gap-2 pt-4">
          {nfcSupported && <Button variant={nfcActive ? 'success' : 'outline'} size="sm" onClick={startNfc} disabled={nfcActive} title="NFC aktivieren" className={collapsed ? 'px-0' : ''}><Nfc className="h-4 w-4 shrink-0" />{!collapsed && (nfcActive ? 'NFC aktiv' : 'NFC aktivieren')}</Button>}
          <Button variant="ghost" size="sm" onClick={() => { api.setToken(''); location.reload() }} title="Abmelden" className={collapsed ? 'px-0' : ''}><LogOut className="h-4 w-4 shrink-0" />{!collapsed && 'Abmelden'}</Button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sm:hidden flex items-center justify-between px-4 py-3 border-b border-border">
        <p className="font-bold">Börsenparty</p>
        <div className="flex items-center gap-2">
          {nfcSupported && <Button variant={nfcActive ? 'success' : 'outline'} size="sm" onClick={startNfc} disabled={nfcActive}><Nfc className="h-4 w-4" /></Button>}
          <Badge variant={connected ? 'success' : 'destructive'}>{mode}</Badge>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-24 sm:pb-4 sm:p-6 max-w-3xl w-full mx-auto">
        {pending && (
          <Card className="mb-4 border-primary/50">
            <CardContent className="flex items-center justify-between py-4 gap-3">
              <div>
                <p className="text-sm font-medium">Ungeklärter Vorgang vom letzten Versuch</p>
                <p className="text-xs text-muted-foreground">{pending.type === 'purchase' ? 'Zahlung' : 'Aufladung'} · Armband {pending.uid}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={() => { remember(null); toast.info('Verworfen – neuen Versuch starten.') }}>Verwerfen</Button>
                <Button size="sm" onClick={() => execute(pending)}>Erneut prüfen</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {view === 'pos' && <PosView uid={uid} setUid={setUid} products={products} cart={cart} setCart={setCart} onPay={pay} disabled={Boolean(pending)} />}
        {view === 'topup' && <TopupView uid={uid} setUid={setUid} onTopup={topup} disabled={Boolean(pending)} />}
        {view === 'products' && <ProductsView api={api} />}
        {view === 'market' && <MarketView products={products} />}
        {view === 'ops' && <OpsView api={api} health={health} />}
      </main>

      {/* Bottom tab bar on mobile */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 border-t border-border bg-card/95 backdrop-blur grid grid-cols-5">
        {NAV.map(n => (
          <button key={n.id} onClick={() => setView(n.id)} className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${view === n.id ? 'text-primary' : 'text-muted-foreground'}`}>
            <n.icon className="h-5 w-5" /> {n.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function UidScanner({ uid, setUid }: { uid: string; setUid: (x: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="uid">Armband scannen</Label>
      <div className="relative">
        <Nfc className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input id="uid" value={uid} onChange={e => setUid(e.target.value)} placeholder="NFC-UID" autoCapitalize="characters" className="pl-10 font-mono text-lg h-14" />
      </div>
    </div>
  );
}

function Login({ api, done }: { api: Api; done: () => void }) {
  const [user, setUser] = useState('admin');
  const [password, setPassword] = useState('');
  const [terminal, setTerminal] = useState('11111111-1111-4111-8111-111111111111');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const terminals = [
    { id: '11111111-1111-4111-8111-111111111111', name: 'Bar A' },
    { id: '22222222-2222-4222-8222-222222222222', name: 'Bar B' },
    { id: '33333333-3333-4333-8333-333333333333', name: 'Zentrale Aufladung' },
    { id: '44444444-4444-4444-8444-444444444444', name: 'Admin' },
  ];
  async function submit() {
    setBusy(true); setError('');
    try { const r = await api.login(user, password, terminal); api.setToken(r.accessToken); done() }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
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
            <Label htmlFor="pw">Passwort</Label>
            <Input id="pw" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
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
          <Button className="w-full" size="lg" onClick={submit} disabled={busy}>Anmelden</Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function PosView({ uid, setUid, products, cart, setCart, onPay, disabled }: {
  uid: string; setUid: (x: string) => void; products: Product[]; cart: Record<string, number>;
  setCart: (f: (c: Record<string, number>) => Record<string, number>) => void; onPay: () => void; disabled: boolean;
}) {
  const total = products.reduce((sum, p) => sum + (cart[p.id] ?? 0) * p.priceCents, 0);
  const itemCount = Object.values(cart).reduce((a, b) => a + b, 0);
  return (
    <div className="flex flex-col gap-5">
      <UidScanner uid={uid} setUid={setUid} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {products.map(p => (
          <button key={p.id} disabled={p.soldOut} onClick={() => setCart(c => ({ ...c, [p.id]: (c[p.id] ?? 0) + 1 }))}
            className="relative flex flex-col items-start gap-1 rounded-xl border border-border bg-card p-4 text-left transition-transform active:scale-95 hover:border-primary/50 disabled:opacity-40 disabled:active:scale-100 disabled:hover:border-border">
            {Boolean(cart[p.id]) && <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{cart[p.id]}</span>}
            <span className="font-semibold leading-tight">{p.name}</span>
            {p.soldOut ? <span className="text-muted-foreground font-bold text-sm">ausverkauft</span> : <span className="text-primary font-bold">{euro(p.priceCents)}</span>}
          </button>
        ))}
      </div>
      {products.length === 0 && <p className="text-sm text-muted-foreground">Keine Getränke geladen – unter "Getränke" welche anlegen.</p>}
      <Separator />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{itemCount} Artikel</p>
          <p className="text-2xl font-bold">{euro(total)}</p>
        </div>
        <div className="flex gap-2">
          {itemCount > 0 && <Button variant="outline" onClick={() => setCart(() => ({}))}>Leeren</Button>}
          <Button size="lg" disabled={!uid || itemCount === 0 || disabled} onClick={onPay}>Verbindlich bezahlen</Button>
        </div>
      </div>
    </div>
  );
}

function TopupView({ uid, setUid, onTopup, disabled }: { uid: string; setUid: (x: string) => void; onTopup: (amount: number) => void; disabled: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <UidScanner uid={uid} setUid={setUid} />
      <div className="grid grid-cols-2 gap-3">
        {[1000, 2000, 3000, 5000].map(x => (
          <Button key={x} size="lg" variant="secondary" disabled={!uid || disabled} onClick={() => onTopup(x)} className="h-20 text-xl">{euro(x)}</Button>
        ))}
      </div>
      <Card>
        <CardContent className="pt-5 text-sm text-muted-foreground flex gap-2">
          <CreditCard className="h-4 w-4 shrink-0 mt-0.5" />
          <p>Kartenaufladungen sind nur mit bestätigter Provider-Referenz zulässig und bewusst nicht über diesen Schnellbildschirm möglich.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function MarketView({ products }: { products: Product[] }) {
  const byCategory = products.reduce<Record<string, Product[]>>((all, p) => { (all[p.category] ??= []).push(p); return all }, {});
  return (
    <div className="flex flex-col gap-6">
      {Object.entries(byCategory).map(([category, items]) => (
        <div key={category}>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">{category}</h3>
          <div className="flex flex-col gap-1">
            {items.map(p => (
              <div key={p.id} className="flex items-center justify-between rounded-lg px-3 py-2.5 bg-card border border-border">
                <span className="font-medium">{p.name}</span>
                <span className="font-bold text-primary">{euro(p.priceCents)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductsView({ api }: { api: Api }) {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const refresh = () => api.adminProducts().then(setProducts).catch(e => toast.error(e.message));
  useEffect(() => { void refresh() }, [api]);

  function openCreate() { setEditing(null); setOpen(true) }
  function openEdit(p: AdminProduct) { setEditing(p); setOpen(true) }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Getränke verwalten</h2>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" />Neu</Button>
      </div>
      <div className="flex flex-col gap-2">
        {products.map(p => (
          <div key={p.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3">
            <button onClick={() => openEdit(p)} className="flex-1 min-w-0 flex items-center justify-between text-left">
              <div className="min-w-0">
                <p className="font-semibold truncate">{p.name} {!p.active && <Badge variant="secondary" className="ml-2">Inaktiv</Badge>}</p>
                <p className="text-xs text-muted-foreground">{p.category} · {euro(p.minPriceCents)}–{euro(p.maxPriceCents)}, Basis {euro(p.basePriceCents)}</p>
              </div>
              <span className="font-bold text-primary shrink-0 ml-2">{p.soldOut ? 'Aus' : (p.currentPriceCents != null ? euro(p.currentPriceCents) : '–')}</span>
            </button>
            <Button size="sm" variant={p.soldOut ? 'destructive' : 'outline'} className="shrink-0"
              onClick={async () => { try { await api.updateProduct(p.id, { soldOut: !p.soldOut }); toast.success(p.soldOut ? `${p.name} wieder verfügbar` : `${p.name} als ausverkauft markiert`); refresh() } catch (e) { toast.error((e as Error).message) } }}>
              {p.soldOut ? 'Ausverkauft' : 'Verfügbar'}
            </Button>
          </div>
        ))}
        {products.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Getränke angelegt.</p>}
      </div>
      <ProductDialog open={open} onOpenChange={setOpen} api={api} product={editing} onSaved={refresh} />
    </div>
  );
}

function ProductDialog({ open, onOpenChange, api, product, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; api: Api; product: AdminProduct | null; onSaved: () => void }) {
  const [name, setName] = useState(''); const [category, setCategory] = useState('');
  const [base, setBase] = useState(''); const [min, setMin] = useState(''); const [max, setMax] = useState('');
  const [active, setActive] = useState(true); const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setName(product?.name ?? ''); setCategory(product?.category ?? '');
    setBase(product ? (product.basePriceCents / 100).toFixed(2) : ''); setMin(product ? (product.minPriceCents / 100).toFixed(2) : '');
    setMax(product ? (product.maxPriceCents / 100).toFixed(2) : ''); setActive(product?.active ?? true); setError('');
  }, [open, product]);

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
          <div className="flex flex-col gap-1.5"><Label>Kategorie</Label><Input value={category} onChange={e => setCategory(e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1.5"><Label>Min (€)</Label><Input inputMode="decimal" value={min} onChange={e => setMin(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label>Basis (€)</Label><Input inputMode="decimal" value={base} onChange={e => setBase(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label>Max (€)</Label><Input inputMode="decimal" value={max} onChange={e => setMax(e.target.value)} /></div>
          </div>
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
  return (
    <Tabs defaultValue="cash">
      <TabsList className="w-full grid grid-cols-4">
        <TabsTrigger value="cash">Kasse</TabsTrigger>
        <TabsTrigger value="crash">Crash</TabsTrigger>
        <TabsTrigger value="approvals">Freigaben</TabsTrigger>
        <TabsTrigger value="users">Team</TabsTrigger>
      </TabsList>
      <TabsContent value="cash"><CashPanel api={api} /></TabsContent>
      <TabsContent value="crash"><CrashPanel api={api} /></TabsContent>
      <TabsContent value="approvals"><ApprovalPanel api={api} /></TabsContent>
      <TabsContent value="users"><UserPanel api={api} /></TabsContent>
      <Card className="mt-4"><CardHeader><CardTitle className="text-sm text-muted-foreground">Rohdaten</CardTitle></CardHeader><CardContent><pre className="text-xs text-muted-foreground overflow-auto">{JSON.stringify(health, null, 2)}</pre></CardContent></Card>
    </Tabs>
  );
}

function CashPanel({ api }: { api: Api }) {
  const [session, setSession] = useState<any>(null);
  const [opening, setOpening] = useState('0'); const [counted, setCounted] = useState(''); const [reason, setReason] = useState('');
  useEffect(() => { void api.cashSession().then(setSession).catch(e => toast.error(e.message)) }, [api]);
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Landmark className="h-4 w-4" />Kassensitzung</CardTitle></CardHeader>
      <CardContent>
        {session ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div><p className="text-muted-foreground">Eröffnung</p><p className="font-bold">{euro(session.openingCashCents)}</p></div>
              <div><p className="text-muted-foreground">Bar-Aufladungen</p><p className="font-bold">{euro(session.movementsCents)}</p></div>
              <div><p className="text-muted-foreground">Soll</p><p className="font-bold text-primary">{euro(session.expectedCashCents)}</p></div>
            </div>
            <div className="flex flex-col gap-1.5"><Label>Gezählter Bestand (€)</Label><Input inputMode="decimal" value={counted} onChange={e => setCounted(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label>Begründung bei Differenz</Label><Input value={reason} onChange={e => setReason(e.target.value)} /></div>
            <Button onClick={async () => { try { const r = await api.closeCashSession(toCents(counted), reason || undefined); toast.success(`Kasse geschlossen · Differenz ${euro(r.differenceCents)}`); setSession(null) } catch (e) { toast.error((e as Error).message) } }}>Kasse zählen und schließen</Button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5"><Label>Startbestand (€)</Label><Input inputMode="decimal" value={opening} onChange={e => setOpening(e.target.value)} /></div>
            <Button onClick={async () => { try { setSession(await api.openCashSession(toCents(opening))); toast.success('Kasse geöffnet') } catch (e) { toast.error((e as Error).message) } }}>Kasse öffnen</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CrashPanel({ api }: { api: Api }) {
  const [minutes, setMinutes] = useState('5');
  const [health, setHealth] = useState<any>();
  const refresh = () => api.health().then(setHealth).catch(e => toast.error(e.message));
  useEffect(() => { void refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t) }, [api]);
  const crashUntil = health?.state?.crashUntil ?? 0, crashing = crashUntil > Date.now();
  const action = async (fn: () => Promise<any>, message: string) => { try { await fn(); toast.success(message); await refresh() } catch (e) { toast.error((e as Error).message) } };
  return (
    <Card>
      <CardHeader><CardTitle>Börsencrash</CardTitle><CardDescription>Alle Preise für ein paar Minuten auf Tiefstpreis – das Display kündigt es groß an.</CardDescription></CardHeader>
      <CardContent>
        {crashing && <Badge variant="destructive">{health.state.crashKind === 'AUSVERKAUF' ? 'Ausverkauf' : 'Crash'} läuft noch bis {new Date(crashUntil).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</Badge>}
        <div className="flex flex-col gap-1.5"><Label>Minuten</Label><Input inputMode="numeric" value={minutes} onChange={e => setMinutes(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="destructive" disabled={crashing} onClick={() => action(() => api.startCrash(Math.max(1, Math.min(30, Number(minutes) || 5)), 'CRASH'), 'Crash gestartet')}>Crash auslösen</Button>
          <Button variant="secondary" disabled={crashing} onClick={() => action(() => api.startCrash(Math.max(1, Math.min(30, Number(minutes) || 20)), 'AUSVERKAUF'), 'Ausverkauf gestartet')}>Ausverkauf starten</Button>
        </div>
        <Button variant="outline" disabled={!crashing} onClick={() => action(() => api.stopCrash(), 'Beendet')}>Beenden</Button>
      </CardContent>
    </Card>
  );
}

function ApprovalPanel({ api }: { api: Api }) {
  const [items, setItems] = useState<any[]>([]);
  const [normalReason, setNormalReason] = useState('Vor-Ort-Prüfung erfolgreich');
  const [oldUid, setOldUid] = useState(''); const [newUid, setNewUid] = useState(''); const [bandReason, setBandReason] = useState('Armband verloren');
  const [orderId, setOrderId] = useState(''); const [refundReason, setRefundReason] = useState('Fehlbuchung bestätigt'); const [refundAmount, setRefundAmount] = useState('');
  const [rejectReason, setRejectReason] = useState('Antrag nicht freigegeben');
  const [backups, setBackups] = useState<any[]>([]); const [reports, setReports] = useState<any[]>([]);
  const refresh = async () => { try { setItems(await api.approvals()); setBackups(await api.backups()); setReports(await api.signedReports()) } catch (e) { toast.error((e as Error).message) } };
  useEffect(() => { void refresh() }, [api]);
  const action = async (fn: () => Promise<any>, message: string) => { try { await fn(); toast.success(message); await refresh() } catch (e) { toast.error((e as Error).message) } };
  const pending = items.filter(x => x.status === 'PENDING');
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Lock className="h-4 w-4" />Neuen Antrag stellen</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1.5"><Label>NORMAL-Begründung</Label><Input value={normalReason} onChange={e => setNormalReason(e.target.value)} /></div>
          <Button size="sm" variant="outline" onClick={() => action(() => api.requestNormalMode(normalReason), 'NORMAL-Freigabe beantragt')}>NORMAL beantragen</Button>
          <Separator />
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5"><Label>Alte UID</Label><Input value={oldUid} onChange={e => setOldUid(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label>Ersatz-UID</Label><Input value={newUid} onChange={e => setNewUid(e.target.value)} /></div>
          </div>
          <div className="flex flex-col gap-1.5"><Label>Wechselgrund</Label><Input value={bandReason} onChange={e => setBandReason(e.target.value)} /></div>
          <Button size="sm" variant="outline" onClick={() => action(() => api.requestBandReplacement(oldUid, newUid, bandReason), 'Armbandwechsel beantragt')}>Armbandwechsel beantragen</Button>
          <Separator />
          <div className="flex flex-col gap-1.5"><Label>Bestell-ID</Label><Input value={orderId} onChange={e => setOrderId(e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label>Stornobetrag in € (leer = kompletter Rest)</Label><Input inputMode="decimal" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label>Stornogrund</Label><Input value={refundReason} onChange={e => setRefundReason(e.target.value)} /></div>
          <Button size="sm" variant="outline" onClick={() => action(() => api.requestRefund(orderId, refundReason, refundAmount ? toCents(refundAmount) : undefined), 'Storno beantragt')}>Storno beantragen</Button>
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Offene Anträge ({pending.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1.5"><Label>Ablehnungsgrund</Label><Input value={rejectReason} onChange={e => setRejectReason(e.target.value)} /></div>
            {pending.map(x => (
              <div key={x.id} className="rounded-lg border border-border p-3 flex flex-col gap-2">
                <p className="font-semibold text-sm">{x.type}</p>
                <p className="text-xs text-muted-foreground break-all">{JSON.stringify(x.payload)}</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => action(() => api.approve(x.id), 'Antrag freigegeben')}><Unlock className="h-4 w-4" />Freigeben</Button>
                  <Button size="sm" variant="outline" onClick={() => action(() => api.reject(x.id, rejectReason), 'Antrag abgelehnt')}>Ablehnen</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Abschlussnachweise &amp; Sicherungen</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between"><p className="text-sm">{reports.length} signierte Berichte</p><Button size="sm" variant="outline" onClick={() => action(() => api.createSignedReport(), 'Signierter Abschlussbericht erstellt')}>Bericht signieren</Button></div>
          <div className="flex items-center justify-between"><p className="text-sm">{backups.length} verifizierte Sicherungen</p><Button size="sm" variant="outline" onClick={() => action(() => api.createBackup(), 'Backup erstellt und geprüft')}>Backup erstellen</Button></div>
        </CardContent>
      </Card>
    </div>
  );
}

function UserPanel({ api }: { api: Api }) {
  const [users, setUsers] = useState<any[]>([]);
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [role, setRole] = useState('BAR');
  const refresh = () => api.users().then(setUsers).catch(e => toast.error(e.message));
  useEffect(() => { void refresh() }, [api]);
  const action = async (fn: () => Promise<any>) => { try { await fn(); toast.success('Änderung gespeichert'); setPassword(''); await refresh() } catch (e) { toast.error((e as Error).message) } };
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" />Neues Konto</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1.5"><Label>Benutzername</Label><Input value={username} onChange={e => setUsername(e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label>Temporäres Passwort</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} /></div>
          <div className="flex flex-col gap-1.5">
            <Label>Rolle</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{['BAR', 'TOPUP', 'MARKET_MANAGER', 'PAYMENT_LEAD', 'ADMIN', 'AUDITOR'].map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={() => action(() => api.createUser(username, password, [role]))}>Konto anlegen</Button>
        </CardContent>
      </Card>
      <div className="flex flex-col gap-2">
        {users.map(u => (
          <div key={u.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
            <div>
              <p className="font-semibold">{u.username}</p>
              <p className="text-xs text-muted-foreground">{u.roles.join(', ')} · {u.active ? 'aktiv' : 'deaktiviert'}{u.lockedUntil > Date.now() ? ' · gesperrt' : ''}</p>
            </div>
            <div className="flex gap-2">
              {u.lockedUntil > Date.now() && <Button size="sm" variant="outline" onClick={() => action(() => api.unlockUser(u.id))}>Entsperren</Button>}
              <Button size="sm" variant={u.active ? 'outline' : 'secondary'} onClick={() => action(() => api.setUserActive(u.id, !u.active))}>{u.active ? 'Deaktivieren' : 'Aktivieren'}</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
