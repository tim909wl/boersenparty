import { lazy,Suspense,useEffect,useMemo,useRef,useState,type CSSProperties } from 'react';
import { Api,deviceId,type DiagnosticResult,type MarketPoint,type Product } from './api';
import { parseMarketDisplayConfig } from './market-config';
const TerminalApp=lazy(()=>import('./terminal/TerminalApp'));
import DiagnosticsPage from './diagnostics/DiagnosticsPage';
function DisabledGuestDisplay(){useEffect(()=>{localStorage.removeItem('token')},[]);return <main className="min-h-dvh grid place-items-center p-8 text-center"><section><h1 className="text-3xl font-bold">Bezahldisplay pausiert</h1><p className="mt-4">Bitte direkt beim Thekenpersonal bezahlen.</p><a className="mt-6 inline-block underline" href="/market">Zur Getränkebörse</a></section></main>}
import { BOARD_COLUMN,boardUnit,BoardFooter,CATEGORY_HEADING,CrashBar,DrinkName,euro,MarketRow,marketTrend,MomentOverlay,priceNum,Sparkline,type Moment } from './market/parts';
import './display.css';

export default function App(){const display=new URLSearchParams(location.search).get('display');return display==='diagnostics'?<DiagnosticsPage/>:display==='pay'?<DisabledGuestDisplay/>:location.pathname==='/market'||display==='market'?<MarketDisplay/>:<Suspense fallback={<main className="min-h-dvh grid place-items-center">Kasse wird geladen …</main>}><TerminalApp/></Suspense>}

type SpotMode='discount'|'gain';

// Two fundamentally different jobs, so two layout modes rather than one set of breakpoints:
//  - Kiosk (a TV nobody touches): everything MUST fit one screen, because nobody is there to
//    scroll. The board shrinks to fit.
//  - Handheld (phone/small window): fitting 16 drinks into one phone screen would mean ~10px
//    prices. Readability wins, the page scrolls, and the board stacks into a single column.
const HANDHELD_QUERY='(max-width: 900px), (orientation: portrait) and (max-width: 1200px)';
function useHandheld(){
  const[handheld,setHandheld]=useState(()=>typeof window!=='undefined'&&window.matchMedia(HANDHELD_QUERY).matches);
  useEffect(()=>{
    const mq=window.matchMedia(HANDHELD_QUERY);
    const update=()=>setHandheld(mq.matches);
    update();
    if(mq.addEventListener){mq.addEventListener('change',update);return()=>mq.removeEventListener('change',update)}
    mq.addListener(update);return()=>mq.removeListener(update);
  },[]);
  return handheld;
}

// Fills the dedicated quarter-width focus column to its full height: label, name and price stack
// at the top, the curve takes whatever height is left. Everything scales from the same --u unit as
// the drink rows, so the two regions never drift apart typographically.
function FocusCard({product,mode,fade,history,charts,compact=false}:{product:Product;mode:SpotMode;fade:boolean;history:MarketPoint[];charts:boolean;compact?:boolean}){
  const{color}=marketTrend(product,history);const base=product.basePriceCents??product.priceCents;const percent=base?(product.priceCents-base)/base*100:0;
  // compact = stacked under the board on a handheld, where it is a short banner rather than a
  // full-height column, so nothing here may claim leftover vertical space.
  return <section className={compact?'flex flex-col':'flex-1 min-h-0 flex flex-col'}>
    <h2 className={CATEGORY_HEADING}>Im Fokus</h2>
    <div className={`flex flex-col gap-[calc(var(--u,36px)*0.1)] pt-[calc(var(--u,36px)*0.4)] transition-[opacity,transform] duration-500 ${compact?'':'flex-1 min-h-0'} ${fade?'opacity-0 translate-y-[calc(var(--u,36px)*0.2)]':'opacity-100 translate-y-0'}`}>
      <span className="font-ticker-display font-semibold text-[length:calc(var(--u,36px)*0.3)] text-ticker-gold">{mode==='discount'?'Größter Rabatt':'Stärkster Anstieg'}</span>
      <h3 className="m-0 text-[length:calc(var(--u,36px)*0.62)] leading-[1.1] font-semibold overflow-hidden"><DrinkName name={product.name}/></h3>
      <div className="font-ticker-display font-bold text-[length:calc(var(--u,36px)*1.4)] leading-none tabular-nums whitespace-nowrap">
        {priceNum(product.priceCents)}<span className="text-[0.45em] font-medium text-ticker-soft ml-[-0.1em]">€</span>
      </div>
      <em className="not-italic font-semibold text-ticker-muted text-[length:calc(var(--u,36px)*0.28)]">
        {mode==='discount'?`${Math.abs(Math.round(percent))} % unter Basispreis`:`+${Math.round(percent)} % über Basispreis`}
      </em>
      {/* Capped, and with min-h-0 so it can shrink: left as a plain flex-1 with a min-height it
          ate roughly half the screen on a 16:9 TV and pushed the footer off the bottom edge. */}
      {charts&&<div className={`mt-[calc(var(--u,36px)*0.3)] [&>canvas]:block [&>canvas]:w-full [&>canvas]:h-full ${compact?'h-[calc(var(--u,36px)*1.8)]':'flex-1 min-h-0 max-h-[calc(var(--u,36px)*3)]'}`}><Sparkline history={history} product={product} color={color} lineWidth={3}/></div>}
    </div>
  </section>;
}

function MarketDisplay(){
  const config=useMemo(()=>parseMarketDisplayConfig(location.search),[]),api=useMemo(()=>new Api(''),[]);
  const handheld=useHandheld();
  const[products,setProducts]=useState<Product[]>([]),[history,setHistory]=useState<MarketPoint[]>([]),[health,setHealth]=useState<any>();
  const[lastUpdate,setLastUpdate]=useState(0),[serverOffset,setServerOffset]=useState(0);
  const[clock,setClock]=useState(()=>new Date());
  const[spot,setSpot]=useState<{id:string;mode:SpotMode}|null>(null),[spotFade,setSpotFade]=useState(false);
  const[moment,setMoment]=useState<Moment|null>(null);
  const[crash,setCrash]=useState<{until:number;kind:string}|null>(null);
  const prevCrashingRef=useRef(false);
  useEffect(()=>{const t=setInterval(()=>setClock(new Date()),1000);return()=>clearInterval(t)},[]);

  // Every display heartbeats itself into the central device registry (no login needed — it's an
  // unattended kiosk), so the admin fleet view can see which screens are actually online.
  const did=useMemo(()=>deviceId(),[]);
  useEffect(()=>{
    const beat=()=>void api.deviceHeartbeat(did,{userAgent:navigator.userAgent,screenWidth:screen.width,screenHeight:screen.height}).catch(()=>{});
    beat();
    const t=setInterval(beat,20000);
    return()=>clearInterval(t);
  },[api,did]);

  // A "Leistungstest" triggered centrally (admin panel) sets system_state.diagnosticsRequestedAt,
  // which every display already sees on its next health poll below. All of them compute the same
  // rounded wall-clock reveal instant from it, so every screen starts flickering/testing in
  // lockstep — same synchronized-reveal trick already used for the crash announcement.
  const[fleetTest,setFleetTest]=useState(false);
  const handledDiagnosticsAtRef=useRef(0);
  function maybeStartFleetTest(requestedAt:number){
    if(!requestedAt||requestedAt<=handledDiagnosticsAtRef.current)return;
    handledDiagnosticsAtRef.current=requestedAt;
    // A display that only (re)connects well after the trigger — e.g. rebooting mid-event after a
    // power blip — would otherwise run a now-meaningless "synchronized" test on its own, out of
    // step with every other screen and disrupting the live board for no reason.
    if(Date.now()-requestedAt>60000)return;
    const revealAt=Math.ceil(Date.now()/10000)*10000+2000;
    setTimeout(()=>setFleetTest(true),Math.max(0,revealAt-Date.now()));
  }
  function finishFleetTest(result:DiagnosticResult){
    void api.reportDiagnostic(did,result).catch(()=>{});
    setFleetTest(false);
  }

  const visibleRef=useRef<Product[]>([]);
  const prevProductsRef=useRef<Record<string,Product>>({}),coolRef=useRef<Record<string,number>>({});
  const momentQueueRef=useRef<Moment[]>([]),showingRef=useRef(false),lastShowRef=useRef(0);
  function pumpMoments(){
    if(showingRef.current||!momentQueueRef.current.length)return;
    // The pacing cooldown exists to stop routine Höchst-/Tiefstpreis moments from flashing back
    // to back — it must never delay the crash reveal itself, which is already time-synchronized
    // across every display and needs to stay as close to real-time as possible.
    const next=momentQueueRef.current[0];
    const wait=next.tone==='crash'?0:10000-(Date.now()-lastShowRef.current);
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
      const before=prev[p.id];if(!before||p.minPriceCents>=p.maxPriceCents||p.soldOut)continue;
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
  // Prices update immediately from the coherent snapshot. A visual crash announcement never delays them.
  function detectCrash(h:any,serverTime:number){
    const until=h?.state?.crashUntil??0,kind=h?.state?.crashKind==='AUSVERKAUF'?'AUSVERKAUF':'CRASH',crashingNow=until>serverTime&&h?.ok&&h?.state?.mode==='NORMAL'&&h?.state?.eventPhase==='OPEN';
    if(crashingNow&&!prevCrashingRef.current){
      momentQueueRef.current=[];
      momentQueueRef.current.push(kind==='AUSVERKAUF'?{tone:'crash',title:'Ausverkauf',sub:'Alles zum Tiefstpreis · jetzt bestellen'}:{tone:'crash',title:'Börsencrash',sub:'Alle Preise auf Tiefstand · jetzt bestellen'});
      pumpMoments();
    }
    if(!crashingNow&&prevCrashingRef.current)momentQueueRef.current=momentQueueRef.current.filter(m=>m.tone!=='crash');
    prevCrashingRef.current=crashingNow;
    return{crashingNow,until,kind};
  }

  useEffect(()=>{
    let active=true,inFlight=false;let controller:AbortController|undefined;
    const refresh=async()=>{
      if(inFlight)return;inFlight=true;controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),Math.max(5000,config.refreshMs*2));
      try{
        const hist=await api.marketHistory(controller.signal);
        if(!hist.snapshot||!Array.isArray(hist.snapshot.products)||!Array.isArray(hist.points))throw new Error("Ungültiger Kursstand");
        const {products:p,health:h}=hist.snapshot;
        if(!active)return;
        setHealth(h);setLastUpdate(Date.now());setServerOffset(hist.snapshot.serverTime-Date.now());
        maybeStartFleetTest(h?.state?.diagnosticsRequestedAt??0);
        const{crashingNow,until,kind}=detectCrash(h,hist.snapshot.serverTime);
        const applyData=()=>{setProducts(p);setHistory(hist.points);setCrash(crashingNow?{until,kind}:null);detectMoments(p,crashingNow)};
        applyData();
      }catch{if(active)setHealth({ok:false,state:{mode:'VERBINDUNGSFEHLER'}})}finally{clearTimeout(timeout);inFlight=false}
    };
    void refresh();
    const timer=setInterval(refresh,config.refreshMs);
    return()=>{active=false;controller?.abort();clearInterval(timer);};
  },[api,config.refreshMs]);

  const visible=config.category?products.filter(p=>p.category.localeCompare(config.category!,'de',{sensitivity:'base'})===0):products;
  visibleRef.current=visible;
  const groups=Object.entries(visible.reduce<Record<string,Product[]>>((all,p)=>{(all[p.category]??=[]).push(p);return all},{}));
  // A single category with far more drinks than the others (e.g. a big "Cocktails" list next to a
  // handful of beers) would otherwise dominate whichever column it lands in — since every column
  // shares one row-height unit sized to fit the heaviest column, that leaves the lighter columns
  // with a conspicuous empty gap at the bottom. Split an oversized category across two same-named
  // columns instead, so no single column towers over the rest.
  // One column on a handheld no matter what the URL asks for: two 170px columns on a phone leave
  // no room for a name, a curve, a trend and a price side by side.
  const portrait=config.format==='9x16';
  const boardColumns=handheld||portrait?1:Math.min(config.categoryColumns,Math.max(1,visible.length));
  const fairShare=visible.length/Math.max(1,boardColumns);
  const packable=groups.flatMap(([category,items])=>{
    if(items.length>4&&items.length>fairShare*1.5){
      const mid=Math.ceil(items.length/2);
      return[[category,items.slice(0,mid)],[category,items.slice(mid)]] as typeof groups;
    }
    return[[category,items]] as typeof groups;
  });
  // Greedy bin-packing by row count (largest categories first, always into the currently lightest
  // column) instead of a naive round-robin by category index — with 14-16+ drinks spread unevenly
  // across categories, round-robin could pile most rows into one column while others sit empty.
  const columns=Array.from({length:boardColumns},()=>[] as typeof groups);
  // Starts at -0.7 because each category adds a trailing 0.7 gap below itself, but there is no gap
  // below the last one — counting it would make every column look 0.7 units taller than it is and
  // shrink --u (and with it the whole board) for no reason.
  const columnUnits=Array.from({length:boardColumns},()=>-0.7);
  [...packable].sort((a,b)=>b[1].length-a[1].length).forEach(group=>{
    let lightest=0;
    for(let i=1;i<columnUnits.length;i++)if(columnUnits[i]<columnUnits[lightest])lightest=i;
    columns[lightest].push(group);
    columnUnits[lightest]+=0.85+group[1].length+0.7;
  });

  // Rotates "Im Fokus" between the biggest real discount and the biggest real markup every 15s, as in the prototype's spot modes.
  useEffect(()=>{
    let first=true;const modeRef={current:'discount' as SpotMode};
    const pick=(mode:SpotMode)=>{
      const candidates=visibleRef.current.filter(p=>p.minPriceCents<p.maxPriceCents&&!p.soldOut&&Boolean(p.basePriceCents)).map(p=>({p,percent:(p.priceCents-p.basePriceCents!)/p.basePriceCents!*100}));
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

  // Measures the real rendered column width AND height (not an assumed viewport) and derives a px
  // unit that every row's width, height and font size scale from — both axes are checked and the
  // smaller wins, so the board shrinks to fit rather than overflowing with many drinks, and can
  // never overflow regardless of how a TV's browser reports or scales its viewport. Mirrors the
  // prototype's own --u sizing technique (including its per-category "0.85 header + rows + 0.7
  // gap" unit budgeting used below to find the heaviest column).
  const maxColumnUnits=Math.max(1,...columnUnits);
  const totalUnitsSignature=columnUnits.join(',');
  const boardRef=useRef<HTMLElement>(null);
  const[unit,setUnit]=useState(36);
  useEffect(()=>{
    const el=boardRef.current;if(!el)return;
    const compute=()=>{
      const cs=getComputedStyle(el),stacked=cs.flexDirection==='column';
      const cols=stacked?1:Math.max(1,boardColumns);
      const gap=stacked?0:parseFloat(cs.columnGap)||0;
      const perColumn=(el.clientWidth-gap*(cols-1))/cols;
      const unitsToFit=stacked?columnUnits.reduce((a,b)=>a+b,0):maxColumnUnits;
      setUnit(boardUnit({handheld,perColumn,boardHeight:el.clientHeight,unitsToFit}));
    };
    compute();
    if(typeof ResizeObserver==='undefined'){window.addEventListener('resize',compute);return()=>window.removeEventListener('resize',compute)}
    const ro=new ResizeObserver(compute);ro.observe(el);
    return()=>ro.disconnect();
    // handheld/boardColumns belong here explicitly: without them a mode switch could leave the
    // ResizeObserver running the previous mode's closure and sizing the board by the wrong rule.
  },[handheld,boardColumns,maxColumnUnits,totalUnitsSignature]);

  const mode=health?.state?.mode??'VERBINDE…';
  const stale=!lastUpdate||clock.getTime()-lastUpdate>Math.max(5000,config.refreshMs*3)||mode==='VERBINDUNGSFEHLER';
  const phase=health?.state?.eventPhase;
  const footerNote=stale?'Keine aktuellen Kurse · letzter bekannter Stand':!health?.ok?'Systemprüfung fehlgeschlagen · Kasse informieren':phase==='PREPARING'?'Veranstaltung in Vorbereitung':phase==='CLOSED'?'Veranstaltung beendet':phase==='CLOSING'||mode==='PAYMENT_STOP'?'Zahlungen gestoppt':mode==='PRICE_FROZEN'?'Preise eingefroren · letzter Stand':`Stand: ${new Date(lastUpdate+serverOffset).toLocaleTimeString('de-DE')} · Trend: letzte 24 Kursstände`;
  // Format-specific overrides (used to be CSS attribute-selector rules keyed off a `.format-*`
  // class; expressed directly as conditional Tailwind classes here since the component already
  // knows config.format).
  // Typography scales off viewport height (clamped), not a root em — a 1080p and a 4K TV then land
  // on the same visual proportions instead of the 4K one rendering everything tiny. `scale` still
  // lets a specific venue nudge it, and `overscan` insets the whole board for TVs that crop edges.
  // Both axes set here rather than half inline / half in a className: an inline padding shorthand
  // beats the class, so splitting them silently drops whichever side the class was responsible
  // for. Horizontal is the prototype's max(16px,3.3vw) inset plus the TV overscan allowance.
  const style={
    '--display-scale':config.scale,
    paddingBlock:`${config.overscan}vmin`,
    paddingInline:`calc(max(16px, 3.3vw) + ${config.overscan}vmin)`,
  } as CSSProperties;
  // The focus area now owns a dedicated quarter of the width, so it no longer has to compete with
  // the drinks for leftover space in a column — it shows whenever there is something worth
  // featuring, and the board simply takes the full width when there is not.
  const showFocusCard=config.showFocus&&!portrait&&!stale;

  const crashLeft=crash?Math.max(0,Math.ceil((crash.until-clock.getTime()-serverOffset)/1000)):0;
  if(fleetTest)return<DiagnosticsPage embedded networkTestSeconds={15} onComplete={finishFleetTest}/>;
  // kiosk-lock (and the hard viewport height) only in kiosk mode: on a handheld the page has to
  // scroll like any other page, and locking the body there would trap the user on the first screen.
  return <main className={`w-full max-w-none m-0 bg-ticker-bg text-ticker-fg font-ticker-body flex flex-col select-none [&_*]:box-border ${handheld?'min-h-dvh':'kiosk-lock h-dvh overflow-hidden touch-none [overscroll-behavior:none]'}`} style={style}>
    <header className="flex-none flex items-center justify-between gap-[1em] pt-[2.2vh] pb-[1.8vh] border-b border-ticker-line">
      <div className="flex min-w-0 items-center gap-[0.8em]">
        <h1 className="m-0 truncate font-ticker-display font-bold text-[length:clamp(22px,calc(3.4vh*var(--display-scale,1)),52px)] leading-none tracking-[-0.01em]">Getränkebörse</h1>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="font-ticker-display font-semibold text-[length:clamp(18px,calc(2.8vh*var(--display-scale,1)),42px)] leading-none text-ticker-fg tabular-nums">{clock.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</span>
        <span className="mt-[0.35em] font-ticker-display text-[length:clamp(9px,1.25vh,16px)] font-semibold uppercase tracking-[0.1em] text-ticker-muted">{clock.toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'})}</span>
      </div>
    </header>
    {!stale&&health?.ok&&phase==='OPEN'&&mode==='NORMAL'&&crash&&crashLeft>0&&<CrashBar kind={crash.kind} secondsLeft={crashLeft}/>}
    {/* Height follows its own font size (py in em), so the tape is proportional on a phone and on
        a 4K TV alike — a fixed em height would be pinned to the inherited 16px root instead. */}
    {config.showTicker&&<div className="flex-none flex items-stretch overflow-hidden whitespace-nowrap border-b border-ticker-line bg-ticker-panel font-ticker-display font-bold text-[length:clamp(11px,1.7vh,22px)] leading-none" aria-label="Aktuelle Kurse">
      {visible.map(p=><div key={p.id} className="flex-none flex items-center gap-[0.8em] px-[1.2em] py-[0.9em] border-r border-ticker-line"><b className="font-semibold">{p.name}</b><span>{euro(p.priceCents)}</span></div>)}
    </div>}
    {/* Three parts drinks, one part focus. grow-[3]/grow-[1] on a zero basis rather than 75%/25%
        widths, so the gap between them is shared proportionally instead of pushing the total over
        100% and making both columns shrink unevenly. */}
    <div className={`pt-[2.4vh] pb-[1.8vh] flex gap-[2vw] ${handheld?'flex-col gap-[2vh]':'flex-1 min-h-0 overflow-hidden'}`} style={{'--u':`${unit}px`} as CSSProperties}>
      <section className={`grow-[3] basis-0 min-w-0 flex gap-[1.4vw] ${handheld||config.format==='9x16'?'flex-col gap-[1.4vh]':''} ${handheld?'':'overflow-hidden'}`} ref={boardRef}>
        {columns.map((column,columnIndex)=><div className={`${BOARD_COLUMN} px-[0.7vw] pb-[0.7vh] ${columnIndex?'border-l border-ticker-line pl-[1.4vw]':''}`} key={columnIndex}>
          {column.map(([category,items],i)=><section key={category+i}>
            <h2 className={CATEGORY_HEADING}>{category}</h2>
            <div className="flex flex-col">{items.map(p=><MarketRow key={p.id} product={p} history={history} charts={config.showCharts}/>)}</div>
          </section>)}
        </div>)}
        {!groups.length&&<div className="flex-1 flex items-center justify-center text-ticker-muted text-[length:clamp(16px,2.6vh,34px)]">{stale?'Kurse werden geladen …':'Keine Getränke in dieser Kategorie'}</div>}
      </section>
      {showFocusCard&&spot&&focusProduct&&(
        <aside className={`grow-[1] basis-0 min-w-0 flex flex-col border-ticker-line ${handheld?'border-t pt-[1.8vh]':'border-l pl-[2vw] min-h-0 overflow-hidden'}`}>
          <FocusCard product={focusProduct} mode={spot.mode} fade={spotFade} history={history} charts={config.showCharts} compact={handheld}/>
        </aside>
      )}
    </div>
    <BoardFooter note={footerNote||undefined} online={!stale&&Boolean(health?.ok)}/>
    <MomentOverlay moment={!stale&&health?.ok&&phase==='OPEN'&&mode==='NORMAL'&&(moment?.tone!=='crash'||crashLeft>0)?moment:null}/>
  </main>;
}
