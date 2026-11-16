import type { APIRoute } from 'astro';
import { loadMemoryCards } from '../../../lib/load-catalog';

/** Full memory card catalog — consumed by client-side SRS queue and exam-bridge. */
export const GET: APIRoute = async () => {
  const cards = await loadMemoryCards();
  return new Response(JSON.stringify(cards), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
