import { Module } from '@nestjs/common';
import { ChipRegistryController } from './chip-registry.controller.js';
import { ChipRegistryService } from './chip-registry.service.js';

@Module({ controllers: [ChipRegistryController], providers: [ChipRegistryService], exports: [ChipRegistryService] })
export class ChipRegistryModule {}
