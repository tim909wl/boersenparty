import { Body,Controller,Get,Post } from '@nestjs/common';import { z } from 'zod';import { CurrentPrincipal,Roles,type Principal } from '../auth/auth.js';import { DomainError } from '../common/domain-error.js';import { WristbandAdminService } from './wristband-admin.service.js';
@Controller('wristbands')export class WristbandAdminController{constructor(private admin:WristbandAdminService){}
 @Get()@Roles('TOPUP','PAYMENT_LEAD','ADMIN','AUDITOR')list(){return this.admin.list()}
 @Post('register')@Roles('TOPUP','PAYMENT_LEAD','ADMIN')register(@Body()b:unknown,@CurrentPrincipal()p:Principal){const x=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('NFC'),bandNumber:z.string().min(1).max(40),uid:z.string().min(4),freeDrink:z.boolean().optional(),initialBalanceCents:z.number().int().min(0).max(20000).default(0)}),
  z.object({kind:z.literal('TYVEK'),bandNumber:z.string().min(1).max(40),uid:z.string().optional(),freeDrink:z.boolean().optional(),initialBalanceCents:z.number().int().min(0).max(20000).default(0)})
 ]).parse(b);if(x.initialBalanceCents!==0&&x.initialBalanceCents!==500)throw new DomainError('INVALID_STARTING_BALANCE','Nur 0 € oder 5 € Startguthaben erlaubt',422);return this.admin.register(x,p.sub)}
 @Post('block')@Roles('PAYMENT_LEAD','ADMIN')block(@Body()b:unknown,@CurrentPrincipal()p:Principal){const x=z.object({uid:z.string(),reason:z.string().min(5).max(500)}).parse(b);return this.admin.block(x.uid,x.reason,p.sub)}
}
