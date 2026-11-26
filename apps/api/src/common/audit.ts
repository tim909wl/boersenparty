import type Database from 'better-sqlite3';
import { id, sha256 } from './hash.js';

export function appendAudit(db:Database.Database,event:{actorId?:string;action:string;entityType:string;entityId?:string;payload?:unknown}){
  const previous=(db.prepare('SELECT event_hash FROM audit_events ORDER BY rowid DESC LIMIT 1').get() as any)?.event_hash??null;
  const createdAt=Date.now(),payloadJson=JSON.stringify(event.payload??{}),eventId=id();
  const eventHash=sha256(JSON.stringify({eventId,actorId:event.actorId??null,action:event.action,entityType:event.entityType,entityId:event.entityId??null,payloadJson,previous,createdAt}));
  db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?,?,?)').run(eventId,event.actorId??null,event.action,event.entityType,event.entityId??null,payloadJson,previous,eventHash,createdAt);
  return eventHash;
}

export function auditAnchor(db:Database.Database) {
  let previous:string|null=null,count=0;
  for(const row of db.prepare('SELECT id,actor_id,action,entity_type,entity_id,payload_json,previous_hash,event_hash,created_at FROM audit_events ORDER BY rowid').iterate() as Iterable<any>){
    const expected=sha256(JSON.stringify({eventId:row.id,actorId:row.actor_id,action:row.action,entityType:row.entity_type,entityId:row.entity_id,payloadJson:row.payload_json,previous,createdAt:row.created_at}));
    if(row.previous_hash!==previous||row.event_hash!==expected)throw new Error('Audit-Protokoll inkonsistent');
    previous=row.event_hash;count++;
  }
  return {eventCount:count,headHash:previous};
}
