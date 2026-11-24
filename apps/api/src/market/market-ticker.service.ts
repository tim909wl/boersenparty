import { Injectable,Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DomainError } from '../common/domain-error.js';
import { MarketService } from './market.service.js';

const interval=Math.max(10_000,Number(process.env.MARKET_TICK_INTERVAL_MS) || 60_000);

@Injectable()
export class MarketTickerService {
  private readonly logger=new Logger(MarketTickerService.name);
  constructor(private readonly market:MarketService){}

  @Interval('market-price-tick',interval)
  updatePrices(){
    if(!this.market.isRunning())return;
    try{this.market.tick()}
    catch(error){
      if(error instanceof DomainError&&error.code==='MARKET_NOT_RUNNING')return;
      this.logger.error('Automatic price tick failed',error instanceof Error?error.stack:undefined);
    }
  }
}
