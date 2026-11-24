import { Injectable } from '@nestjs/common';
import Database from 'better-sqlite3';
import { copyFileSync,mkdirSync,readFileSync,statSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { DatabaseService } from '../database/database.service.js';
import { id,sha256 } from '../common/hash.js';
import { appendAudit } from '../common/audit.js';
import { DomainError } from '../common/domain-error.js';

function assertRestorable(path:string){
  const check=new Database(path,{readonly:true});
  try{
    const result=(check.prepare('PRAGMA integrity_check').get() as any)?.integrity_check;
    if(result!=='ok')throw new DomainError('BACKUP_INTEGRITY_CHECK_FAILED',`Backup failed its restore integrity check: ${result}`,500);
  }finally{check.close()}
}

@Injectable()export class BackupService{
  constructor(private db:DatabaseService){}
  async create(actorId:string){
    const directory=resolve(process.env.BACKUP_DIR??'./backups');mkdirSync(directory,{recursive:true});
    const backupId=id(),createdAt=Date.now(),filename=`boersenparty-${new Date(createdAt).toISOString().replace(/[:.]/g,'-')}-${backupId.slice(0,8)}.db`,path=join(directory,filename);
    await this.db.raw.backup(path);
    assertRestorable(path);
    const bytes=readFileSync(path),digest=sha256(bytes),sizeBytes=statSync(path).size;
    let secondaryPath:string|null=null,secondarySha256:string|null=null,replicatedAt:number|null=null;
    if(process.env.SECONDARY_BACKUP_DIR?.trim()){
      const secondaryDirectory=resolve(process.env.SECONDARY_BACKUP_DIR);if(secondaryDirectory===directory)throw new DomainError('SECONDARY_BACKUP_NOT_DISTINCT','Secondary backup directory must differ from primary',500);mkdirSync(secondaryDirectory,{recursive:true});secondaryPath=join(secondaryDirectory,filename);copyFileSync(path,secondaryPath);secondarySha256=sha256(readFileSync(secondaryPath));if(secondarySha256!==digest)throw new DomainError('SECONDARY_BACKUP_HASH_MISMATCH','Secondary backup verification failed',500);replicatedAt=Date.now();
    }
    this.db.raw.prepare("INSERT INTO backup_records(id,path,sha256,size_bytes,status,created_by,created_at,secondary_path,secondary_sha256,replicated_at) VALUES(?,?,?,?,'VERIFIED',?,?,?,?,?)").run(backupId,path,digest,sizeBytes,actorId,createdAt,secondaryPath,secondarySha256,replicatedAt);
    appendAudit(this.db.raw,{actorId,action:'DATABASE_BACKUP_VERIFIED',entityType:'backup_record',entityId:backupId,payload:{path,sha256:digest,sizeBytes,secondaryPath,secondarySha256,replicatedAt}});
    return{id:backupId,path,sha256:digest,sizeBytes,status:'VERIFIED',createdAt,secondaryPath,secondarySha256,replicatedAt};
  }
  list(){return this.db.raw.prepare('SELECT id,path,sha256,size_bytes sizeBytes,status,created_by createdBy,created_at createdAt,secondary_path secondaryPath,secondary_sha256 secondarySha256,replicated_at replicatedAt FROM backup_records ORDER BY created_at DESC').all()}
}
