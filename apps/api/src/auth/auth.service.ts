import { HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { timingSafeEqual } from 'node:crypto';
import { pinEligible, staffPinFor, terminalAllowed } from './staff-pin.js';
import { DatabaseService } from '../database/database.service.js';
import { appendAudit } from '../common/audit.js';
import { id, hmacSha256 } from '../common/hash.js';

type LoginMeta={remoteAddress?:string;userAgent?:string};
// Fixed decoy hash (no real password behind it) so a login for a non-existent username still
// pays the full bcrypt cost — without this, an unknown username returns noticeably faster than a
// known one with a wrong password, letting an attacker enumerate valid usernames by timing.
const DECOY_PASSWORD_HASH='$2b$12$/t80iUy6/ZrHRWyLfzHXxu0s3M9xcwvT0K1wNwfexW4WpE3icpAWC';
@Injectable() export class AuthService{
  private inFlight=new Map<string,number>();
  private totalInFlight=0;
  constructor(private db:DatabaseService,private jwt:JwtService){}
  async login(usernameValue:string,password:string,terminalId:string,meta:LoginMeta={}){
    const remoteKey=meta.remoteAddress?.slice(0,100)??"unknown";const concurrent=this.inFlight.get(remoteKey)??0;if(concurrent>=4||this.totalInFlight>=24)throw new HttpException("Zu viele gleichzeitige Anmeldungen. Bitte erneut versuchen.",429);this.inFlight.set(remoteKey,concurrent+1);this.totalInFlight++;try{
    const username=usernameValue.trim().toLowerCase(),now=Date.now(),remoteAddress=meta.remoteAddress?.slice(0,100);if(remoteAddress){const recent=(this.db.raw.prepare('SELECT COUNT(*) count FROM auth_attempts WHERE remote_address=? AND success=0 AND created_at>?').get(remoteAddress,now-60_000) as any).count;if(recent>=20)throw new HttpException('Too many failed login attempts from this address',429)}const user=this.db.raw.prepare('SELECT * FROM users WHERE username=?').get(username) as any,terminal=this.db.raw.prepare("SELECT id FROM terminals WHERE id=? AND status='ACTIVE'").get(terminalId);
    if(user?.locked_until&&user.locked_until>now){this.attempt(username,user.id,terminalId,false,'LOCKED',meta,now);throw new UnauthorizedException('Invalid credentials, disabled account, or temporary lock')}

    const roles=(this.db.raw.prepare('SELECT role FROM user_roles WHERE user_id=?').all(user?.id??'') as any[]).map(x=>x.role);
    const pin=staffPinFor(username), pinMode=/^\d{4}$/.test(password);
    const pinEnabled=typeof pin==='string'&&/^\d{4}$/.test(pin);
    const passwordValid=pinMode
      ? Boolean(pinEnabled&&pinEligible(roles)&&timingSafeEqual(Buffer.from(password),Buffer.from(pin!)))
      : await compare(password,user?.password_hash??DECOY_PASSWORD_HASH);
    if(!user||!user.active||!terminal||!terminalAllowed(username,terminalId)||!passwordValid){
      let reason=!user?'UNKNOWN_USER':!user.active?'INACTIVE_USER':!terminal?'INVALID_TERMINAL':'INVALID_PASSWORD';
      if(user&&user.active&&terminal&&!passwordValid){const latest=this.db.raw.prepare('SELECT failed_login_count,last_failed_at,locked_until FROM users WHERE id=?').get(user.id) as any;const failedAt=Date.now(),withinWindow=Boolean(latest.last_failed_at&&failedAt-latest.last_failed_at<15*60_000),failedCount=(withinWindow?latest.failed_login_count:0)+1,lockedUntil=failedCount>=5?Math.max(latest.locked_until??0,failedAt+15*60_000):latest.locked_until??null;this.db.raw.prepare('UPDATE users SET failed_login_count=?,last_failed_at=?,locked_until=? WHERE id=?').run(failedCount,failedAt,lockedUntil,user.id);if(lockedUntil){reason='LOCKED_AFTER_FAILURES';appendAudit(this.db.raw,{actorId:user.id,action:'USER_LOGIN_LOCKED',entityType:'user',entityId:user.id,payload:{terminalId,lockedUntil,failedCount}})}}
      this.attempt(username,user?.id,terminalId,false,reason,meta,now);throw new UnauthorizedException('Invalid credentials, disabled account, or temporary lock');
    }
    const current=this.db.raw.prepare('SELECT auth_version,active,locked_until FROM users WHERE id=?').get(user.id) as any;if(!current?.active||current.auth_version!==user.auth_version||(current.locked_until&&current.locked_until>Date.now()))throw new UnauthorizedException('Konto geändert. Bitte erneut anmelden.');
    this.db.raw.prepare('UPDATE users SET failed_login_count=0,last_failed_at=NULL,locked_until=NULL,last_login_at=? WHERE id=?').run(now,user.id);this.attempt(username,user.id,terminalId,true,'SUCCESS',meta,now);appendAudit(this.db.raw,{actorId:user.id,action:'LOGIN_SUCCEEDED',entityType:'terminal',entityId:terminalId,payload:{remoteAddress:meta.remoteAddress??null}});
    return {accessToken:await this.jwt.signAsync({sub:user.id,username:user.username,roles,terminalId,staffPin:pinMode,authVersion:user.auth_version,pinVersion:pinMode?hmacSha256(process.env.JWT_SECRET??'',pin!):undefined},{expiresIn:'12h'}),expiresInSeconds:43200};
    }finally{this.totalInFlight--;const remaining=(this.inFlight.get(remoteKey)??1)-1;if(remaining)this.inFlight.set(remoteKey,remaining);else this.inFlight.delete(remoteKey)}
  }
  private attempt(username:string,userId:string|undefined,terminalId:string,success:boolean,reason:string,meta:LoginMeta,createdAt:number){this.db.raw.prepare('INSERT INTO auth_attempts VALUES(?,?,?,?,?,?,?,?,?)').run(id(),username,userId??null,terminalId,meta.remoteAddress?.slice(0,100)??null,meta.userAgent?.slice(0,500)??null,success?1:0,reason,createdAt)}
}
