import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { DomainError } from '../common/domain-error.js';
import { normalizeUid } from '../common/uid.js';
@Injectable() export class WalletService{
  constructor(private db:DatabaseService){}
  lookup(rawUid:string){
    const uid=normalizeUid(rawUid);
    const row=this.db.raw.prepare(`SELECT w.id walletId,w.balance_cents balanceCents,w.status,wb.band_number bandNumber FROM wristbands wb JOIN wristband_assignments a ON a.wristband_id=wb.id AND a.revoked_at IS NULL JOIN wallets w ON w.id=a.wallet_id WHERE wb.uid_hex=? AND wb.status='ACTIVE'`).get(uid) as any;
    if(!row) throw new DomainError('WRISTBAND_NOT_ACTIVE','Wristband is unknown, blocked or not assigned',404);
    return row;
  }
}
