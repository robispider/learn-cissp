import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';

export const getStaticPaths: GetStaticPaths = async () => {
  const exams = await getCollection('exams');
  const allQuestions = await getCollection('questions');
  const questionMap = new Map(allQuestions.map((q) => [q.data.id, q.data]));

  return exams.map((examEntry) => {
    const exam = examEntry.data;
    const questions = exam.questionIds
      .map((id) => questionMap.get(id))
      .filter(Boolean);

    return {
      params: { examId: exam.examId },
      props: {
        payload: {
          ...exam,
          questions,
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
