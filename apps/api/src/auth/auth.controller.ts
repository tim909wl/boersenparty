import { Body, Controller, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from './auth.service.js';
import { Public } from './auth.js';
@Controller('auth') export class AuthController{constructor(private auth:AuthService){} @Public() @Post('login') login(@Body() body:unknown,@Req() req:any){const x=z.object({username:z.string().min(1),password:z.string().min(4).max(128),terminalId:z.string().uuid()}).parse(body);return this.auth.login(x.username,x.password,x.terminalId,{remoteAddress:req.ip??req.socket?.remoteAddress,userAgent:req.headers?.['user-agent']})}}
