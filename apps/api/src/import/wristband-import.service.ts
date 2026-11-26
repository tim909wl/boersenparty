import { resolveBandId } from '../wallet/band-identity.js';
import { createWallet } from '../database/wallet-factory.js';
import { Injectable } from '@nestjs/common';import { readSheet } from 'read-excel-file/node';import { readFile } from 'node:fs/promises';import { DatabaseService } from '../database/database.service.js';import { id,canonicalHash } from '../common/hash.js';import { normalizeUid } from '../common/uid.js';import { DomainError } from '../common/domain-error.js';
export type ImportRow={bandNumber:string;uid:string};
// Policy for this event: every wristband starts with the same 5€, whether registered one at a
// time or imported in bulk — so the bulk path credits it through the same STARTING_BALANCE
// ledger account as single registration, instead of silently leaving bulk-imported wallets at
// 0 with no ledger trace of the credit.
const STARTING_BALANCE_CENTS=500;
// RFC 4180 quoting (commas/newlines inside a field wrapped in "...", "" as an escaped quote)
// handled by hand so a plain text column format doesn't need a dependency the Excel path
// doesn't also need. The delimiter is sniffed from the header line because German Excel
// exports CSV with ';' (its locale uses ',' as the decimal separator), while most other
// tools emit ','.
function parseCsv(text:string):string[][]{
  const body=text.replace(/^﻿/,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  const headerLine=body.slice(0,body.indexOf('\n')===-1?undefined:body.indexOf('\n'));
  const delimiter=(headerLine.match(/;/g)?.length??0)>(headerLine.match(/,/g)?.length??0)?';':',';
  const rows:string[][]=[];let row:string[]=[],field='',inQuotes=false;
  for(let i=0;i<body.length;i++){const char=body[i];
    if(inQuotes){
      if(char==='"'){if(body[i+1]==='"'){field+='"';i++}else inQuotes=false}
      else field+=char;
    }else if(char==='"')inQuotes=true;
    else if(char===delimiter){row.push(field);field=''}
    else if(char==='\n'){row.push(field);rows.push(row);row=[];field=''}
    else field+=char;
  }
  if(field.length||row.length){row.push(field);rows.push(row)}
  return rows.filter(r=>r.some(cell=>cell.trim().length));
}
function rowsFromSheet(sheet:unknown[][]):ImportRow[]{
  // Plain Error here would reach Nest's default filter as an unhandled 500 — DomainError (an
  // HttpException) is what lets the controller's caller see an actual 400 with this message
  // instead of a generic Internal Server Error.
  if(!sheet.length)throw new DomainError('IMPORT_FILE_EMPTY','File has no rows',400);
  const headers=new Map<string,number>();sheet[0].forEach((cell,n)=>headers.set(String(cell??'').trim().toLowerCase(),n));
  const bandCol=headers.get('armbandnummer')??headers.get('band_number')??headers.get('bandnumber');
  const uidCol=headers.get('uid')??headers.get('nfc_uid')??headers.get('nfc-kennung');
  // Naming the headers actually found turns this into a self-diagnosing error: the operator sees
  // immediately whether the file's columns are merely misnamed or the delimiter was sniffed wrong,
  // without a round trip to ask what the file looks like.
  if(bandCol===undefined||uidCol===undefined){const found=sheet[0].map(cell=>String(cell??'').trim()).filter(Boolean).join(', ')||'(empty)';throw new DomainError('IMPORT_COLUMNS_MISSING',`Expected columns Armbandnummer/Band_Number and UID/NFC_UID — found: ${found}`,400)}
  const rows:ImportRow[]=[];
  for(const row of sheet.slice(1)){const band=String(row[bandCol]??'').trim(),uid=String(row[uidCol]??'').trim();if(!band&&!uid)continue;rows.push({bandNumber:band,uid})}
  return rows;
}
@Injectable() export class WristbandImportService{constructor(private db:DatabaseService){}
 async fromExcel(path:string){const sheet=await readSheet(path);return this.importRows(rowsFromSheet(sheet as unknown[][]),{creditStartingBalance:true})}
 async fromCsv(path:string){const text=await readFile(path,'utf8');return this.importRows(rowsFromSheet(parseCsv(text)),{creditStartingBalance:true})}
 // `creditStartingBalance` defaults to off because this method doubles as the generic "seed N
 // wristbands" helper used throughout the test suite, where an uninvited 5€ would silently shift
 // every balance assertion in those unrelated tests. Only the real upload endpoints opt in.
 importRows(rows:ImportRow[],options?:{creditStartingBalance?:boolean}){const errors:string[]=[],normalized:{bandNumber:string;uid:string}[]=[],bands=new Set<string>(),uids=new Set<string>();rows.forEach((r,i)=>{try{if(!r.bandNumber)throw new Error('missing band number');const uid=normalizeUid(r.uid);if(bands.has(r.bandNumber))throw new Error('duplicate band number in file');if(uids.has(uid))throw new Error('duplicate UID in file');bands.add(r.bandNumber);uids.add(uid);normalized.push({bandNumber:r.bandNumber,uid})}catch(e){errors.push(`Row ${i+2}: ${(e as Error).message}`)}});if(errors.length)return{imported:0,errors};
   try{const imported=this.db.raw.transaction(()=>{
     const credit=options?.creditStartingBalance?STARTING_BALANCE_CENTS:0;
     const clearing=credit>0?this.db.raw.prepare("SELECT id FROM ledger_accounts WHERE type='STARTING_BALANCE'").get() as {id:string}|undefined:undefined;
     if(credit>0&&!clearing)throw new DomainError('LEDGER_MISCONFIGURED','Starting balance account is missing',500);
     let count=0;
     for(const r of normalized){
       if(resolveBandId(this.db.raw,r.bandNumber)||resolveBandId(this.db.raw,r.uid))throw new DomainError('WRISTBAND_EXISTS','Armbandnummer oder UID kollidiert mit einem anderen Armband',409);
       const now=Date.now(),wristbandId=id(),walletId=id();
       this.db.raw.prepare("INSERT INTO wristbands(id,band_number,uid_hex,status,created_at) VALUES(?,?,?,'ACTIVE',?)").run(wristbandId,r.bandNumber,r.uid,now);
       const walletAccountId=createWallet(this.db.raw,walletId,now);
       this.db.raw.prepare('INSERT INTO wristband_assignments(id,wristband_id,wallet_id,assigned_at) VALUES(?,?,?,?)').run(id(),wristbandId,walletId,now);

       if(credit>0&&clearing){
         const operationId=id(),operationKey=`starting-balance:${wristbandId}`,response={wristbandId,walletId,amountCents:credit,status:'COMMITTED'};
         this.db.raw.prepare('INSERT INTO financial_operations(id,idempotency_key,request_hash,type,status,terminal_id,operator_id,created_at,committed_at,response_json) VALUES(?,?,?,?,?,?,?,?,?,?)').run(operationId,operationKey,canonicalHash({wristbandId,amountCents:credit}),'STARTING_BALANCE','COMMITTED',null,null,now,now,JSON.stringify(response));
         this.db.raw.prepare('INSERT INTO ledger_entries VALUES(?,?,?,?,?)').run(id(),operationId,walletAccountId,credit,now);
         this.db.raw.prepare('INSERT INTO ledger_entries VALUES(?,?,?,?,?)').run(id(),operationId,clearing.id,-credit,now);
         this.db.raw.prepare('UPDATE wallets SET balance_cents=? WHERE id=?').run(credit,walletId);
       }
       count++;
     }
     return count;
   }).immediate();return{imported,errors:[]}}catch(e){return{imported:0,errors:[`Database rejected entire import: ${(e as Error).message}`]}}
 }
}
