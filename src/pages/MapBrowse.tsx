import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import CampusMap from '../components/CampusMap';
import WorkCard from '../components/WorkCard';
import ImageUpload from '../components/ImageUpload';
import StyleTags from '../components/StyleTags';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { useAuth } from '../hooks/useAuth';
import { useDragSheet } from '../hooks/useDragSheet';
import { EditIcon, HeartIcon, TrashIcon } from '../components/Icons';
import api from '../api/client';
import { DEMO_REGIONS, DEMO_WORKS } from '../demoData';
import { DEMO_FALLBACK_ENABLED } from '../demoMode';
import type { Work, Region } from '../types';
import { getWorkSummary, getWorkTitle } from '../utils/workText';

interface MySubmission {
  submission: {
    id: string;
    regionName: string;
    title: string;
    cornerStory: string;
    imageUrl: string;
    thumbnailUrl: string | null;
    musicPrompt: string;
    status: string;
    createdAt: string;
  };
  generation: {
    id: string;
    status: string;
    audioUrls: string[];
  } | null;
  work: { id: string } | null;
}

interface SubmissionUpdatePayload {
  id: string;
  title: string;
  cornerStory: string;
  musicPrompt: string;
}

const TITLE_MAX_LENGTH = 40;
const CORNER_STORY_MAX_LENGTH = 280;

function getApiErrorMessage(err: unknown, fallback: string) {
  return (err as { response?: { data?: { error?: { message?: string } } } })
    ?.response?.data?.error?.message ?? fallback;
}

export default function MapBrowse() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, logout } = useAuth();

  const [works, setWorks] = useState<Work[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState('');

  // Sidebar state (cluster works)
  const [sidebarWorks, setSidebarWorks] = useState<Work[] | null>(null);
  const [sidebarTitle, setSidebarTitle] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'popular'>('recent');

  // Popup state
  const [selectedWork, setSelectedWork] = useState<Work | null>(null);
  // Fly-to target (for "my music" → locate on map)
  const [flyTarget, setFlyTarget] = useState<{ x: number; y: number; offsetX?: number; offsetY?: number } | null>(null);

  // My works panel
  const [myPanelOpen, setMyPanelOpen] = useState(false);
  const [myWorks, setMyWorks] = useState<Work[]>([]);
  const [myPendingSubmissions, setMyPendingSubmissions] = useState<MySubmission[]>([]);
  const [myLoading, setMyLoading] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCornerStory, setEditCornerStory] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editDeleting, setEditDeleting] = useState(false);
  const [pendingDeletingId, setPendingDeletingId] = useState<string | null>(null);
  const [editError, setEditError] = useState('');

  // Status bar: active generation tracking
  const [activeGen, setActiveGen] = useState<{ submissionId: string; regionName: string; status: string; jobsAhead?: number | null } | null>(null);
  const genIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const trackingIdRef = useRef<string | null>(null);

  // Create mode state
  const [createMode, setCreateMode] = useState(false);
  const [createLocation, setCreateLocation] = useState<{ mapX: number; mapY: number; regionName: string } | null>(null);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [uploadId, setUploadId] = useState('');
  const [uploadToken, setUploadToken] = useState('');
  const [title, setTitle] = useState('');
  const [cornerStory, setCornerStory] = useState('');
  const [musicPrompt, setMusicPrompt] = useState('');
  const [guidance, setGuidance] = useState(2.0);
  const [numSongs, setNumSongs] = useState<1 | 2 | 3>(1);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const titleLength = title.trim().length;
  const storyLength = cornerStory.trim().length;
  const promptLength = musicPrompt.trim().length;
  const titleValid = titleLength <= TITLE_MAX_LENGTH;
  const storyValid = storyLength <= CORNER_STORY_MAX_LENGTH;
  const promptValid = promptLength <= 100;
  const editTitleLength = editTitle.trim().length;
  const editStoryLength = editCornerStory.trim().length;
  const editTitleValid = editTitleLength <= TITLE_MAX_LENGTH;
  const editStoryValid = editStoryLength <= CORNER_STORY_MAX_LENGTH;

  const { playingId, progress, play, stop } = useAudioPlayer();

  // Draggable sheets
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const clusterDrag = useDragSheet({ onDismiss: () => { setSidebarWorks(null); stop(); }, minHeight: 80, maxHeight: vh * 0.9, defaultHeight: vh * 0.5 });
  const myDrag = useDragSheet({ onDismiss: () => { setMyPanelOpen(false); stop(); }, minHeight: 80, maxHeight: vh * 0.9, defaultHeight: vh * 0.5 });
  const createDrag = useDragSheet({ onDismiss: () => { setCreateSheetOpen(false); setCreateLocation(null); }, minHeight: 80, maxHeight: vh * 0.9, defaultHeight: vh * 0.55 });

  // Fetch works and regions
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [worksRes, regionsRes] = await Promise.all([
          api.get<{ success: boolean; data: Work[] }>('/works'),
          api.get<{ success: boolean; data: Region[] }>('/regions'),
        ]);
        if (worksRes.data.success && worksRes.data.data) setWorks(worksRes.data.data);
        if (regionsRes.data.success && regionsRes.data.data) setRegions(regionsRes.data.data);
      } catch {
        if (DEMO_FALLBACK_ENABLED) {
          setWorks(DEMO_WORKS);
          setRegions(DEMO_REGIONS);
          setMapError('');
        } else {
          setMapError('网络错误，请检查连接');
        }
      } finally {
        setMapLoading(false);
      }
    };
    fetchData();
  }, []);

  // Handle highlight param (after selecting music → fly to new work)
  const highlightHandled = useRef(false);
  useEffect(() => {
    if (highlightHandled.current || works.length === 0) return;
    const highlightId = searchParams.get('highlight');
    const xParam = searchParams.get('x');
    const yParam = searchParams.get('y');
    const x = xParam != null ? Number(xParam) : null;
    const y = yParam != null ? Number(yParam) : null;
    if (highlightId && x != null && y != null && Number.isFinite(x) && Number.isFinite(y)) {
      highlightHandled.current = true;
      // Fly to the new work location
      setFlyTarget({ x, y, offsetY: 120 });
      // Find and select the work
      const work = works.find((w) => w.id === highlightId);
      if (work) {
        setTimeout(() => setSelectedWork(work), 600);
      }
    }
  }, [works, searchParams]);

  // Poll a specific generation by submissionId
  const startTracking = useCallback((submissionId: string, regionName: string) => {
    // Avoid duplicate tracking
    if (trackingIdRef.current === submissionId && genIntervalRef.current) return;
    trackingIdRef.current = submissionId;
    setActiveGen({ submissionId, regionName, status: 'generating' });

    // Clear any existing interval
    if (genIntervalRef.current) { clearInterval(genIntervalRef.current); genIntervalRef.current = undefined; }

    const poll = async () => {
      try {
        const res = await api.get(`/generations/${submissionId}`);
        const data = res.data.data as { status: string; audioUrls: string[] | null; queue?: { jobsAhead: number | null } };

        if (data.status === 'queued' || data.status === 'processing') {
          setActiveGen({ submissionId, regionName, status: 'generating', jobsAhead: data.queue?.jobsAhead ?? null });
        }

        if (data.status === 'done') {
          setActiveGen({ submissionId, regionName, status: 'ready' });
          // Stop polling — ready state persists until user clicks
          if (genIntervalRef.current) { clearInterval(genIntervalRef.current); genIntervalRef.current = undefined; }
        } else if (data.status === 'failed') {
          setActiveGen(null);
          trackingIdRef.current = null;
          if (genIntervalRef.current) { clearInterval(genIntervalRef.current); genIntervalRef.current = undefined; }
        }
        // queued/processing → keep polling, status bar already showing
      } catch { /* keep polling */ }
    };

    poll(); // immediate first check
    genIntervalRef.current = setInterval(poll, 3000);
  }, []);

  // On mount: check if there's an active generation to track
  useEffect(() => {
    if (!user) return;

    const genParam = searchParams.get('gen');
    if (genParam) {
      // Came from submit/audioselect with a specific submission to track
      const regionParam = searchParams.get('region') || '校园内';
      startTracking(genParam, regionParam);
      return;
    }

    // Otherwise, do a one-time check for any active generation
    api.get(`/submissions/all?ts=${Date.now()}`).then((res) => {
      const subs: MySubmission[] = res.data.data || [];
      const generating = subs.find(
        (s) => s.submission.status === 'generating' && s.generation && ['queued', 'processing'].includes(s.generation.status)
      );
      const readyToSelect = subs.find(
        (s) => s.submission.status === 'selecting' || (s.generation?.status === 'done' && !s.work)
      );

      if (generating) {
        startTracking(generating.submission.id, generating.submission.regionName);
      } else if (readyToSelect) {
        setActiveGen({ submissionId: readyToSelect.submission.id, regionName: readyToSelect.submission.regionName, status: 'ready' });
      }
    }).catch(() => {});

    return () => {
      if (genIntervalRef.current) {
        clearInterval(genIntervalRef.current);
        genIntervalRef.current = undefined;
      }
    };
  }, [user, searchParams, startTracking]);

  // Fetch my works and unfinished submissions when panel opens
  const openMyPanel = useCallback(async () => {
    if (!user) { navigate('/auth'); return; }
    setMyPanelOpen(true);
    setMyLoading(true);
    setSidebarWorks(null);
    setSelectedWork(null);
    try {
      const submissionsRes = await api.get<{ success: boolean; data: MySubmission[] }>(`/submissions/all?ts=${Date.now()}`);
      const pending = (submissionsRes.data.data || []).filter((item) => {
        if (item.work) return false;
        const submissionStatus = item.submission.status;
        const generationStatus = item.generation?.status;
        return (
          submissionStatus === 'generating' ||
          submissionStatus === 'selecting' ||
          submissionStatus === 'failed' ||
          generationStatus === 'queued' ||
          generationStatus === 'processing' ||
          generationStatus === 'done' ||
          generationStatus === 'failed'
        );
      });
      setMyPendingSubmissions(pending);

      const myPublished = works.filter((w) => w.loginAccount === user.loginAccount);
      setMyWorks(myPublished);
    } catch {
      setMyPendingSubmissions([]);
      const myPublished = works.filter((w) => w.loginAccount === user.loginAccount);
      setMyWorks(myPublished);
    }
    finally {
      setMyLoading(false);
      setTimeout(() => myDrag.applyDefault(), 50);
    }
  }, [user, navigate, works]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open panels from URL params
  useEffect(() => {
    if (mapLoading) return;
    if (searchParams.get('panel') === 'my' && user) {
      openMyPanel();
    }
    if (searchParams.get('create') === 'true') {
      if (user && !createMode) setCreateMode(true);
      else if (!user) navigate('/auth');
    }
  }, [user, mapLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeMyPanel = useCallback(() => {
    setMyPanelOpen(false);
    stop();
  }, [stop]);

  // ── Create mode logic ──
  const toggleCreateMode = useCallback(() => {
    if (!user) { navigate('/auth'); return; }
    setCreateMode((prev) => {
      if (prev) {
        // Exiting create mode — reset form
        setCreateSheetOpen(false);
        setCreateLocation(null);
        setImageUrl(''); setImagePreview(null);
        setUploadId(''); setUploadToken('');
        setTitle(''); setCornerStory(''); setMusicPrompt('');
        setGuidance(2.0); setSubmitError('');
      }
      // Dismiss other panels
      setSidebarWorks(null); setSelectedWork(null); setMyPanelOpen(false);
      return !prev;
    });
  }, [user, navigate]);

  const startCreateFlow = useCallback(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    setSidebarWorks(null);
    setSelectedWork(null);
    setMyPanelOpen(false);
    stop();

    if (!createMode) {
      setCreateMode(true);
    }
  }, [user, navigate, stop, createMode]);

  const handleCreateLocationPick = useCallback((mapX: number, mapY: number, regionName: string) => {
    setCreateLocation({ mapX, mapY, regionName });
    setCreateSheetOpen(true);
    setTimeout(() => createDrag.applyDefault(), 50);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImageUpload = async (blob: Blob, previewUrl: string) => {
    setImagePreview(previewUrl);
    setSubmitError('');
    setUploadingImage(true); setImageUrl('');
    setUploadId(''); setUploadToken('');
    try {
      const formData = new FormData();
      formData.append('image', blob, 'photo.jpg');
      const res = await api.post<{
        data: {
          imageUrl: string;
          thumbnailUrl: string;
          uploadId: string;
          uploadToken: string;
        };
      }>('/upload/image', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImageUrl(res.data.data.imageUrl);
      setUploadId(res.data.data.uploadId);
      setUploadToken(res.data.data.uploadToken);
      setSubmitError('');
    } catch { setSubmitError('图片上传失败，请重试'); }
    finally { setUploadingImage(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createLocation || !imageUrl || !uploadId || !uploadToken || submitting) return;
    if (!titleValid) {
      setSubmitError(`标题最多 ${TITLE_MAX_LENGTH} 字`);
      return;
    }
    if (!storyValid) {
      setSubmitError(`描述最多 ${CORNER_STORY_MAX_LENGTH} 字`);
      return;
    }
    if (!promptValid) {
      setSubmitError('音乐描述最多 100 字');
      return;
    }
    setSubmitError(''); setSubmitting(true);
    try {
      const res = await api.post('/submissions', {
        mapX: createLocation.mapX, mapY: createLocation.mapY,
        regionName: createLocation.regionName,
        title: title.trim(),
        cornerStory: cornerStory.trim(),
        uploadId, uploadToken,
        musicPrompt: musicPrompt.trim(), guidance, numSongs,
      });
      const submissionId = res.data.data.submissionId;
      setCreateMode(false); setCreateSheetOpen(false); setCreateLocation(null);
      setImageUrl(''); setImagePreview(null);
      setUploadId(''); setUploadToken('');
      setTitle(''); setCornerStory(''); setMusicPrompt(''); setNumSongs(1);
      navigate(`/select?id=${submissionId}`);
    } catch (err: unknown) {
      setSubmitError(getApiErrorMessage(err, '提交失败'));
    } finally { setSubmitting(false); }
  };

  const applyWorkUpdate = useCallback((submissionId: string, updates: Pick<Work, 'title' | 'cornerStory'>) => {
    const updateWork = (work: Work): Work => (
      work.submissionId === submissionId
        ? { ...work, ...updates }
        : work
    );

    setWorks((prev) => prev.map(updateWork));
    setMyWorks((prev) => prev.map(updateWork));
    setSidebarWorks((prev) => prev ? prev.map(updateWork) : null);
    setSelectedWork((prev) => prev && prev.submissionId === submissionId ? { ...prev, ...updates } : prev);
  }, []);

  const removeWorkFromState = useCallback((submissionId: string, workId: string | null) => {
    const shouldRemove = (work: Work) => work.submissionId !== submissionId && work.id !== workId;

    stop();
    setWorks((prev) => prev.filter(shouldRemove));
    setMyWorks((prev) => prev.filter(shouldRemove));
    setSidebarWorks((prev) => {
      if (!prev) return prev;
      const next = prev.filter(shouldRemove);
      return next.length > 0 ? next : null;
    });
    setSelectedWork((prev) => prev && (prev.submissionId === submissionId || prev.id === workId) ? null : prev);
    setEditSheetOpen(false);
    setEditingSubmissionId(null);
    setEditError('');
  }, [stop]);

  const openOwnerEditor = useCallback((work: Work) => {
    setEditingSubmissionId(work.submissionId);
    setEditTitle(work.title);
    setEditCornerStory(work.cornerStory);
    setEditError('');
    setEditSheetOpen(true);
  }, []);

  const closeOwnerEditor = useCallback(() => {
    if (editSaving || editDeleting) return;
    setEditSheetOpen(false);
    setEditingSubmissionId(null);
    setEditError('');
  }, [editDeleting, editSaving]);

  const handleOwnerSave = useCallback(async () => {
    if (!editingSubmissionId || editSaving || editDeleting) return;

    if (!editTitleValid) {
      setEditError(`标题最多 ${TITLE_MAX_LENGTH} 字`);
      return;
    }
    if (!editStoryValid) {
      setEditError(`描述最多 ${CORNER_STORY_MAX_LENGTH} 字`);
      return;
    }

    setEditSaving(true);
    setEditError('');
    try {
      const res = await api.patch<{ success: boolean; data: SubmissionUpdatePayload }>(
        `/submissions/${editingSubmissionId}`,
        {
          title: editTitle,
          cornerStory: editCornerStory,
        },
      );
      applyWorkUpdate(editingSubmissionId, {
        title: res.data.data.title,
        cornerStory: res.data.data.cornerStory,
      });
      setEditTitle(res.data.data.title);
      setEditCornerStory(res.data.data.cornerStory);
      setEditSheetOpen(false);
      setEditingSubmissionId(null);
    } catch (err: unknown) {
      setEditError(getApiErrorMessage(err, '保存失败，请重试'));
    } finally {
      setEditSaving(false);
    }
  }, [
    applyWorkUpdate,
    editDeleting,
    editSaving,
    editStoryValid,
    editCornerStory,
    editTitle,
    editTitleValid,
    editingSubmissionId,
  ]);

  const handleOwnerDelete = useCallback(async (work: Work) => {
    if (editDeleting || editSaving) return;
    if (!window.confirm('确定删除这个作品吗？图片、音频和点赞记录都会被移除。')) return;

    setEditDeleting(true);
    setEditError('');
    try {
      const res = await api.delete<{ success: boolean; data: { id: string; deletedWorkId: string | null } }>(
        `/submissions/${work.submissionId}`,
      );
      removeWorkFromState(res.data.data.id, res.data.data.deletedWorkId);
    } catch (err: unknown) {
      window.alert(getApiErrorMessage(err, '删除失败，请重试'));
    } finally {
      setEditDeleting(false);
    }
  }, [editDeleting, editSaving, removeWorkFromState]);

  const handleLike = useCallback(async (workId: string) => {
    try {
      await api.post(`/works/${workId}/like`);
      const updateWork = (w: Work): Work => {
        if (w.id !== workId) return w;
        return { ...w, isLiked: !w.isLiked, likeCount: w.isLiked ? w.likeCount - 1 : w.likeCount + 1 };
      };
      setWorks((prev) => prev.map(updateWork));
      setMyWorks((prev) => prev.map(updateWork));
      setSidebarWorks((prev) => prev ? prev.map(updateWork) : null);
      setSelectedWork((prev) => prev ? updateWork(prev) : null);
    } catch { /* ignore */ }
  }, []);

  const handleWorkClick = useCallback((work: Work) => {
    setSidebarWorks(null);
    setMyPanelOpen(false);
    setSelectedWork((prev) => {
      const isToggleOff = prev?.id === work.id;
      if (isToggleOff) return null;
      // Pan so the pin sits clear of the mobile bottom popup / desktop right sidebar,
      // so the revolver fan has room to open without being obscured.
      const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
      setFlyTarget(isDesktop
        ? { x: work.mapX, y: work.mapY, offsetX: 320 }
        : { x: work.mapX, y: work.mapY, offsetY: 320 });
      return work;
    });
  }, []);

  const handleClusterClick = useCallback((clusterWorks: Work[], regionName: string) => {
    setSidebarWorks(clusterWorks);
    setTimeout(() => clusterDrag.applyDefault(), 50);
    setSidebarTitle(regionName);
    setSelectedWork(null);
    setMyPanelOpen(false);
  }, [clusterDrag]);

  const closeSidebar = useCallback(() => {
    setSidebarWorks(null);
    stop();
  }, [stop]);

  const sidebarOpen = sidebarWorks !== null;

  // Sort sidebar works
  const sortFn = (a: Work, b: Work) =>
    sortBy === 'popular'
      ? b.likeCount - a.likeCount
      : new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();

  const sortedSidebarWorks = sidebarWorks ? [...sidebarWorks].sort(sortFn) : null;
  const sortedMyWorks = [...myWorks].sort(sortFn);
  const sortedMyPendingSubmissions = [...myPendingSubmissions].sort(
    (a, b) => new Date(b.submission.createdAt).getTime() - new Date(a.submission.createdAt).getTime(),
  );
  const myPanelItemCount = myWorks.length + myPendingSubmissions.length;

  // ── Desktop right-side surfaces ──
  const desktopSidebarVisible = sidebarOpen || myPanelOpen;
  const desktopFloatingWorkVisible = !!selectedWork && !sidebarOpen && !myPanelOpen;
  const desktopRightOccupied = desktopSidebarVisible || desktopFloatingWorkVisible || (createMode && createSheetOpen);
  const desktopSidebarMode: 'cluster' | 'myMusic' =
    sidebarOpen ? 'cluster' : 'myMusic';
  const floatingCardCenterY = activeGen ? 'calc(50% + 26px)' : '50%';
  const floatingCardMaxHeight = activeGen ? 'calc(100dvh - 88px)' : 'calc(100dvh - 40px)';

  // Cluster item click handler (shared between desktop sidebar and mobile sheet)
  const handleSidebarItemClick = (work: Work) => {
    closeSidebar();
    setFlyTarget({ x: work.mapX, y: work.mapY, offsetY: 250 });
    setTimeout(() => setSelectedWork(work), 900);
  };

  // My-music item click handler (shared between desktop sidebar and mobile sheet)
  const handleMyWorkClick = (work: Work) => {
    closeMyPanel();
    setFlyTarget({ x: work.mapX, y: work.mapY, offsetY: 250 });
    setTimeout(() => setSelectedWork(work), 900);
  };

  const handlePendingSubmissionClick = (item: MySubmission) => {
    closeMyPanel();
    navigate(`/select?id=${item.submission.id}`);
  };

  const handlePendingSubmissionDelete = async (item: MySubmission) => {
    if (pendingDeletingId) return;
    if (!window.confirm('确定删除这个生成失败的作品吗？图片和生成记录都会被移除。')) return;

    setPendingDeletingId(item.submission.id);
    try {
      await api.delete(`/submissions/${item.submission.id}`);
      setMyPendingSubmissions((prev) => prev.filter((pending) => pending.submission.id !== item.submission.id));
      if (activeGen?.submissionId === item.submission.id) {
        setActiveGen(null);
        trackingIdRef.current = null;
      }
    } catch (err: unknown) {
      window.alert(getApiErrorMessage(err, '删除失败，请重试'));
    } finally {
      setPendingDeletingId(null);
    }
  };

  const getPendingSubmissionStatus = (item: MySubmission) => {
    if (item.submission.status === 'selecting' || item.generation?.status === 'done') {
      return {
        label: '待选择',
        action: '去选择',
        color: 'var(--accent-text)',
        background: 'var(--accent-soft)',
        border: 'var(--accent-border)',
      };
    }
    if (item.submission.status === 'failed' || item.generation?.status === 'failed') {
      return {
        label: '生成失败',
        action: '查看',
        color: '#fca5a5',
        background: 'rgba(220,38,38,0.12)',
        border: 'rgba(248,113,113,0.24)',
      };
    }
    return {
      label: '生成中',
      action: '查看进度',
      color: 'var(--text-secondary)',
      background: 'rgba(255,255,255,0.06)',
      border: 'rgba(255,255,255,0.1)',
    };
  };

  const renderOwnerActionButtons = (work: Work, variant: 'card' | 'list') => {
    const buttonStyle = variant === 'card'
      ? {
          width: 40,
          height: 40,
          borderRadius: 999,
        }
      : {
          width: 34,
          height: 34,
          borderRadius: 999,
        };

    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="编辑作品"
          title="编辑作品"
          onClick={() => openOwnerEditor(work)}
          disabled={editSaving || editDeleting}
          className="flex items-center justify-center transition-colors"
          style={{
            ...buttonStyle,
            background: 'rgba(255,255,255,0.06)',
            color: 'var(--text-secondary)',
            border: '1px solid rgba(255,255,255,0.08)',
            opacity: editSaving || editDeleting ? 0.6 : 1,
            cursor: editSaving || editDeleting ? 'default' : 'pointer',
          }}
        >
          <EditIcon size={16} />
        </button>
        <button
          type="button"
          aria-label="删除作品"
          title="删除作品"
          onClick={() => handleOwnerDelete(work)}
          disabled={editSaving || editDeleting}
          className="flex items-center justify-center transition-colors"
          style={{
            ...buttonStyle,
            background: 'rgba(220,38,38,0.12)',
            color: '#fca5a5',
            border: '1px solid rgba(248,113,113,0.24)',
            opacity: editSaving || editDeleting ? 0.6 : 1,
            cursor: editSaving || editDeleting ? 'default' : 'pointer',
          }}
        >
          <TrashIcon size={16} />
        </button>
      </div>
    );
  };

  const selectedWorkOwned = !!user && !!selectedWork && selectedWork.loginAccount === user.loginAccount;
  const selectedWorkOwnerActions = selectedWorkOwned && selectedWork
    ? renderOwnerActionButtons(selectedWork, 'card')
    : undefined;

  const renderPendingSubmissionListItem = (item: MySubmission, variant: 'desktop' | 'mobile') => {
    const status = getPendingSubmissionStatus(item);
    const thumbnail = item.submission.thumbnailUrl || item.submission.imageUrl;
    const canQuickDelete = item.submission.status === 'failed' || item.generation?.status === 'failed';
    const isDeleting = pendingDeletingId === item.submission.id;

    return (
      <div
        key={item.submission.id}
        className="w-full flex items-center gap-2 p-2.5 rounded-[var(--radius-sm)] transition-colors"
        style={{
          background: variant === 'desktop' ? 'rgba(255,255,255,0.03)' : 'transparent',
          border: variant === 'desktop' ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(255,255,255,0.04)',
          marginBottom: 10,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = variant === 'desktop' ? 'rgba(255,255,255,0.03)' : 'transparent'; }}
      >
        <button
          type="button"
          onClick={() => handlePendingSubmissionClick(item)}
          className="flex flex-1 min-w-0 items-center gap-3 text-left"
          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
            {thumbnail ? (
              <img src={thumbnail} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: 'var(--text-tertiary)' }}>音</div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{getWorkTitle(item.submission)}</p>
              <span
                className="text-[11px] flex-shrink-0"
                style={{
                  color: status.color,
                  background: status.background,
                  border: `1px solid ${status.border}`,
                  borderRadius: 999,
                  padding: '2px 7px',
                }}
              >
                {status.label}
              </span>
            </div>
            <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {item.submission.regionName} · {getWorkSummary(item.submission)}
            </p>
          </div>
          <span className="text-xs flex-shrink-0" style={{ color: status.color }}>{status.action}</span>
        </button>
        {canQuickDelete && (
          <button
            type="button"
            aria-label="删除失败作品"
            title="删除失败作品"
            onClick={() => handlePendingSubmissionDelete(item)}
            disabled={isDeleting}
            className="flex items-center justify-center flex-shrink-0 transition-colors"
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              background: 'rgba(220,38,38,0.12)',
              color: '#fca5a5',
              border: '1px solid rgba(248,113,113,0.24)',
              opacity: isDeleting ? 0.6 : 1,
              cursor: isDeleting ? 'default' : 'pointer',
            }}
          >
            <TrashIcon size={15} />
          </button>
        )}
      </div>
    );
  };

  const renderMyWorkListItem = (work: Work, variant: 'desktop' | 'mobile') => (
    <div
      key={work.id}
      className="w-full flex items-center gap-2 p-2.5 rounded-[var(--radius-sm)]"
      style={{
        background: variant === 'desktop' ? 'rgba(255,255,255,0.03)' : 'transparent',
        border: variant === 'desktop' ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(255,255,255,0.04)',
        marginBottom: 10,
      }}
    >
      <button
        type="button"
        onClick={() => handleMyWorkClick(work)}
        className="flex flex-1 min-w-0 items-center gap-3 text-left"
        style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
          {(work.thumbnailUrl || work.imageUrl) ? (
            <img src={work.thumbnailUrl || work.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm" style={{ color: 'var(--text-tertiary)' }}>🎵</div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{getWorkTitle(work)}</p>
          <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>{work.regionName} · {getWorkSummary(work)}</p>
        </div>
      </button>
      {renderOwnerActionButtons(work, 'list')}
    </div>
  );

  return (
    <div className="relative w-full overflow-hidden" style={{ background: '#0a0a0a', height: '100dvh' }}>

      {/* ── Status bar (when generating) ── */}
      {activeGen && (
        <div
          className="absolute top-0 left-0 right-0 z-[1002] flex items-center justify-center cursor-pointer"
          onClick={() => {
            if (activeGen.status === 'ready') {
              navigate(`/select?id=${activeGen.submissionId}`);
            }
          }}
          style={{
            padding: '10px 16px',
            background: activeGen.status === 'ready' ? 'rgba(160,40,45,0.9)' : 'var(--glass-bg)',
            backdropFilter: 'var(--glass-blur)',
            WebkitBackdropFilter: 'var(--glass-blur)',
            borderBottom: '1px solid var(--glass-border)',
          }}
        >
          {activeGen.status === 'generating' ? (
            <div className="flex items-center gap-2">
              <div
                className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin flex-shrink-0"
                style={{ borderColor: 'var(--accent-text)', borderTopColor: 'transparent' }}
              />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {activeGen.jobsAhead !== null && activeGen.jobsAhead !== undefined
                  ? `排队中：前方 ${activeGen.jobsAhead} 个任务`
                  : `正在生成「${activeGen.regionName}」的音乐…`}
              </span>
            </div>
          ) : (
            <span className="text-sm font-medium text-white">
              音乐已生成，点击选择 →
            </span>
          )}
        </div>
      )}

      {/* ── Full-screen map ── */}
      <CampusMap
        mode="browse"
        regions={regions}
        works={works}
        selectedWorkId={selectedWork?.id ?? null}
        onWorkClick={handleWorkClick}
        onClusterClick={handleClusterClick}
        onMapClick={() => { if (!createMode) { setSelectedWork(null); setSidebarWorks(null); setMyPanelOpen(false); stop(); } }}
        flyToCoord={flyTarget}
        createMode={createMode}
        onCreateLocationPick={handleCreateLocationPick}
      />

      {/* ── Loading overlay ── */}
      {mapLoading && (
        <div className="absolute inset-0 z-[999] flex items-center justify-center pointer-events-none" style={{ background: 'rgba(10,10,10,0.75)' }}>
          <div className="glass-panel flex items-center gap-3 px-5 py-3 rounded-[var(--radius-md)] shadow-xl">
            <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin flex-shrink-0" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>加载中...</span>
          </div>
        </div>
      )}

      {/* ── Create mode guide ── */}
      {createMode && !createLocation && !mapLoading && !mapError && (
        <div
          className="absolute left-1/2 z-[1003] -translate-x-1/2 pointer-events-none px-4"
          style={{ top: activeGen ? 104 : 72, transition: 'top 0.3s ease' }}
        >
          <div
            className="glass-panel text-center shadow-xl"
            style={{
              padding: '12px 18px',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(16,16,16,0.82)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
            }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              选择地图上的地点
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              选好地点后，上传照片并填写描述
            </p>
          </div>
        </div>
      )}

      {/* ── Error overlay ── */}
      {mapError && !mapLoading && (
        <div className="absolute inset-0 z-[999] flex items-center justify-center" style={{ background: 'rgba(10,10,10,0.75)' }}>
          <div className="glass-panel flex flex-col items-center gap-3 px-6 py-5 rounded-[var(--radius-md)] shadow-xl mx-4 text-center">
            <p className="text-sm" style={{ color: '#f87171' }}>{mapError}</p>
            <button onClick={() => window.location.reload()} className="btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }}>重试</button>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!mapLoading && !mapError && works.length === 0 && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[998]">
          <div className="glass-panel rounded-[var(--radius-lg)] px-5 py-4 text-center shadow-xl">
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>还没有作品</p>
            <button type="button" onClick={startCreateFlow} className="text-sm underline" style={{ color: 'var(--accent-text)' }}>
              去创建 →
            </button>
          </div>
        </div>
      )}

      {/* ── Work popup — mobile only ── */}
      {selectedWork && (
        <div className="md:hidden absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] w-[calc(100vw-2rem)] max-w-sm shadow-2xl" style={{ maxHeight: '58dvh' }}>
          <div className="glass-panel rounded-[var(--radius-lg)] overflow-y-auto" style={{ maxHeight: '58dvh' }}>
            <WorkCard
              work={selectedWork}
              isPlaying={playingId === selectedWork.id}
              progress={playingId === selectedWork.id ? progress : 0}
              onPlay={() => play(selectedWork.id, selectedWork.selectedAudioUrl)}
              onLike={() => handleLike(selectedWork.id)}
              ownerActions={selectedWorkOwnerActions}
              mediaMaxHeight="22dvh"
            />
          </div>
        </div>
      )}

      {/* No full-screen backdrop — map stays interactive when panels are open.
           Panels are dismissed via X button or by clicking a map pin. */}

      {/* ── Desktop right sidebar (md+) ── */}
      {/* Reserved for cluster and "my music" panels. Selected work uses a floating card. */}
      <div
        className={`hidden md:flex absolute top-0 right-0 h-full w-96 z-[1001] flex-col transition-transform duration-300 ${desktopSidebarVisible ? 'translate-x-0' : 'translate-x-full'}`}
        style={{
          background: 'rgba(16,16,16,0.88)',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 'var(--radius-lg) 0 0 var(--radius-lg)',
          boxShadow: '-14px 0 36px rgba(0,0,0,0.22)',
        }}
      >
        {/* Handle bar — click to close */}
        {/* ── Cluster content ── */}
        {desktopSidebarMode === 'cluster' && (
          <>
            <div className="px-5 py-4 flex-shrink-0 flex items-start justify-between gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>区域作品</p>
                <h2 className="font-semibold mt-2" style={{ fontSize: 16, color: 'var(--text-primary)' }}>{sidebarTitle || '作品列表'}</h2>
                {sidebarWorks && <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{sidebarWorks.length} 件作品</p>}
              </div>
              <button aria-label="关闭" onClick={() => { setSidebarWorks(null); setSelectedWork(null); setMyPanelOpen(false); stop(); }} style={{ color: 'var(--text-tertiary)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', padding: 8, borderRadius: 999 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            {sortedSidebarWorks && sortedSidebarWorks.length > 1 && (
              <div className="flex gap-1 px-3 pt-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: 8 }}>
                {(['recent', 'popular'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSortBy(s)}
                    className="px-3 py-1 rounded-full text-xs transition-colors"
                    style={{
                      background: sortBy === s ? 'var(--accent-soft)' : 'transparent',
                      color: sortBy === s ? 'var(--accent-text)' : 'var(--text-tertiary)',
                      border: sortBy === s ? '1px solid var(--accent-border)' : '1px solid transparent',
                    }}
                  >
                    {s === 'recent' ? '最新' : '最热'}
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-3">
              {sortedSidebarWorks && sortedSidebarWorks.length > 0 ? sortedSidebarWorks.map((work) => (
                <button
                  key={work.id}
                  onClick={() => handleSidebarItemClick(work)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-[var(--radius-sm)] transition-colors text-left"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', marginBottom: 10 }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                >
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    {(work.thumbnailUrl || work.imageUrl) ? (
                      <img src={work.thumbnailUrl || work.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm" style={{ color: 'var(--text-tertiary)' }}>🎵</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{getWorkTitle(work)}</span>
                      <span className="flex items-center gap-0.5 text-xs flex-shrink-0 ml-2" style={{ color: 'var(--text-tertiary)' }}><HeartIcon size={11} /> {work.likeCount}</span>
                    </div>
                    <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>{work.loginAccount} · {work.regionName}</p>
                  </div>
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>›</span>
                </button>
              )) : (
                <div className="flex items-center justify-center h-20 text-sm" style={{ color: 'var(--text-tertiary)' }}>该区域暂无作品</div>
              )}
            </div>
          </>
        )}

        {/* ── My music content ── */}
        {desktopSidebarMode === 'myMusic' && (
          <>
            <div className="px-5 py-4 flex-shrink-0 flex items-start justify-between gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>我的作品</p>
                <h2 className="font-semibold mt-2" style={{ fontSize: 16, color: 'var(--text-primary)' }}>我的作品</h2>
                {myPanelItemCount > 0 && (
                  <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    {myPendingSubmissions.length} 件待完成 · {myWorks.length} 件已发布
                  </p>
                )}
              </div>
              <button aria-label="关闭" onClick={() => { setSidebarWorks(null); setSelectedWork(null); setMyPanelOpen(false); stop(); }} style={{ color: 'var(--text-tertiary)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', padding: 8, borderRadius: 999 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            {myWorks.length > 1 && (
              <div className="flex gap-1 px-3 pt-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: 8 }}>
                {(['recent', 'popular'] as const).map((s) => (
                  <button key={s} onClick={() => setSortBy(s)} className="px-3 py-1 rounded-full text-xs transition-colors" style={{ background: sortBy === s ? 'var(--accent-soft)' : 'transparent', color: sortBy === s ? 'var(--accent-text)' : 'var(--text-tertiary)', border: sortBy === s ? '1px solid var(--accent-border)' : '1px solid transparent' }}>
                    {s === 'recent' ? '最新' : '最热'}
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-3">
              {myLoading ? (
                <div className="flex items-center justify-center h-20">
                  <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                </div>
              ) : myPanelItemCount === 0 ? (
                <div className="flex flex-col items-center justify-center h-20 gap-2">
                  <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>还没有已发布的作品</p>
                  <button type="button" onClick={startCreateFlow} className="text-sm" style={{ color: 'var(--accent-text)' }}>
                    去创建 →
                  </button>
                </div>
              ) : (
                <>
                  {sortedMyPendingSubmissions.length > 0 && (
                    <section style={{ marginBottom: 14 }}>
                      <div className="flex items-center justify-between px-1 pb-2">
                        <h3 className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>待完成作品</h3>
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{sortedMyPendingSubmissions.length} 件</span>
                      </div>
                      {sortedMyPendingSubmissions.map((item) => renderPendingSubmissionListItem(item, 'desktop'))}
                    </section>
                  )}
                  {sortedMyWorks.length > 0 && (
                    <section>
                      <div className="flex items-center justify-between px-1 pb-2">
                        <h3 className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>已发布作品</h3>
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{sortedMyWorks.length} 件</span>
                      </div>
                      {sortedMyWorks.map((work) => renderMyWorkListItem(work, 'desktop'))}
                    </section>
                  )}
                </>
              )}
            </div>
            {/* Logout at bottom */}
            <div className="flex-shrink-0 p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button
                onClick={() => { logout(); navigate('/'); }}
                className="w-full text-left px-3 py-2 text-sm rounded-[var(--radius-sm)] transition-colors"
                style={{ color: 'var(--text-tertiary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#f87171'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
              >
                退出登录
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Desktop floating work card (md+) ── */}
      <div
        className="hidden md:block absolute right-4 z-[1001] transition-all duration-300"
        style={{
          top: floatingCardCenterY,
          width: 400,
          maxWidth: 'calc(100vw - 2rem)',
          transform: desktopFloatingWorkVisible
            ? 'translate3d(0, -50%, 0)'
            : 'translate3d(calc(100% + 16px), -50%, 0)',
          opacity: desktopFloatingWorkVisible ? 1 : 0,
          pointerEvents: desktopFloatingWorkVisible ? 'auto' : 'none',
        }}
      >
        {selectedWork && (
          <div
            className="rounded-[var(--radius-lg)] overflow-hidden"
            style={{
              background: 'rgba(16,16,16,0.88)',
              backdropFilter: 'blur(28px)',
              WebkitBackdropFilter: 'blur(28px)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '-14px 16px 36px rgba(0,0,0,0.22)',
              maxHeight: floatingCardMaxHeight,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              className="px-4 py-3 flex items-center justify-between gap-3"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>作品详情</p>
                <p className="text-xs truncate mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {selectedWork.loginAccount} · {selectedWork.regionName}
                </p>
              </div>
              <button
                aria-label="关闭"
                onClick={() => { setSelectedWork(null); stop(); }}
                style={{
                  color: 'var(--text-tertiary)',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  cursor: 'pointer',
                  padding: 8,
                  borderRadius: 999,
                  flexShrink: 0,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div style={{ minHeight: 0, overflowY: 'auto' }}>
              <WorkCard
                work={selectedWork}
                isPlaying={playingId === selectedWork.id}
                progress={playingId === selectedWork.id ? progress : 0}
                onPlay={() => play(selectedWork.id, selectedWork.selectedAudioUrl)}
                onLike={() => handleLike(selectedWork.id)}
                ownerActions={selectedWorkOwnerActions}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Cluster mobile bottom sheet ── */}
      {(() => {
        const sortToggle = sortedSidebarWorks && sortedSidebarWorks.length > 1 && (
          <div className="flex gap-1 px-3 pt-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: 8 }}>
            {(['recent', 'popular'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className="px-3 py-1 rounded-full text-xs transition-colors"
                style={{
                  background: sortBy === s ? 'var(--accent-soft)' : 'transparent',
                  color: sortBy === s ? 'var(--accent-text)' : 'var(--text-tertiary)',
                  border: sortBy === s ? '1px solid var(--accent-border)' : '1px solid transparent',
                }}
              >
                {s === 'recent' ? '最新' : '最热'}
              </button>
            ))}
          </div>
        );

        const workList = sortedSidebarWorks && sortedSidebarWorks.length > 0 ? sortedSidebarWorks.map((work) => (
          <button
            key={work.id}
            onClick={() => handleSidebarItemClick(work)}
            className="w-full flex items-center gap-3 p-2.5 rounded-[var(--radius-sm)] transition-colors text-left"
            style={{ background: 'transparent' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
              {(work.thumbnailUrl || work.imageUrl) ? (
                <img src={work.thumbnailUrl || work.imageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm" style={{ color: 'var(--text-tertiary)' }}>🎵</div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{getWorkTitle(work)}</span>
                <span className="flex items-center gap-0.5 text-xs flex-shrink-0 ml-2" style={{ color: 'var(--text-tertiary)' }}><HeartIcon size={11} /> {work.likeCount}</span>
              </div>
              <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>{work.loginAccount} · {work.regionName}</p>
            </div>
            <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>›</span>
          </button>
        )) : (
          <div className="flex items-center justify-center h-20 text-sm" style={{ color: 'var(--text-tertiary)' }}>该区域暂无作品</div>
        );

        const panelTitle = (title: string, count: string) => (
          <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{title}</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{count}</p>
          </div>
        );

        return (
          <div ref={clusterDrag.sheetRef} className={`md:hidden bottom-sheet z-[1001] flex flex-col ${sidebarOpen ? 'open' : ''}`} style={{ maxHeight: '90dvh' }}>
            <div className="flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none" {...clusterDrag.handleProps}>
              <div className="w-12 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
            </div>
            {panelTitle(sidebarTitle || '作品列表', sidebarWorks ? `${sidebarWorks.length} 件作品` : '')}
            {sortToggle}
            <div className="flex-1 overflow-y-auto p-2">{workList}</div>
          </div>
        );
      })()}

      {/* ── My music mobile bottom sheet ── */}
      {(() => {
        const myList = (
          <>
            {myLoading ? (
              <div className="flex items-center justify-center h-20">
                <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
              </div>
            ) : myPanelItemCount === 0 ? (
              <div className="flex flex-col items-center justify-center h-20 gap-2">
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>还没有已发布的作品</p>
                <button type="button" onClick={startCreateFlow} className="text-sm" style={{ color: 'var(--accent-text)' }}>
                  去创建 →
                </button>
              </div>
            ) : (
              <>
                {sortedMyPendingSubmissions.length > 0 && (
                  <section style={{ marginBottom: 12 }}>
                    <div className="flex items-center justify-between px-1 pb-2">
                      <h3 className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>待完成作品</h3>
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{sortedMyPendingSubmissions.length} 件</span>
                    </div>
                    {sortedMyPendingSubmissions.map((item) => renderPendingSubmissionListItem(item, 'mobile'))}
                  </section>
                )}
                {sortedMyWorks.length > 0 && (
                  <section>
                    <div className="flex items-center justify-between px-1 pb-2">
                      <h3 className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>已发布作品</h3>
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{sortedMyWorks.length} 件</span>
                    </div>
                    {sortedMyWorks.map((work) => renderMyWorkListItem(work, 'mobile'))}
                  </section>
                )}
              </>
            )}
          </>
        );

        const myTitle = (
          <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>我的作品</h2>
            {myPanelItemCount > 0 && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                {myPendingSubmissions.length} 件待完成 · {myWorks.length} 件已发布
              </p>
            )}
          </div>
        );

        return (
          <div ref={myDrag.sheetRef} className={`md:hidden bottom-sheet z-[1001] flex flex-col ${myPanelOpen ? 'open' : ''}`} style={{ maxHeight: '90dvh' }}>
            <div className="flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none" {...myDrag.handleProps}>
              <div className="w-12 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
            </div>
            {myTitle}
            {myWorks.length > 1 && (
              <div className="flex gap-1 px-3 pt-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: 8 }}>
                {(['recent', 'popular'] as const).map((s) => (
                  <button key={s} onClick={() => setSortBy(s)} className="px-3 py-1 rounded-full text-xs transition-colors" style={{ background: sortBy === s ? 'var(--accent-soft)' : 'transparent', color: sortBy === s ? 'var(--accent-text)' : 'var(--text-tertiary)', border: sortBy === s ? '1px solid var(--accent-border)' : '1px solid transparent' }}>
                    {s === 'recent' ? '最新' : '最热'}
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-2">{myList}</div>
            <div className="flex-shrink-0 p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button
                onClick={() => { logout(); navigate('/'); }}
                className="w-full text-left px-3 py-2 text-sm rounded-[var(--radius-sm)]"
                style={{ color: 'var(--text-tertiary)' }}
              >
                退出登录
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Create mode form panel ── */}
      {createMode && createLocation && (() => {
        const formContent = (
          <div style={{ padding: '0 20px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>创建作品</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                上传照片，填写描述，然后生成音乐。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="glass-panel flex items-center gap-2" style={{ display: 'inline-flex', padding: '8px 14px', borderRadius: 'var(--radius-full)' }}>
                <span style={{ fontSize: 14 }}>📍</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{createLocation.regionName}</span>
              </div>
              <button
                type="button"
                onClick={() => { setCreateLocation(null); setCreateSheetOpen(false); }}
                className="rounded-full transition-all hover:bg-[rgba(255,255,255,0.1)]"
                style={{ padding: '8px 14px', fontSize: 13, color: 'var(--accent-text)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                重选地点
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>上传照片</label>
                <ImageUpload onUpload={handleImageUpload} />
                {uploadingImage && <p className="animate-pulse" style={{ fontSize: 12, color: 'var(--accent-text)', marginTop: 6 }}>正在上传图片…</p>}
                {imagePreview && !uploadingImage && imageUrl && <p style={{ fontSize: 12, color: '#4ade80', marginTop: 6 }}>上传完成</p>}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  标题（可选） <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>（{titleLength}/{TITLE_MAX_LENGTH}）</span>
                </label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="输入标题" maxLength={TITLE_MAX_LENGTH} className="glass-input w-full" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  描述（可选）<span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>（{storyLength}/{CORNER_STORY_MAX_LENGTH}）</span>
                </label>
                <textarea value={cornerStory} onChange={(e) => setCornerStory(e.target.value)} placeholder="输入描述" maxLength={CORNER_STORY_MAX_LENGTH} rows={4} className="glass-input w-full resize-none" style={{ padding: '10px 14px', fontSize: 14 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>风格标签</label>
                <StyleTags onSelect={(tag) => setMusicPrompt((prev) => prev.trim() ? `${prev.trim()}，${tag}` : tag)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  音乐描述（可选）<span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>（{promptLength}/100）</span>
                </label>
                <textarea value={musicPrompt} onChange={(e) => setMusicPrompt(e.target.value)} placeholder="描述想要的音乐风格…" maxLength={100} rows={3} className="glass-input w-full resize-none" style={{ padding: '10px 14px', fontSize: 14 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  生成数量 <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>默认 1，最多 3</span>
                </label>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="生成数量">
                  {([1, 2, 3] as const).map((count) => (
                    <button
                      key={count}
                      type="button"
                      role="radio"
                      aria-checked={numSongs === count}
                      onClick={() => setNumSongs(count)}
                      className="rounded-[var(--radius-md)] transition-all"
                      style={{
                        padding: '10px 12px',
                        border: numSongs === count ? '1px solid var(--accent-border)' : '1px solid var(--glass-border)',
                        background: numSongs === count ? 'var(--accent-soft)' : 'rgba(255,255,255,0.04)',
                        color: numSongs === count ? 'var(--accent-text)' : 'var(--text-secondary)',
                        fontSize: 15,
                        fontWeight: 700,
                      }}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  变化程度 <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{guidance <= 1 ? '稳定' : guidance <= 2 ? '适中' : guidance <= 3.5 ? '更多变化' : '变化较大'}</span>
                </label>
                <input type="range" min="0.5" max="5" step="0.5" value={guidance} onChange={(e) => setGuidance(parseFloat(e.target.value))} className="w-full" style={{ accentColor: 'rgb(160, 40, 45)' }} />
                <div className="flex justify-between" style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  <span>稳定</span><span>变化较大</span>
                </div>
              </div>
              {submitError && <p style={{ fontSize: 13, color: '#f87171', background: 'rgba(220,38,38,0.1)', borderRadius: 'var(--radius-md)', padding: '10px 16px' }}>{submitError}</p>}
              <button type="submit" disabled={!imageUrl || !uploadId || !uploadToken || !storyValid || !promptValid || submitting || uploadingImage} className="btn-primary w-full">
                {submitting ? (<span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'white', borderTopColor: 'transparent' }} />提交中…</span>) : '提交并生成'}
              </button>
            </form>
          </div>
        );
        return (
          <>
            {/* Mobile: draggable bottom sheet */}
            <div
              ref={createDrag.sheetRef}
              className="md:hidden absolute bottom-0 left-0 right-0"
              style={{
                zIndex: 1050,
                borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
                background: 'var(--glass-bg)',
                backdropFilter: 'var(--glass-blur)',
                WebkitBackdropFilter: 'var(--glass-blur)',
                border: '1px solid var(--glass-border)',
                borderBottom: 'none',
                paddingBottom: 'env(safe-area-inset-bottom, 0)',
                overflow: 'hidden',
              }}
            >
              <div {...createDrag.handleProps} className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing touch-none">
                <div className="w-12 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
              </div>
              <div style={{ overflowY: 'auto', maxHeight: 'calc(100% - 24px)' }}>
                {formContent}
              </div>
            </div>
            {/* Desktop: right sidebar */}
            <div
              className={`hidden md:flex absolute top-0 right-0 h-full w-96 flex-col transition-transform duration-300 ${createSheetOpen ? 'translate-x-0' : 'translate-x-full'}`}
              style={{ zIndex: 1050, background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderLeft: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg) 0 0 var(--radius-lg)' }}
            >
              <div className="flex-1 overflow-y-auto pt-4">{formContent}</div>
            </div>
          </>
        );
      })()}

      {/* ── Owner edit modal ── */}
      {editSheetOpen && (
        <div
          className="absolute inset-0 z-[1200] flex items-end md:items-center md:justify-center"
          style={{ background: 'rgba(0,0,0,0.58)' }}
          onClick={closeOwnerEditor}
        >
          <div
            className="w-full md:max-w-lg md:mx-6"
            style={{
              background: 'rgba(16,16,16,0.92)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              borderLeft: '1px solid rgba(255,255,255,0.08)',
              borderRight: '1px solid rgba(255,255,255,0.08)',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
              boxShadow: '0 -16px 40px rgba(0,0,0,0.28)',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="md:hidden flex justify-center pt-3 pb-2">
              <div className="w-12 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
            </div>
            <div className="px-5 pt-2 pb-4 md:pt-5 md:px-6 md:pb-6" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>作品管理</p>
                  <h2 className="font-semibold mt-2" style={{ fontSize: 18, color: 'var(--text-primary)' }}>编辑标题和描述</h2>
                </div>
                <button
                  type="button"
                  aria-label="关闭"
                  onClick={closeOwnerEditor}
                  disabled={editSaving || editDeleting}
                  style={{
                    color: 'var(--text-tertiary)',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    cursor: 'pointer',
                    padding: 8,
                    borderRadius: 999,
                    opacity: editSaving || editDeleting ? 0.6 : 1,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  标题 <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>（{editTitleLength}/{TITLE_MAX_LENGTH}）</span>
                </label>
                <input
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  maxLength={TITLE_MAX_LENGTH}
                  placeholder="输入标题"
                  className="glass-input w-full"
                  disabled={editSaving || editDeleting}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  描述 <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>（{editStoryLength}/{CORNER_STORY_MAX_LENGTH}）</span>
                </label>
                <textarea
                  value={editCornerStory}
                  onChange={(event) => setEditCornerStory(event.target.value)}
                  maxLength={CORNER_STORY_MAX_LENGTH}
                  rows={5}
                  placeholder="补充描述"
                  className="glass-input w-full resize-none"
                  style={{ padding: '10px 14px', fontSize: 14 }}
                  disabled={editSaving || editDeleting}
                />
              </div>

              {editError && (
                <p
                  style={{
                    fontSize: 13,
                    color: '#fca5a5',
                    background: 'rgba(220,38,38,0.1)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 14px',
                  }}
                >
                  {editError}
                </p>
              )}

              <div
                className="flex gap-2"
                style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0px)' }}
              >
                <button
                  type="button"
                  onClick={closeOwnerEditor}
                  disabled={editSaving || editDeleting}
                  className="flex-1 py-2.5 rounded-[var(--radius-sm)] text-sm transition-colors"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    color: 'var(--text-secondary)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    opacity: editSaving || editDeleting ? 0.6 : 1,
                  }}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleOwnerSave}
                  disabled={!editTitleValid || !editStoryValid || editSaving || editDeleting}
                  className="flex-1 py-2.5 rounded-[var(--radius-sm)] text-sm font-medium transition-colors"
                  style={{
                    background: 'rgba(160,40,45,0.95)',
                    color: 'white',
                    border: '1px solid rgba(255,255,255,0.06)',
                    opacity: !editTitleValid || !editStoryValid || editSaving || editDeleting ? 0.6 : 1,
                  }}
                >
                  {editSaving ? '保存中…' : '保存修改'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Top nav bar ── */}
      <div
        className="absolute left-0 right-0 z-[1100] pointer-events-none"
        style={{ top: activeGen ? 52 : 16, transition: 'top 0.3s ease' }}
      >
        {/* Left: back */}
        <div className="absolute left-4 top-0 pointer-events-auto">
          <Link to="/" className="glass-pill">← 返回</Link>
        </div>

        {/* Center: mode switch — always centered */}
        <div className="flex justify-center pointer-events-none">
          <div
            className="flex items-center pointer-events-auto"
            style={{
              background: 'rgba(20,20,20,0.75)',
              backdropFilter: 'blur(22px)',
              WebkitBackdropFilter: 'blur(22px)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 'var(--radius-full)',
              padding: 4,
              boxShadow: '0 10px 24px rgba(0,0,0,0.18)',
            }}
          >
            <button
              type="button"
              onClick={() => { if (!createMode) toggleCreateMode(); }}
              style={{
                padding: '7px 14px', fontSize: 13, fontWeight: 500, lineHeight: 1,
                borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer',
                transition: 'all 0.25s ease',
                background: createMode ? 'rgba(160,40,45,0.95)' : 'transparent',
                color: createMode ? 'white' : 'var(--text-tertiary)',
              }}
            >创作</button>
            <button
              type="button"
              onClick={() => { if (createMode) toggleCreateMode(); }}
              style={{
                padding: '7px 14px', fontSize: 13, fontWeight: 500, lineHeight: 1,
                borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer',
                transition: 'all 0.25s ease',
                background: !createMode ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: !createMode ? 'var(--text-primary)' : 'var(--text-tertiary)',
              }}
            >浏览</button>
          </div>
        </div>

        {/* Right: user */}
        {user && !desktopRightOccupied && (
          <div className="absolute right-4 top-0 pointer-events-auto">
            <button onClick={openMyPanel} className="glass-pill">
              {user.loginAccount}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
