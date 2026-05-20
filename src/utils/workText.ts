interface WorkTextSource {
  title?: string | null;
  regionName: string;
  cornerStory?: string | null;
  musicPrompt?: string | null;
}

function normalizeText(value?: string | null): string {
  return value?.trim() ?? '';
}

export function getWorkTitle(source: WorkTextSource): string {
  return normalizeText(source.title) || source.regionName;
}

export function getWorkSummary(source: WorkTextSource): string {
  return (
    normalizeText(source.cornerStory) ||
    normalizeText(source.musicPrompt) ||
    '暂无描述'
  );
}

export function hasCornerStory(source: WorkTextSource): boolean {
  return normalizeText(source.cornerStory).length > 0;
}
