import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder,SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module.js';
import { DatabaseService } from './database/database.service.js';
import { ZodExceptionFilter } from './common/zod-exception.filter.js';

const app=await NestFactory.create(AppModule,{bodyParser:true});
const express=app.getHttpAdapter().getInstance();
express.set('trust proxy','loopback, linklocal, uniquelocal');
app.setGlobalPrefix('api/v1');
app.useGlobalFilters(new ZodExceptionFilter());
// HSTS is counter-productive on a local-only, self-signed-certificate deployment: once a browser
// has cached it, Chrome refuses to offer a click-through on any future certificate error for this
// host — which is exactly the override phones need before the CA is installed (or after it's
// regenerated on different hardware for the live event).
app.use(helmet({contentSecurityPolicy:false,hsts:false}));
app.enableCors({origin:(process.env.CORS_ORIGIN??'http://localhost:5173').split(','),credentials:false});
app.use((req:any,res:any,next:any)=>{req.correlationId=req.headers['x-correlation-id']??randomUUID();res.setHeader('X-Correlation-Id',req.correlationId);next()});
app.get(DatabaseService).migrate();
const doc=SwaggerModule.createDocument(app,new DocumentBuilder().setTitle('Börsenparty API').setVersion('1.0').addBearerAuth().build());
SwaggerModule.setup('api/docs',app,doc);
await app.listen(Number(process.env.PORT??3000),process.env.API_HOST??'127.0.0.1');
