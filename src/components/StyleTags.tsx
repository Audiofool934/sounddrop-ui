import { useState, useCallback } from 'react';
import { STYLE_TAGS } from '../config';

interface Props {
  onSelect: (tag: string) => void;
}

function pickRandom(count: number): string[] {
  const arr = [...STYLE_TAGS].sort(() => Math.random() - 0.5);
  return arr.slice(0, count);
}

export default function StyleTags({ onSelect }: Props) {
  const [visible, setVisible] = useState(() => pickRandom(6));

  const shuffle = useCallback(() => {
    setVisible(pickRandom(6));
  }, []);

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {visible.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onSelect(tag)}
          className="px-4 py-2 text-sm rounded-full transition-all hover:border-[rgba(160,40,45,0.35)] hover:text-[var(--accent-text)] hover:bg-[rgba(160,40,45,0.15)]"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--text-secondary)',
          }}
        >
          {tag}
        </button>
      ))}
      <button
        type="button"
        onClick={shuffle}
        aria-label="换一批"
        className="flex items-center justify-center rounded-full transition-all hover:bg-[rgba(255,255,255,0.1)]"
        style={{
          width: 32, height: 32,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: 'var(--text-tertiary)',
        }}
        title="换一批"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 3h5v5" /><path d="M4 20L21 3" />
          <path d="M21 16v5h-5" /><path d="M15 15l6 6" />
          <path d="M4 4l5 5" />
        </svg>
      </button>
    </div>
  );
}
