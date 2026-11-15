import type { APIRoute } from 'astro';
import { loadQuestions } from '../../lib/load-catalog';

/** Entire question bank — consumed by the in-browser exam generator and results pages. */
export const GET: APIRoute = async () => {
  const questions = await loadQuestions();
  return new Response(JSON.stringify(questions), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
