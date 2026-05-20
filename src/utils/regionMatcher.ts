// frontend/src/utils/regionMatcher.ts
import { MAP_CONFIG } from '../config';

// Max radius scaled to web-image coordinate space
const S = MAP_CONFIG.scale;
const MAX_RADIUS: Record<number, number> = { 1: 2000 * S, 2: 500 * S, 3: 150 * S };

export function zoomToRegionLevel(zoom: number): number {
  if (zoom <= MAP_CONFIG.zoom.level1Max) return 1;
  if (zoom <= MAP_CONFIG.zoom.level2Max) return 2;
  return 3;
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

interface RegionInput {
  id: number;
  level: number;
  name: string;
  centerX: number;
  centerY: number;
  radius: number;
  parentId: number | null;
}

interface MatchResult {
  id: number;
  name: string;
  level: number;
}

export function matchRegion(
  mapX: number,
  mapY: number,
  zoom: number,
  regions: RegionInput[],
): MatchResult {
  const targetLevel = zoomToRegionLevel(zoom);
  return matchAtLevel(mapX, mapY, targetLevel, regions);
}

function matchAtLevel(
  mapX: number,
  mapY: number,
  level: number,
  regions: RegionInput[],
): MatchResult {
  const candidates = regions.filter((r) => r.level === level);
  if (candidates.length === 0) {
    return { id: 0, name: '校园内', level: 0 };
  }

  let nearest = candidates[0];
  let nearestDist = distance(mapX, mapY, nearest.centerX * S, nearest.centerY * S);

  for (const r of candidates) {
    const d = distance(mapX, mapY, r.centerX * S, r.centerY * S);
    if (d < nearestDist) {
      nearest = r;
      nearestDist = d;
    }
  }

  const maxRadius = MAX_RADIUS[level] || 2000;
  if (nearestDist > maxRadius) {
    if (level > 1) {
      return matchAtLevel(mapX, mapY, level - 1, regions);
    }
    return { id: 0, name: '校园内', level: 0 };
  }

  return { id: nearest.id, name: nearest.name, level: nearest.level };
}
