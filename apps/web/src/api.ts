const base=import.meta.env.VITE_API_URL??'/api/v1';
// crypto.randomUUID() requires a secure context (HTTPS/localhost) and throws on the
// plain-HTTP LAN origin this app is served from, so idempotency keys use getRandomValues instead.
export function uuid(){const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&0x0f)|0x40;b[8]=(b[8]&0x3f)|0x80;const h=[...b].map(x=>x.toString(16).padStart(2,'0'));return`${h.slice(0,4).join('')}-${h.slice(4,6).join('')}-${h.slice(6,8).join('')}-${h.slice(8,10).join('')}-${h.slice(10,16).join('')}`}
export class Api{
  constructor(private token=localStorage.getItem('token')??''){}
  hasToken(){return Boolean(this.token)}
  setToken(v:string){this.token=v;localStorage.setItem('token',v)}
  async call<T>(path:string,init:RequestInit={}){const r=await fetch(base+path,{...init,headers:{'Content-Type':'application/json',...(this.token?{Authorization:`Bearer ${this.token}`} :{}),...init.headers}});const text=await r.text();let body:any=null;if(text){try{body=JSON.parse(text)}catch{body={}}}if(!r.ok)throw new Error(Array.isArray(body?.message)?body.message.join(', '):body?.message??body?.code??`HTTP ${r.status}`);return body as T}
  login(username:string,password:string,terminalId:string){return this.call<{accessToken:string}>('/auth/login',{method:'POST',body:JSON.stringify({username,password,terminalId})})}
  products(){return this.call<Product[]>('/products')}
  marketHistory(){return this.call<MarketHistory>('/market/history')}
  quote(items:{productId:string;quantity:number}[]){return this.call<Quote>('/quotes',{method:'POST',body:JSON.stringify({items})})}
  purchase(uid:string,quoteId:string,idempotencyKey:string=uuid()){return this.call<any>('/purchases',{method:'POST',headers:{'Idempotency-Key':idempotencyKey},body:JSON.stringify({uid,quoteId})})}
  topup(uid:string,amountCents:number,fundingMethod:'CASH'|'CARD_VERIFIED',paymentReference?:string,idempotencyKey:string=uuid()){return this.call<any>('/topups',{method:'POST',headers:{'Idempotency-Key':idempotencyKey},body:JSON.stringify({uid,amountCents,fundingMethod,paymentReference})})}
  health(){return this.call<any>('/operations/health')}
  startCrash(minutes:number,kind:'CRASH'|'AUSVERKAUF'){return this.call<any>('/market/crash',{method:'POST',body:JSON.stringify({minutes,kind})})}
  stopCrash(){return this.call<any>('/market/crash/stop',{method:'POST',body:'{}'})}
  cashSession(){return this.call<any>('/operations/cash-session')}
  openCashSession(openingCashCents:number){return this.call<any>('/operations/cash-session/open',{method:'POST',body:JSON.stringify({openingCashCents})})}
  closeCashSession(countedCashCents:number,reason?:string){return this.call<any>('/operations/cash-session/close',{method:'POST',body:JSON.stringify({countedCashCents,reason})})}
  report(){return this.call<any>('/operations/report')}
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
  setUserActive(id:string,active:boolean){return this.call<any>(`/admin/users/${id}/active`,{method:'PATCH',body:JSON.stringify({active})})}
  unlockUser(id:string){return this.call<any>(`/admin/users/${id}/unlock`,{method:'POST',body:'{}'})}
  adminProducts(){return this.call<AdminProduct[]>('/admin/products')}
  createProduct(input:ProductInput){return this.call<AdminProduct>('/admin/products',{method:'POST',body:JSON.stringify(input)})}
  updateProduct(id:string,patch:Partial<ProductInput&{active:boolean;soldOut:boolean}>){return this.call<AdminProduct>(`/admin/products/${id}`,{method:'PATCH',body:JSON.stringify(patch)})}
}
export type Product={id:string;name:string;category:string;priceCents:number;minPriceCents:number;maxPriceCents:number;soldOut:boolean;version:number};export type MarketPoint={version:number;effectiveAt:number;prices:Record<string,number>};export type MarketHistory={points:MarketPoint[]};export type Quote={quoteId:string;totalCents:number;expiresAt:number};
export type ProductInput={name:string;category:string;basePriceCents:number;minPriceCents:number;maxPriceCents:number};
export type AdminProduct=ProductInput&{id:string;active:boolean;soldOut:boolean;currentPriceCents:number|null};
