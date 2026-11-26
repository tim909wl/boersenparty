import { HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { timingSafeEqual } from 'node:crypto';
import { pinEligible } from './staff-pin.js';
import { DatabaseService } from '../database/database.service.js';
import { appendAudit } from '../common/audit.js';
import { id } from '../common/hash.js';

type LoginMeta={remoteAddress?:string;userAgent?:string};
// Fixed decoy hash (no real password behind it) so a login for a non-existent username still
// pays the full bcrypt cost — without this, an unknown username returns noticeably faster than a
// known one with a wrong password, letting an attacker enumerate valid usernames by timing.
const DECOY_PASSWORD_HASH='$2b$12$/t80iUy6/ZrHRWyLfzHXxu0s3M9xcwvT0K1wNwfexW4WpE3icpAWC';
@Injectable() export class AuthService{
  constructor(private db:DatabaseService,private jwt:JwtService){}
  async login(usernameValue:string,password:string,terminalId:string,meta:LoginMeta={}){
    const username=usernameValue.trim().toLowerCase(),now=Date.now(),remoteAddress=meta.remoteAddress?.slice(0,100);if(remoteAddress){const recent=(this.db.raw.prepare('SELECT COUNT(*) count FROM auth_attempts WHERE remote_address=? AND success=0 AND created_at>?').get(remoteAddress,now-60_000) as any).count;if(recent>=20)throw new HttpException('Too many failed login attempts from this address',429)}const user=this.db.raw.prepare('SELECT * FROM users WHERE username=?').get(username) as any,terminal=this.db.raw.prepare("SELECT id FROM terminals WHERE id=? AND status='ACTIVE'").get(terminalId);
    if(user?.locked_until&&user.locked_until>now){this.attempt(username,user.id,terminalId,false,'LOCKED',meta,now);throw new UnauthorizedException('Invalid credentials, disabled account, or temporary lock')}
    const roles=(this.db.raw.prepare('SELECT role FROM user_roles WHERE user_id=?').all(user?.id??'') as any[]).map(x=>x.role);
    const pin=process.env.STAFF_LOGIN_PIN, pinMode=/^\d{4}$/.test(password);
    const pinEnabled=typeof pin==='string'&&/^\d{4}$/.test(pin);
    const passwordValid=pinMode
      ? Boolean(pinEnabled&&pinEligible(roles)&&timingSafeEqual(Buffer.from(password),Buffer.from(pin!)))
      : await compare(password,user?.password_hash??DECOY_PASSWORD_HASH);
    if(!user||!user.active||!terminal||!passwordValid){
      let reason=!user?'UNKNOWN_USER':!user.active?'INACTIVE_USER':!terminal?'INVALID_TERMINAL':'INVALID_PASSWORD';
      if(user&&user.active&&terminal&&!passwordValid){const withinWindow=Boolean(user.last_failed_at&&now-user.last_failed_at<15*60_000),failedCount=(withinWindow?user.failed_login_count:0)+1,lockedUntil=failedCount>=5?now+15*60_000:null;this.db.raw.prepare('UPDATE users SET failed_login_count=?,last_failed_at=?,locked_until=? WHERE id=?').run(failedCount,now,lockedUntil,user.id);if(lockedUntil){reason='LOCKED_AFTER_FAILURES';appendAudit(this.db.raw,{actorId:user.id,action:'USER_LOGIN_LOCKED',entityType:'user',entityId:user.id,payload:{terminalId,lockedUntil,failedCount}})}}
      this.attempt(username,user?.id,terminalId,false,reason,meta,now);throw new UnauthorizedException('Invalid credentials, disabled account, or temporary lock');
    }
    this.db.raw.prepare('UPDATE users SET failed_login_count=0,last_failed_at=NULL,locked_until=NULL,last_login_at=? WHERE id=?').run(now,user.id);this.attempt(username,user.id,terminalId,true,'SUCCESS',meta,now);appendAudit(this.db.raw,{actorId:user.id,action:'LOGIN_SUCCEEDED',entityType:'terminal',entityId:terminalId,payload:{remoteAddress:meta.remoteAddress??null}});
    return {accessToken:await this.jwt.signAsync({sub:user.id,username:user.username,roles,terminalId,staffPin:pinMode},{expiresIn:'12h'}),expiresInSeconds:43200};
  }
  private attempt(username:string,userId:string|undefined,terminalId:string,success:boolean,reason:string,meta:LoginMeta,createdAt:number){this.db.raw.prepare('INSERT INTO auth_attempts VALUES(?,?,?,?,?,?,?,?,?)').run(id(),username,userId??null,terminalId,meta.remoteAddress?.slice(0,100)??null,meta.userAgent?.slice(0,500)??null,success?1:0,reason,createdAt)}
}
