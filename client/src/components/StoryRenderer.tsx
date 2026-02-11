import { useMemo, useState } from 'react';
import type { InteractiveArticle } from '@shared/interactiveArticle';

interface StoryRendererProps {
  article: InteractiveArticle;
}

export function StoryRenderer({ article }: StoryRendererProps) {
  const [activeBlockId, setActiveBlockId] = useState<string>(article.storyBlocks[0]?.id || '');
  const [openedHighlightId, setOpenedHighlightId] = useState<string | null>(null);

  if (!article.storyBlocks.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
        스토리 블록이 없어 인터랙티브 렌더링을 표시할 수 없습니다.
      </div>
    );
  }

  const scrollByBlock = useMemo(() => {
    const map = new Map<string, { start: number; end: number }>();
    for (const item of article.scrollMap) {
      map.set(item.blockId, { start: item.start, end: item.end });
    }
    return map;
  }, [article.scrollMap]);

  const highlightsByBlock = useMemo(() => {
    const map = new Map<string, InteractiveArticle['highlights']>();
    for (const h of article.highlights) {
      const list = map.get(h.blockId) || [];
      list.push(h);
      map.set(h.blockId, list);
    }
    return map;
  }, [article.highlights]);

  const interactionsByBlock = useMemo(() => {
    const map = new Map<string, InteractiveArticle['interactionHints']>();
    for (const hint of article.interactionHints) {
      const list = map.get(hint.blockId) || [];
      list.push(hint);
      map.set(hint.blockId, list);
    }
    return map;
  }, [article.interactionHints]);

  return (
    <div className="space-y-5">
      {article.storyBlocks.map((block) => {
        const scrollRange = scrollByBlock.get(block.id);
        const highlights = highlightsByBlock.get(block.id) || [];
        const interactions = interactionsByBlock.get(block.id) || [];
        const isActive = activeBlockId === block.id;

        return (
          <section
            key={block.id}
            onMouseEnter={() => setActiveBlockId(block.id)}
            className={`rounded-xl border p-4 transition-colors ${
              isActive ? 'border-white/30 bg-white/10' : 'border-white/10 bg-white/5'
            }`}
            data-block-id={block.id}
          >
            <div className="mb-2 flex items-center gap-2 text-xs text-white/60">
              <span className="rounded bg-white/10 px-2 py-0.5 uppercase">{block.intent}</span>
              {scrollRange && (
                <span className="rounded bg-white/10 px-2 py-0.5">
                  scroll {scrollRange.start}-{scrollRange.end}
                </span>
              )}
              {isActive && interactions.length > 0 && (
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-200">
                  interactive
                </span>
              )}
            </div>

            <p className="text-base leading-7 text-white/90 whitespace-pre-wrap">{block.text}</p>

            {highlights.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {highlights.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/85 hover:bg-white/20"
                    onClick={() => setOpenedHighlightId((prev) => (prev === h.id ? null : h.id))}
                  >
                    {h.type}: {h.label}
                  </button>
                ))}
              </div>
            )}

            {openedHighlightId && (
              <div className="mt-2 text-sm text-white/70">
                {highlights
                  .filter((h) => h.id === openedHighlightId)
                  .map((h) => (
                    <div key={h.id}>
                      {typeof h.payload?.summary === 'string'
                        ? h.payload.summary
                        : JSON.stringify(h.payload)}
                    </div>
                  ))}
              </div>
            )}

            {isActive && interactions.length > 0 && (
              <div className="mt-3 space-y-1">
                {interactions.map((hint) => (
                  <p key={hint.id} className="text-xs text-cyan-200/90">
                    {`${hint.trigger} -> ${hint.action} (${hint.target})`}
                  </p>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
