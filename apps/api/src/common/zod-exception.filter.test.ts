import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ZodExceptionFilter } from './zod-exception.filter.js';

describe('ZodExceptionFilter', () => {
  it('turns a Zod validation error into a 400 with a readable message instead of an unhandled 500', () => {
    const result = z.object({ password: z.string().min(8), terminalId: z.string() }).safeParse({ password: 'short' });
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as any;

    new ZodExceptionFilter().catch(result.error!, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ code: 'VALIDATION_ERROR', message: expect.stringContaining('password') });
  });
});
