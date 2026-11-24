import { useEffect,useMemo,useRef,useState,type CSSProperties } from 'react';import { Api,uuid,type MarketPoint,type Product } from './api';import { parseMarketDisplayConfig } from './market-config';import './style.css';import './display.css';
declare global{interface Window{onNfcUid?:(uid:string)=>void;NDEFReader?:new()=>{scan():Promise<void>;onreading:((e:any)=>void)|null}}}
const nfcSupported=typeof window!=='undefined'&&'NDEFReader' in window&&window.isSecureContext;
const euro=(c:number)=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(c/100);
type PendingOperation={type:'purchase';key:string;uid:string;quoteId:string}|{type:'topup';key:string;uid:string;amountCents:number};
const loadPending=()=>{try{return JSON.parse(localStorage.getItem('pending-operation')??'null') as PendingOperation|null}catch{return null}};
export default function App(){return location.pathname==='/market'||new URLSearchParams(location.search).get('display')==='market'?<MarketDisplay/>:<TerminalApp/>}
function TerminalApp(){const api=useMemo(()=>new Api(),[]),[authenticated,setAuthenticated]=useState(api.hasToken()),[view,setView]=useState<'pos'|'topup'|'market'|'ops'>('pos'),[uid,setUid]=useState(''),[products,setProducts]=useState<Product[]>([]),[cart,setCart]=useState<Record<string,number>>({}),[message,setMessage]=useState('Bereit'),[health,setHealth]=useState<any>(),[pending,setPending]=useState<PendingOperation|null>(loadPending),[nfcActive,setNfcActive]=useState(false);
 useEffect(()=>{window.onNfcUid=(x)=>{setUid(x);setMessage(`Armband gelesen: ${x}`)};return()=>{delete window.onNfcUid}},[]);useEffect(()=>{const refresh=()=>{api.products().then(setProducts).catch(()=>{});api.health().then(setHealth).catch(()=>setHealth({ok:false}))};refresh();const t=setInterval(refresh,5000);return()=>clearInterval(t)},[api]);
 async function startNfc(){try{const reader=new window.NDEFReader!();await reader.scan();setNfcActive(true);reader.onreading=(e:any)=>{const raw=String(e.serialNumber??'').replace(/[:-]/g,'').toUpperCase();if(raw){setUid(raw);setMessage(`Armband gelesen (Web NFC): ${raw}`)}}}catch(e){setMessage(`NFC konnte nicht gestartet werden: ${(e as Error).message}`)}}
 function remember(x:PendingOperation|null){setPending(x);if(x)localStorage.setItem('pending-operation',JSON.stringify(x));else localStorage.removeItem('pending-operation')}
 async function execute(x:PendingOperation){try{if(x.type==='purchase'){const r=await api.purchase(x.uid,x.quoteId,x.key);setMessage(`Bezahlt: ${euro(r.totalCents)} · Rest ${euro(r.balanceCents)}`);setCart({})}else{const r=await api.topup(x.uid,x.amountCents,'CASH',undefined,x.key);setMessage(`Aufgeladen: ${euro(x.amountCents)} · Neu ${euro(r.balanceCents)}`)}remember(null);setUid('')}catch(e){setMessage(`ERGEBNIS UNGEKLÄRT: ${(e as Error).message} · Mit „Vorgang erneut prüfen“ denselben Schlüssel wiederverwenden.`)}}
 const submittingRef=useRef(false);
 async function pay(){if(pending||submittingRef.current)return setMessage('Zuerst den ungeklärten Vorgang prüfen.');submittingRef.current=true;try{const items=Object.entries(cart).filter(([,q])=>q).map(([productId,quantity])=>({productId,quantity}));const q=await api.quote(items),x:PendingOperation={type:'purchase',key:uuid(),uid,quoteId:q.quoteId};remember(x);await execute(x)}catch(e){setMessage(`NICHT BEZAHLT: ${(e as Error).message}`)}finally{submittingRef.current=false}}
 async function topup(amount:number){if(pending||submittingRef.current)return setMessage('Zuerst den ungeklärten Vorgang prüfen.');submittingRef.current=true;try{const x:PendingOperation={type:'topup',key:uuid(),uid,amountCents:amount};remember(x);await execute(x)}finally{submittingRef.current=false}}
 if(!authenticated)return <Login api={api} done={()=>setAuthenticated(true)}/>;return <main><header><h1>Börsenparty</h1>{nfcSupported&&<button onClick={startNfc} disabled={nfcActive}>{nfcActive?'NFC aktiv':'NFC aktivieren'}</button>}<span className={health?.ok?'ok':'bad'}>{health?.state?.mode??'VERBINDUNG…'}</span></header><nav>{(['pos','topup','market','ops'] as const).map(x=><button className={view===x?'active':''} onClick={()=>setView(x)} key={x}>{x.toUpperCase()}</button>)}</nav><div className="notice">{message}{pending&&<button className="retry" onClick={()=>execute(pending)}>Vorgang erneut prüfen</button>}</div>
 {view==='pos'&&<section><h2>Barverkauf</h2><Uid uid={uid} setUid={setUid}/><div className="grid">{products.map(p=><button className="product" key={p.id} onClick={()=>setCart(c=>({...c,[p.id]:(c[p.id]??0)+1}))}><strong>{p.name}</strong><span>{euro(p.priceCents)}</span><b>{cart[p.id]??0}</b></button>)}</div><button className="primary" disabled={!uid||!Object.values(cart).some(Boolean)} onClick={pay}>Verbindlich bezahlen</button></section>}
 {view==='topup'&&<section><h2>Bargeld-Aufladung</h2><Uid uid={uid} setUid={setUid}/><div className="amounts">{[1000,2000,3000,5000].map(x=><button disabled={!uid} onClick={()=>topup(x)}>{euro(x)}</button>)}</div><p>Kartenaufladungen sind nur mit bestätigter Provider-Referenz zulässig und bewusst nicht über diesen Schnellbildschirm möglich.</p></section>}
 {view==='market'&&<section><h2>Aktuelle Kurse</h2><div className="market">{products.map(p=><article><span>{p.name}</span><strong>{euro(p.priceCents)}</strong></article>)}</div></section>}
 {view==='ops'&&<section><h2>Betriebszustand</h2><pre>{JSON.stringify(health,null,2)}</pre><CashPanel api={api}/><CrashPanel api={api}/><ApprovalPanel api={api}/><UserPanel api={api}/></section>}</main>}
function Uid({uid,setUid}:{uid:string;setUid:(x:string)=>void}){return <label>Armband scannen<input value={uid} onChange={e=>setUid(e.target.value)} placeholder="NFC-UID" autoCapitalize="characters"/></label>}
function Login({api,done}:{api:Api;done:()=>void}){const[user,setUser]=useState('admin'),[password,setPassword]=useState(''),[terminal,setTerminal]=useState('11111111-1111-4111-8111-111111111111'),[error,setError]=useState('');return <main className="login"><h1>Terminal anmelden</h1><label>Benutzer<input value={user} onChange={e=>setUser(e.target.value)}/></label><label>Passwort<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Terminal<select value={terminal} onChange={e=>setTerminal(e.target.value)}><option value="11111111-1111-4111-8111-111111111111">Bar A</option><option value="22222222-2222-4222-8222-222222222222">Bar B</option><option value="33333333-3333-4333-8333-333333333333">Zentrale Aufladung</option><option value="44444444-4444-4444-8444-444444444444">Admin</option></select></label>{error&&<p className="bad">{error}</p>}<button className="primary" onClick={async()=>{try{const r=await api.login(user,password,terminal);api.setToken(r.accessToken);done()}catch(e){setError((e as Error).message)}}}>Anmelden</button></main>}
function CashPanel({api}:{api:Api}){const[session,setSession]=useState<any>(),[opening,setOpening]=useState('0'),[counted,setCounted]=useState(''),[reason,setReason]=useState(''),[status,setStatus]=useState('');useEffect(()=>{void api.cashSession().then(setSession).catch(e=>setStatus(e.message))},[api]);return <div className="cash"><h2>Kassensitzung</h2>{session?<><p>Eröffnung: {euro(session.openingCashCents)} · Bargeldaufladungen: {euro(session.movementsCents)} · Soll: <strong>{euro(session.expectedCashCents)}</strong></p><label>Gezählter Bestand in Euro<input inputMode="decimal" value={counted} onChange={e=>setCounted(e.target.value)}/></label><label>Begründung bei Differenz<input value={reason} onChange={e=>setReason(e.target.value)}/></label><button onClick={async()=>{try{const r=await api.closeCashSession(Math.round(Number(counted.replace(',','.'))*100),reason||undefined);setStatus(`Kasse geschlossen · Differenz ${euro(r.differenceCents)}`);setSession(null)}catch(e){setStatus((e as Error).message)}}}>Kasse zählen und schließen</button></>:<><label>Startbestand in Euro<input inputMode="decimal" value={opening} onChange={e=>setOpening(e.target.value)}/></label><button onClick={async()=>{try{setSession(await api.openCashSession(Math.round(Number(opening.replace(',','.'))*100)));setStatus('Kasse geöffnet')}catch(e){setStatus((e as Error).message)}}}>Kasse öffnen</button></>}{status&&<p>{status}</p>}</div>}
function CrashPanel({api}:{api:Api}){const[minutes,setMinutes]=useState('5'),[status,setStatus]=useState(''),[health,setHealth]=useState<any>();const refresh=()=>api.health().then(setHealth).catch(e=>setStatus(e.message));useEffect(()=>{void refresh();const t=setInterval(refresh,5000);return()=>clearInterval(t)},[api]);const crashUntil=health?.state?.crashUntil??0,crashing=crashUntil>Date.now();const action=async(fn:()=>Promise<any>,message:string)=>{try{await fn();setStatus(message);await refresh()}catch(e){setStatus((e as Error).message)}};return <div className="crash"><h2>Börsencrash</h2><p>Alle Preise für ein paar Minuten auf Tiefstpreis setzen – das Display kündigt es groß an.</p>{crashing&&<p><strong>{health.state.crashKind==='AUSVERKAUF'?'Ausverkauf':'Crash'} läuft</strong> noch bis {new Date(crashUntil).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</p>}<label>Minuten<input inputMode="numeric" value={minutes} onChange={e=>setMinutes(e.target.value)}/></label><button disabled={crashing} onClick={()=>action(()=>api.startCrash(Math.max(1,Math.min(30,Number(minutes)||5)),'CRASH'),'Crash gestartet')}>Crash auslösen</button><button disabled={crashing} onClick={()=>action(()=>api.startCrash(Math.max(1,Math.min(30,Number(minutes)||20)),'AUSVERKAUF'),'Ausverkauf gestartet')}>Ausverkauf starten</button><button disabled={!crashing} onClick={()=>action(()=>api.stopCrash(),'Beendet')}>Beenden</button>{status&&<p>{status}</p>}</div>}
function ApprovalPanel({api}:{api:Api}){const[items,setItems]=useState<any[]>([]),[status,setStatus]=useState(''),[normalReason,setNormalReason]=useState('Vor-Ort-Prüfung erfolgreich'),[oldUid,setOldUid]=useState(''),[newUid,setNewUid]=useState(''),[bandReason,setBandReason]=useState('Armband verloren'),[orderId,setOrderId]=useState(''),[refundReason,setRefundReason]=useState('Fehlbuchung bestätigt'),[refundAmount,setRefundAmount]=useState(''),[rejectReason,setRejectReason]=useState('Antrag nicht freigegeben'),[backups,setBackups]=useState<any[]>([]),[reports,setReports]=useState<any[]>([]);const refresh=async()=>{try{setItems(await api.approvals());setBackups(await api.backups());setReports(await api.signedReports())}catch(e){setStatus((e as Error).message)}};useEffect(()=>{void refresh()},[api]);const action=async(fn:()=>Promise<any>,message:string)=>{try{await fn();setStatus(message);await refresh()}catch(e){setStatus((e as Error).message)}};return <div className="admin"><h2>Vier-Augen-Freigaben</h2><details><summary>Neuen Antrag stellen</summary><label>NORMAL-Begründung<input value={normalReason} onChange={e=>setNormalReason(e.target.value)}/></label><button onClick={()=>action(()=>api.requestNormalMode(normalReason),'NORMAL-Freigabe beantragt')}>NORMAL beantragen</button><label>Alte UID<input value={oldUid} onChange={e=>setOldUid(e.target.value)}/></label><label>Ersatz-UID<input value={newUid} onChange={e=>setNewUid(e.target.value)}/></label><label>Wechselgrund<input value={bandReason} onChange={e=>setBandReason(e.target.value)}/></label><button onClick={()=>action(()=>api.requestBandReplacement(oldUid,newUid,bandReason),'Armbandwechsel beantragt')}>Armbandwechsel beantragen</button><label>Bestell-ID<input value={orderId} onChange={e=>setOrderId(e.target.value)}/></label><label>Stornobetrag in Euro (leer = kompletter Rest)<input inputMode="decimal" value={refundAmount} onChange={e=>setRefundAmount(e.target.value)}/></label><label>Stornogrund<input value={refundReason} onChange={e=>setRefundReason(e.target.value)}/></label><button onClick={()=>action(()=>api.requestRefund(orderId,refundReason,refundAmount?Math.round(Number(refundAmount.replace(',','.'))*100):undefined),'Storno beantragt')}>Storno beantragen</button></details><label>Ablehnungsgrund<input value={rejectReason} onChange={e=>setRejectReason(e.target.value)}/></label>{items.filter(x=>x.status==='PENDING').map(x=><article className="approval" key={x.id}><strong>{x.type}</strong><span>{JSON.stringify(x.payload)}</span><button onClick={()=>action(()=>api.approve(x.id),'Antrag freigegeben')}>Freigeben</button><button onClick={()=>action(()=>api.reject(x.id,rejectReason),'Antrag abgelehnt')}>Ablehnen</button></article>)}<h2>Abschlussnachweise</h2><button onClick={()=>action(()=>api.createSignedReport(),'Signierter Abschlussbericht erstellt')}>Bericht signieren</button><p>{reports.length} signierte Berichte registriert.</p><h2>Sicherungen</h2><button onClick={()=>action(()=>api.createBackup(),'Backup erstellt und geprüft')}>Jetzt Backup erstellen</button><p>{backups.length} verifizierte Sicherung(en) registriert.</p>{status&&<p>{status}</p>}</div>}
function UserPanel({api}:{api:Api}){const[users,setUsers]=useState<any[]>([]),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[role,setRole]=useState('BAR'),[status,setStatus]=useState('');const refresh=()=>api.users().then(setUsers).catch(e=>setStatus(e.message));useEffect(()=>{void refresh()},[api]);const action=async(fn:()=>Promise<any>)=>{try{await fn();setStatus('Änderung gespeichert');setPassword('');await refresh()}catch(e){setStatus((e as Error).message)}};return <div className="users"><h2>Mitarbeiter</h2><details><summary>Neues Konto</summary><label>Benutzername<input value={username} onChange={e=>setUsername(e.target.value)}/></label><label>Temporäres Passwort<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Rolle<select value={role} onChange={e=>setRole(e.target.value)}>{['BAR','TOPUP','MARKET_MANAGER','PAYMENT_LEAD','ADMIN','AUDITOR'].map(x=><option key={x}>{x}</option>)}</select></label><button onClick={()=>action(()=>api.createUser(username,password,[role]))}>Konto anlegen</button></details>{users.map(u=><article className="approval" key={u.id}><strong>{u.username}</strong><span>{u.roles.join(', ')} · {u.active?'aktiv':'deaktiviert'}{u.lockedUntil>Date.now()?' · GESPERRT':''}</span><button onClick={()=>action(()=>api.setUserActive(u.id,!u.active))}>{u.active?'Deaktivieren':'Aktivieren'}</button>{u.lockedUntil>Date.now()&&<button onClick={()=>action(()=>api.unlockUser(u.id))}>Entsperren</button>}</article>)}{status&&<p>{status}</p>}</div>}
const priceNum=(c:number)=>(c/100).toFixed(2).replace('.',',');
const TONE={up:'#3ddc84',down:'#ff5a5f',soft:'#56606c'};
function marketSeries(product:Product,history:MarketPoint[]){return history.map(point=>({time:point.effectiveAt,price:point.prices[product.id]})).filter(point=>point.price!==undefined)}
function marketTrend(product:Product,history:MarketPoint[]){const series=marketSeries(product,history),start=series[0]?.price??product.priceCents,delta=product.priceCents-start,percent=start?delta/start*100:0,fixed=product.minPriceCents>=product.maxPriceCents;return{series,start,delta,percent,up:delta>0,fixed,color:fixed||delta===0?TONE.soft:delta>0?TONE.up:TONE.down}}

// Rolls the displayed price up/down for ~700ms when it changes, matching the ticker-board feel of the price board.
function usePriceRoll(value:number){const prev=useRef(value),[cls,setCls]=useState('');useEffect(()=>{if(prev.current!==value){const dir=value>prev.current?'ru':'rd';prev.current=value;setCls(dir);const t=setTimeout(()=>setCls(''),700);return()=>clearTimeout(t)}},[value]);return cls}

function Sparkline({history,product,color,lineWidth=2}:{history:MarketPoint[];product:Product;color:string;lineWidth?:number}){
  const ref=useRef<HTMLCanvasElement>(null);
  const series=marketSeries(product,history).map(p=>p.price as number);
  const base=series[0]??product.priceCents;
  useEffect(()=>{
    const cv=ref.current;if(!cv)return;
    const hist=series.length?series:[base];
    const draw=()=>{
      const dpr=window.devicePixelRatio||1,w=cv.clientWidth,h=cv.clientHeight;if(!w||!h)return;
      const W=Math.round(w*dpr),H=Math.round(h*dpr);if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H}
      const g=cv.getContext('2d');if(!g)return;
      g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
      const pad=Math.max(base*0.06,1),lo=Math.min(base,...hist)-pad,hi=Math.max(base,...hist)+pad,span=hi-lo||1;
      const y=(v:number)=>h-lineWidth-2-(v-lo)/span*(h-2*lineWidth-4);
      g.setLineDash([3,5]);g.strokeStyle='rgba(244,246,248,.18)';g.lineWidth=1;
      g.beginPath();g.moveTo(0,y(base));g.lineTo(w,y(base));g.stroke();g.setLineDash([]);
      if(hist.length<2)return;
      const step=(w-lineWidth*2)/(hist.length-1);
      g.beginPath();hist.forEach((v,i)=>{const x=i*step+lineWidth,yy=y(v);i?g.lineTo(x,yy):g.moveTo(x,yy)});
      g.lineWidth=lineWidth;g.lineJoin='round';g.lineCap='round';g.strokeStyle=color;g.stroke();
      const lastX=(hist.length-1)*step+lineWidth;
      g.lineTo(lastX,h);g.lineTo(lineWidth,h);g.closePath();
      const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,color+'44');gr.addColorStop(1,color+'00');g.fillStyle=gr;g.fill();
      g.fillStyle=color;g.beginPath();g.arc(lastX,y(hist.at(-1) as number),lineWidth*1.6,0,7);g.fill();
    };
    draw();
    const ro=new ResizeObserver(draw);ro.observe(cv);
    return()=>ro.disconnect();
  },[series.join(','),base,color,lineWidth]);
  return <canvas ref={ref}/>;
}

function MarketRow({product,history,charts}:{product:Product;history:MarketPoint[];charts:boolean}){
  const{percent,up,fixed,color}=marketTrend(product,history),flat=!fixed&&Math.round(percent)===0,roll=usePriceRoll(product.priceCents);
  return <article className="market-row">
    <h3>{product.name}</h3>
    {charts&&<div className="mini-chart"><Sparkline history={history} product={product} color={color}/></div>}
    <div className={`row-trend ${fixed?'':flat?'flat':up?'positive':'negative'}`}>{fixed?'':flat?'±0 %':(up?'▲ ':'▼ ')+Math.abs(Math.round(percent))+' %'}</div>
    <strong className="price"><span className={`n ${roll}`}>{priceNum(product.priceCents)}</span><span className="c">€</span></strong>
  </article>;
}

type SpotMode='discount'|'gain';
function FocusCard({product,mode,fade,history,charts}:{product:Product;mode:SpotMode;fade:boolean;history:MarketPoint[];charts:boolean}){
  const{percent,color}=marketTrend(product,history);
  return <section className={`focus-card${fade?' fade':''}`}>
    <h2>Im Fokus</h2>
    <div className="inner">
      <span className="k">{mode==='discount'?'Größter Rabatt':'Stärkster Anstieg'}</span>
      <h3>{product.name}</h3>
      <div className="pr"><strong className="price"><span className="n">{priceNum(product.priceCents)}</span><span className="c">€</span></strong><em>{mode==='discount'?`${Math.abs(Math.round(percent))} % unter Basispreis`:`+${Math.round(percent)} % über Basispreis`}</em></div>
      {charts&&<div className="focus-chart"><Sparkline history={history} product={product} color={color} lineWidth={3}/></div>}
    </div>
  </section>;
}

type Moment={tone:'up'|'down'|'crash';title:string;sub:string};
function MarketDisplay(){
  const config=useMemo(()=>parseMarketDisplayConfig(location.search),[]),api=useMemo(()=>new Api(),[]);
  const[products,setProducts]=useState<Product[]>([]),[history,setHistory]=useState<MarketPoint[]>([]),[health,setHealth]=useState<any>();
  const[clock,setClock]=useState(()=>new Date());
  const[spot,setSpot]=useState<{id:string;mode:SpotMode}|null>(null),[spotFade,setSpotFade]=useState(false);
  const[moment,setMoment]=useState<Moment|null>(null);
  const[crash,setCrash]=useState<{until:number;kind:string}|null>(null);
  const prevCrashingRef=useRef(false);
  useEffect(()=>{const t=setInterval(()=>setClock(new Date()),1000);return()=>clearInterval(t)},[]);

  const visibleRef=useRef<Product[]>([]),historyRef=useRef<MarketPoint[]>([]);
  const prevProductsRef=useRef<Record<string,Product>>({}),coolRef=useRef<Record<string,number>>({});
  const momentQueueRef=useRef<Moment[]>([]),showingRef=useRef(false),lastShowRef=useRef(0);
  function pumpMoments(){
    if(showingRef.current||!momentQueueRef.current.length)return;
    const wait=10000-(Date.now()-lastShowRef.current);
    if(wait>0){setTimeout(pumpMoments,wait);return}
    const m=momentQueueRef.current.shift() as Moment;
    showingRef.current=true;setMoment(m);
    const dur=m.tone==='crash'?6000:4200;
    setTimeout(()=>{setMoment(null);setTimeout(()=>{showingRef.current=false;lastShowRef.current=Date.now();pumpMoments()},450)},dur);
  }
  // Skipped entirely while a crash/sale is active: otherwise every product crossing into its
  // floor at the same instant the crash is triggered fires its own "Tiefstpreis"-Meldung, flooding
  // the queue with redundant noise on top of the single crash announcement.
  function detectMoments(list:Product[],crashingNow:boolean){
    const prev=prevProductsRef.current,now=Date.now();
    if(!crashingNow)for(const p of list){
      const before=prev[p.id];if(!before||p.minPriceCents>=p.maxPriceCents)continue;
      if(p.priceCents>=p.maxPriceCents&&before.priceCents<p.maxPriceCents&&(coolRef.current[p.id+'hi']??0)<now){
        coolRef.current[p.id+'hi']=now+240000;
        momentQueueRef.current.push({tone:'up',title:p.name,sub:`${priceNum(p.priceCents)} € · teurer wird es nicht`});
      }else if(p.priceCents<=p.minPriceCents&&before.priceCents>p.minPriceCents&&(coolRef.current[p.id+'lo']??0)<now){
        coolRef.current[p.id+'lo']=now+240000;
        momentQueueRef.current.push({tone:'down',title:p.name,sub:`nur ${priceNum(p.priceCents)} €`});
      }
    }
    prevProductsRef.current=Object.fromEntries(list.map(p=>[p.id,p]));
    pumpMoments();
  }
  // Best-effort: simply does nothing on displays whose browser blocks unprompted audio
  // (expected on an unattended kiosk TV with no prior user gesture).
  function playCrashAlarm(){
    try{
      const audio=new Audio('/sounds/crash-alarm.mp3');
      audio.volume=1;
      audio.play().catch(()=>{});
    }catch{}
  }
  function detectCrash(h:any){
    const until=h?.state?.crashUntil??0,kind=h?.state?.crashKind==='AUSVERKAUF'?'AUSVERKAUF':'CRASH',crashingNow=until>Date.now();
    setCrash(crashingNow?{until,kind}:null);
    if(crashingNow&&!prevCrashingRef.current){
      momentQueueRef.current.unshift(kind==='AUSVERKAUF'
        ?{tone:'crash',title:'Ausverkauf',sub:'Alles zum Tiefstpreis · jetzt leer trinken'}
        :{tone:'crash',title:'Börsencrash',sub:'Alle Preise im Keller · jetzt bestellen'});
      pumpMoments();
      if(config.sound)playCrashAlarm();
    }
    prevCrashingRef.current=crashingNow;
    return crashingNow;
  }

  useEffect(()=>{let active=true;const refresh=async()=>{try{const[p,hist,h]=await Promise.all([api.products(),api.marketHistory(),api.health()]);if(active){setProducts(p);setHistory(hist.points);setHealth(h);detectMoments(p,detectCrash(h))}}catch{if(active)setHealth({ok:false,state:{mode:'VERBINDUNGSFEHLER'}})}};void refresh();const timer=setInterval(refresh,config.refreshMs);return()=>{active=false;clearInterval(timer)}},[api,config.refreshMs]);

  const visible=config.category?products.filter(p=>p.category.localeCompare(config.category!,'de',{sensitivity:'base'})===0):products;
  visibleRef.current=visible;historyRef.current=history;
  const groups=Object.entries(visible.reduce<Record<string,Product[]>>((all,p)=>{(all[p.category]??=[]).push(p);return all},{}));
  const columns=Array.from({length:config.categoryColumns},()=>[] as typeof groups);
  groups.forEach((group,index)=>columns[index%columns.length].push(group));

  // Rotates "Im Fokus" between the biggest real discount and the biggest real markup every 15s, as in the prototype's spot modes.
  useEffect(()=>{
    let first=true;const modeRef={current:'discount' as SpotMode};
    const pick=(mode:SpotMode)=>{
      const candidates=visibleRef.current.filter(p=>p.minPriceCents<p.maxPriceCents).map(p=>({p,...marketTrend(p,historyRef.current)}));
      if(!candidates.length)return null;
      const best=mode==='discount'?candidates.reduce((a,b)=>b.percent<a.percent?b:a):candidates.reduce((a,b)=>b.percent>a.percent?b:a);
      return(mode==='discount'?best.percent<=-3:best.percent>=3)?best.p:null;
    };
    const rotate=()=>{
      const next:SpotMode=modeRef.current==='discount'?'gain':'discount';
      for(const m of[next,modeRef.current]){
        const p=pick(m);
        if(p){
          modeRef.current=m;
          if(first){setSpot({id:p.id,mode:m});first=false}
          else{setSpotFade(true);setTimeout(()=>{setSpot({id:p.id,mode:m});setSpotFade(false)},400)}
          return;
        }
      }
      setSpot(null);
    };
    rotate();
    const t=setInterval(rotate,15000);
    return()=>clearInterval(t);
  },[]);
  const focusProduct=spot&&visible.find(p=>p.id===spot.id);

  // Measures the real rendered column width (not an assumed viewport) and derives a px unit that
  // every row dimension scales from, so layout can never overflow regardless of how a TV's browser
  // reports or scales its viewport. Mirrors the prototype's own --u sizing technique.
  const boardRef=useRef<HTMLElement>(null);
  const[unit,setUnit]=useState(36);
  useEffect(()=>{
    const el=boardRef.current;if(!el)return;
    const compute=()=>{
      const cs=getComputedStyle(el),stacked=cs.flexDirection==='column';
      const cols=stacked?1:Math.max(1,config.categoryColumns);
      const gap=stacked?0:parseFloat(cs.columnGap)||0;
      const perColumn=(el.clientWidth-gap*(cols-1))/cols;
      setUnit(Math.max(20,Math.min(90,perColumn/6.6)));
    };
    compute();
    const ro=new ResizeObserver(compute);ro.observe(el);
    return()=>ro.disconnect();
  },[config.categoryColumns]);

  const mode=health?.state?.mode??'VERBINDE…';
  const footerNote=mode==='PAYMENT_STOP'?'Zahlungen gestoppt':mode==='PRICE_FROZEN'?'Preise eingefroren · letzter Stand':'Restguthaben gibt es am Ende an der Wechselbude zurück';
  const style={'--display-scale':config.scale,'--overscan':`${config.overscan}vmin`} as CSSProperties;

  const crashLeft=crash?Math.max(0,Math.ceil((crash.until-clock.getTime())/1000)):0;
  return <main className={`public-display format-${config.format}${config.showCharts?'':' no-charts'}${config.showTicker?'':' no-ticker'}${crash?' crash':''}`} style={style}>
    <header className="market-header"><h1>Getränkebörse</h1><span id="clock">{clock.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</span></header>
    {crash&&<div className="crashbar"><span>{crash.kind==='AUSVERKAUF'?'Ausverkauf · letzte Runde zum Tiefstpreis':'Börsencrash · alle Preise auf Tiefstand'}</span><span>noch {Math.floor(crashLeft/60)}:{String(crashLeft%60).padStart(2,'0')}</span></div>}
    {config.showTicker&&<div className="tape" aria-label="Aktuelle Kurse">{visible.map(p=><div key={p.id}><b>{p.name}</b><span>{euro(p.priceCents)}</span></div>)}</div>}
    <section className="category-board" ref={boardRef} style={{'--u':`${unit}px`} as CSSProperties}>
      {columns.map((column,columnIndex)=><div className="market-column" key={columnIndex}>
        {column.map(([category,items])=><section className="market-category" key={category}><h2>{category}</h2><div className="security-list">{items.map(p=><MarketRow key={p.id} product={p} history={history} charts={config.showCharts}/>)}</div></section>)}
        {config.showFocus&&spot&&focusProduct&&columnIndex===columns.length-1&&<FocusCard product={focusProduct} mode={spot.mode} fade={spotFade} history={history} charts={config.showCharts}/>}
      </div>)}
      {!groups.length&&<div className="empty-category">Keine Getränke in dieser Kategorie</div>}
    </section>
    <footer><span>{footerNote}</span><span><i className={health?.ok?'online':'offline'}/> {health?.ok?'Verbunden':'Verbindung unterbrochen'}</span></footer>
    <div className={`moment ${moment?'on '+moment.tone:''}`}>{moment&&<><div className="k">{moment.tone==='up'?'Höchstkurs erreicht':moment.tone==='down'?'Tiefstpreis':'Börse'}</div><div className="h">{moment.title}</div><div className="s">{moment.sub}</div></>}</div>
  </main>;
}
