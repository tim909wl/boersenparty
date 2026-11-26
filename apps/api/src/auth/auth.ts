import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException, ForbiddenException, createParamDecorator } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Role } from '@boersenparty/contracts';
import { hmacSha256 } from '../common/hash.js';
import { pinEligible, staffPinFor, terminalAllowed } from './staff-pin.js';
import { DatabaseService } from '../database/database.service.js';

export type Principal={sub:string;username:string;roles:Role[];terminalId:string;staffPin?:boolean;authVersion?:number;pinVersion?:string};
export const Public=()=>SetMetadata('public',true);
export const Roles=(...roles:Role[])=>SetMetadata('roles',roles);
export const CurrentPrincipal=createParamDecorator((_d,ctx)=>ctx.switchToHttp().getRequest().principal as Principal);
@Injectable() export class AuthGuard implements CanActivate{
  constructor(private jwt:JwtService,private reflector:Reflector,private db:DatabaseService){}
  canActivate(ctx:ExecutionContext){
    if(this.reflector.getAllAndOverride<boolean>('public',[ctx.getHandler(),ctx.getClass()])) return true;
    const req=ctx.switchToHttp().getRequest(); const token=String(req.headers.authorization??'').replace(/^Bearer /,'');
    if(!token) throw new UnauthorizedException();
    try{req.principal=this.jwt.verify<Principal>(token);}catch{throw new UnauthorizedException('Invalid or expired token');}
    const sessionUser=this.db.raw.prepare("SELECT u.auth_version FROM users u JOIN terminals t ON t.id=? WHERE u.id=? AND u.active=1 AND (u.locked_until IS NULL OR u.locked_until<=?) AND t.status='ACTIVE'").get(req.principal.terminalId,req.principal.sub,Date.now()) as {auth_version:number}|undefined;if(!sessionUser||req.principal.authVersion!==sessionUser.auth_version)throw new UnauthorizedException('User or terminal has been disabled or locked');
    req.principal.roles=(this.db.raw.prepare('SELECT role FROM user_roles WHERE user_id=?').all(req.principal.sub) as {role:Role}[]).map(row=>row.role);
    const pin=staffPinFor(req.principal.username);if(!terminalAllowed(req.principal.username,req.principal.terminalId))throw new UnauthorizedException('Terminal nicht zugewiesen');
    if(req.principal.staffPin&&(!pinEligible(req.principal.roles)||!pin||!/^\d{4}$/.test(pin)||req.principal.pinVersion!==hmacSha256(process.env.JWT_SECRET??'',pin))) throw new UnauthorizedException('Permissions changed; sign in again with a personal password');
    const required=this.reflector.getAllAndOverride<Role[]>('roles',[ctx.getHandler(),ctx.getClass()])??[];
    if(required.length&&!required.some(r=>req.principal.roles.includes(r))) throw new ForbiddenException();
    return true;
  }
}
