import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DownloadIcon } from './Icons';
import { downloadImageAudioVideo, getVideoExportErrorMessage } from '../utils/videoExport';

interface DownloadMenuProps {
  imageUrl: string;
  audioUrl: string;
  filenameBase: string;
  size?: number;
  disabled?: boolean;
  onBeforeVideoExport?: () => void;
}

function sanitizeDownloadName(input: string) {
  const cleaned = input
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned || 'sounddrop';
}

export default function DownloadMenu({
  imageUrl,
  audioUrl,
  filenameBase,
  size = 36,
  disabled = false,
  onBeforeVideoExport,
}: DownloadMenuProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [exportingVideo, setExportingVideo] = useState(false);
  const [error, setError] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const safeFilename = sanitizeDownloadName(filenameBase);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = 132;
      const menuHeight = error ? 124 : 88;
      const left = Math.min(Math.max(12, rect.right - menuWidth), window.innerWidth - menuWidth - 12);
      const below = rect.bottom + 8;
      const above = rect.top - menuHeight - 8;
      const top = below + menuHeight > window.innerHeight - 12 && above > 12 ? above : below;
      setPosition({ top, left });
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [error, open]);

  const handleVideoDownload = async () => {
    if (exportingVideo) return;
    setError('');
    setExportingVideo(true);
    onBeforeVideoExport?.();
    try {
      await downloadImageAudioVideo({ imageUrl, audioUrl, filenameBase: safeFilename });
      setOpen(false);
    } catch (downloadError) {
      setError(getVideoExportErrorMessage(downloadError));
    } finally {
      setExportingVideo(false);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="下载"
        title="下载"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          if (disabled) return;
          setError('');
          setOpen((prev) => !prev);
        }}
        disabled={disabled}
        className="flex items-center justify-center transition-colors"
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          background: open ? 'var(--accent-soft)' : 'rgba(255,255,255,0.06)',
          color: open ? 'var(--accent-text)' : 'var(--text-secondary)',
          border: open ? '1px solid var(--accent-border)' : '1px solid rgba(255,255,255,0.08)',
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        {exportingVideo ? (
          <span className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'currentColor', borderTopColor: 'transparent' }} />
        ) : (
          <DownloadIcon size={size >= 40 ? 16 : 15} />
        )}
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="fixed p-1 shadow-2xl"
          style={{
            top: position.top,
            left: position.left,
            width: 132,
            zIndex: 10000,
            borderRadius: 'var(--radius-md)',
            background: 'rgba(16,16,16,0.96)',
            border: '1px solid rgba(255,255,255,0.12)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <a
            role="menuitem"
            href={audioUrl}
            download={`${safeFilename}.mp3`}
            className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-xs transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onClick={() => setOpen(false)}
          >
            <DownloadIcon size={13} />
            <span>下载音频</span>
          </a>
          <button
            type="button"
            role="menuitem"
            disabled={exportingVideo}
            onClick={() => void handleVideoDownload()}
            className="w-full flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-xs transition-colors text-left"
            style={{
              color: exportingVideo ? 'var(--text-tertiary)' : 'var(--text-secondary)',
              background: 'transparent',
              border: 'none',
              cursor: exportingVideo ? 'default' : 'pointer',
            }}
          >
            {exportingVideo ? (
              <span className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'currentColor', borderTopColor: 'transparent' }} />
            ) : (
              <DownloadIcon size={13} />
            )}
            <span>{exportingVideo ? '合成中' : '下载视频'}</span>
          </button>
          {error && (
            <p className="px-3 py-2 text-[11px]" style={{ color: '#fca5a5', lineHeight: 1.4 }}>
              {error}
            </p>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
