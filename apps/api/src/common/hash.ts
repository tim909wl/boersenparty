import { createHash, createHmac, randomUUID } from 'node:crypto';
export const id = () => randomUUID();
export const sha256 = (value:string|Buffer) => createHash('sha256').update(value).digest('hex');
export const canonicalHash = (value:unknown) => sha256(JSON.stringify(value, Object.keys(value as object).sort()));
export const hmacSha256 = (secret:string,value:string|Buffer) => createHmac('sha256',secret).update(value).digest('hex');
