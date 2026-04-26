import { ApiProperty } from '@nestjs/swagger';

/**
 * Swagger schema for the JSON error envelope emitted by
 * {@link AppExceptionFilter}. The filter is the producer; this DTO
 * only documents the shape so OpenAPI clients (and the reseller looking
 * at Swagger UI) know what to expect on a non-2xx.
 *
 * Don't import this from anywhere except controller decorators and the
 * filter's own typing — it's a wire-format description, not a runtime
 * model.
 *
 * Lives next to `app-exception.filter.ts` because the filter owns the
 * envelope; keeping schema and producer together avoids drift.
 */
export class ErrorResponseDto {
  @ApiProperty({
    description:
      'Stable, machine-readable error code. Domain failures use `PROVIDER_*` codes; framework errors use `HTTP_<status>`; anything unmapped falls through to `INTERNAL_ERROR`.',
    example: 'PROVIDER_UNAVAILABLE',
  })
  code!: string;

  @ApiProperty({
    description: 'Human-readable error message. Safe to surface to API users.',
    example: 'Provider all-providers is unavailable',
  })
  message!: string;

  @ApiProperty({
    description:
      'Correlation id — same value as the `x-request-id` response header and the `requestId` field on the access / error log lines for this request. Use it to grep logs when a client reports a failure.',
    example: '7f3c1e2a-9b6f-4d3a-9e1c-2b5f3c1e2a9b',
    required: false,
  })
  requestId?: string;

  @ApiProperty({
    description: 'ISO-8601 timestamp of when the response envelope was built.',
    example: '2026-04-25T09:15:30.000Z',
  })
  timestamp!: string;
}
