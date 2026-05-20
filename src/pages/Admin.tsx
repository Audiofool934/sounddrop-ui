import { useState, useEffect, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import api from '../api/client';
import type { AdminWork } from '../types';

interface AdminStats {
  totalUsers: number;
  totalSubmissions: number;
  publishedWorks: number;
  totalLikes: number;
}

type SortKey = 'publishedAt' | 'likeCount' | 'regionName' | 'loginAccount';
type SortDirection = 'desc' | 'asc';
type VisibilityFilter = 'all' | 'visible' | 'hidden';

export default function Admin() {
  const { user, loading } = useAuth();
  const { playingId, play, stop } = useAudioPlayer();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [frozen, setFrozen] = useState(false);
  const [freezeLoading, setFreezeLoading] = useState(false);

  const [works, setWorks] = useState<AdminWork[]>([]);
  const [worksLoading, setWorksLoading] = useState(true);
  const [likeDrafts, setLikeDrafts] = useState<Record<string, string>>({});
  const [savingLikeCounts, setSavingLikeCounts] = useState<Record<string, boolean>>({});
  const [expandedWork, setExpandedWork] = useState<AdminWork | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('publishedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  useEffect(() => {
    if (!user || user.role !== 'admin') return;

    // Fetch stats
    api.get('/admin/stats')
      .then((res) => setStats(res.data.data))
      .catch(() => {})
      .finally(() => setStatsLoading(false));

    // Fetch works
    api.get('/admin/works')
      .then((res) => setWorks(res.data.data ?? []))
      .catch(() => {})
      .finally(() => setWorksLoading(false));

    // Fetch freeze state (stats or separate endpoint; try stats first)
    api.get('/admin/stats')
      .then((res) => {
        if (typeof res.data.data?.frozen === 'boolean') {
          setFrozen(res.data.data.frozen);
        }
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!expandedWork) return;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setExpandedWork(null);
      stop();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedWork, stop]);

  const handleFreezeToggle = async () => {
    if (!frozen) {
      const confirmed = window.confirm('确定要冻结活动吗？冻结后用户将无法提交新内容。');
      if (!confirmed) return;
    }
    setFreezeLoading(true);
    try {
      const res = await api.post('/admin/freeze');
      if (typeof res.data.data?.frozen === 'boolean') {
        setFrozen(res.data.data.frozen);
      } else {
        setFrozen((prev) => !prev);
      }
    } catch {
      alert('操作失败，请重试');
    } finally {
      setFreezeLoading(false);
    }
  };

  const handleToggleVisibility = async (work: AdminWork) => {
    const action = work.visible ? '隐藏' : '显示';
    const confirmed = window.confirm(work.title.trim() ? `确认要${action}《${work.title.trim()}》吗？` : `确认要${action}这件作品吗？`);
    if (!confirmed) return;

    const endpoint = work.visible
      ? `/admin/works/${work.id}/hide`
      : `/admin/works/${work.id}/show`;

    // Optimistic update
    setWorks((prev) =>
      prev.map((w) => (w.id === work.id ? { ...w, visible: !w.visible } : w))
    );

    try {
      await api.post(endpoint);
    } catch {
      // Revert on failure
      setWorks((prev) =>
        prev.map((w) => (w.id === work.id ? { ...w, visible: work.visible } : w))
      );
      alert('操作失败，请重试');
    }
  };

  const handleLikeCountChange = (workId: string, value: string) => {
    setLikeDrafts((prev) => ({ ...prev, [workId]: value }));
  };

  const handleSaveLikeCount = async (work: AdminWork, rawValue: string) => {
    if (savingLikeCounts[work.id]) return;

    if (rawValue === '') {
      setLikeDrafts((prev) => {
        const next = { ...prev };
        delete next[work.id];
        return next;
      });
      return;
    }

    const nextLikeCount = Number(rawValue);

    if (!Number.isInteger(nextLikeCount) || nextLikeCount < 0 || nextLikeCount > 100000) {
      setLikeDrafts((prev) => ({ ...prev, [work.id]: String(work.likeCount) }));
      alert('操作失败，请重试');
      return;
    }

    if (nextLikeCount === work.likeCount) {
      setLikeDrafts((prev) => {
        const next = { ...prev };
        delete next[work.id];
        return next;
      });
      return;
    }

    const delta = nextLikeCount - work.likeCount;

    setSavingLikeCounts((prev) => ({ ...prev, [work.id]: true }));
    setWorks((prev) =>
      prev.map((w) => (w.id === work.id ? { ...w, likeCount: nextLikeCount } : w))
    );
    setStats((prev) => (prev ? { ...prev, totalLikes: prev.totalLikes + delta } : prev));

    try {
      await api.patch(`/admin/works/${work.id}/likes`, { likeCount: nextLikeCount });
      setLikeDrafts((prev) => {
        const next = { ...prev };
        delete next[work.id];
        return next;
      });
    } catch {
      setWorks((prev) =>
        prev.map((w) => (w.id === work.id ? { ...w, likeCount: work.likeCount } : w))
      );
      setStats((prev) => (prev ? { ...prev, totalLikes: prev.totalLikes - delta } : prev));
      setLikeDrafts((prev) => ({ ...prev, [work.id]: String(work.likeCount) }));
      alert('操作失败，请重试');
    } finally {
      setSavingLikeCounts((prev) => {
        const next = { ...prev };
        delete next[work.id];
        return next;
      });
    }
  };

  const handleThumbnailInteraction = (work: AdminWork) => {
    if (expandedWork?.id === work.id) {
      setExpandedWork(null);
      stop();
      return;
    }

    setExpandedWork(work);
    play(work.id, work.selectedAudioUrl);
  };

  const handleThumbnailKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>, work: AdminWork) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleThumbnailInteraction(work);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0a' }}>
        <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>加载中…</span>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#0a0a0a' }}>
        <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>需要管理员权限</p>
        <Link to="/" className="glass-pill">← 返回首页</Link>
      </div>
    );
  }

  const statCards = [
    { label: '总用户数', value: stats?.totalUsers },
    { label: '总投稿数', value: stats?.totalSubmissions },
    { label: '已发布作品', value: stats?.publishedWorks },
    { label: '总点赞数', value: stats?.totalLikes },
  ];

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const normalizedUserFilter = userFilter.trim().toLowerCase();

  const filteredWorks = works.filter((work) => {
    const matchesSearch =
      normalizedSearchQuery.length === 0 ||
      work.title.toLowerCase().includes(normalizedSearchQuery) ||
      work.regionName.toLowerCase().includes(normalizedSearchQuery);

    const matchesUser =
      normalizedUserFilter.length === 0 ||
      work.loginAccount.toLowerCase().includes(normalizedUserFilter);

    const matchesVisibility =
      visibilityFilter === 'all' ||
      (visibilityFilter === 'visible' && work.visible) ||
      (visibilityFilter === 'hidden' && !work.visible);

    return matchesSearch && matchesUser && matchesVisibility;
  });

  const sortedWorks = [...filteredWorks].sort((a, b) => {
    let comparison = 0;

    if (sortKey === 'publishedAt') {
      comparison = new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
    } else if (sortKey === 'likeCount') {
      comparison = a.likeCount - b.likeCount;
    } else if (sortKey === 'regionName') {
      comparison = a.regionName.localeCompare(b.regionName, 'zh-CN');
    } else {
      comparison = a.loginAccount.localeCompare(b.loginAccount, 'zh-CN');
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const clearFilters = () => {
    setSearchQuery('');
    setUserFilter('');
    setVisibilityFilter('all');
    setSortKey('publishedAt');
    setSortDirection('desc');
  };

  const toggleSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === 'publishedAt' || nextKey === 'likeCount' ? 'desc' : 'asc');
  };

  const getSortMarker = (key: SortKey) => {
    if (sortKey !== key) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  return (
    <div className="min-h-screen" style={{ background: '#0a0a0a' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-10">

        {/* Top nav */}
        <div className="flex items-center gap-4">
          <Link to="/" className="glass-pill">← 返回</Link>
          <h1 className="text-2xl font-bold tracking-wide" style={{ color: 'var(--text-primary)' }}>管理后台</h1>
        </div>

        {/* Stats */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-tertiary)' }}>
            数据概览
          </h2>
          {statsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="glass-panel rounded-[var(--radius-md)] px-6 py-5 animate-pulse">
                  <div className="h-8 rounded w-1/2 mb-2" style={{ background: 'rgba(255,255,255,0.06)' }} />
                  <div className="h-3 rounded w-2/3" style={{ background: 'rgba(255,255,255,0.06)' }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {statCards.map((card) => (
                <div
                  key={card.label}
                  className="glass-panel rounded-[var(--radius-md)] px-6 py-5 flex flex-col gap-1"
                >
                  <span className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {card.value ?? '—'}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{card.label}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Freeze Toggle */}
        <section className="glass-panel rounded-[var(--radius-md)] px-6 py-6 flex items-center justify-between gap-4">
          <div>
            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>活动状态</p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              当前状态：{' '}
              {frozen ? (
                <span style={{ color: 'rgba(248,113,113,1)', fontWeight: 600 }}>已冻结</span>
              ) : (
                <span style={{ color: 'rgba(52,211,153,1)', fontWeight: 600 }}>正常运行</span>
              )}
            </p>
          </div>
          <button
            onClick={handleFreezeToggle}
            disabled={freezeLoading}
            className="btn-secondary text-sm disabled:opacity-50"
            style={{
              padding: '8px 20px',
              fontSize: '13px',
              fontWeight: 600,
              ...(frozen
                ? { background: 'rgba(52,211,153,0.15)', borderColor: 'rgba(52,211,153,0.3)', color: 'rgba(52,211,153,1)' }
                : { background: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.3)', color: 'rgba(248,113,113,1)' }
              ),
            }}
          >
            {freezeLoading ? '处理中…' : frozen ? '解冻活动' : '冻结活动'}
          </button>
        </section>

        {/* Works Management */}
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                作品管理
              </h2>
              {!worksLoading && works.length > 0 && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  当前显示 {sortedWorks.length} / {works.length} 件作品
                </p>
              )}
            </div>
            {!worksLoading && works.length > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs"
                style={{ color: 'var(--accent-text)' }}
              >
                重置筛选
              </button>
            )}
          </div>
          {worksLoading ? (
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>加载中…</p>
          ) : works.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>暂无作品</p>
          ) : (
            <div className="glass-panel rounded-[var(--radius-md)] overflow-hidden overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-tertiary)' }}>
                    <th className="px-4 py-3 text-left font-medium">缩略图</th>
                    <th className="px-4 py-3 text-left font-medium">
                      <button
                        type="button"
                        onClick={() => toggleSort('loginAccount')}
                        className="inline-flex items-center gap-1"
                        style={{ color: 'inherit' }}
                      >
                        <span>用户</span>
                        <span>{getSortMarker('loginAccount')}</span>
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      <button
                        type="button"
                        onClick={() => toggleSort('regionName')}
                        className="inline-flex items-center gap-1"
                        style={{ color: 'inherit' }}
                      >
                        <span>标题 / 地点</span>
                        <span>{getSortMarker('regionName')}</span>
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-medium">状态</th>
                    <th className="px-4 py-3 text-left font-medium">
                      <button
                        type="button"
                        onClick={() => toggleSort('likeCount')}
                        className="inline-flex items-center gap-1"
                        style={{ color: 'inherit' }}
                      >
                        <span>点赞</span>
                        <span>{getSortMarker('likeCount')}</span>
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      <button
                        type="button"
                        onClick={() => toggleSort('publishedAt')}
                        className="inline-flex items-center gap-1"
                        style={{ color: 'inherit' }}
                      >
                        <span>发布时间</span>
                        <span>{getSortMarker('publishedAt')}</span>
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-medium">操作</th>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <th className="px-4 py-2.5 text-left">
                      <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>点击缩略图预览</span>
                    </th>
                    <th className="px-4 py-2.5 text-left">
                      <input
                        type="text"
                        value={userFilter}
                        onChange={(e) => setUserFilter(e.target.value)}
                        placeholder="筛选用户"
                        className="w-full rounded-[var(--radius-sm)] border px-2 py-1.5 text-xs focus:outline-none"
                        style={{
                          color: 'var(--text-primary)',
                          background: 'rgba(255,255,255,0.04)',
                          borderColor: 'rgba(255,255,255,0.08)',
                        }}
                      />
                    </th>
                    <th className="px-4 py-2.5 text-left">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="筛选标题 / 地点"
                        className="w-full rounded-[var(--radius-sm)] border px-2 py-1.5 text-xs focus:outline-none"
                        style={{
                          color: 'var(--text-primary)',
                          background: 'rgba(255,255,255,0.04)',
                          borderColor: 'rgba(255,255,255,0.08)',
                        }}
                      />
                    </th>
                    <th className="px-4 py-2.5 text-left">
                      <select
                        value={visibilityFilter}
                        onChange={(e) => setVisibilityFilter(e.target.value as VisibilityFilter)}
                        className="w-full rounded-[var(--radius-sm)] border px-2 py-1.5 text-xs focus:outline-none"
                        style={{
                          color: 'var(--text-primary)',
                          background: 'rgba(255,255,255,0.04)',
                          borderColor: 'rgba(255,255,255,0.08)',
                        }}
                      >
                        <option value="all">全部状态</option>
                        <option value="visible">显示中</option>
                        <option value="hidden">已下架</option>
                      </select>
                    </th>
                    <th className="px-4 py-2.5" />
                    <th className="px-4 py-2.5" />
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {sortedWorks.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center">
                        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>没有符合当前筛选条件的作品</p>
                      </td>
                    </tr>
                  ) : sortedWorks.map((work) => (
                    <tr
                      key={work.id}
                      className="transition-colors"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                    >
                      {/* Thumbnail */}
                      <td className="px-4 py-3">
                        <div
                          role="button"
                          tabIndex={0}
                          aria-pressed={expandedWork?.id === work.id}
                          aria-label={expandedWork?.id === work.id ? `关闭《${work.title.trim() || '未命名作品'}》预览` : `放大并播放《${work.title.trim() || '未命名作品'}》`}
                          onClick={() => handleThumbnailInteraction(work)}
                          onKeyDown={(event) => handleThumbnailKeyDown(event, work)}
                          className={`group relative block w-12 h-12 overflow-hidden rounded-[var(--radius-sm)] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] cursor-pointer ${(playingId === work.id || expandedWork?.id === work.id) ? 'ring-2 ring-[var(--accent)]' : ''}`}
                          style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                        >
                          {work.thumbnailUrl || work.imageUrl ? (
                            <img
                              src={work.thumbnailUrl ?? work.imageUrl}
                              alt=""
                              className="w-12 h-12 object-cover"
                            />
                          ) : (
                            <div
                              className="w-12 h-12"
                              style={{ background: 'rgba(255,255,255,0.06)' }}
                            />
                          )}
                          <div
                            className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity ${playingId === work.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}
                            style={{ background: playingId === work.id ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.28)' }}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                              className="w-4 h-4"
                              style={{ color: 'rgba(255,255,255,0.96)', fill: 'currentColor' }}
                            >
                              {playingId === work.id ? (
                                <>
                                  <rect x="7" y="5" width="3.5" height="14" rx="1" />
                                  <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
                                </>
                              ) : (
                                <path d="M8 6.5v11l9-5.5-9-5.5Z" />
                              )}
                            </svg>
                          </div>
                        </div>
                      </td>

                      {/* Login account */}
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {work.loginAccount}
                      </td>

                      {/* Title / Region */}
                      <td className="px-4 py-3">
                        <p style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                          {work.title.trim() || '未命名作品'}
                        </p>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{work.regionName}</p>
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                          style={work.visible
                            ? { background: 'var(--accent-soft)', color: 'var(--accent-text)', border: '1px solid var(--accent-border)' }
                            : { background: 'rgba(239,68,68,0.12)', color: 'rgba(248,113,113,1)', border: '1px solid rgba(239,68,68,0.3)' }
                          }
                        >
                          {work.visible ? '显示中' : '已下架'}
                        </span>
                      </td>

                      {/* Like count */}
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={0}
                          max={100000}
                          step={1}
                          value={likeDrafts[work.id] ?? String(work.likeCount)}
                          disabled={Boolean(savingLikeCounts[work.id])}
                          onChange={(e) => handleLikeCountChange(work.id, e.target.value)}
                          onBlur={(e) => void handleSaveLikeCount(work, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.currentTarget.blur();
                            }
                          }}
                          className={`w-20 rounded-[var(--radius-sm)] border px-2 py-1 text-sm transition-opacity focus:outline-none ${savingLikeCounts[work.id] ? 'opacity-50' : ''}`}
                          style={{
                            color: 'var(--text-primary)',
                            background: 'rgba(255,255,255,0.04)',
                            borderColor: 'rgba(255,255,255,0.08)',
                          }}
                        />
                      </td>

                      {/* Published date */}
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>
                        {new Date(work.publishedAt).toLocaleDateString('zh-CN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        })}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggleVisibility(work)}
                          className="px-3 py-1 rounded-[var(--radius-sm)] text-xs font-medium transition-colors"
                          style={work.visible
                            ? { background: 'rgba(239,68,68,0.12)', color: 'rgba(248,113,113,1)', border: '1px solid rgba(239,68,68,0.25)' }
                            : { background: 'var(--accent-soft)', color: 'var(--accent-text)', border: '1px solid var(--accent-border)' }
                          }
                        >
                          {work.visible ? '下架' : '恢复'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {expandedWork && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.86)' }}
          onClick={() => { setExpandedWork(null); stop(); }}
        >
          <img
            src={expandedWork.imageUrl}
            alt={expandedWork.title.trim() || expandedWork.regionName}
            style={{
              maxWidth: 'min(92vw, 1600px)',
              maxHeight: '92dvh',
              objectFit: 'contain',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
              cursor: 'pointer',
            }}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}
