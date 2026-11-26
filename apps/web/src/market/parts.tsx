import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { MarketPoint, Product } from '../api';

// Shared visual building blocks of the public price board. They live here rather than in App.tsx
// so the pre-event venue check can preview the REAL components instead of a hand-rolled copy —
// the previous copy had already drifted (no sparkline, no marquee, different sold-out styling),
// which defeats the point of a check that is supposed to show what the board will actually look
// like on the night.

// Every row height, column width and font size on the board is a multiple of this one unit.
// Kiosk screens must fit one screen because nobody is there to scroll, so both axes are checked
// and the smaller wins. Handhelds deliberately ignore height: fitting a full drinks list into one
// phone screen works out at roughly a 10px price, so there readability wins and the page scrolls.
export function boardUnit({ handheld, perColumn, boardHeight, unitsToFit }: { handheld: boolean; perColumn: number; boardHeight: number; unitsToFit: number }) {
  const horizontal = perColumn / 6.6;
  if (handheld) return Math.max(30, Math.min(72, horizontal));
  const vertical = boardHeight / Math.max(1, unitsToFit);
  return Math.max(16, Math.min(130, Math.min(horizontal, vertical)));
}

export const euro = (c: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(c / 100);
export const priceNum = (c: number) => (c / 100).toFixed(2).replace('.', ',');
export const TONE = { up: '#3ddc84', down: '#ff5a5f', soft: '#56606c' };

export function marketSeries(product: Product, history: MarketPoint[]) {
  return history.map(point => ({ time: point.effectiveAt, price: point.prices[product.id] })).filter(point => point.price !== undefined);
}
export function marketTrend(product: Product, history: MarketPoint[]) {
  const series = marketSeries(product, history), start = series[0]?.price ?? product.priceCents;
  const delta = product.priceCents - start, percent = start ? delta / start * 100 : 0;
  const fixed = product.minPriceCents >= product.maxPriceCents;
  return { series, start, delta, percent, up: delta > 0, fixed, color: fixed || delta === 0 ? TONE.soft : delta > 0 ? TONE.up : TONE.down };
}

// Rolls the displayed price up/down for ~700ms when it changes, matching the ticker-board feel.
export function usePriceRoll(value: number) {
  const prev = useRef(value), [cls, setCls] = useState('');
  useEffect(() => {
    if (prev.current !== value) {
      const dir = value > prev.current ? 'ru' : 'rd';
      prev.current = value; setCls(dir);
      const t = setTimeout(() => setCls(''), 700);
      return () => clearTimeout(t);
    }
  }, [value]);
  return cls;
}

export function Sparkline({ history, product, color, lineWidth = 2 }: { history: MarketPoint[]; product: Product; color: string; lineWidth?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const series = marketSeries(product, history).map(p => p.price as number);
  const base = series[0] ?? product.priceCents;
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const hist = series.length ? series : [base];
    const draw = () => {
      const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
      const W = Math.round(w * dpr), H = Math.round(h * dpr);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H }
      const g = cv.getContext('2d'); if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      const pad = Math.max(base * 0.06, 1), lo = Math.min(base, ...hist) - pad, hi = Math.max(base, ...hist) + pad, span = hi - lo || 1;
      const y = (v: number) => h - lineWidth - 2 - (v - lo) / span * (h - 2 * lineWidth - 4);
      g.setLineDash([3, 5]); g.strokeStyle = 'rgba(244,246,248,.18)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, y(base)); g.lineTo(w, y(base)); g.stroke(); g.setLineDash([]);
      if (hist.length < 2) return;
      const step = (w - lineWidth * 2) / (hist.length - 1);
      g.beginPath(); hist.forEach((v, i) => { const x = i * step + lineWidth, yy = y(v); i ? g.lineTo(x, yy) : g.moveTo(x, yy) });
      g.lineWidth = lineWidth; g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = color; g.stroke();
      const lastX = (hist.length - 1) * step + lineWidth;
      g.lineTo(lastX, h); g.lineTo(lineWidth, h); g.closePath();
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, color + '44'); gr.addColorStop(1, color + '00');
      g.fillStyle = gr; g.fill();
      g.fillStyle = color; g.beginPath(); g.arc(lastX, y(hist[hist.length-1]), lineWidth * 1.6, 0, 7); g.fill();
    };
    draw();
    if(typeof ResizeObserver==='undefined'){window.addEventListener('resize',draw);return()=>window.removeEventListener('resize',draw)}
    const ro = new ResizeObserver(draw); ro.observe(cv);
    return () => ro.disconnect();
  }, [series.join(','), base, color, lineWidth]);
  return <canvas ref={ref} />;
}

// Names too long for their row get an auto-scrolling marquee instead of an ellipsis cutoff — but
// only the ones that actually overflow; short names stay perfectly still.
export function MarqueeText({ text }: { text: string }) {
  const outerRef = useRef<HTMLSpanElement>(null), innerRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  useEffect(() => {
    const outer = outerRef.current, inner = innerRef.current; if (!outer || !inner) return;
    const measure = () => { const diff = inner.scrollWidth - outer.clientWidth; setOverflow(diff > 2 ? diff : 0) };
    measure();
    if(typeof ResizeObserver==='undefined'){window.addEventListener('resize',measure);return()=>window.removeEventListener('resize',measure)}
    const ro = new ResizeObserver(measure); ro.observe(outer); ro.observe(inner);
    return () => ro.disconnect();
  }, [text]);
  const style = overflow ? { '--marquee-distance': `-${overflow}px`, '--marquee-duration': `${Math.max(5, overflow / 18)}s` } as CSSProperties : undefined;
  return <span ref={outerRef} className="block overflow-hidden whitespace-nowrap min-w-0" style={style}>
    <span ref={innerRef} className={`inline-block whitespace-nowrap will-change-transform motion-reduce:animate-none${overflow ? ' animate-ticker-marquee' : ''}`}>{text}</span>
  </span>;
}

// "Helles 0,5 l" reads better as a bold name with the volume set quietly beside it than as one
// long bold string — same split the prototype does, and it buys back row width for the name.
export function splitVolume(name: string) {
  const m = /^(.*\S)\s+(\d+(?:[.,]\d+)?\s?l)$/i.exec(name);
  return m ? { main: m[1], suffix: m[2] } : { main: name, suffix: '' };
}
export function DrinkName({ name }: { name: string }) {
  const { main, suffix } = splitVolume(name);
  return <span className="flex items-baseline min-w-0">
    <MarqueeText text={main} />
    {suffix && <small className="shrink-0 font-medium text-ticker-muted text-[0.66em] ml-[0.3em]">{suffix}</small>}
  </span>;
}

// Row and category-header heights are FIXED multiples of --u (1.0 and 0.85), exactly the budget
// MarketDisplay uses to derive --u. With min-height instead, a row could grow past its budget and
// push the last drink of a column off the bottom of an unattended screen nobody is watching.
const ROW_BASE = 'min-w-0 h-[var(--u,36px)] border-b border-ticker-line flex items-center gap-[calc(var(--u,36px)*0.18)]';
const ROW_NAME = 'flex-1 min-w-0 m-0 overflow-hidden font-semibold text-[length:calc(var(--u,36px)*0.44)] leading-none';
const ROW_CHART = 'shrink-0 basis-[calc(var(--u,36px)*1.05)] h-[calc(var(--u,36px)*0.52)] min-w-0 [&>canvas]:block [&>canvas]:w-full [&>canvas]:h-full';
const ROW_TREND = 'shrink-0 basis-[calc(var(--u,36px)*0.82)] text-right font-ticker-display font-semibold text-[length:calc(var(--u,36px)*0.26)] leading-none tabular-nums overflow-hidden';
const ROW_PRICE = 'shrink-0 basis-[calc(var(--u,36px)*1.62)] text-right whitespace-nowrap leading-[1.2] font-ticker-display font-bold tabular-nums overflow-hidden inline-block';
export const CATEGORY_HEADING = 'm-0 h-[calc(var(--u,36px)*0.85)] flex items-end pb-[calc(var(--u,36px)*0.12)] border-b border-ticker-line text-ticker-muted font-ticker-display text-[length:calc(var(--u,36px)*0.36)] leading-none font-semibold';
export const BOARD_COLUMN = 'flex-1 min-w-0 overflow-hidden flex flex-col gap-[calc(var(--u,36px)*0.7)]';

// A row's sparkline is only about 70px wide. Drawing the full hour of history into it squeezes
// ~60 points into that space, so every crash dip collapses into a 1px spike and the curve reads as
// a square wave rather than a trend. The recent window is used for the percentage too, so the
// number and the curve always describe the same stretch of time.
const ROW_HISTORY_POINTS = 24;

export function MarketRow({ product, history, charts }: { product: Product; history: MarketPoint[]; charts: boolean }) {
  const recent = history.length > ROW_HISTORY_POINTS ? history.slice(-ROW_HISTORY_POINTS) : history;
  const { percent, up, fixed, color } = marketTrend(product, recent), flat = !fixed && Math.round(percent) === 0, roll = usePriceRoll(product.priceCents);
  if (product.soldOut) return <article className={`${ROW_BASE} opacity-70`}>
    <h3 className={ROW_NAME}><DrinkName name={product.name} /></h3>
    {charts && <div className={ROW_CHART} />}
    <div className={ROW_TREND} />
    <strong className={`${ROW_PRICE} text-[length:calc(var(--u,36px)*0.26)] font-semibold text-ticker-down`}><span>ausverkauft</span></strong>
  </article>;
  return <article className={ROW_BASE}>
    <h3 className={ROW_NAME}><DrinkName name={product.name} /></h3>
    {charts && <div className={ROW_CHART}><Sparkline history={recent} product={product} color={color} /></div>}
    <div className={`${ROW_TREND} ${fixed || flat ? 'text-ticker-soft' : up ? 'text-ticker-up' : 'text-ticker-down'}`}>{fixed ? '' : flat ? '±0 %' : (up ? '▲ ' : '▼ ') + Math.abs(Math.round(percent)) + ' %'}</div>
    <strong className={`${ROW_PRICE} text-[length:calc(var(--u,36px)*0.58)] tracking-[-0.025em]`}>
      <span className={`inline-block ${roll === 'ru' ? 'animate-ticker-up' : roll === 'rd' ? 'animate-ticker-down' : ''}`}>{priceNum(product.priceCents)}</span>
      <span className="text-[0.5em] font-medium text-ticker-soft ml-[0.15em]">€</span>
    </strong>
  </article>;
}

// The German crash wording is long; on a phone it has to be allowed to sit above the countdown
// rather than squeezing it to nothing on one line.
export function CrashBar({ kind, secondsLeft }: { kind: string; secondsLeft: number }) {
  return <div className="flex-none flex items-baseline justify-between gap-[1em] mt-[2vh] px-[1.6vw] py-[1.4vh] bg-ticker-down text-white font-ticker-display font-bold text-[length:clamp(16px,3vh,44px)] max-[620px]:flex-col max-[620px]:items-start max-[620px]:gap-[0.2em]">
    <span>{kind === 'AUSVERKAUF' ? 'Ausverkauf · letzte Runde zum Tiefstpreis' : 'Börsencrash · alle Preise auf Tiefstand'}</span>
    <span className="tabular-nums shrink-0">noch {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</span>
  </div>;
}

export function BoardFooter({ note, online }: { note?: string; online: boolean }) {
  return <footer className={`flex-none flex items-center gap-x-[2em] gap-y-[0.3em] flex-wrap pt-[1.6vh] pb-[2.4vh] border-t border-ticker-line text-ticker-muted text-[length:clamp(13px,2vh,30px)] ${note ? 'justify-between' : 'justify-end'}`}>
    {note && <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{note}</span>}
    <span className="flex items-center whitespace-nowrap">
      <i className={`inline-block w-[0.55em] h-[0.55em] mr-[0.5em] rounded-full ${online ? 'bg-ticker-up' : 'bg-ticker-down'}`} />
      {online ? 'Verbunden' : 'Verbindung unterbrochen'}
    </span>
  </footer>;
}

export type Moment = { tone: 'up' | 'down' | 'crash'; title: string; sub: string };

export function MomentOverlay({ moment, inline = false }: { moment: Moment | null; inline?: boolean }) {
  const crash = moment?.tone === 'crash';
  return <div className={`${inline ? 'relative min-h-[40vh]' : 'fixed inset-0'} z-20 flex flex-col justify-center px-[7vw] transition-[opacity,visibility] duration-400 ${moment ? 'opacity-100 visible' : 'opacity-0 invisible'} ${crash ? 'bg-ticker-down text-white' : 'bg-ticker-bg text-ticker-fg'}`}>
    {moment && <>
      <div className={`font-ticker-display font-semibold text-[length:clamp(18px,4.2vh,60px)] ${crash ? 'text-white/75' : 'text-ticker-gold'} animate-ticker-enter [animation-delay:50ms] motion-reduce:animate-none`}>
        {moment.tone === 'up' ? 'Höchstkurs erreicht' : moment.tone === 'down' ? 'Tiefstpreis' : 'Börse'}
      </div>
      <div className={`font-ticker-display font-bold text-[length:min(17vh,10vw)] leading-[1.02] mt-[1.5vh] whitespace-nowrap overflow-hidden text-ellipsis motion-reduce:animate-none ${crash ? 'animate-ticker-crash-headline' : 'animate-ticker-enter [animation-delay:150ms]'}`}>
        {moment.title}
      </div>
      <div className={`font-ticker-display font-semibold text-[length:clamp(20px,6.5vh,96px)] mt-[2.5vh] tabular-nums animate-ticker-enter [animation-delay:300ms] motion-reduce:animate-none ${crash ? 'text-white/85' : moment.tone === 'up' ? 'text-ticker-up' : moment.tone === 'down' ? 'text-ticker-down' : 'text-ticker-muted'}`}>
        {moment.sub}
      </div>
    </>}
  </div>;
}
