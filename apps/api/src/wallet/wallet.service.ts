import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { DomainError } from '../common/domain-error.js';
import { appendAudit } from '../common/audit.js';
import { resolveBandId } from './band-identity.js';
const WALLET_FIELDS=`w.id walletId,w.balance_cents balanceCents,w.status,wb.band_number bandNumber,wb.uid_hex uidHex,wb.kind,wb.status wristbandStatus,CASE WHEN EXISTS(SELECT 1 FROM free_drink_entitlements f WHERE f.wallet_id=w.id AND f.redeemed_order_id IS NULL) THEN 'AVAILABLE' WHEN EXISTS(SELECT 1 FROM free_drink_entitlements f WHERE f.wallet_id=w.id) THEN 'REDEEMED' ELSE 'NONE' END freeDrinkStatus`;
const SELECT_WALLET=`SELECT ${WALLET_FIELDS} FROM wristbands wb JOIN wristband_assignments a ON a.wristband_id=wb.id AND a.revoked_at IS NULL JOIN wallets w ON w.id=a.wallet_id WHERE wb.status='ACTIVE' AND `;
const SELECT_WALLET_ANY=`SELECT ${WALLET_FIELDS} FROM wristbands wb JOIN wristband_assignments a ON a.wristband_id=wb.id AND a.revoked_at IS NULL JOIN wallets w ON w.id=a.wallet_id WHERE `;
@Injectable() export class WalletService{
  constructor(private db:DatabaseService){}
  // The NFC sticker and the printed Tyvek band number identify the same physical wristband, so
  // either one must work here: iPhones can't read Web NFC at all, and even on devices that can,
  // staff should be free to just type the printed number instead of scanning.
  lookup(rawInput:string){return this.lookupWith(rawInput,SELECT_WALLET)}
  // Payment-flow lookups stay ACTIVE-only (a blocked band must never be payable), but viewing a
  // wallet's history needs to work on a blocked band too — otherwise "Sperren" makes the band look
  // deleted to staff instead of showing its FROZEN status, which is what actually happened.
  lookupAny(rawInput:string){return this.lookupWith(rawInput,SELECT_WALLET_ANY)}
  private lookupWith(rawInput:string,select:string){
    const bandId=resolveBandId(this.db.raw,rawInput);
    const row=bandId?this.db.raw.prepare(select+'wb.id=?').get(bandId):null;
    if(!row)throw new DomainError('WRISTBAND_NOT_ACTIVE','Wristband is unknown, blocked or not assigned',404);
    return row as {walletId:string;balanceCents:number;status:string;bandNumber:string;uidHex:string|null;kind:'NFC'|'TYVEK';wristbandStatus:string;freeDrinkStatus:'NONE'|'AVAILABLE'|'REDEEMED'};
  }
  grantFreeDrink(identifier:string,expectedWalletId:string,actorId:string){return this.db.raw.transaction(()=>{
    const lead=this.db.raw.prepare("SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.active=1 AND r.role IN('ADMIN','PAYMENT_LEAD')").get(actorId);
    if(!lead)throw new DomainError('FREE_DRINK_FORBIDDEN','Nur die Leitung darf Freigetränke vergeben',403);
    const phase=(this.db.raw.prepare('SELECT event_phase FROM system_state WHERE id=1').get() as any)?.event_phase;
    if(!['PREPARING','OPEN'].includes(phase))throw new DomainError('EVENT_NOT_OPEN','Keine neuen Freigetränke nach Verkaufsende',422);
    const wallet=this.lookup(identifier);if(wallet.walletId!==expectedWalletId||wallet.status!=='ACTIVE')throw new DomainError('WALLET_CHANGED','Armband neu scannen',409);
    const result=this.db.raw.prepare('INSERT INTO free_drink_entitlements(wallet_id,granted_by,granted_at) VALUES(?,?,?) ON CONFLICT(wallet_id) DO NOTHING').run(wallet.walletId,actorId,Date.now());
    if(result.changes)appendAudit(this.db.raw,{actorId,action:'FREE_DRINK_GRANTED',entityType:'wallet',entityId:wallet.walletId});
    return this.lookup(identifier);
  }).immediate()}
  // One scan, the full picture: staff deciding whether to approve a Storno or band swap need to
  // see what actually happened on this wallet, not just its current balance. Purchases carry
  // refundableCents so the UI can offer "Stornieren" only where money is actually left to return.
  history(rawInput:string){
    const wallet=this.lookupAny(rawInput);
    const orders=this.db.raw.prepare(`SELECT o.id,o.total_cents totalCents,o.status,o.created_at createdAt,EXISTS(SELECT 1 FROM free_drink_entitlements f WHERE f.redeemed_order_id=o.id) freeDrink,
      COALESCE((SELECT SUM(amount_cents) FROM refunds WHERE original_order_id=o.id),0) refundedCents
      FROM orders o WHERE o.wallet_id=? ORDER BY o.created_at DESC LIMIT 201`).all(wallet.walletId) as any[];
    const topups=this.db.raw.prepare(`SELECT id,amount_cents amountCents,funding_method fundingMethod,payment_reference paymentReference,status,created_at createdAt FROM topups WHERE wallet_id=? ORDER BY created_at DESC LIMIT 201`).all(wallet.walletId) as any[];
    const refunds=this.db.raw.prepare(`SELECT r.id,r.original_order_id orderId,r.amount_cents amountCents,r.reason,r.created_at createdAt FROM refunds r JOIN orders o ON o.id=r.original_order_id WHERE o.wallet_id=? ORDER BY r.created_at DESC LIMIT 201`).all(wallet.walletId) as any[];
    const entries=[
      ...orders.map(o=>({type:'PURCHASE' as const,id:o.id,amountCents:-o.totalCents,status:o.status,createdAt:o.createdAt,refundableCents:o.totalCents-o.refundedCents,freeDrink:Boolean(o.freeDrink)})),
      ...topups.map(t=>({type:'TOPUP' as const,id:t.id,amountCents:t.amountCents,status:t.status,createdAt:t.createdAt,fundingMethod:t.fundingMethod,paymentReference:t.paymentReference})),
      ...refunds.map(r=>({type:'REFUND' as const,id:r.id,orderId:r.orderId,amountCents:r.amountCents,createdAt:r.createdAt,reason:r.reason})),
    ].sort((a,b)=>b.createdAt-a.createdAt);
    return{wallet,entries:entries.slice(0,200),truncated:entries.length>200};
  }
}
