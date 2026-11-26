import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, Public, Roles, type Principal } from '../auth/auth.js';
import { DeviceService } from './device.service.js';

const heartbeatSchema = z.object({ name: z.string().max(80).optional(), userAgent: z.string().max(500).optional(), screenWidth: z.number().int().positive().optional(), screenHeight: z.number().int().positive().optional() });
const diagnosticSchema = z.object({
  network: z.object({ avgMs: z.number(), failures: z.number().int(), samples: z.number().int(), verdict: z.enum(['good', 'warn', 'bad']) }),
  device: z.record(z.string(), z.unknown()),
});

@Controller('devices')
export class DeviceController {
  constructor(private devices: DeviceService) {}

  @Get() @Roles('ADMIN', 'MARKET_MANAGER', 'AUDITOR')
  list() { return this.devices.list(); }

  @Post('trigger-diagnostics') @Roles('ADMIN', 'MARKET_MANAGER')
  trigger(@CurrentPrincipal() p: Principal) { return this.devices.triggerFleetDiagnostics(p.sub); }

  @Patch(':id') @Roles('ADMIN', 'MARKET_MANAGER')
  rename(@Param('id') id: string, @Body() b: unknown, @CurrentPrincipal() p: Principal) {
    return this.devices.rename(id, z.object({ name: z.string().min(1).max(80) }).parse(b).name, p.sub);
  }

  // Public: every unattended display heartbeats and reports its own test results without a login.
  @Post(':id/heartbeat') @Public()
  heartbeat(@Param('id') id: string, @Body() b: unknown) { return this.devices.heartbeat(id, heartbeatSchema.parse(b)); }

  @Post(':id/diagnostic-result') @Public()
  diagnosticResult(@Param('id') id: string, @Body() b: unknown) { return this.devices.recordDiagnostic(id, diagnosticSchema.parse(b)); }
}
