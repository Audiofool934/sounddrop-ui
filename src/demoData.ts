import type { Region, Work } from './types';

const demoImage = '/maps/map-zgc-web.jpg';
const silentAudio = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';

export const DEMO_REGIONS: Region[] = [
  { id: 1, level: 1, name: 'Campus Green', centerX: 1500, centerY: 1267, radius: 900, parentId: null },
  { id: 2, level: 2, name: 'Library Walk', centerX: 1360, centerY: 1130, radius: 280, parentId: 1 },
  { id: 3, level: 2, name: 'Evening Court', centerX: 1800, centerY: 1420, radius: 260, parentId: 1 },
];

export const DEMO_WORKS: Work[] = [
  {
    id: 'demo-library-walk',
    submissionId: 'demo-submission-1',
    loginAccount: 'demo-user',
    mapX: 1360,
    mapY: 1130,
    regionName: 'Library Walk',
    title: 'After-class Light',
    cornerStory: 'A quiet walk after class, with bicycles passing through soft evening air.',
    imageUrl: demoImage,
    thumbnailUrl: demoImage,
    musicPrompt: 'Warm piano, soft textures, gentle campus ambience',
    selectedAudioUrl: silentAudio,
    likeCount: 12,
    publishedAt: new Date('2026-05-20T08:00:00Z').toISOString(),
  },
  {
    id: 'demo-evening-court',
    submissionId: 'demo-submission-2',
    loginAccount: 'ai-music-lab',
    mapX: 1800,
    mapY: 1420,
    regionName: 'Evening Court',
    title: 'Courtyard Echo',
    cornerStory: 'Footsteps, distant voices, and a small melody tucked into a familiar corner.',
    imageUrl: demoImage,
    thumbnailUrl: demoImage,
    musicPrompt: 'Lo-fi beat, mellow guitar, nostalgic atmosphere',
    selectedAudioUrl: silentAudio,
    likeCount: 8,
    publishedAt: new Date('2026-05-20T08:05:00Z').toISOString(),
  },
];
