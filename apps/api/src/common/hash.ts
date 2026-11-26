import { createHash, createHmac, randomUUID } from 'node:crypto';
export const id = () => randomUUID();
export const sha256 = (value:string|Buffer) => createHash('sha256').update(value).digest('hex');
// Preserve the previous hash for flat requests; nested approval payloads must retain all keys.
function canonical(value:unknown):unknown { if(Array.isArray(value))return value.map(canonical);if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,canonical(v)]));return value; }
export const canonicalHash = (value:unknown) => sha256(JSON.stringify(canonical(value)));
export const hmacSha256 = (secret:string,value:string|Buffer) => createHmac('sha256',secret).update(value).digest('hex');
