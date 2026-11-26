import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { appendAudit } from '../common/audit.js';
import { DomainError } from '../common/domain-error.js';

// Every display that loads /market (TV board or Bezahldisplay) generates its own persistent id
// once and heartbeats it here, so the admin panel can see every physical device's online status
// and last self-test result in one place — instead of walking around with a laptop checking each
// screen individually.
type HeartbeatInfo = { name?: string; userAgent?: string; screenWidth?: number; screenHeight?: number };
export type DiagnosticResult = { network: { avgMs: number; failures: number; samples: number; verdict: 'good' | 'warn' | 'bad' }; device: Record<string, unknown> };

@Injectable()
export class DeviceService {
  constructor(private db: DatabaseService) {}

  heartbeat(deviceId: string, info: HeartbeatInfo) {
    const now = Date.now();
    if(!/^[a-zA-Z0-9_-]{1,100}$/.test(deviceId))throw new DomainError('INVALID_DEVICE','Ungültige Gerätekennung',400);
    const allow=process.env.DISPLAY_DEVICE_IDS?.split(',').map(x=>x.trim()).filter(Boolean);if(allow?.length&&!allow.includes(deviceId))throw new DomainError('UNKNOWN_DEVICE','Display nicht registriert',403);
    const existing = this.db.raw.prepare('SELECT id,last_seen_at,name,user_agent,screen_width,screen_height FROM display_devices WHERE id=?').get(deviceId) as any;
    if(!existing&&(this.db.raw.prepare('SELECT COUNT(*) n FROM display_devices').get() as {n:number}).n>=30)throw new DomainError('DEVICE_LIMIT','Gerätelimit erreicht',429);
    if (existing) {
      if(now-existing.last_seen_at<10000 && !info.name && !info.userAgent && !info.screenWidth && !info.screenHeight)return {ok:true};
      if (now-existing.last_seen_at < 1000 &&
          (!info.name || existing.name) &&
          (info.userAgent == null || info.userAgent === existing.user_agent) &&
          (info.screenWidth == null || info.screenWidth === existing.screen_width) &&
          (info.screenHeight == null || info.screenHeight === existing.screen_height))
        return {ok:true};
      // A lighter heartbeat that omits device info (the common case) must not wipe out what an
      // earlier, fuller heartbeat already recorded — only overwrite fields that are actually sent.
      this.db.raw.prepare('UPDATE display_devices SET last_seen_at=?,user_agent=COALESCE(?,user_agent),screen_width=COALESCE(?,screen_width),screen_height=COALESCE(?,screen_height),name=COALESCE(name,?) WHERE id=?')
        .run(now, info.userAgent ?? null, info.screenWidth ?? null, info.screenHeight ?? null, info.name ?? null, deviceId);
    } else {
      this.db.raw.prepare('INSERT INTO display_devices(id,name,user_agent,screen_width,screen_height,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?,?)')
        .run(deviceId, info.name ?? null, info.userAgent ?? null, info.screenWidth ?? null, info.screenHeight ?? null, now, now);
    }
    return { ok: true };
  }

  recordDiagnostic(deviceId: string, result: DiagnosticResult) {
    const now = Date.now();
    if(JSON.stringify(result).length>8192)throw new DomainError('DIAGNOSTIC_TOO_LARGE','Diagnose zu groß',400);
    const last=this.db.raw.prepare('SELECT last_diagnostic_at n FROM display_devices WHERE id=?').get(deviceId) as {n:number}|undefined;if(last?.n&&now-last.n<10000)throw new DomainError('DEVICE_RATE_LIMIT','Diagnose zu häufig',429);
    this.heartbeat(deviceId, {});
    this.db.raw.prepare('UPDATE display_devices SET last_diagnostic_at=?,diagnostic_result_json=? WHERE id=?').run(now, JSON.stringify(result), deviceId);
    return { ok: true };
  }

  rename(deviceId: string, name: string, actorId: string) {
    this.db.raw.prepare('UPDATE display_devices SET name=? WHERE id=?').run(name.trim(), deviceId);
    appendAudit(this.db.raw, { actorId, action: 'DEVICE_RENAMED', entityType: 'display_device', entityId: deviceId, payload: { name: name.trim() } });
    return { ok: true };
  }

  list() {
    return this.db.raw.prepare(`
      SELECT id,name,user_agent userAgent,screen_width screenWidth,screen_height screenHeight,
             first_seen_at firstSeenAt,last_seen_at lastSeenAt,last_diagnostic_at lastDiagnosticAt,diagnostic_result_json diagnosticResultJson
      FROM display_devices ORDER BY last_seen_at DESC
    `).all().map((d: any) => ({ ...d, diagnosticResult: d.diagnosticResultJson ? JSON.parse(d.diagnosticResultJson) : null, diagnosticResultJson: undefined }));
  }

  // Every display's own health poll (already running every few seconds) picks this timestamp up
  // and, since they all compute the same rounded-wall-clock reveal instant from it, start their
  // synchronized self-test in lockstep — the same mechanism already used for the crash reveal.
  triggerFleetDiagnostics(actorId: string) {
    const now = Date.now();
    this.db.raw.prepare('UPDATE system_state SET diagnostics_requested_at=? WHERE id=1').run(now);
    appendAudit(this.db.raw, { actorId, action: 'FLEET_DIAGNOSTICS_TRIGGERED', entityType: 'system_state', entityId: '1', payload: { requestedAt: now } });
    return { requestedAt: now };
  }
}
