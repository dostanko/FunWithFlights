import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppExceptionFilter } from './app-exception.filter';

/**
 * Registers `AppExceptionFilter` globally via `APP_FILTER`.
 *
 * Using the DI-aware token rather than `app.useGlobalFilters(...)` in
 * `main.ts` lets the filter inject providers (e.g. `Logger`) and keeps
 * it on the same lifecycle as the rest of the app.
 */
@Module({
  providers: [{ provide: APP_FILTER, useClass: AppExceptionFilter }],
})
export class ErrorsModule {}
