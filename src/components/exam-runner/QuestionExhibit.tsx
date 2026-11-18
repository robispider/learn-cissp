import { withBase } from '../../lib/paths';
import type { QuestionExhibit as Exhibit } from '../../lib/types/question';

export function QuestionExhibit({ exhibit }: { exhibit: Exhibit }) {
  const src = withBase(`/question-exhibits/${exhibit.file}`);

  return (
    <figure className="mt-4">
      <a className="inline-block max-w-full rounded-lg" href={src} target="_blank" rel="noopener">
        <img
          className="block h-auto max-h-[34rem] max-w-full rounded-lg border border-slate-200 bg-white object-contain dark:border-slate-700"
          src={src}
          alt={exhibit.alt}
          loading="lazy"
        />
      </a>
    </figure>
  );
}
