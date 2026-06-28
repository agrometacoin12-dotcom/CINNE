import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

/**
 * Translates all errors into RFC 7807 `application/problem+json` responses with
 * a correlation id, and logs server-side faults.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId =
      (request.headers['x-correlation-id'] as string | undefined) ?? randomUUID();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let title = 'Internal Server Error';
    let detail = 'An unexpected error occurred.';

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      title = exception.name.replace(/Exception$/, '');
      detail =
        typeof res === 'string'
          ? res
          : ((res as { message?: string | string[] }).message as string) ?? exception.message;
    }

    if (status >= 500) {
      this.logger.error(
        { correlationId, path: request.url, err: exception },
        'Unhandled exception',
      );
    }

    response
      .status(status)
      .type('application/problem+json')
      .json({
        type: 'about:blank',
        title,
        status,
        detail,
        instance: request.url,
        correlationId,
      });
  }
}
