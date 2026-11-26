import { OnGatewayConnection, OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { Interval } from '@nestjs/schedule';
import { MarketEventsService } from './market-events.service.js';
import { MarketService } from './market.service.js';

@WebSocketGateway({ namespace: '/market', path: '/api/socket.io', transports: ['websocket'] })
export class MarketGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer() server!: Server;
  private lastVersion = -1;
  constructor(private events: MarketEventsService, private market: MarketService) {}
  afterInit() { this.events.attach(products => this.server.emit('prices', products)) }
  handleConnection(client: Socket) { client.emit('prices', this.market.list()) }
  @Interval('market-websocket-push', 1000)
  broadcastChanges() {
    const products = this.market.list() as Array<{ version: number }>;
    const version = products[0]?.version ?? 0;
    if (version === this.lastVersion) return;
    this.lastVersion = version;
    this.events.prices(products);
  }
}
