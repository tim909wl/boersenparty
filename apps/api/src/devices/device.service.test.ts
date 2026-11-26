import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseService } from '../database/database.service.js';
import { DeviceService } from './device.service.js';

describe('DeviceService', () => {
  let db: DatabaseService, devices: DeviceService;
  beforeEach(() => {
    db = new DatabaseService(':memory:'); db.migrate();
    db.raw.prepare('INSERT INTO users(id,username,password_hash,active,created_at) VALUES(?,?,?,1,?)').run('admin-1', 'admin', 'x', Date.now());
    devices = new DeviceService(db);
  });
  afterEach(() => db.onModuleDestroy());

  it('registers a device on its first heartbeat and keeps it on later ones', () => {
    devices.heartbeat('tv-1', { name: 'Bar A TV', userAgent: 'TizenBrowser', screenWidth: 1920, screenHeight: 1080 });
    devices.heartbeat('tv-1', {});
    const list = devices.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'tv-1', name: 'Bar A TV', screenWidth: 1920 });
  });

  it('records a diagnostic result and exposes it parsed, not as a raw JSON string', () => {
    devices.heartbeat('tv-1', { name: 'Bar A TV' });
    devices.recordDiagnostic('tv-1', { network: { avgMs: 42, failures: 0, samples: 10, verdict: 'good' }, device: { resolution: '1920x1080' } });
    const found = devices.list().find(d => d.id === 'tv-1') as any;
    expect(found.diagnosticResult).toMatchObject({ network: { verdict: 'good' } });
    expect(found.diagnosticResultJson).toBeUndefined();
  });

  it('keeps an existing name when a later heartbeat omits it', () => {
    devices.heartbeat('tv-1', { name: 'Bar A TV' });
    devices.heartbeat('tv-1', { screenWidth: 1280 });
    expect(devices.list().find(d => d.id === 'tv-1')).toMatchObject({ name: 'Bar A TV', screenWidth: 1280 });
  });

  it('lets an admin rename a device', () => {
    devices.heartbeat('tv-1', {});
    devices.rename('tv-1', 'Zentrale Übersicht', 'admin-1');
    expect(devices.list().find(d => d.id === 'tv-1')).toMatchObject({ name: 'Zentrale Übersicht' });
  });

  it('triggers a fleet diagnostics request that every display can pick up via system_state', () => {
    const before = (db.raw.prepare('SELECT diagnostics_requested_at v FROM system_state WHERE id=1').get() as any).v;
    expect(before).toBe(0);
    const result = devices.triggerFleetDiagnostics('admin-1');
    expect(result.requestedAt).toBeGreaterThan(0);
    const after = (db.raw.prepare('SELECT diagnostics_requested_at v FROM system_state WHERE id=1').get() as any).v;
    expect(after).toBe(result.requestedAt);
  });
});
