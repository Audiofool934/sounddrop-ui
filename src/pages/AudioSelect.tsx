import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGenerationPolling } from '../hooks/usePolling';
import StyleTags from '../components/StyleTags';
import api from '../api/client';
import { getWorkSummary, getWorkTitle } from '../utils/workText';

interface SubmissionData {
  id: string;
  imageUrl: string;
  regionName: string;
  title: string;
  cornerStory: string;
  musicPrompt: string;
  status: string;
}

interface GenerationData {
  id: string;
  status: string;
  audioUrls: string[];
}

interface MineResponse {
  submission: SubmissionData | null;
  generation: GenerationData | null;
  work: { id: string } | null;
}

export default function AudioSelect() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const submissionIdParam = searchParams.get('id');

  const [submission, setSubmission] = useState<SubmissionData | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [initialGenStatus, setInitialGenStatus] = useState<string | null>(null);
  const [initialAudioUrls, setInitialAudioUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [selectedIndex, setSelectedIndex] = useState<1 | 2 | 3 | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  // Edit mode: user wants to adjust prompt and regenerate
  const [editMode, setEditMode] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [editGuidance, setEditGuidance] = useState(2.0);
  const [editNumSongs, setEditNumSongs] = useState<1 | 3>(1);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const audioRefs = useRef<(HTMLAudioElement | null)[]>([]);

  const pauseAllAudio = () => {
    audioRefs.current.forEach((audio) => {
      if (audio && !audio.paused) audio.pause();
    });
  };

  const handleAudioPlay = (activeIndex: number) => {
    audioRefs.current.forEach((audio, index) => {
      if (index !== activeIndex && audio && !audio.paused) audio.pause();
    });
  };

  // When entering edit mode, initialize prompt and open sheet
  useEffect(() => {
    if (editMode && submission) {
      setEditPrompt(submission.musicPrompt || '');
      setTimeout(() => setEditSheetOpen(true), 20);
    }
  }, [editMode, submission]);

  const handleRegenerate = async () => {
    if (!submission || regenerating) return;
    pauseAllAudio();
    setRegenerating(true);
    try {
      // Update prompt on backend if changed
      if (editPrompt.trim() !== (submission.musicPrompt || '')) {
        await api.patch(`/submissions/${submission.id}`, { musicPrompt: editPrompt.trim() });
        setSubmission({ ...submission, musicPrompt: editPrompt.trim() });
      }
      const res = await api.post(`/generations/${submission.id}/regenerate`, {
        guidance: editGuidance,
        numSongs: editNumSongs,
      });
      setGenerationId(res.data.data.generationId);
      setInitialGenStatus('queued');
      setInitialAudioUrls([]);
      setSelectedIndex(null);
      setEditSheetOpen(false);
      setEditMode(false);
      restartPolling();
    } catch {
      setConfirmError('重新生成失败，请重试');
    } finally {
      setRegenerating(false);
    }
  };

  // Poll for generation status
  // Only poll if generation is still in progress
  const needsPolling = submission && initialGenStatus !== 'done' && initialGenStatus !== 'failed';
  const { result: pollResult, restart: restartPolling } = useGenerationPolling(needsPolling ? (submission?.id ?? null) : null);

  // On mount: check current state
  useEffect(() => {
    const query = submissionIdParam ? `/submissions/mine?id=${submissionIdParam}` : '/submissions/mine';
    api
      .get<{ data: MineResponse | null }>(query)
      .then((res) => {
        const data = res.data.data;
        if (!data || !data.submission) {
          navigate('/submit');
          return;
        }
        if (data.work) {
          navigate('/map');
          return;
        }
        setSubmission(data.submission);
        if (data.generation) {
          setGenerationId(data.generation.id);
          setInitialGenStatus(data.generation.status);
          if (data.generation.audioUrls?.length > 0) {
            setInitialAudioUrls(data.generation.audioUrls);
          }
        }
      })
      .catch(() => navigate('/submit'))
      .finally(() => setLoading(false));
  }, [navigate, submissionIdParam]);

  // Derive display status: poll result > initial data > default
  const status = pollResult?.status
    ?? (initialGenStatus === 'done' ? 'done' : null)
    ?? (submission?.status === 'selecting' ? 'done' : null)
    ?? (submission?.status === 'failed' ? 'failed' : null)
    ?? 'queued';
  const audioUrls = pollResult?.audioUrls ?? (initialAudioUrls.length > 0 ? initialAudioUrls : null);
  const estimatedWait = pollResult?.estimatedWait ?? null;

  useEffect(() => {
    if (status === 'done' && audioUrls && audioUrls.length > 0) {
      setTimeout(() => setSheetOpen(true), 20);
    }
  }, [status, audioUrls]);

  useEffect(() => () => {
    audioRefs.current.forEach((audio) => {
      if (audio && !audio.paused) audio.pause();
    });
  }, []);

  const handleConfirm = async () => {
    if (!generationId || selectedIndex === null || confirming) return;
    setConfirmError('');
    setConfirming(true);
    try {
      const selectRes = await api.post(`/generations/${generationId}/select`, { selectedIndex });
      const { workId, mapX, mapY } = selectRes.data.data;
      navigate(`/map?highlight=${workId}&x=${mapX}&y=${mapY}`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? '选择失败，请重试';
      setConfirmError(msg);
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#0a0a0a', height: '100dvh' }}>
        <div
          className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0" style={{ background: '#0a0a0a', height: '100dvh' }}>
      {/* Map background — static image with blur + dark overlay */}
      <div className="absolute inset-0" style={{ zIndex: 0 }}>
        <img
          src="/maps/map-zgc-web.jpg"
          alt=""
          className="w-full h-full object-cover"
          style={{ filter: 'blur(4px)', transform: 'scale(1.05)' }}
        />
        <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} />
      </div>

      {/* Top nav */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between">
        <button
          onClick={() => navigate('/map')}
          className="glass-pill"
        >
          ← 返回地图
        </button>
        {submission && (
          <button
            onClick={async () => {
              if (!confirm('确定放弃这次投稿？生成的音乐将被丢弃。')) return;
              try {
                await api.delete(`/submissions/${submission.id}`);
              } catch { /* ignore */ }
              navigate('/map');
            }}
            className="glass-pill"
            style={{ color: '#f87171' }}
          >
            放弃
          </button>
        )}
      </div>

      {/* Content */}
      <div className="relative" style={{ zIndex: 10, height: '100%' }}>

        {/* ── Queued / Processing ── */}
        {(status === 'queued' || status === 'processing') && (
          <div className="flex flex-col items-center justify-center h-full px-6">
            <div
              className="glass-panel w-full flex flex-col items-center gap-6 p-8"
              style={{ maxWidth: 360, borderRadius: 24 }}
            >
              {/* Pulsing music note */}
              <div className="relative flex items-center justify-center">
                <div
                  className="w-24 h-24 rounded-full flex items-center justify-center animate-pulse"
                  style={{
                    background: 'var(--accent-soft)',
                    border: '1px solid var(--accent-border)',
                  }}
                >
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
                <div
                  className="absolute inset-0 rounded-full animate-ping"
                  style={{ border: '1px solid rgba(160,40,45,0.3)' }}
                />
              </div>

              <div className="text-center" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <h2
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    letterSpacing: '0.02em',
                  }}
                >
                  正在谱写旋律…
                </h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  AI 正在感受你的照片，为它谱写旋律
                </p>
                {estimatedWait !== null && (
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    预计还需约 {estimatedWait} 秒
                  </p>
                )}
              </div>

              {/* Animated dots */}
              <div className="flex gap-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full"
                    style={{
                      background: 'var(--accent)',
                      animation: `audioSelectBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>

              <button
                onClick={() => navigate(`/map?gen=${submission?.id || ''}&region=${encodeURIComponent(submission?.regionName || '')}`)}
                className="btn-secondary w-full text-center"
                style={{ marginTop: 8, padding: '10px 24px', fontSize: 13 }}
              >
                先去浏览地图
              </button>
            </div>
          </div>
        )}

        {/* ── Failed ── */}
        {status === 'failed' && (
          <div className="flex flex-col items-center justify-center h-full px-6">
            <div
              className="glass-panel w-full flex flex-col items-center gap-6 p-8 text-center"
              style={{ maxWidth: 360, borderRadius: 24 }}
            >
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
              </svg>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
                  生成失败
                </h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  很抱歉，AI 服务暂时不可用，请稍后再试
                </p>
              </div>
              <button
                onClick={() => navigate('/submit')}
                className="btn-secondary"
                style={{ width: '100%' }}
              >
                重新提交
              </button>
            </div>
          </div>
        )}

        {/* ── Done: audio selection ── */}
        {status === 'done' && audioUrls && audioUrls.length > 0 && (() => {
          const selectionContent = (
            <div style={{ padding: '0 20px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {submission && (
                <div className="glass-panel flex items-center gap-4 p-4" style={{ borderRadius: 'var(--radius-md)' }}>
                  <img src={submission.imageUrl} alt="" className="object-cover flex-shrink-0" style={{ width: 56, height: 56, borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)' }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-text)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{submission.regionName}</p>
                    <p className="truncate" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{getWorkTitle(submission)}</p>
                    <p className="truncate" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{getWorkSummary(submission)}</p>
                  </div>
                </div>
              )}
              <div className="text-center" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>选择你最喜欢的旋律</h2>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>AI 为你的角落生成了 {audioUrls.length} 段音乐</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {audioUrls.slice(0, 3).map((url, i) => {
                  const idx = (i + 1) as 1 | 2 | 3;
                  const isSelected = selectedIndex === idx;
                  return (
                    <button key={url} type="button" onClick={() => setSelectedIndex(idx)} className="w-full text-left transition-all" style={{ borderRadius: 'var(--radius-md)', border: isSelected ? '1px solid var(--accent-border)' : '1px solid var(--glass-border)', background: isSelected ? 'var(--accent-soft)' : 'rgba(255,255,255,0.04)', padding: 16, cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <span style={{ fontSize: 16, flexShrink: 0, color: isSelected ? 'var(--accent-text)' : 'var(--text-tertiary)' }}>{isSelected ? '●' : '○'}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>版本 {idx}</span>
                      </div>
                      <audio
                        ref={(audio) => { audioRefs.current[i] = audio; }}
                        controls
                        src={url}
                        preload="none"
                        className="w-full"
                        style={{ height: 40, accentColor: 'var(--accent)' }}
                        onClick={(e) => e.stopPropagation()}
                        onPlay={() => handleAudioPlay(i)}
                      />
                    </button>
                  );
                })}
              </div>
              <p className="text-center" style={{ fontSize: 12, color: 'rgba(234,179,8,0.8)', background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.15)', borderRadius: 'var(--radius-md)', padding: '10px 16px' }}>⚠️ 确认后将无法更改，请仔细试听</p>
              {confirmError && <p className="text-center" style={{ fontSize: 14, color: '#f87171', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 'var(--radius-md)', padding: '10px 16px' }}>{confirmError}</p>}
              <button type="button" disabled={selectedIndex === null || confirming} onClick={handleConfirm} className="btn-primary w-full">
                {confirming ? (<span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'white', borderTopColor: 'transparent' }} />发布中…</span>) : selectedIndex ? `确认选择版本 ${selectedIndex} 并发布` : '请先选择一个版本'}
              </button>
              <button type="button" disabled={confirming} onClick={() => { setSheetOpen(false); setSelectedIndex(null); setConfirmError(''); setEditMode(true); }} className="btn-secondary w-full" style={{ fontSize: 14 }}>都不喜欢？重新生成</button>
            </div>
          );

          return (
            <>
              <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.3)', zIndex: 1 }} />

              {/* Mobile: bottom sheet */}
              <div className={`md:hidden bottom-sheet${sheetOpen ? ' open' : ''}`} style={{ zIndex: 10, maxHeight: '85dvh', overflowY: 'auto' }}>
                <div className="bottom-sheet-handle" />
                {selectionContent}
              </div>

              {/* Desktop: right sidebar */}
              <div
                className={`hidden md:flex absolute top-0 right-0 h-full w-80 flex-col transition-transform duration-300 ${sheetOpen ? 'translate-x-0' : 'translate-x-full'}`}
                style={{ zIndex: 10, background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderLeft: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg) 0 0 var(--radius-lg)' }}
              >
                <div className="flex-1 overflow-y-auto pt-4">
                  {selectionContent}
                </div>
              </div>
            </>
          );
        })()}
      </div>

      {/* ── Edit mode: adjust prompt + regenerate ── */}
      {editMode && submission && (() => {
        const editContent = (
          <div style={{ padding: '0 20px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="glass-panel flex items-center gap-4 p-4" style={{ borderRadius: 'var(--radius-md)' }}>
              <img src={submission.imageUrl} alt="" className="object-cover flex-shrink-0" style={{ width: 56, height: 56, borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)' }} />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-text)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{submission.regionName}</p>
                <p className="truncate" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{getWorkTitle(submission)}</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>调整音乐提示词后重新生成</p>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>风格标签</label>
              <StyleTags onSelect={(tag) => setEditPrompt((prev) => prev ? `${prev}，${tag}` : tag)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>音乐提示词（可选）</label>
              <textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} placeholder="描述你想要的音乐氛围..." maxLength={100} rows={3} className="glass-input w-full resize-none" style={{ padding: '10px 14px', fontSize: 14 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                生成数量 <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>默认 1 段，需要挑选时可生成 3 段</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {([1, 3] as const).map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setEditNumSongs(count)}
                    className="rounded-[var(--radius-md)] transition-all"
                    style={{
                      padding: '10px 12px',
                      border: editNumSongs === count ? '1px solid var(--accent-border)' : '1px solid var(--glass-border)',
                      background: editNumSongs === count ? 'var(--accent-soft)' : 'rgba(255,255,255,0.04)',
                      color: editNumSongs === count ? 'var(--accent-text)' : 'var(--text-secondary)',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {count === 1 ? '生成 1 段' : '生成 3 段'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                创意程度 <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{editGuidance <= 1 ? '保守' : editGuidance <= 2 ? '平衡' : editGuidance <= 3.5 ? '自由' : '大胆'}</span>
              </label>
              <input type="range" min="0.5" max="5" step="0.5" value={editGuidance} onChange={(e) => setEditGuidance(parseFloat(e.target.value))} className="w-full" style={{ accentColor: 'rgb(160, 40, 45)' }} />
              <div className="flex justify-between" style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                <span>保守</span><span>大胆</span>
              </div>
            </div>
            {confirmError && <p className="text-center" style={{ fontSize: 13, color: '#f87171' }}>{confirmError}</p>}
            <button type="button" onClick={handleRegenerate} disabled={regenerating} className="btn-primary w-full">{regenerating ? '提交中…' : '重新生成'}</button>
            <button type="button" onClick={() => { setEditSheetOpen(false); setTimeout(() => { setEditMode(false); setTimeout(() => setSheetOpen(true), 20); }, 360); }} className="btn-secondary w-full" style={{ fontSize: 14 }}>返回选择</button>
          </div>
        );

        return (
          <>
            <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.4)', zIndex: 1 }} />
            {/* Mobile */}
            <div className={`md:hidden bottom-sheet${editSheetOpen ? ' open' : ''}`} style={{ zIndex: 10, maxHeight: '85dvh', overflowY: 'auto' }}>
              <div className="bottom-sheet-handle" />
              {editContent}
            </div>
            {/* Desktop */}
            <div
              className={`hidden md:flex absolute top-0 right-0 h-full w-80 flex-col transition-transform duration-300 ${editSheetOpen ? 'translate-x-0' : 'translate-x-full'}`}
              style={{ zIndex: 10, background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderLeft: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg) 0 0 var(--radius-lg)' }}
            >
              <div className="flex-1 overflow-y-auto pt-4">{editContent}</div>
            </div>
          </>
        );
      })()}

    </div>
  );
}
