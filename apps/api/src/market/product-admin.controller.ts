import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, Roles, type Principal } from '../auth/auth.js';
import { ProductAdminService } from './product-admin.service.js';

const money = z.number().int().min(0).max(100_000);
const createSchema = z.object({ name: z.string().min(1).max(80), category: z.string().min(1).max(40), basePriceCents: money, minPriceCents: money, maxPriceCents: money });
const updateSchema = createSchema.partial().extend({ active: z.boolean().optional(), soldOut: z.boolean().optional() });

@Controller('admin/products') @Roles('MARKET_MANAGER', 'ADMIN') export class ProductAdminController {
  constructor(private products: ProductAdminService) {}
  @Get() list() { return this.products.list(); }
  @Post() create(@Body() b: unknown, @CurrentPrincipal() p: Principal) { return this.products.create(createSchema.parse(b), p.sub); }
  @Patch(':id') update(@Param('id') productId: string, @Body() b: unknown, @CurrentPrincipal() p: Principal) { return this.products.update(productId, updateSchema.parse(b), p.sub); }
}
