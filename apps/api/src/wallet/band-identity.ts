import type Database from 'better-sqlite3';
import { uidVariants } from '../common/uid.js';
import { DomainError } from '../common/domain-error.js';
export function resolveBandId(db:Database.Database,value:string):string|null {
  const identifier=value.trim();let variants:string[]=[];try{variants=uidVariants(identifier)}catch{}
  const rows=db.prepare(`SELECT id FROM wristbands WHERE band_number=?${variants.length?' OR uid_hex IN ('+variants.map(()=>'?').join(',')+')':''}`).all(identifier,...variants) as {id:string}[];
  if(rows.length>1)throw new DomainError('AMBIGUOUS_UID','Armbandkennung ist mehrdeutig. Bitte Veranstaltungsleitung informieren.',409);
  return rows[0]?.id??null;
}
