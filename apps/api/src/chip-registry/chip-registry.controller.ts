import { timingSafeEqual } from 'node:crypto';
import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, Public, Roles, type Principal } from '../auth/auth.js';
import { DomainError } from '../common/domain-error.js';
import { ChipRegistryService } from './chip-registry.service.js';

const registerSchema = z.object({
  type: z.string().min(1).max(40),
  name: z.string().max(80).optional(),
  firmwareVersion: z.string().max(40).optional(),
  capabilities: z.array(z.string().max(40)).max(20).optional(),
  ip: z.string().max(45).optional(),
});
const heartbeatSchema = z.object({ ip: z.string().max(45).optional(), reportedState: z.record(z.string(), z.unknown()).optional() });

// A configured map is authoritative; retain the legacy shared key only when the map is absent.
function checkChipSecret(id:string,secret: string | undefined) {
  let perDevice:Record<string,string>|undefined;
  if(process.env.CHIP_DEVICE_SECRETS){try{perDevice=JSON.parse(process.env.CHIP_DEVICE_SECRETS);if(!perDevice||typeof perDevice!=='object'||Array.isArray(perDevice))throw new Error('invalid map')}catch{throw new DomainError('CHIP_SECRET_CONFIG','Invalid chip configuration',503)}}
  const expected=perDevice?Object.hasOwn(perDevice,id)?perDevice[id]:undefined:process.env.CHIP_NETWORK_SECRET;
  if (typeof expected!=='string' || !expected || !secret || Buffer.byteLength(secret)!==Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(secret),Buffer.from(expected))) throw new DomainError('UNAUTHORIZED_DEVICE', 'Invalid or missing chip secret', 401);
}

@Controller('chips')
export class ChipRegistryController {
  constructor(private chips: ChipRegistryService) {}

  @Get() @Roles('ADMIN', 'MARKET_MANAGER', 'AUDITOR')
  list() { return this.chips.list(); }

  @Patch(':id') @Roles('ADMIN', 'MARKET_MANAGER')
  rename(@Param('id') id: string, @Body() b: unknown, @CurrentPrincipal() p: Principal) {
    return this.chips.rename(id, z.object({ name: z.string().min(1).max(80) }).parse(b).name, p.sub);
  }

  @Patch(':id/desired-state') @Roles('ADMIN', 'MARKET_MANAGER')
  setDesiredState(@Param('id') id: string, @Body() b: unknown, @CurrentPrincipal() p: Principal) {
    return this.chips.setDesiredState(id, z.record(z.string(), z.unknown()).parse(b), p.sub);
  }

  @Public() @Post(':id/register')
  register(@Param('id') id: string, @Body() b: unknown, @Headers('x-chip-secret') secret: string | undefined) {
    checkChipSecret(id,secret);
    return this.chips.register(id, registerSchema.parse(b));
  }

  @Public() @Post(':id/heartbeat')
  heartbeat(@Param('id') id: string, @Body() b: unknown, @Headers('x-chip-secret') secret: string | undefined) {
    checkChipSecret(id,secret);
    return this.chips.heartbeat(id, heartbeatSchema.parse(b));
  }
}
