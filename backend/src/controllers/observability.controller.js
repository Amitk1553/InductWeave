import { getMetrics } from '../harness/observability.js';

export async function metrics(_req, res) {
  res.json(await getMetrics());
}
