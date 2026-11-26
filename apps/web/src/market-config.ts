export type MarketFormat='16x9'|'21x9'|'4x3'|'9x16'|'auto';

export type MarketDisplayConfig={
  format:MarketFormat;
  categoryColumns:number;
  scale:number;
  overscan:number;
  refreshMs:number;
  showCharts:boolean;
  showTicker:boolean;
  showFocus:boolean;
  sound:boolean;
  category?:string;
};

const clamp=(value:number,min:number,max:number,fallback:number)=>Number.isFinite(value)?Math.min(max,Math.max(min,value)):fallback;
const numberParam=(params:URLSearchParams,name:string)=>params.has(name)?Number(params.get(name)):Number.NaN;

export function parseMarketDisplayConfig(search:string):MarketDisplayConfig{
  const params=new URLSearchParams(search);
  const rawFormat=(params.get('format')??'16:9').toLowerCase().replace(':','x');
  const format=(['16x9','21x9','4x3','9x16','auto'].includes(rawFormat)?rawFormat:'16x9') as MarketFormat;
  // Two, not three, since the focus area now takes a dedicated quarter of the width: three drink
  // columns in the remaining three quarters leaves each one as narrow as the focus column itself,
  // which shrinks --u (and with it every price) for no good reason. `?columns=3` still overrides.
  const defaultColumns=format==='9x16'?1:format==='4x3'?2:format==='21x9'?3:2;
  const category=params.get('category')?.trim();
  return{
    format,
    categoryColumns:Math.round(clamp(numberParam(params,'columns'),1,6,defaultColumns)),
    scale:clamp(numberParam(params,'scale'),75,140,100)/100,
    overscan:clamp(numberParam(params,'overscan'),0,8,2),
    // Default lowered to 1s (from 5s) so a crash triggered by the physical button reaches every
    // display as close to real-time as possible — these are cheap reads, trivial at party scale.
    refreshMs:Math.round(clamp(numberParam(params,'refresh'),1,60,1)*1000),
    showCharts:params.get('charts')!=='0',
    showTicker:params.get('ticker')==='1',
    showFocus:params.get('focus')!=='0',
    sound:false,
    category:category||undefined,
  };
}
