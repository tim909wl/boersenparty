import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, Roles, type Principal } from '../auth/auth.js';
import { DomainError } from '../common/domain-error.js';
import { PendingChargeService } from './pending-charge.service.js';

const chargeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('purchase'), quoteId: z.string().uuid(), totalCents: z.number().int().min(0), items: z.array(z.object({ name: z.string().max(80), quantity: z.number().int().min(1), unitPriceCents: z.number().int().min(0) })).min(1).max(20) }),
  z.object({ type: z.literal('topup'), amountCents: z.number().int().min(100).max(20000), fundingMethod: z.enum(['CASH', 'CARD_VERIFIED']), paymentReference: z.string().optional() }),
]);

@Controller('terminals/:terminalId/pending-charge')
export class PendingChargeController {
  constructor(private charges: PendingChargeService) {}

  // Paired display must authenticate as a user assigned to this terminal.
  @Get() @Roles('BAR','TOPUP','PAYMENT_LEAD','ADMIN')
  get(@Param('terminalId') terminalId: string,@CurrentPrincipal() p:Principal) { if(terminalId!==p.terminalId)throw new DomainError('TERMINAL_FORBIDDEN','Fremdes Terminal',403); throw new DomainError('DISPLAY_DISABLED','Gästebezahldisplay pausiert; bitte an der Kasse bezahlen',503); }

  @Post() @Roles('BAR', 'TOPUP', 'PAYMENT_LEAD', 'ADMIN')
  set(@Param('terminalId') terminalId: string, @Body() body: unknown, @CurrentPrincipal() p:Principal) {
    if(terminalId!==p.terminalId)throw new DomainError('TERMINAL_FORBIDDEN','Fremdes Terminal',403);
    chargeSchema.parse(body);throw new DomainError('DISPLAY_DISABLED','Gästebezahldisplay pausiert',503);
  }

  @Delete() @Roles('BAR', 'TOPUP', 'PAYMENT_LEAD', 'ADMIN')
  clear(@Param('terminalId') terminalId: string,@CurrentPrincipal() p:Principal,@Query('quoteId') quoteId?:string) { if(terminalId!==p.terminalId)throw new DomainError('TERMINAL_FORBIDDEN','Fremdes Terminal',403); return { ok: this.charges.clear(terminalId,quoteId) }; }
}
