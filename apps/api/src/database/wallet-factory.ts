import type Database from 'better-sqlite3';
import { DomainError } from '../common/domain-error.js';
// Call inside the same transaction that inserts the wristband and assignment.
export function createWallet(db:Database.Database,walletId:string,now:number):string {
  db.prepare("INSERT INTO wallets(id,balance_cents,status,version,created_at) VALUES(?,0,'ACTIVE',0,?)").run(walletId,now);
  const account=db.prepare("SELECT id FROM ledger_accounts WHERE wallet_id=? AND type='WALLET'").get(walletId) as {id:string}|undefined;
  if(!account)throw new DomainError('LEDGER_MISCONFIGURED','Wallet-Konto fehlt',503);
  return account.id;
}
