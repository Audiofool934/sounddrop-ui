import { useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Work } from '../types';
import { PlayIcon, PauseIcon, HeartIcon } from './Icons';
import { getWorkSummary, getWorkTitle, hasCornerStory } from '../utils/workText';

interface WorkCardProps {
  work: Work;
  isPlaying: boolean;
  onPlay: () => void;
  onLike: () => void;
  compact?: boolean;
  progress?: number;
  ownerActions?: ReactNode;
}

export default function WorkCard({
  work,
  isPlaying,
  onPlay,
  onLike,
  compact = false,
  progress = 0,
  ownerActions,
}: WorkCardProps) {
  const thumbnail = work.thumbnailUrl || work.imageUrl;
  const [lightbox, setLightbox] = useState(false);
  const title = getWorkTitle(work);
  const summary = getWorkSummary(work);
  const storyVisible = hasCornerStory(work);
  const musicPromptVisible = work.musicPrompt.trim().length > 0;

  if (compact) {
    return (
      <div
        className="flex items-start gap-3 p-3 rounded-[var(--radius-md)] transition-colors"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Thumbnail */}
        <div className="flex-shrink-0 w-12 h-12 rounded-[var(--radius-sm)] overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          {thumbnail ? (
            <img src={thumbnail} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xl" style={{ color: 'var(--text-tertiary)' }}>🎵</div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate mb-0.5" style={{ color: 'var(--text-primary)' }}>{title}</p>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-medium truncate" style={{ color: 'var(--accent-text)' }}>{work.loginAccount}</span>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>·</span>
            <span className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>{work.regionName}</span>
          </div>
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{summary}</p>

          {/* Progress bar */}
          <div className="mt-1.5 rounded-full overflow-hidden" style={{ height: '2px', background: 'rgba(255,255,255,0.08)' }}>
            <div
              className="h-full transition-none"
              style={{ width: `${progress * 100}%`, background: 'var(--accent)' }}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onPlay}
            className="w-11 h-11 rounded-full flex items-center justify-center text-xs transition-colors"
            style={isPlaying
              ? { background: 'var(--accent)', color: 'white' }
              : { background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }
            }
          >
            {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
          </button>
          <button
            onClick={onLike}
            className="flex items-center gap-1 text-xs transition-colors min-h-[44px] px-1"
            style={{ color: work.isLiked ? 'var(--accent-text)' : 'var(--text-tertiary)' }}
          >
            <HeartIcon filled={work.isLiked} size={13} />
            <span>{work.likeCount}</span>
          </button>
        </div>
      </div>
    );
  }

  // Full card
  return (
    <>
      <div
        className="overflow-hidden rounded-[var(--radius-md)] transition-colors"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Thumbnail — click to enlarge */}
        <div
          className="relative w-full cursor-pointer"
          style={{ background: 'rgba(0,0,0,0.3)' }}
          onClick={() => setLightbox(true)}
        >
          {thumbnail ? (
            <img src={thumbnail} alt={title} className="w-full object-contain" style={{ maxHeight: '50vh' }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl" style={{ color: 'var(--text-tertiary)' }}>🎵</div>
          )}
        </div>

        {/* Progress bar */}
        <div style={{ height: '2px', background: 'rgba(255,255,255,0.06)' }}>
          <div
            className="h-full transition-none"
            style={{ width: `${progress * 100}%`, background: 'var(--accent)' }}
          />
        </div>

        {/* Info + Controls */}
        <div className="p-4">
          <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{title}</h3>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium" style={{ color: 'var(--accent-text)' }}>{work.loginAccount}</span>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>·</span>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{work.regionName}</span>
          </div>
          <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            {summary}
          </p>
          {musicPromptVisible && storyVisible && (
            <div className="mb-3">
              <p className="text-[11px] font-medium mb-1" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.04em' }}>
                音乐描述
              </p>
              <p className="text-xs italic" style={{ color: 'var(--text-secondary)' }}>{work.musicPrompt}</p>
            </div>
          )}

          {/* Play + Like row */}
          <div className="flex items-center gap-3">
            <button
              onClick={onPlay}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[var(--radius-sm)] text-sm font-medium transition-colors"
              style={isPlaying
                ? { background: 'var(--accent)', color: 'white' }
                : { background: 'rgba(255,255,255,0.08)', color: 'var(--text-primary)' }
              }
            >
              {isPlaying ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
              <span>{isPlaying ? '播放中' : '播放'}</span>
            </button>
            <button
              onClick={onLike}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-[var(--radius-sm)] text-sm transition-colors"
              style={{
                background: work.isLiked ? 'var(--accent-soft)' : 'rgba(255,255,255,0.06)',
                color: work.isLiked ? 'var(--accent-text)' : 'var(--text-tertiary)',
                border: work.isLiked ? '1px solid var(--accent-border)' : '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <HeartIcon filled={work.isLiked} size={14} />
              <span>{work.likeCount}</span>
            </button>
          </div>

          {ownerActions && (
            <div
              className="mt-3 pt-3 flex flex-col gap-2"
              style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
            >
              {ownerActions}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox — portaled to body to escape overflow-hidden */}
      {lightbox && thumbnail && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.88)' }}
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            aria-label="关闭大图"
            className="absolute top-5 right-5 flex items-center justify-center rounded-full"
            style={{
              width: 40,
              height: 40,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.14)',
              color: 'white',
              cursor: 'pointer',
            }}
            onClick={() => setLightbox(false)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
          <img
            src={work.imageUrl}
            alt={title}
            style={{
              maxWidth: 'calc(100vw - 48px)',
              maxHeight: 'calc(100dvh - 120px)',
              objectFit: 'contain',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            }}
            onClick={(event) => event.stopPropagation()}
          />
        </div>,
        document.body,
      )}
    </>
  );
}
