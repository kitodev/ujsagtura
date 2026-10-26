// Útvonal-sorrend a címek között: legközelebbi szomszéd módszer, majd 2-opt javítás
// (kiveszi a kereszteződő, visszafelé menő szakaszokat).
import { distanceM, type LatLon } from "./geo";

const MAX_ROUNDS = 50;
const MIN_GAIN_M = 0.5;

/**
 * A pontok rövid bejárási sorrendje.
 * Ha van kezdőpont (GPS), onnan indul; ha nincs, azt a kezdő címet választja, amelyikkel a legrövidebb az út.
 */
export function bestOrder<T extends LatLon>(points: T[], start: LatLon | null): T[] {
  const n = points.length;
  if (n < 2) return points.slice();

  const dist = points.map((a) => points.map((b) => distanceM(a, b)));
  const fromStart = start ? points.map((p) => distanceM(start, p)) : null;

  const tourLength = (order: number[]) =>
    (fromStart ? fromStart[order[0]] : 0) + order.slice(1).reduce((sum, v, i) => sum + dist[order[i]][v], 0);

  const nearestNeighbour = (first: number) => {
    const used = new Set([first]);
    const order = [first];
    while (order.length < n) {
      const last = order[order.length - 1];
      let best = -1;
      let bestDist = Infinity;
      for (let j = 0; j < n; j++) {
        if (!used.has(j) && dist[last][j] < bestDist) {
          bestDist = dist[last][j];
          best = j;
        }
      }
      order.push(best);
      used.add(best);
    }
    return order;
  };

  const twoOpt = (order: number[]) => {
    for (let round = 0, improved = true; improved && round < MAX_ROUNDS; round++) {
      improved = false;
      for (let i = 0; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) {
          const before = (k: number) => (i === 0 ? (fromStart ? fromStart[k] : 0) : dist[order[i - 1]][k]);
          const after = (k: number) => (j === n - 1 ? 0 : dist[k][order[j + 1]]);
          if (before(order[j]) + after(order[i]) < before(order[i]) + after(order[j]) - MIN_GAIN_M) {
            order.splice(i, j - i + 1, ...order.slice(i, j + 1).reverse());
            improved = true;
          }
        }
      }
    }
    return order;
  };

  const all = [...Array(n).keys()];
  const starts = fromStart
    ? [fromStart.indexOf(Math.min(...fromStart))]
    : n > 60
      ? all.filter((i) => i % Math.ceil(n / 40) === 0)
      : all;

  let best = all;
  let bestLength = Infinity;
  for (const first of starts) {
    const order = twoOpt(nearestNeighbour(first));
    const length = tourLength(order);
    if (length < bestLength) {
      bestLength = length;
      best = order;
    }
  }
  return best.map((i) => points[i]);
}
