import { Body,Controller,Post } from '@nestjs/common';import { z } from 'zod';import { CurrentPrincipal,Roles,type Principal } from '../auth/auth.js';import { WalletService } from './wallet.service.js';
@Controller('wallets') export class WalletController{constructor(private wallet:WalletService){}
 @Post('lookup') @Roles('BAR','TOPUP','PAYMENT_LEAD','ADMIN') lookup(@Body() b:unknown){return this.wallet.lookup(z.object({uid:z.string()}).parse(b).uid)}
 @Post('free-drink') @Roles('PAYMENT_LEAD','ADMIN') grant(@Body() b:unknown,@CurrentPrincipal() p:Principal){const x=z.object({uid:z.string().min(1).max(100),expectedWalletId:z.string().min(1).max(80)}).parse(b);return this.wallet.grantFreeDrink(x.uid,x.expectedWalletId,p.sub)}
 @Post('history') @Roles('BAR','TOPUP','PAYMENT_LEAD','ADMIN','AUDITOR') history(@Body() b:unknown){return this.wallet.history(z.object({uid:z.string()}).parse(b).uid)}
}
