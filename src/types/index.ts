export interface User {
  id: string;
  loginAccount: string;
  role: 'user' | 'admin';
  hasSubmission: boolean;
}

export interface Region {
  id: number;
  level: number;
  name: string;
  centerX: number;
  centerY: number;
  radius: number;
  parentId: number | null;
}

export interface Submission {
  id: string;
  mapX: number;
  mapY: number;
  regionName: string;
  title: string;
  cornerStory: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  musicPrompt: string;
  status: 'generating' | 'selecting' | 'published' | 'failed';
  createdAt: string;
}

export interface Generation {
  id: string;
  submissionId: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  audioUrls: string[];
  completedAt: string | null;
}

export interface Work {
  id: string;
  submissionId: string;
  loginAccount: string;
  mapX: number;
  mapY: number;
  regionName: string;
  title: string;
  cornerStory: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  musicPrompt: string;
  selectedAudioUrl: string;
  likeCount: number;
  isLiked?: boolean;
  publishedAt: string;
}

export interface AdminWork {
  id: string;
  loginAccount: string;
  regionName: string;
  title: string;
  cornerStory: string;
  thumbnailUrl: string | null;
  imageUrl: string;
  selectedAudioUrl: string;
  visible: boolean;
  likeCount: number;
  publishedAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}
