import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { DomainError } from '../common/domain-error.js';
import { ledgerIssues } from '../database/ledger-integrity.js';
import { appendAudit } from '../common/audit.js';

export type EventPhase = 'PREPARING' | 'OPEN' | 'CLOSING' | 'CLOSED';
export type ChecklistItem = { id: string; label: string; required: boolean; ok: boolean; detail: string };

const DEVICE_ONLINE_MS = 120_000;

@Injectable()
export class EventService {
  constructor(private db: DatabaseService) {}

  state() {
    const row = this.db.raw.prepare('SELECT mode,event_phase phase,event_name name,event_opened_at openedAt,event_closed_at closedAt FROM system_state WHERE id=1').get() as any;
    return { phase: (row?.phase ?? 'PREPARING') as EventPhase, name: row?.name ?? null, openedAt: row?.openedAt ?? null, closedAt: row?.closedAt ?? null, mode: row?.mode ?? 'PAYMENT_STOP' };
  }

  // Every item is derived from real data, never from a box somebody ticked: a checklist that can
  // be satisfied by clicking it is worth nothing at the start of an event.
  checklist(): ChecklistItem[] {
    const count = (sql: string, ...params: unknown[]) => (this.db.raw.prepare(sql).get(...params) as any).n as number;
    const products = count("SELECT COUNT(*) n FROM products WHERE active=1");
    const wristbands = count("SELECT COUNT(*) n FROM wristbands WHERE status='ACTIVE'");
    const staff = count("SELECT COUNT(DISTINCT u.id) n FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.active=1 AND r.role IN ('ADMIN','PAYMENT_LEAD') AND (u.locked_until IS NULL OR u.locked_until<=?)",Date.now());
    const issues=ledgerIssues(this.db.raw);
    const dbOk=(this.db.raw.prepare('PRAGMA quick_check').get() as {quick_check:string})?.quick_check==='ok'&&(this.db.raw.pragma('foreign_key_check') as unknown[]).length===0;
    const prices=count("SELECT COUNT(*) n FROM products p JOIN price_entries e ON e.product_id=p.id JOIN price_versions v ON v.id=e.price_version_id AND v.status='ACTIVE' WHERE p.active=1");
    const cashSessions = count("SELECT COUNT(*) n FROM cash_sessions WHERE status='OPEN'");
    const displays = count('SELECT COUNT(*) n FROM display_devices WHERE last_seen_at > ?', Date.now() - DEVICE_ONLINE_MS);
    const backups=count("SELECT COUNT(*) n FROM backup_records WHERE status='VERIFIED' AND created_at>=?",Date.now()-24*60*60_000);
    const testTransactions = count("SELECT COUNT(*) n FROM financial_operations WHERE status='COMMITTED' AND type IN('PURCHASE','TOPUP')");
    return [
      { id: 'products', label: 'Getränke und Preise eingerichtet', required: true, ok: products > 0 && prices===products, detail: `${products} aktive Getränke` },
      { id: 'wristbands', label: 'Armbänder registriert', required: true, ok: wristbands > 0, detail: `${wristbands} aktive Armbänder` },
      {id:'database',label:'SQLite-Datenbank konsistent',required:true,ok:dbOk,detail:dbOk?'Integrität und Fremdschlüssel OK':'Datenbankfehler'},
      { id: 'ledger', label: 'Buchhaltung konsistent', required: true, ok: issues.length===0, detail: issues.join(', ') || 'Keine Inkonsistenzen' },
      { id: 'staff', label: 'Mitarbeiter angelegt', required: true, ok: staff >= 2, detail: `${staff} aktive Freigabeberechtigte (zwei erforderlich)` },
      { id: 'cash', label: 'Kassen eröffnet', required: false, ok: cashSessions > 0, detail: cashSessions > 0 ? `${cashSessions} offene Kassensitzung(en)` : 'Keine offene Kassensitzung — Bar-Aufladungen sind bis dahin gesperrt' },
      { id: 'displays', label: 'Börsendisplays verbunden', required: false, ok: displays > 0, detail: displays > 0 ? `${displays} Display(s) online` : 'Kein Display hat sich zuletzt gemeldet' },
      { id:'backup',label:'Aktuelles Backup',required:false,ok:backups>0,detail:backups>0?'Sicherung vorhanden':'Vor Beginn eine Sicherung erstellen' },
      { id: 'testrun', label: 'Testtransaktion erfolgreich', required: false, ok: testTransactions > 0, detail: testTransactions > 0 ? `${testTransactions} gebuchte Vorgänge` : 'Noch kein Verkauf oder Aufladung gebucht' },
    ];
  }

  open(name: string, actorId: string) {
    const title = name.trim();
    if (title.length < 3) throw new DomainError('EVENT_NAME_REQUIRED', 'Die Veranstaltung braucht einen Namen', 400);
    return this.db.raw.transaction(() => {
      const { phase } = this.state();
      if (phase === 'OPEN') throw new DomainError('EVENT_ALREADY_OPEN', 'Die Veranstaltung läuft bereits', 422);
      if (phase === 'CLOSED') throw new DomainError('EVENT_CLOSED','Für dieselbe Veranstaltung bitte den Abschluss wieder öffnen. Eine neue Veranstaltung benötigt eine separate Datenbank.',422);
      if (phase === 'CLOSING') throw new DomainError('EVENT_CLOSING', 'Der Abschluss läuft bereits — zuerst abschließen', 422);
      const blocking = this.checklist().filter(item => item.required && !item.ok);
      if (blocking.length) throw new DomainError('EVENT_NOT_READY', `Noch offen: ${blocking.map(item => item.label).join(', ')}`, 422);
      const now = Date.now();
      this.db.raw.prepare("UPDATE system_state SET event_phase='OPEN',event_name=?,event_opened_at=?,event_closed_at=NULL,mode=CASE WHEN manual_payment_stop=1 THEN 'PAYMENT_STOP' ELSE 'NORMAL' END,changed_at=?,changed_by=?,reason=? WHERE id=1")
        .run(title, now, now, actorId, `Veranstaltung "${title}" eröffnet`);
      appendAudit(this.db.raw, { actorId, action: 'EVENT_OPENED', entityType: 'system_state', entityId: '1', payload: { name: title, openedAt: now } });
      return this.state();
    }).immediate();
  }

  // Closing is deliberately two steps: this one stops the tills so nothing new is booked while
  // the cash is counted, and leaves everything else — balances, history — untouched.
  beginClosing(actorId: string) {
    return this.db.raw.transaction(() => {
      const { phase } = this.state();
      if (phase !== 'OPEN') throw new DomainError('EVENT_NOT_OPEN', 'Es läuft keine Veranstaltung', 422);
      const now = Date.now();
      this.db.raw.prepare("UPDATE system_state SET event_phase='CLOSING',event_resume_mode=mode,mode='PAYMENT_STOP',changed_at=?,changed_by=?,reason=? WHERE id=1").run(now, actorId, 'Verkaufsende eingeleitet');
      appendAudit(this.db.raw, { actorId, action: 'EVENT_CLOSING_STARTED', entityType: 'system_state', entityId: '1', payload: { startedAt: now } });
      return this.state();
    }).immediate();
  }

  stepBack(expectedPhase:EventPhase,actorId:string) {
    return this.db.raw.transaction(()=>{
      const state=this.state();if(state.phase!==expectedPhase)throw new DomainError('EVENT_CHANGED','Veranstaltungsstatus hat sich geändert. Bitte neu laden.',409);
      const now=Date.now();let next:EventPhase,mode:string='PAYMENT_STOP';
      if(state.phase==='CLOSED'){next='CLOSING';}
      else if(state.phase==='CLOSING'){
        const blocking=this.checklist().filter(i=>i.required&&!i.ok);if(blocking.length)throw new DomainError('EVENT_NOT_READY',`Noch offen: ${blocking.map(i=>i.label).join(', ')}`,422);
        next='OPEN';mode=(this.db.raw.prepare("SELECT CASE WHEN manual_payment_stop=1 THEN 'PAYMENT_STOP' ELSE event_resume_mode END AS mode FROM system_state WHERE id=1").get() as {mode:string}).mode;
      }else if(state.phase==='OPEN'){
        if(this.db.raw.prepare("SELECT 1 FROM financial_operations WHERE created_at>=? AND status IN('PENDING','COMMITTED') LIMIT 1").get(state.openedAt??0))throw new DomainError('EVENT_HAS_PAYMENTS','Bereits gebucht: Zur Vorbereitung zurück nicht möglich. Verkauf kann über den Abschluss pausiert werden.',422);
        if(this.db.raw.prepare("SELECT 1 FROM cash_sessions WHERE opened_at>=? OR closed_at>=? LIMIT 1").get(state.openedAt??0,state.openedAt??0))throw new DomainError('EVENT_HAS_CASH','Seit dem Start wurde eine Kasse eröffnet oder geschlossen. Bitte Abschluss verwenden.',422);
        next='PREPARING';
      }else throw new DomainError('EVENT_PREPARING','Bereits in Vorbereitung',422);
      this.db.raw.prepare("UPDATE system_state SET event_phase=?,mode=?,event_closed_at=NULL,event_opened_at=CASE WHEN ?='PREPARING' THEN NULL ELSE event_opened_at END,changed_at=?,changed_by=?,reason=? WHERE id=1").run(next,mode,next,now,actorId,`Veranstaltung: ${state.phase} → ${next}`);
      appendAudit(this.db.raw,{actorId,action:'EVENT_PHASE_REVERSED',entityType:'system_state',entityId:'1',payload:{previous:state.phase,next,previousMode:state.mode,previousOpenedAt:state.openedAt,previousClosedAt:state.closedAt}});
      return this.state();
    }).immediate();
  }

  closingStatus() {
    const openCashSessions = this.db.raw.prepare("SELECT cs.id,cs.terminal_id terminalId,t.name terminalName,cs.opened_at openedAt,cs.opening_cash_cents openingCashCents FROM cash_sessions cs JOIN terminals t ON t.id=cs.terminal_id WHERE cs.status='OPEN' ORDER BY t.name").all() as any[];
    const outstanding = this.db.raw.prepare("SELECT COUNT(*) n,COALESCE(SUM(balance_cents),0) cents FROM wallets WHERE status<>'CLOSED' AND balance_cents>0").get() as any;
    const pendingOperations = (this.db.raw.prepare("SELECT COUNT(*) n FROM financial_operations WHERE status='PENDING'").get() as any).n as number;
    const pendingApprovals = (this.db.raw.prepare("SELECT COUNT(*) n FROM approval_requests WHERE status='PENDING' AND expires_at>=unixepoch('subsec')*1000").get() as any).n as number;
    return { openCashSessions, outstandingWallets: outstanding.n as number, outstandingCents: outstanding.cents as number, pendingOperations, pendingApprovals };
  }

  close(actorId: string) {
    return this.db.raw.transaction(() => {
      const { phase } = this.state();
      if (phase !== 'CLOSING') throw new DomainError('EVENT_NOT_CLOSING', 'Zuerst das Verkaufsende einleiten', 422);
      const status = this.closingStatus();
      if (status.openCashSessions.length) throw new DomainError('CASH_SESSIONS_OPEN', `${status.openCashSessions.length} Kassensitzung(en) sind noch offen und müssen gezählt werden`, 422);
      if (status.pendingOperations) throw new DomainError('OPERATIONS_PENDING', `${status.pendingOperations} Vorgang/Vorgänge sind noch nicht abgeschlossen`, 422);
      if(this.db.raw.prepare(`SELECT 1 FROM cash_sessions s LEFT JOIN cash_session_operations c ON c.cash_session_id=s.id WHERE s.status='CLOSED' GROUP BY s.id HAVING s.closed_at IS NULL OR s.counted_cash_cents IS NULL OR s.expected_cash_cents IS NULL OR s.difference_cents IS NULL OR s.expected_cash_cents<>s.opening_cash_cents+COALESCE(SUM(c.amount_cents),0) OR s.difference_cents<>s.counted_cash_cents-s.expected_cash_cents OR (s.difference_cents<>0 AND LENGTH(TRIM(COALESCE(s.close_reason,'')))<5) LIMIT 1`).get())throw new DomainError('CASH_RECONCILIATION_INVALID','Mindestens eine geschlossene Kasse ist nicht vollständig abgerechnet',422);
      if(status.pendingApprovals) throw new DomainError('APPROVALS_PENDING','Offene Freigaben zuerst bearbeiten',422);
      const issues=ledgerIssues(this.db.raw);if(issues.length)throw new DomainError('LEDGER_MISCONFIGURED',issues.join(', '),503);
      const now = Date.now();
      this.db.raw.prepare("UPDATE system_state SET event_phase='CLOSED',event_closed_at=?,mode='PAYMENT_STOP',changed_at=?,changed_by=?,reason=? WHERE id=1").run(now, now, actorId, 'Veranstaltung abgeschlossen');
      appendAudit(this.db.raw, { actorId, action: 'EVENT_CLOSED', entityType: 'system_state', entityId: '1', payload: { closedAt: now, outstandingCents: status.outstandingCents, outstandingWallets: status.outstandingWallets } });
      return this.state();
    }).immediate();
  }
}
