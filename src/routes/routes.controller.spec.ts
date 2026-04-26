import { RouteResponseDto } from './route-response.dto';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';

describe('RoutesController', () => {
  it('delegates findAll() to RoutesService.getAll() and returns its result verbatim', async () => {
    const payload: RouteResponseDto[] = [
      {
        airline: 'HA',
        sourceAirport: 'HNL',
        destinationAirport: 'LAS',
        codeShare: '',
        stops: 0,
        equipment: 'E90 320',
      },
    ];
    const getAll = jest.fn(async () => payload);
    const svc = { getAll } as unknown as RoutesService;
    const controller = new RoutesController(svc);

    const out = await controller.findAll({});

    expect(out).toBe(payload);
    expect(getAll).toHaveBeenCalledTimes(1);
  });

  it('returns an empty array when the service returns []', async () => {
    const getAll = jest.fn(async () => [] as RouteResponseDto[]);
    const svc = { getAll } as unknown as RoutesService;
    const controller = new RoutesController(svc);

    expect(await controller.findAll({})).toEqual([]);
  });

  it('forwards the query DTO to the service untouched', async () => {
    const getAll = jest.fn(async () => [] as RouteResponseDto[]);
    const svc = { getAll } as unknown as RoutesService;
    const controller = new RoutesController(svc);

    const query = { sourceAirport: 'HNL', destinationAirport: 'LAS' };
    await controller.findAll(query);

    expect(getAll).toHaveBeenCalledWith(query);
  });
});
