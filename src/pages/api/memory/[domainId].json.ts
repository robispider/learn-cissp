import type { APIRoute, GetStaticPaths } from 'astro';
import taxonomy from '../../../content/taxonomy/cissp-cbk-2026.json';
import { loadMemoryCards } from '../../../lib/load-catalog';

export const getStaticPaths: GetStaticPaths = async () => {
  const allCards = await loadMemoryCards();

  return taxonomy.domains.map((domain) => {
    const domainCards = allCards.filter((c) => c.domainId === domain.domainId);
    return {
      params: { domainId: domain.domainId },
      props: {
        payload: {
          domain,
          totalCards: domainCards.length,
          cards: domainCards,
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
