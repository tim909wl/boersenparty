import { HttpException } from '@nestjs/common';
export class DomainError extends HttpException {
  constructor(public readonly code: string, message: string, status = 409) { super({code,message}, status); }
}
