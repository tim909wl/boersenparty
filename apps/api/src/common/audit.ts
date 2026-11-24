import type Database from 'better-sqlite3';
import { id, sha256 } from './hash.js';

export function appendAudit(db:Database.Database,event:{actorId?:string;action:string;entityType:string;entityId?:string;payload?:unknown}){
  const previous=(db.prepare('SELECT event_hash FROM audit_events ORDER BY rowid DESC LIMIT 1').get() as any)?.event_hash??null;
  const createdAt=Date.now(),payloadJson=JSON.stringify(event.payload??{}),eventId=id();
  const eventHash=sha256(JSON.stringify({eventId,actorId:event.actorId??null,action:event.action,entityType:event.entityType,entityId:event.entityId??null,payloadJson,previous,createdAt}));
  db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?,?,?)').run(eventId,event.actorId??null,event.action,event.entityType,event.entityId??null,payloadJson,previous,eventHash,createdAt);
  return eventHash;
}
