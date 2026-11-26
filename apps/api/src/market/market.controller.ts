import { timingSafeEqual } from 'node:crypto';
import { Body,Controller,Get,Headers,Post } from '@nestjs/common';import { z } from 'zod';import { CurrentPrincipal, Public,Roles,type Principal } from '../auth/auth.js';import { MarketService } from './market.service.js';import { DomainError } from '../common/domain-error.js';
// A plain crash is meant as a short, loud moment at the bar; the drawn-out variant is AUSVERKAUF.
export const CRASH_DEFAULT_MINUTES=2;
@Controller()export class MarketController{constructor(private market:MarketService){} @Public() @Get('products')products(){return this.market.list()} @Public() @Get('market/history')history(){return this.market.snapshot()} @Post('quotes')@Roles('BAR','ADMIN')quote(@Body()b:unknown,@CurrentPrincipal()p:Principal){return this.market.quote(z.object({items:z.array(z.object({productId:z.string().uuid(),quantity:z.number().int()})).min(1).max(20)}).parse(b).items,p)} @Post('market/tick')@Roles('MARKET_MANAGER','ADMIN')tick(){return this.market.tick()} @Post('market/crash')@Roles('MARKET_MANAGER','ADMIN')crash(@Body()b:unknown,@CurrentPrincipal()p:Principal){const x=z.object({minutes:z.number().int().min(1).max(30),kind:z.enum(['CRASH','AUSVERKAUF']).default('CRASH')}).parse(b);return this.market.startCrash(x.minutes,x.kind,p.sub)} @Post('market/crash/stop')@Roles('MARKET_MANAGER','ADMIN')stopCrash(@CurrentPrincipal()p:Principal){return this.market.stopCrash(p.sub)}
 // Physical crash button (ESP32 + buzzer): no staff login, just a shared secret header — kept
 // deliberately separate from the staff-facing /market/crash endpoint above so the hardware
 // integration never needs a user account or JWT refresh logic.
 @Public() @Post('market/crash/device-trigger') deviceTrigger(@Body()b:unknown,@Headers('x-device-secret')secret:string|undefined){
  const expected=process.env.CRASH_BUTTON_SECRET;
  if(!expected||!secret||Buffer.byteLength(secret)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(secret),Buffer.from(expected)))throw new DomainError('UNAUTHORIZED_DEVICE','Invalid or missing device secret',401);
  const x=z.object({minutes:z.number().int().min(1).max(30).default(CRASH_DEFAULT_MINUTES),kind:z.enum(['CRASH','AUSVERKAUF']).default('CRASH')}).parse(b??{});
  return this.market.startCrash(x.minutes,x.kind,undefined,'physical-buzzer');
 }
 @Post('operations/mode')@Roles('ADMIN','PAYMENT_LEAD')mode(@Body()b:unknown,@CurrentPrincipal()p:Principal){const x=z.object({mode:z.enum(['NORMAL','PRICE_FROZEN','PAYMENT_STOP']),reason:z.string()}).parse(b);if(x.mode==='NORMAL')throw new DomainError('APPROVAL_REQUIRED','NORMAL mode requires a two-person approval request',403);return this.market.setMode(x.mode,x.reason,p.sub)} @Public() @Get('operations/health')health(){return this.market.health()}}
