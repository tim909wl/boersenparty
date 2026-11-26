import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { appendAudit } from '../common/audit.js';

// Generalized registry for every physical ESP32 chip (buzzer, relay controller, future sensors),
// keyed by a durable device identity (the chip derives its id from its own MAC address, never
// from its IP — this venue's DHCP IPs drift and there is no router admin access to fix that).
// Separate from DeviceService/display_devices, which is for browser-based screens, not chips.
export type ChipRegistration = { type: string; name?: string; firmwareVersion?: string; capabilities?: string[]; ip?: string };
export type ChipHeartbeat = { ip?: string; reportedState?: Record<string, unknown> };

@Injectable()
export class ChipRegistryService {
  constructor(private db: DatabaseService) {}

  // Self-registration must be idempotent and must never clobber an admin-assigned name or an
  // already-known capability set just because a device re-announced itself after a reconnect.
  register(deviceId: string, info: ChipRegistration) {
    const now = Date.now();
    const existing = this.db.raw.prepare('SELECT id,name FROM chip_devices WHERE id=?').get(deviceId) as any;
    const capabilitiesJson = JSON.stringify(info.capabilities ?? []);
    if (existing) {
      this.db.raw.prepare('UPDATE chip_devices SET type=?,firmware_version=COALESCE(?,firmware_version),ip_address=COALESCE(?,ip_address),capabilities_json=?,last_seen_at=? WHERE id=?')
        .run(info.type, info.firmwareVersion ?? null, info.ip ?? null, capabilitiesJson, now, deviceId);
    } else {
      this.db.raw.prepare('INSERT INTO chip_devices(id,type,name,capabilities_json,firmware_version,ip_address,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?,?,?)')
        .run(deviceId, info.type, info.name ?? info.type, capabilitiesJson, info.firmwareVersion ?? null, info.ip ?? null, now, now);
    }
    return { success: true, registered: true };
  }

  // Pull-based reconciliation: the device reports what it currently thinks is true and gets back
  // the server's desired state in the same response — no server-initiated connection to the
  // device is ever needed, which is what lets this work without a static IP or router access.
  heartbeat(deviceId: string, info: ChipHeartbeat) {
    const now = Date.now();
    const row = this.db.raw.prepare('SELECT desired_state_json FROM chip_devices WHERE id=?').get(deviceId) as any;
    if (!row) return { success: false, error: 'unknown_device' };
    this.db.raw.prepare('UPDATE chip_devices SET last_seen_at=?,ip_address=COALESCE(?,ip_address),reported_state_json=? WHERE id=?')
      .run(now, info.ip ?? null, JSON.stringify(info.reportedState ?? {}), deviceId);
    return { success: true, desiredState: JSON.parse(row.desired_state_json) };
  }

  // Admin sets what SHOULD be true (e.g. "lights on"); the device picks it up on its next
  // heartbeat and applies it idempotently — repeating the same desired state is always a no-op.
  setDesiredState(deviceId: string, state: Record<string, unknown>, actorId: string) {
    const existing = this.db.raw.prepare('SELECT desired_state_json FROM chip_devices WHERE id=?').get(deviceId) as any;
    if (!existing) return { success: false, error: 'unknown_device' };
    const merged = { ...JSON.parse(existing.desired_state_json), ...state };
    this.db.raw.prepare('UPDATE chip_devices SET desired_state_json=? WHERE id=?').run(JSON.stringify(merged), deviceId);
    appendAudit(this.db.raw, { actorId, action: 'CHIP_DESIRED_STATE_SET', entityType: 'chip_device', entityId: deviceId, payload: state });
    return { success: true, desiredState: merged };
  }

  // Automatic sync, not an admin decision — used so every chip advertising a "lights"
  // capability follows the Börsencrash lifecycle (on while crashing, off once it ends) without
  // any manual step. Reuses the same desired-state column the manual admin toggle uses, so a
  // chip's reconciliation logic in firmware never needs to know this call exists.
  setLightsForCapableChips(on: boolean) {
    const chips = this.db.raw.prepare("SELECT id,desired_state_json FROM chip_devices WHERE capabilities_json LIKE '%\"lights\"%'").all() as any[];
    for (const chip of chips) {
      const merged = { ...JSON.parse(chip.desired_state_json), lights: on };
      this.db.raw.prepare('UPDATE chip_devices SET desired_state_json=? WHERE id=?').run(JSON.stringify(merged), chip.id);
    }
  }

  rename(deviceId: string, name: string, actorId: string) {
    this.db.raw.prepare('UPDATE chip_devices SET name=? WHERE id=?').run(name.trim(), deviceId);
    appendAudit(this.db.raw, { actorId, action: 'CHIP_RENAMED', entityType: 'chip_device', entityId: deviceId, payload: { name: name.trim() } });
    return { success: true };
  }

  list() {
    const staleAfterMs = 20_000; // three missed 5s-ish heartbeats = offline, not just mid-reconnect
    const now = Date.now();
    return this.db.raw.prepare(`
      SELECT id,type,name,capabilities_json capabilitiesJson,firmware_version firmwareVersion,ip_address ipAddress,
             first_seen_at firstSeenAt,last_seen_at lastSeenAt,reported_state_json reportedStateJson,desired_state_json desiredStateJson
      FROM chip_devices ORDER BY last_seen_at DESC
    `).all().map((d: any) => ({
      ...d,
      capabilities: JSON.parse(d.capabilitiesJson), capabilitiesJson: undefined,
      reportedState: JSON.parse(d.reportedStateJson), reportedStateJson: undefined,
      desiredState: JSON.parse(d.desiredStateJson), desiredStateJson: undefined,
      online: now - d.lastSeenAt < staleAfterMs,
    }));
  }
}
