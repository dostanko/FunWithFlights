import { Logger } from '@nestjs/common';
import { ProviderParseError } from '../common/errors/domain.errors';
import { parseProviderResponse } from './route.parser';

const validRecord = {
  airline: 'HA',
  sourceAirport: 'HNL',
  destinationAirport: 'LAS',
  codeShare: '',
  stops: 0,
  equipment: 'E90 320',
};

function silentLogger(): Logger {
  const l = new Logger('test');
  jest.spyOn(l, 'warn').mockImplementation(() => undefined);
  return l;
}

describe('parseProviderResponse', () => {
  it('throws ProviderParseError when body is not an array', () => {
    expect(() => parseProviderResponse('p1', { not: 'an array' }, silentLogger())).toThrow(
      ProviderParseError,
    );
    expect(() => parseProviderResponse('p1', null, silentLogger())).toThrow(ProviderParseError);
    expect(() => parseProviderResponse('p1', 'string-body', silentLogger())).toThrow(
      ProviderParseError,
    );
  });

  it('returns parsed routes for a fully-valid array', () => {
    const out = parseProviderResponse(
      'p1',
      [validRecord, { ...validRecord, sourceAirport: 'LAS', destinationAirport: 'HNL' }],
      silentLogger(),
    );
    expect(out).toHaveLength(2);
    expect(out[0].airline).toBe('HA');
    expect(out[0].equipment).toEqual(['E90', '320']);
  });

  it('returns [] for an empty array body', () => {
    expect(parseProviderResponse('p1', [], silentLogger())).toEqual([]);
  });

  it('drops a record with non-string airline, keeps the rest', () => {
    const out = parseProviderResponse(
      'p1',
      [validRecord, { ...validRecord, airline: 123 }],
      silentLogger(),
    );
    expect(out).toHaveLength(1);
    expect(out[0].airline).toBe('HA');
  });

  it('drops a record with non-int stops, keeps the rest', () => {
    const out = parseProviderResponse(
      'p1',
      [validRecord, { ...validRecord, stops: 'two' }],
      silentLogger(),
    );
    expect(out).toHaveLength(1);
  });

  it('drops a record with non-string airport code', () => {
    const out = parseProviderResponse(
      'p1',
      [validRecord, { ...validRecord, sourceAirport: null }],
      silentLogger(),
    );
    expect(out).toHaveLength(1);
  });

  it('keeps records with non-IATA-length codes (only `string` is required)', () => {
    // Conventions like "airline must be 2 chars" / "airport must be 3 chars"
    // are not part of the contract — only `string` is required. Real
    // provider data contains records like this; we intentionally do not
    // drop them.
    const out = parseProviderResponse(
      'p1',
      [
        { ...validRecord, airline: 'TOOLONG' },
        { ...validRecord, sourceAirport: 'XX', destinationAirport: 'TOOLONG' },
      ],
      silentLogger(),
    );
    expect(out).toHaveLength(2);
  });

  it('normalises equipment as space-joined string into an array', () => {
    const out = parseProviderResponse(
      'p1',
      [{ ...validRecord, equipment: 'DH7 DH8 E90' }],
      silentLogger(),
    );
    expect(out[0].equipment).toEqual(['DH7', 'DH8', 'E90']);
  });

  it('treats missing equipment as empty array', () => {
    const { equipment: _e, ...withoutEquipment } = validRecord;
    const out = parseProviderResponse('p1', [withoutEquipment], silentLogger());
    expect(out).toHaveLength(1);
    expect(out[0].equipment).toEqual([]);
  });

  it('treats null / empty-string equipment as empty array', () => {
    const out = parseProviderResponse(
      'p1',
      [
        { ...validRecord, equipment: null },
        { ...validRecord, sourceAirport: 'LAS', destinationAirport: 'HNL', equipment: '' },
      ],
      silentLogger(),
    );
    expect(out).toHaveLength(2);
    expect(out[0].equipment).toEqual([]);
    expect(out[1].equipment).toEqual([]);
  });

  it('keeps string entries from an equipment array, drops non-strings', () => {
    const out = parseProviderResponse(
      'p1',
      [{ ...validRecord, equipment: ['E90', 123, '320', null] }],
      silentLogger(),
    );
    expect(out[0].equipment).toEqual(['E90', '320']);
  });

  it('logs a single summary WARN line when records are dropped', () => {
    const logger = new Logger('test');
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

    parseProviderResponse(
      'p1',
      [validRecord, { ...validRecord, airline: 123 }, { ...validRecord, stops: 'no' }],
      logger,
    );

    // No per-record lines — just one summary that includes the dropped
    // count and example error reasons.
    expect(warn).toHaveBeenCalledTimes(1);
    const summary = String(warn.mock.calls[0][0]);
    expect(summary).toContain('dropped=2');
    expect(summary).toContain('total=3');
    expect(summary).toContain('valid=1');
    expect(summary).toContain('examples=');
  });

  it('does not log when every record is valid', () => {
    const logger = new Logger('test');
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

    parseProviderResponse('p1', [validRecord], logger);
    expect(warn).not.toHaveBeenCalled();
  });
});
