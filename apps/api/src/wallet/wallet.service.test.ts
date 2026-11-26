import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseService } from '../database/database.service.js';
import { WristbandImportService } from '../import/wristband-import.service.js';
import { WristbandAdminService } from './wristband-admin.service.js';
import { WalletService } from './wallet.service.js';

describe('WalletService', () => {
  let db: DatabaseService, wallets: WalletService;
  beforeEach(() => {
    db = new DatabaseService(':memory:'); db.migrate();
    new WristbandImportService(db).importRows([{ bandNumber: '0001', uid: '04A1B2C3D4E5F6' }]);
    wallets = new WalletService(db);
  });
  afterEach(() => db.onModuleDestroy());

  it('finds the wallet by the printed Tyvek band number, without any NFC scan', () => {
    expect(wallets.lookup('0001').bandNumber).toBe('0001');
  });
  it('finds the same wallet by its NFC UID', () => {
    expect(wallets.lookup('04A1B2C3D4E5F6').bandNumber).toBe('0001');
  });
  it('rejects an identifier that matches neither a band number nor a UID', () => {
    expect(() => wallets.lookup('nope')).toThrow(/unknown, blocked or not assigned/);
  });

  it('stops a blocked band from being looked up for payment, but keeps its history visible instead of making it look deleted', () => {
    db.raw.prepare('INSERT INTO users(id,username,password_hash,active,created_at) VALUES(?,?,?,1,?)').run('user', 'u', 'x', Date.now());
    new WristbandAdminService(db).block('0001', 'Reported lost', 'user');
    expect(() => wallets.lookup('0001')).toThrow(/unknown, blocked or not assigned/);
    const result = wallets.history('0001');
    expect(result.wallet.bandNumber).toBe('0001');
    expect(result.wallet.status).toBe('FROZEN');
  });
});
