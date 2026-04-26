import { Route } from './route.dto';

export function mergeRoutes(byProvider: ReadonlyArray<ReadonlyArray<Route>>): Route[] {
  const map = new Map<string, Route>();

  for (const provider of byProvider) {
    for (const route of provider) {
      const key = makeKey(route);
      const existing = map.get(key);

      if (!existing) {
        map.set(key, { ...route, equipment: [...route.equipment] });
        continue;
      }
      existing.equipment = unionEquipment(existing.equipment, route.equipment);
    }
  }

  return Array.from(map.values());
}

function makeKey(r: Route): string {
  // Identity follows the OpenFlights / IATA SSIM model: a route record
  // is uniquely identified by carrier + O&D pair + number of stops. A
  // non-stop and a 1-stop service between the same airports are
  // different schedule entries, so `stops` is part of the key, not
  // something to merge.
  return `${r.airline}|${r.sourceAirport}|${r.destinationAirport}|${r.stops}`;
}

function unionEquipment(a: ReadonlyArray<string>, b: ReadonlyArray<string>): string[] {
  // Set keeps insertion order, so the result starts with every code
  // from `a` (the higher-priority provider) followed by codes unique
  // to `b`.
  const set = new Set<string>();
  for (const code of a) set.add(code);
  for (const code of b) set.add(code);
  return Array.from(set);
}
