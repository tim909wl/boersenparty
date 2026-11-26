import { afterEach,beforeEach,describe,expect,it } from 'vitest';import { writeFile,mkdtemp,rm } from 'node:fs/promises';import { tmpdir } from 'node:os';import { join } from 'node:path';import { DatabaseService } from '../database/database.service.js';import { WristbandImportService } from './wristband-import.service.js';describe('wristband import',()=>{let db:DatabaseService,service:WristbandImportService,dir:string;beforeEach(async()=>{db=new DatabaseService(':memory:');db.migrate();service=new WristbandImportService(db);dir=await mkdtemp(join(tmpdir(),'wristband-import-'))});afterEach(async()=>{db.onModuleDestroy();await rm(dir,{recursive:true,force:true})});it('imports a validated batch atomically',()=>{expect(service.importRows([{bandNumber:'0001',uid:'04:A1:B2:C3:D4:E5:F6'}])).toEqual({imported:1,errors:[]});expect((db.raw.prepare('SELECT COUNT(*) n FROM wallets').get() as any).n).toBe(1)});it('rejects duplicate UIDs without partial import',()=>{const x=service.importRows([{bandNumber:'1',uid:'04A1B2C3D4E5F6'},{bandNumber:'2',uid:'04:A1:B2:C3:D4:E5:F6'}]);expect(x.imported).toBe(0);expect((db.raw.prepare('SELECT COUNT(*) n FROM wristbands').get() as any).n).toBe(0)});
 it('imports a comma-delimited CSV',async()=>{const path=join(dir,'bands.csv');await writeFile(path,'Armbandnummer,UID\n0001,04A1B2C3D4E5F6\n0002,04A1B2C3D4E5F7\n');const result=await service.fromCsv(path);expect(result).toEqual({imported:2,errors:[]})});
 it('imports a semicolon-delimited CSV, the shape German Excel exports',async()=>{const path=join(dir,'bands.csv');await writeFile(path,'Armbandnummer;UID\n0001;04A1B2C3D4E5F6\n');const result=await service.fromCsv(path);expect(result).toEqual({imported:1,errors:[]})});
 it('handles quoted CSV fields and a UTF-8 BOM',async()=>{const path=join(dir,'bands.csv');await writeFile(path,'﻿"Armbandnummer","UID"\n"0001","04A1B2C3D4E5F6"\n');const result=await service.fromCsv(path);expect(result).toEqual({imported:1,errors:[]})});
 it('rejects a CSV missing the expected columns',async()=>{const path=join(dir,'bands.csv');await writeFile(path,'Foo,Bar\n1,2\n');await expect(service.fromCsv(path)).rejects.toThrow(/Expected columns/)});
 it('credits the 5€ starting balance through the CSV upload path, unlike the bare importRows test helper',async()=>{
   const path=join(dir,'bands.csv');await writeFile(path,'Armbandnummer,UID\n0001,04A1B2C3D4E5F6\n');
   await service.fromCsv(path);
   expect((db.raw.prepare('SELECT balance_cents FROM wallets').get() as any).balance_cents).toBe(500);
   expect((db.raw.prepare("SELECT COUNT(*) n FROM financial_operations WHERE type='STARTING_BALANCE'").get() as any).n).toBe(1);
 });
 it('the bare importRows helper (used across the test suite to seed wristbands) still defaults to a zero balance',()=>{
   service.importRows([{bandNumber:'0001',uid:'04A1B2C3D4E5F6'}]);
   expect((db.raw.prepare('SELECT balance_cents FROM wallets').get() as any).balance_cents).toBe(0);
 });
});
