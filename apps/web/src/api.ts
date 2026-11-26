import { io } from 'socket.io-client';
const base=import.meta.env.VITE_API_URL??'/api/v1';
// crypto.randomUUID() requires a secure context (HTTPS/localhost) and throws on the
// plain-HTTP LAN origin this app is served from, so idempotency keys use getRandomValues instead.
export function uuid(){const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&0x0f)|0x40;b[8]=(b[8]&0x3f)|0x80;const h=[...b].map(x=>x.toString(16).padStart(2,'0'));return`${h.slice(0,4).join('')}-${h.slice(4,6).join('')}-${h.slice(6,8).join('')}-${h.slice(8,10).join('')}-${h.slice(10,16).join('')}`}
export class ApiError extends Error { constructor(message:string, public status:number, public code?:string){super(message)} }
const ERROR_TEXT:Record<string,string>={CASH_SESSION_REQUIRED:'Bitte zuerst die Bargeldkasse dieses Terminals eröffnen.',LEDGER_MISCONFIGURED:'Buchhaltung inkonsistent. Bitte Veranstaltungsleitung informieren.',INSUFFICIENT_FUNDS:'Nicht genug Guthaben.',QUOTE_INVALID:'Preisangebot abgelaufen oder bereits verwendet.',PAYMENT_STOP:'Zahlungen sind gesperrt.',EVENT_NOT_OPEN:'Veranstaltung nicht geöffnet.',TRANSACTION_NOT_FOUND:'Buchung nicht gefunden.',TRANSACTION_FORBIDDEN:'Vorgang gehört zu einer anderen Sitzung.',WRISTBAND_NOT_ACTIVE:'Armband nicht aktiv oder nicht zugeordnet.'};
export class Api{
  constructor(private token=localStorage.getItem('token')??''){}
  hasToken(){return Boolean(this.token)}
  setToken(v:string){this.token=v;localStorage.setItem('token',v)}
  // The JWT already carries terminalId as a claim (it's what the server itself uses to attribute
  // every financial operation) — reading it back out of the token avoids keeping a second,
  // potentially stale copy of the same fact in local state.
  terminalId(){try{const payload=this.token.split('.')[1];return JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/')))?.terminalId as string|undefined}catch{return undefined}}
  operatorId(){try{const payload=this.token.split('.')[1];return JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/')))?.sub as string|undefined}catch{return undefined}}
  roles(){try{const payload=this.token.split('.')[1];return (JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/')))?.roles as string[]|undefined)??[]}catch{return[]}}
  async call<T>(path:string,init:RequestInit={}){const r=await fetch(base+path,{...init,headers:{'Content-Type':'application/json',...(this.token?{Authorization:`Bearer ${this.token}`} :{}),...init.headers}});const text=await r.text();let body:any=null;if(text){try{body=JSON.parse(text)}catch{body={}}}if(!r.ok)throw new ApiError(ERROR_TEXT[body?.code]??(Array.isArray(body?.message)?body.message.join(', '):body?.message??body?.code??`HTTP ${r.status}`),r.status,body?.code);return body as T}
  session(){return this.call<{username:string;roles:string[];terminalId:string}>('/auth/me')}
  login(username:string,password:string,terminalId:string){return this.call<{accessToken:string}>('/auth/login',{method:'POST',body:JSON.stringify({username,password,terminalId})})}
  lookupWallet(identifier:string){return this.call<WalletIdentity>('/wallets/lookup',{method:'POST',body:JSON.stringify({uid:identifier})})}
  grantFreeDrink(uid:string,expectedWalletId:string){return this.call<WalletIdentity>('/wallets/free-drink',{method:'POST',body:JSON.stringify({uid,expectedWalletId})})}
  walletHistory(identifier:string){return this.call<{wallet:WalletIdentity;entries:HistoryEntry[];truncated?:boolean}>('/wallets/history',{method:'POST',body:JSON.stringify({uid:identifier})})}
  blockWristband(identifier:string,reason:string){return this.call<any>('/wristbands/block',{method:'POST',body:JSON.stringify({uid:identifier,reason})})}
  products(){return this.call<Product[]>('/products')}
  subscribeProducts(receive:(products:Product[])=>void){const socket=io('/market',{path:'/api/socket.io',transports:['websocket']});socket.on('prices',receive);return()=>socket.disconnect()}
  marketHistory(signal?:AbortSignal){return this.call<MarketHistory>('/market/history',{signal,cache:'no-store'})}
  quote(items:{productId:string;quantity:number}[]){return this.call<Quote>('/quotes',{method:'POST',body:JSON.stringify({items})})}
  purchase(uid:string,quoteId:string,idempotencyKey:string=uuid(),expectedWalletId?:string,freeDrink?:true){return this.call<any>('/purchases',{method:'POST',headers:{'Idempotency-Key':idempotencyKey},body:JSON.stringify({uid,quoteId,expectedWalletId,freeDrink})})}
  topup(uid:string,amountCents:number,fundingMethod:'CASH'|'CARD_VERIFIED',paymentReference?:string,idempotencyKey:string=uuid(),expectedWalletId?:string){return this.call<any>('/topups',{method:'POST',headers:{'Idempotency-Key':idempotencyKey},body:JSON.stringify({uid,amountCents,fundingMethod,paymentReference,expectedWalletId})})}
  cancelTransaction(key:string,type:'TOPUP'|'PURCHASE',quoteId?:string){return this.call<{status:string;response:any}>(`/transactions/${encodeURIComponent(key)}/cancel`,{method:'POST',body:JSON.stringify({type,quoteId})})}
  transactionStatus(idempotencyKey:string){return this.call<{type:string;status:string;createdAt:number;committedAt:number|null;response:any}>(`/transactions/${encodeURIComponent(idempotencyKey)}`)}
  health(){return this.call<any>('/operations/health')}
  startCrash(minutes:number,kind:'CRASH'|'AUSVERKAUF'){return this.call<any>('/market/crash',{method:'POST',body:JSON.stringify({minutes,kind})})}
  stopCrash(){return this.call<any>('/market/crash/stop',{method:'POST',body:'{}'})}
  cashSession(){return this.call<OpenCashSession|null>('/operations/cash-session')}
  cashSessions(){return this.call<OpenCashSession[]>('/operations/cash-sessions')}
  openCashSession(openingCashCents:number){return this.call<any>('/operations/cash-session/open',{method:'POST',body:JSON.stringify({openingCashCents})})}
  closeCashSession(sessionId:string,expectedCashCents:number,countedCashCents:number,reason?:string){return this.call<{differenceCents:number}>('/operations/cash-session/close',{method:'POST',body:JSON.stringify({sessionId,expectedCashCents,countedCashCents,reason})})}
  report(){return this.call<any>('/operations/report')}
  eventState(){return this.call<EventState>('/operations/event')}
  openEvent(name:string){return this.call<EventState>('/operations/event/open',{method:'POST',body:JSON.stringify({name})})}
  beginEventClosing(){return this.call<EventState>('/operations/event/begin-closing',{method:'POST',body:'{}'})}
  backEvent(expectedPhase:EventPhase){return this.call<EventState>('/operations/event/back',{method:'POST',body:JSON.stringify({expectedPhase})})}
  closeEvent(){return this.call<EventState>('/operations/event/close',{method:'POST',body:'{}'})}
  approvals(){return this.call<any[]>('/approvals')}
  requestRefund(orderId:string,reason:string,amountCents?:number){return this.approvalRequest('/approvals/refunds',{orderId,reason,amountCents})}
  requestBandReplacement(oldUid:string,newUid:string,reason:string){return this.approvalRequest('/approvals/wristband-replacements',{oldUid,newUid,reason})}
  requestNormalMode(reason:string){return this.approvalRequest('/approvals/normal-mode',{reason})}
  private approvalRequest(path:string,body:unknown){return this.call<any>(path,{method:'POST',headers:{'Idempotency-Key':uuid()},body:JSON.stringify(body)})}
  approve(id:string){return this.call<any>(`/approvals/${id}/approve`,{method:'POST',body:'{}'})}
  reject(id:string,reason:string){return this.call<any>(`/approvals/${id}/reject`,{method:'POST',body:JSON.stringify({reason})})}
  backups(){return this.call<any[]>('/operations/backups')}
  createBackup(){return this.call<any>('/operations/backups',{method:'POST',body:'{}'})}
  signedReports(){return this.call<any[]>('/operations/signed-reports')}
  createSignedReport(){return this.call<any>('/operations/signed-reports',{method:'POST',body:'{}'})}
  users(){return this.call<any[]>('/admin/users')}
  createUser(username:string,password:string,roles:string[]){return this.call<any>('/admin/users',{method:'POST',body:JSON.stringify({username,password,roles})})}
  setUserRoles(id:string,roles:string[],password?:string){return this.call<any>(`/admin/users/${id}/roles`,{method:'PATCH',body:JSON.stringify({roles,password})})}
  setUserActive(id:string,active:boolean){return this.call<any>(`/admin/users/${id}/active`,{method:'PATCH',body:JSON.stringify({active})})}
  unlockUser(id:string){return this.call<any>(`/admin/users/${id}/unlock`,{method:'POST',body:'{}'})}
  adminProducts(){return this.call<AdminProduct[]>('/admin/products')}
  createProduct(input:ProductInput){return this.call<AdminProduct>('/admin/products',{method:'POST',body:JSON.stringify(input)})}
  updateProduct(id:string,patch:Partial<ProductInput&{active:boolean;soldOut:boolean}>){return this.call<AdminProduct>(`/admin/products/${id}`,{method:'PATCH',body:JSON.stringify(patch)})}
  wristbands(){return this.call<Wristband[]>('/wristbands')}
  registerWristband(input:{bandNumber:string;kind:'NFC'|'TYVEK';uid?:string;initialBalanceCents:number;freeDrink?:boolean}){return this.call<Wristband>('/wristbands/register',{method:'POST',body:JSON.stringify(input)})}
  async importWristbands(file:File){const form=new FormData();form.append('file',file);const r=await fetch(`${base}/admin/wristbands/import`,{method:'POST',headers:this.token?{Authorization:`Bearer ${this.token}`}:{},body:form});const text=await r.text();let body:any=null;if(text){try{body=JSON.parse(text)}catch{body={}}}if(!r.ok)throw new Error(body?.message??body?.code??`HTTP ${r.status}`);return body as{imported:number;errors:string[]}}
  deviceHeartbeat(deviceId:string,info:{name?:string;userAgent?:string;screenWidth?:number;screenHeight?:number}){return this.call<{ok:true}>(`/devices/${deviceId}/heartbeat`,{method:'POST',body:JSON.stringify(info)})}
  reportDiagnostic(deviceId:string,result:DiagnosticResult){return this.call<{ok:true}>(`/devices/${deviceId}/diagnostic-result`,{method:'POST',body:JSON.stringify(result)})}
  devices(){return this.call<DeviceRecord[]>('/devices')}
  renameDevice(deviceId:string,name:string){return this.call<{ok:true}>(`/devices/${deviceId}`,{method:'PATCH',body:JSON.stringify({name})})}
  triggerFleetDiagnostics(){return this.call<{requestedAt:number}>('/devices/trigger-diagnostics',{method:'POST',body:'{}'})}
  chips(){return this.call<ChipDevice[]>('/chips')}
  renameChip(chipId:string,name:string){return this.call<{success:boolean}>(`/chips/${chipId}`,{method:'PATCH',body:JSON.stringify({name})})}
  setChipDesiredState(chipId:string,state:Record<string,unknown>){return this.call<{success:boolean;desiredState:Record<string,unknown>}>(`/chips/${chipId}/desired-state`,{method:'PATCH',body:JSON.stringify(state)})}
  setPendingCharge(terminalId:string,charge:PendingCharge){return this.call<{ok:true}>(`/terminals/${terminalId}/pending-charge`,{method:'POST',body:JSON.stringify(charge)})}
  getPendingCharge(terminalId:string){return this.call<PendingCharge|{type:null}>(`/terminals/${terminalId}/pending-charge`)}
  clearPendingCharge(terminalId:string,quoteId?:string){return this.call<{ok:boolean}>(`/terminals/${terminalId}/pending-charge${quoteId?'?quoteId='+encodeURIComponent(quoteId):''}`,{method:'DELETE'})}
}
export type Product={id:string;name:string;category:string;priceCents:number;basePriceCents?:number;minPriceCents:number;maxPriceCents:number;soldOut:boolean;version:number};export type MarketPoint={version:number;effectiveAt:number;prices:Record<string,number>};export type MarketHistory={points:MarketPoint[];snapshot?:{products:Product[];health:{ok:boolean;state:any};serverTime:number}};export type Quote={quoteId:string;totalCents:number;expiresAt:number;items:{productId:string;quantity:number;name:string;unitPriceCents:number}[]};
export type WalletIdentity={walletId:string;balanceCents:number;status:string;bandNumber:string;uidHex:string|null;kind:'NFC'|'TYVEK';freeDrinkStatus?:'NONE'|'AVAILABLE'|'REDEEMED'};
export type EventPhase='PREPARING'|'OPEN'|'CLOSING'|'CLOSED';
export type ChecklistItem={id:string;label:string;required:boolean;ok:boolean;detail:string};
export type OpenCashSession={id:string;terminalId:string;terminalName:string;operatorId:string;operatorName:string;openedAt:number;openingCashCents:number;movementsCents:number;expectedCashCents:number};
export type EventState={
  phase:EventPhase;name:string|null;openedAt:number|null;closedAt:number|null;mode:string;
  checklist:ChecklistItem[];
  closing:{openCashSessions:{id:string;terminalId:string;terminalName:string;openedAt:number;openingCashCents:number}[];outstandingWallets:number;outstandingCents:number;pendingOperations:number;pendingApprovals:number};
};
export type HistoryEntry=
  |{type:'PURCHASE';id:string;amountCents:number;status:string;createdAt:number;refundableCents:number;freeDrink?:boolean}
  |{type:'TOPUP';id:string;amountCents:number;status:string;createdAt:number;fundingMethod:'CASH'|'CARD_VERIFIED';paymentReference:string|null}
  |{type:'REFUND';id:string;orderId:string;amountCents:number;createdAt:number;reason:string};
export type ProductInput={name:string;category:string;basePriceCents:number;minPriceCents:number;maxPriceCents:number};
export type AdminProduct=ProductInput&{id:string;active:boolean;soldOut:boolean;currentPriceCents:number|null};
export type Wristband={id:string;bandNumber:string;uidHex:string|null;kind:'NFC'|'TYVEK';status:'IMPORTED'|'ACTIVE'|'BLOCKED'|'RETIRED';createdAt:number;balanceCents:number|null;initialBalanceCents:number;freeDrinkStatus?:'NONE'|'AVAILABLE'|'REDEEMED'};
export type PendingCharge=
  |{type:'purchase';quoteId:string;totalCents:number;items:{name:string;quantity:number;unitPriceCents:number}[]}
  |{type:'topup';amountCents:number;fundingMethod:'CASH'|'CARD_VERIFIED';paymentReference?:string};
export type DiagnosticResult={network:{avgMs:number;failures:number;samples:number;verdict:'good'|'warn'|'bad'};device:Record<string,unknown>};
export type DeviceRecord={id:string;name:string|null;userAgent:string|null;screenWidth:number|null;screenHeight:number|null;firstSeenAt:number;lastSeenAt:number;lastDiagnosticAt:number|null;diagnosticResult:DiagnosticResult|null};
export type ChipDevice={id:string;type:string;name:string;firmwareVersion:string|null;ipAddress:string|null;firstSeenAt:number;lastSeenAt:number;capabilities:string[];reportedState:Record<string,unknown>;desiredState:Record<string,unknown>;online:boolean};
// Every display persists its own id on first load so the admin fleet view can recognize it again
// across reloads/restarts, without needing a login (these are unattended kiosk devices).
export function deviceId(){let v=localStorage.getItem('device-id');if(!v){v=`disp-${crypto.getRandomValues(new Uint32Array(4)).join('')}`;localStorage.setItem('device-id',v)}return v}
