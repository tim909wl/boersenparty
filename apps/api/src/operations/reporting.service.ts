import { ledgerIssues } from '../database/ledger-integrity.js';
import { Injectable } from '@nestjs/common';import { DatabaseService } from '../database/database.service.js';
@Injectable()export class ReportingService{constructor(private db:DatabaseService){}
 summary(){
  const wallets=this.db.raw.prepare("SELECT COUNT(*) wallets,COALESCE(SUM(balance_cents),0) liabilityCents FROM wallets WHERE status<>'CLOSED'").get();
  const operations=this.db.raw.prepare("SELECT type,COUNT(*) count,COALESCE(SUM(CASE WHEN type='TOPUP' THEN (SELECT amount_cents FROM topups WHERE operation_id=financial_operations.id) WHEN type='PURCHASE' THEN (SELECT total_cents FROM orders WHERE operation_id=financial_operations.id) WHEN type='REFUND' THEN (SELECT amount_cents FROM refunds WHERE operation_id=financial_operations.id) WHEN type='STARTING_BALANCE' THEN (SELECT COALESCE(SUM(e.amount_cents),0) FROM ledger_entries e JOIN ledger_accounts a ON a.id=e.account_id WHERE e.operation_id=financial_operations.id AND a.type='WALLET') ELSE 0 END),0) amountCents FROM financial_operations WHERE status='COMMITTED' GROUP BY type").all();
  const sessions=this.db.raw.prepare('SELECT id,terminal_id terminalId,operator_id operatorId,opened_at openedAt,closed_at closedAt,opening_cash_cents openingCashCents,expected_cash_cents expectedCashCents,counted_cash_cents countedCashCents,difference_cents differenceCents,status FROM cash_sessions ORDER BY opened_at DESC').all();
  const audit=(this.db.raw.prepare('SELECT COUNT(*) count FROM audit_events').get() as any).count;
  // Cash vs. card split — what the organizer reconciles the cash drawer and card terminal against.
  const topupsByMethod=this.db.raw.prepare("SELECT funding_method method,COUNT(*) count,COALESCE(SUM(amount_cents),0) amountCents FROM topups WHERE status='COMMITTED' GROUP BY funding_method").all();
  // Per-product sales, read back out of each paid order's frozen quote — what actually sold and
  // how much revenue it brought in, for restocking and pricing decisions after the event.
  const orderRows=this.db.raw.prepare("SELECT q.items_json itemsJson FROM orders o JOIN quotes q ON q.id=o.quote_id WHERE o.status='PAID'").all() as any[];
  const sales=new Map<string,{quantity:number;revenueCents:number}>();
  for(const row of orderRows)for(const item of JSON.parse(row.itemsJson)){
    const entry=sales.get(item.name)??{quantity:0,revenueCents:0};
    entry.quantity+=item.quantity;entry.revenueCents+=item.unitPriceCents*item.quantity;
    sales.set(item.name,entry);
  }
  const productSales=[...sales.entries()].map(([name,v])=>({name,...v})).sort((a,b)=>b.revenueCents-a.revenueCents);
  const refundTotals=this.db.raw.prepare("SELECT COALESCE(SUM(r.amount_cents),0) totalCents,COALESCE(SUM(CASE WHEN o.status='PAID' THEN r.amount_cents ELSE 0 END),0) partialUnallocatedCents FROM refunds r JOIN orders o ON o.id=r.original_order_id").get();
  const startingCredit=this.db.raw.prepare("SELECT -COALESCE(SUM(e.amount_cents),0) netCents FROM ledger_entries e JOIN ledger_accounts a ON a.id=e.account_id WHERE a.type='STARTING_BALANCE'").get();
  const freeDrinks=this.db.raw.prepare('SELECT COUNT(*) granted,COUNT(redeemed_order_id) redeemed,COALESCE(SUM(original_price_cents),0) faceValueCents FROM free_drink_entitlements').get();
  return{freeDrinks,generatedAt:Date.now(),integrityIssues:ledgerIssues(this.db.raw),wallets,operations,topupsByMethod,productSales,refundTotals,startingCredit,cashSessions:sessions,auditEventCount:audit};
 }
}
