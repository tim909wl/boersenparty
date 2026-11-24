import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { ZodError } from 'zod';

@Catch(ZodError)
export class ZodExceptionFilter implements ExceptionFilter {
  catch(exception: ZodError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const message = exception.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    response.status(400).json({ code: 'VALIDATION_ERROR', message });
  }
}
