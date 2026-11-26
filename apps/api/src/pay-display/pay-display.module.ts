import { Module } from '@nestjs/common';
import { PendingChargeController } from './pending-charge.controller.js';
import { PendingChargeService } from './pending-charge.service.js';

@Module({ controllers: [PendingChargeController], providers: [PendingChargeService] })
export class PayDisplayModule {}
