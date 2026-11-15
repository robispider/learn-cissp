/** Server-only (build-time) loader — import from .astro pages / endpoints only. */
import { getCollection } from 'astro:content';
import taxonomy from '../content/taxonomy/cissp-cbk-2026.json';
import { buildCatalog, type CatalogData, type TaxonomyJson } from './catalog';
import type { ExamManifest, Question } from './types/question';

export async function loadQuestions(): Promise<Question[]> {
  return (await getCollection('questions')).map((q) => q.data as Question);
}

export async function loadExams(): Promise<ExamManifest[]> {
  return (await getCollection('exams')).map((e) => e.data as ExamManifest);
}

export async function loadCatalog(): Promise<CatalogData> {
  const [exams, questions] = await Promise.all([loadExams(), loadQuestions()]);
  return buildCatalog(taxonomy as TaxonomyJson, exams, questions);
}

export { taxonomy };
