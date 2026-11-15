import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import taxonomy from '../../../content/taxonomy/cissp-cbk-2026.json';

export const getStaticPaths: GetStaticPaths = async () => {
  const exams = await getCollection('exams');
  const allQuestions = await getCollection('questions');

  return taxonomy.domains.map((domain) => {
    const domainExams = exams
      .filter((e) => e.data.domainId === domain.domainId)
      .map((e) => e.data);
    const domainQuestions = allQuestions
      .filter((q) => q.data.domainId === domain.domainId)
      .map((q) => q.data);

    return {
      params: { domainId: domain.domainId },
      props: {
        payload: {
          domain,
          exams: domainExams,
          questions: domainQuestions,
        },
      },
    };
  });
};

export const GET: APIRoute = async ({ props }) => {
  return new Response(JSON.stringify(props.payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
