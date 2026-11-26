import { Injectable } from '@nestjs/common';
@Injectable()
export class MarketEventsService {
  private publishPrices?: (products: unknown[]) => void;
  attach(publisher: (products: unknown[]) => void) { this.publishPrices = publisher }
  prices(products: unknown[]) { this.publishPrices?.(products) }
}
