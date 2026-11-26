import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException, ForbiddenException, createParamDecorator } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Role } from '@boersenparty/contracts';
import { pinEligible } from './staff-pin.js';
import { DatabaseService } from '../database/database.service.js';

export type Principal={sub:string;username:string;roles:Role[];terminalId:string;staffPin?:boolean};
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
    if(!this.db.raw.prepare("SELECT 1 FROM users u JOIN terminals t ON t.id=? WHERE u.id=? AND u.active=1 AND (u.locked_until IS NULL OR u.locked_until<=?) AND t.status='ACTIVE'").get(req.principal.terminalId,req.principal.sub,Date.now()))throw new UnauthorizedException('User or terminal has been disabled or locked');
    req.principal.roles=(this.db.raw.prepare('SELECT role FROM user_roles WHERE user_id=?').all(req.principal.sub) as {role:Role}[]).map(row=>row.role);
    if(req.principal.staffPin&&!pinEligible(req.principal.roles)) throw new UnauthorizedException('Permissions changed; sign in again with a personal password');
    const required=this.reflector.getAllAndOverride<Role[]>('roles',[ctx.getHandler(),ctx.getClass()])??[];
    if(required.length&&!required.some(r=>req.principal.roles.includes(r))) throw new ForbiddenException();
    return true;
  }
}
