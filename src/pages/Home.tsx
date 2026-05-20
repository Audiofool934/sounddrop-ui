import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../api/client';
import { DEMO_WORKS } from '../demoData';
import { getWorkTitle } from '../utils/workText';

interface ExampleWork {
  id: string;
  regionName: string;
  title: string;
  cornerStory: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  selectedAudioUrl: string;
  loginAccount: string;
  musicPrompt: string;
}

export default function Home() {
  const { user } = useAuth();
  const [examples, setExamples] = useState<ExampleWork[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    api.get('/works/latest?limit=20').then((res) => {
      if (res.data.success) setExamples(res.data.data);
    }).catch(() => {
      setExamples(DEMO_WORKS);
    });
  }, []);

  const togglePlay = (work: ExampleWork) => {
    if (playingId === work.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(work.selectedAudioUrl);
    audio.play().catch(() => {});
    audio.onended = () => setPlayingId(null);
    audioRef.current = audio;
    setPlayingId(work.id);
  };

  useEffect(() => {
    return () => { audioRef.current?.pause(); };
  }, []);

  // Gallery scroll-based scaling
  const galleryRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const updateCardScales = useCallback(() => {
    const container = galleryRef.current;
    if (!container) return;
    cardRefs.current.forEach((card) => {
      if (!card) return;
      const cardCenter = card.offsetLeft - container.scrollLeft + card.offsetWidth / 2;
      const dist = Math.abs(container.offsetWidth / 2 - cardCenter);
      const maxDist = container.offsetWidth * 0.6;
      const ratio = Math.min(dist / maxDist, 1); // 0 = center, 1 = far
      const scale = 1 - ratio * 0.35; // 1.0 → 0.65
      const opacity = 1 - ratio * 0.5; // 1.0 → 0.5
      card.style.transform = `scale(${scale})`;
      card.style.opacity = String(opacity);
    });
  }, []);

  useEffect(() => {
    const el = galleryRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateCardScales, { passive: true });
    updateCardScales();
    return () => el.removeEventListener('scroll', updateCardScales);
  }, [examples, updateCardScales]);

  return (
    <div className="relative flex flex-col" style={{ height: '100dvh', background: 'var(--bg-base)', overflow: 'hidden' }}>
      {/* Background */}
      <div className="absolute inset-0">
        <img src="/maps/map-zgc-web.jpg" alt="" className="w-full h-full object-cover" style={{ filter: 'blur(6px)', transform: 'scale(1.05)', opacity: 0.3 }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(10,10,10,0.4) 0%, rgba(10,10,10,0.9) 60%)' }} />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col flex-1 px-6">
        {/* Hero — top half */}
        <div className="flex flex-col items-center justify-center text-center flex-1" style={{ minHeight: 0 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.25, marginBottom: 12 }}>
            SoundDrop<br />校园声音地图
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24, maxWidth: 340 }}>
            选择地点，上传照片和描述，生成音乐并发布到地图。
          </p>
          <Link to="/map" className="btn-primary text-center" style={{ padding: '13px 36px', fontSize: 15 }}>
            进入声音地图
          </Link>
          {user && (
            <Link to="/map?panel=my" className="mt-3" style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              我的作品 →
            </Link>
          )}
        </div>

        {/* Gallery — bottom portion */}
        {examples.length > 0 && (
          <div style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 20px)' }}>
            <div className="flex items-baseline justify-between mb-3">
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>最新作品</span>
              <Link to="/map" style={{ fontSize: 12, color: 'var(--accent-text)' }}>查看全部 →</Link>
            </div>
            <div ref={galleryRef} className="overflow-x-auto hide-scrollbar" style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', margin: '0 -24px', padding: '0 24px' }}>
              <div className="flex gap-3 items-center" style={{ width: 'max-content', padding: '8px calc(50vw - min(22vw, 100px))' }}>
                {examples.map((w, i) => {
                  const isPlaying = playingId === w.id;
                  return (
                    <button
                      key={w.id}
                      ref={(el) => { cardRefs.current[i] = el; }}
                      type="button"
                      onClick={() => togglePlay(w)}
                      className="group relative overflow-hidden text-left flex-shrink-0"
                      style={{
                        width: 'min(44vw, 200px)', height: 'min(55vw, 250px)',
                        borderRadius: 'var(--radius-md)',
                        border: isPlaying ? '1px solid var(--accent-border)' : '1px solid var(--glass-border)',
                        scrollSnapAlign: 'center',
                        transition: 'transform 0.15s ease-out, opacity 0.15s ease-out',
                      }}
                    >
                      <img src={w.thumbnailUrl || w.imageUrl} alt={w.regionName} className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)' }} />
                      <div
                        className="absolute flex items-center justify-center rounded-full"
                        style={{ bottom: 36, right: 6, width: 24, height: 24, background: isPlaying ? 'var(--accent)' : 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}
                      >
                        {isPlaying ? (
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                        ) : (
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="white"><polygon points="7,4 21,12 7,20" /></svg>
                        )}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <p className="truncate" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{getWorkTitle(w)}</p>
                        <p className="truncate" style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{w.loginAccount} · {w.regionName}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-3" style={{ flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Music Lab · 中国人民大学</span>
        </div>
      </div>
    </div>
  );
}
