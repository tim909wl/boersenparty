import { resolveBandId } from './band-identity.js';
import { createWallet } from '../database/wallet-factory.js';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { DomainError } from '../common/domain-error.js';
import { normalizeUid } from '../common/uid.js';
import { canonicalHash, id } from '../common/hash.js';
import { appendAudit } from '../common/audit.js';

@Injectable() export class WristbandAdminService{
  private resolveBand(identifier:string){return resolveBandId(this.db.raw,identifier)}
  constructor(private db:DatabaseService){}
  list(){return this.db.raw.prepare(`SELECT wb.id,wb.band_number bandNumber,wb.uid_hex uidHex,wb.kind,wb.status,wb.created_at createdAt,w.balance_cents balanceCents,CASE WHEN EXISTS(SELECT 1 FROM free_drink_entitlements f WHERE f.wallet_id=w.id AND f.redeemed_order_id IS NULL) THEN 'AVAILABLE' WHEN EXISTS(SELECT 1 FROM free_drink_entitlements f WHERE f.wallet_id=w.id) THEN 'REDEEMED' ELSE 'NONE' END freeDrinkStatus,
    COALESCE((SELECT SUM(le.amount_cents) FROM ledger_entries le JOIN ledger_accounts la ON la.id=le.account_id JOIN financial_operations fo ON fo.id=le.operation_id WHERE la.wallet_id=w.id AND fo.type='STARTING_BALANCE'),0) initialBalanceCents
    FROM wristbands wb LEFT JOIN wristband_assignments a ON a.wristband_id=wb.id AND a.revoked_at IS NULL LEFT JOIN wallets w ON w.id=a.wallet_id ORDER BY wb.band_number COLLATE NOCASE`).all()}
  register(input:{bandNumber:string;uid?:string;kind:'NFC'|'TYVEK';initialBalanceCents:number;freeDrink?:boolean},actorId:string){
    const bandNumber=input.bandNumber.trim();
    if(!bandNumber)throw new DomainError('BAND_NUMBER_REQUIRED','Band number is required',400);
    if(![0,500].includes(input.initialBalanceCents))throw new DomainError('INVALID_STARTING_BALANCE','Nur 0 € oder 5 € Startguthaben erlaubt',400);
    const uid=input.kind==='NFC'?normalizeUid(input.uid??''):null;
    return this.db.raw.transaction(()=>{
      const phase=(this.db.raw.prepare('SELECT event_phase FROM system_state WHERE id=1').get() as any)?.event_phase;
      if(!['PREPARING','OPEN'].includes(phase))throw new DomainError('EVENT_NOT_OPEN','Nach Verkaufsende keine neuen Armbänder registrieren',422);
      if(input.initialBalanceCents>0&&!this.db.raw.prepare("SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.active=1 AND r.role IN('ADMIN','PAYMENT_LEAD')").get(actorId))throw new DomainError('STARTING_BALANCE_FORBIDDEN','Nur die Leitung darf Startguthaben vergeben',403);
      if(input.freeDrink&&!this.db.raw.prepare("SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.active=1 AND r.role IN('ADMIN','PAYMENT_LEAD')").get(actorId))throw new DomainError('FREE_DRINK_FORBIDDEN','Nur die Leitung darf Freigetränke vergeben',403);
      if(this.resolveBand(bandNumber)||(uid&&this.resolveBand(uid)))throw new DomainError('WRISTBAND_EXISTS','This band number or UID is already registered',409);
      const wristbandId=id(),walletId=id(),now=Date.now();
      this.db.raw.prepare("INSERT INTO wristbands(id,band_number,uid_hex,kind,status,created_at) VALUES(?,?,?,?,'ACTIVE',?)").run(wristbandId,bandNumber,uid,input.kind,now);
      const walletAccountId=createWallet(this.db.raw,walletId,now);
      this.db.raw.prepare('INSERT INTO wristband_assignments(id,wristband_id,wallet_id,assigned_at) VALUES(?,?,?,?)').run(id(),wristbandId,walletId,now);


      if(input.initialBalanceCents>0){
        const operationId=id(),operationKey=`starting-balance:${wristbandId}`,response={wristbandId,walletId,amountCents:input.initialBalanceCents,status:'COMMITTED'};
        const clearing=this.db.raw.prepare("SELECT id FROM ledger_accounts WHERE type='STARTING_BALANCE'").get() as {id:string}|undefined;
        if(!clearing)throw new DomainError('LEDGER_MISCONFIGURED','Starting balance account is missing',500);
        this.db.raw.prepare('INSERT INTO financial_operations(id,idempotency_key,request_hash,type,status,terminal_id,operator_id,created_at,committed_at,response_json) VALUES(?,?,?,?,?,?,?,?,?,?)').run(operationId,operationKey,canonicalHash({wristbandId,amountCents:input.initialBalanceCents}),'STARTING_BALANCE','COMMITTED',null,actorId,now,now,JSON.stringify(response));
        this.db.raw.prepare('INSERT INTO ledger_entries VALUES(?,?,?,?,?)').run(id(),operationId,walletAccountId,input.initialBalanceCents,now);
        this.db.raw.prepare('INSERT INTO ledger_entries VALUES(?,?,?,?,?)').run(id(),operationId,clearing.id,-input.initialBalanceCents,now);
        this.db.raw.prepare('UPDATE wallets SET balance_cents=?,version=version+1 WHERE id=?').run(input.initialBalanceCents,walletId);
      }
      if(input.freeDrink){this.db.raw.prepare('INSERT INTO free_drink_entitlements(wallet_id,granted_by,granted_at) VALUES(?,?,?)').run(walletId,actorId,now);appendAudit(this.db.raw,{actorId,action:'FREE_DRINK_GRANTED',entityType:'wallet',entityId:walletId});}
      appendAudit(this.db.raw,{actorId,action:'WRISTBAND_REGISTERED',entityType:'wristband',entityId:wristbandId,payload:{bandNumber,uid,kind:input.kind,initialBalanceCents:input.initialBalanceCents}});
      return{id:wristbandId,bandNumber,uidHex:uid,kind:input.kind,status:'ACTIVE',balanceCents:input.initialBalanceCents,initialBalanceCents:input.initialBalanceCents};
    }).immediate()
  }
  replacementIdentifiers(oldIdentifier:string,newIdentifier:string){const old=this.resolveBand(oldIdentifier.trim()),next=this.resolveBand(newIdentifier.trim());if(!old||!next||old===next)throw new DomainError('INVALID_REPLACEMENT','Zwei verschiedene registrierte Armbänder erforderlich',422);const get=(id:string)=>(this.db.raw.prepare('SELECT band_number FROM wristbands WHERE id=?').get(id) as {band_number:string}).band_number;return {oldUid:get(old),newUid:get(next)};}
  block(identifierValue:string,reason:string,actorId:string){const identifier=identifierValue.trim();if(reason.trim().length<5)throw new DomainError('REASON_REQUIRED','Blocking requires a reason',400);return this.db.raw.transaction(()=>{const band=this.db.raw.prepare("SELECT id,band_number FROM wristbands WHERE id=? AND status='ACTIVE'").get(this.resolveBand(identifier)) as any;if(!band)throw new DomainError('WRISTBAND_NOT_ACTIVE','Wristband is not active',404);this.db.raw.prepare("UPDATE wristbands SET status='BLOCKED' WHERE id=?").run(band.id);this.db.raw.prepare("UPDATE wallets SET status='FROZEN',version=version+1 WHERE id=(SELECT wallet_id FROM wristband_assignments WHERE wristband_id=? AND revoked_at IS NULL)").run(band.id);appendAudit(this.db.raw,{actorId,action:'WRISTBAND_BLOCKED',entityType:'wristband',entityId:band.id,payload:{bandNumber:band.band_number,reason:reason.trim()}});return{bandNumber:band.band_number,status:'BLOCKED'}}).immediate()}
  replace(oldIdentifierValue:string,newIdentifierValue:string,reason:string,actorId:string){const oldIdentifier=oldIdentifierValue.trim(),newIdentifier=newIdentifierValue.trim();if(reason.trim().length<5)throw new DomainError('REASON_REQUIRED','Replacement requires a reason',400);return this.db.raw.transaction(()=>{const oldBand=this.db.raw.prepare(`SELECT wb.id,wb.band_number,a.wallet_id FROM wristbands wb JOIN wristband_assignments a ON a.wristband_id=wb.id AND a.revoked_at IS NULL WHERE wb.id=? AND wb.status IN('ACTIVE','BLOCKED')`).get(this.resolveBand(oldIdentifier)) as any;const replacement=this.db.raw.prepare(`SELECT wb.id,wb.band_number,a.id assignment_id,a.wallet_id,w.balance_cents FROM wristbands wb JOIN wristband_assignments a ON a.wristband_id=wb.id AND a.revoked_at IS NULL JOIN wallets w ON w.id=a.wallet_id WHERE wb.id=? AND wb.status='ACTIVE'`).get(this.resolveBand(newIdentifier)) as any;if(!oldBand)throw new DomainError('SOURCE_WRISTBAND_NOT_FOUND','Source wristband has no active assignment',404);if(!replacement)throw new DomainError('REPLACEMENT_NOT_AVAILABLE','Replacement wristband is not available',404);if(oldBand.id===replacement.id)throw new DomainError('SAME_WRISTBAND','Replacement wristband must differ',400);const entries=this.db.raw.prepare(`SELECT le.amount_cents amount,la.id accountId,f.type,f.status FROM ledger_entries le JOIN ledger_accounts la ON la.id=le.account_id JOIN financial_operations f ON f.id=le.operation_id WHERE la.wallet_id=?`).all(replacement.wallet_id) as {amount:number;accountId:string;type:string;status:string}[];
    const purchases=this.db.raw.prepare('SELECT 1 FROM orders WHERE wallet_id=? LIMIT 1').get(replacement.wallet_id);
    const topups=this.db.raw.prepare('SELECT 1 FROM topups WHERE wallet_id=? LIMIT 1').get(replacement.wallet_id);
    const unusedCredit=entries.length===1&&entries[0].type==='STARTING_BALANCE'&&entries[0].status==='COMMITTED'&&entries[0].amount===replacement.balance_cents&&replacement.balance_cents===500;
    if(this.db.raw.prepare('SELECT 1 FROM free_drink_entitlements WHERE wallet_id=?').get(replacement.wallet_id))throw new DomainError('REPLACEMENT_WALLET_USED','Ersatzarmband hat bereits ein Freigetränk',422);
    if(purchases||topups||(!unusedCredit&&(replacement.balance_cents!==0||entries.length!==0)))throw new DomainError('REPLACEMENT_WALLET_USED','Ersatzarmband wurde bereits verwendet',422);
    const now=Date.now();
    // Reverse only the unused complimentary credit, never real money. Keep both ledger entries.
    if(unusedCredit){const contra=this.db.raw.prepare("SELECT id FROM ledger_accounts WHERE type='STARTING_BALANCE'").get() as {id:string}|undefined;if(!contra)throw new DomainError('LEDGER_MISCONFIGURED','Startguthabenkonto fehlt',503);const op=id(),key=`replacement-credit:${replacement.wallet_id}`;this.db.raw.prepare("INSERT INTO financial_operations VALUES(?,?,?,?, 'COMMITTED',NULL,?,?,?,?)").run(op,key,canonicalHash({walletId:replacement.wallet_id,amountCents:-500}),'ADJUSTMENT',actorId,now,now,JSON.stringify({status:'COMMITTED',operationId:op,walletId:replacement.wallet_id,amountCents:-500}));this.db.raw.prepare('INSERT INTO ledger_entries VALUES(?,?,?,?,?)').run(id(),op,entries[0].accountId,-500,now);this.db.raw.prepare('INSERT INTO ledger_entries VALUES(?,?,?,?,?)').run(id(),op,contra.id,500,now);this.db.raw.prepare('UPDATE wallets SET balance_cents=0 WHERE id=?').run(replacement.wallet_id);appendAudit(this.db.raw,{actorId,action:'UNUSED_STARTING_CREDIT_REVERSED',entityType:'wallet',entityId:replacement.wallet_id,payload:{operationId:op,amountCents:500}});}
    this.db.raw.prepare('UPDATE wristband_assignments SET revoked_at=?,reason=?,operator_id=? WHERE wristband_id=? AND revoked_at IS NULL').run(now,reason.trim(),actorId,oldBand.id);this.db.raw.prepare('UPDATE wristband_assignments SET revoked_at=?,reason=?,operator_id=? WHERE id=?').run(now,'Released as replacement band',actorId,replacement.assignment_id);this.db.raw.prepare("UPDATE wristbands SET status='RETIRED' WHERE id=?").run(oldBand.id);this.db.raw.prepare("UPDATE wallets SET status='CLOSED',version=version+1 WHERE id=?").run(replacement.wallet_id);this.db.raw.prepare('INSERT INTO wristband_assignments(id,wristband_id,wallet_id,assigned_at,reason,operator_id) VALUES(?,?,?,?,?,?)').run(id(),replacement.id,oldBand.wallet_id,now,reason.trim(),actorId);this.db.raw.prepare("UPDATE wallets SET status='ACTIVE',version=version+1 WHERE id=?").run(oldBand.wallet_id);appendAudit(this.db.raw,{actorId,action:'WRISTBAND_REPLACED',entityType:'wallet',entityId:oldBand.wallet_id,payload:{oldBandNumber:oldBand.band_number,newBandNumber:replacement.band_number,reason:reason.trim()}});return{walletId:oldBand.wallet_id,oldBandNumber:oldBand.band_number,newBandNumber:replacement.band_number,status:'ACTIVE'}}).immediate()}
}
