interface VideoExportOptions {
  imageUrl: string;
  audioUrl: string;
  filenameBase?: string;
}

function sanitizeFilename(input?: string) {
  const cleaned = (input || 'sounddrop-video')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned || 'sounddrop-video';
}

export async function downloadImageAudioVideo(options: VideoExportOptions) {
  const filename = sanitizeFilename(options.filenameBase);
  const params = new URLSearchParams({
    imageUrl: options.imageUrl,
    audioUrl: options.audioUrl,
    filename,
  });
  const response = await fetch(`/api/v1/downloads/video?${params.toString()}`, {
    credentials: 'same-origin',
  });

  if (!response.ok) {
    let message = '视频合成失败，请稍后重试';
    try {
      const body = await response.json();
      message = body?.error?.message || message;
    } catch {
      // Keep the generic message.
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.mp4`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function getVideoExportErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return '视频合成失败，请稍后重试';
}
