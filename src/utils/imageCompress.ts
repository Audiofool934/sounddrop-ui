interface CompressOptions {
  maxWidth?: number;
  targetBytes?: number;
  minQuality?: number;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Compression failed')),
      'image/jpeg',
      quality,
    );
  });
}

export async function compressImage(
  file: File,
  {
    maxWidth = 1600,
    targetBytes = 1.2 * 1024 * 1024,
    minQuality = 0.65,
  }: CompressOptions = {},
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      URL.revokeObjectURL(img.src);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      try {
        let smallestBlob: Blob | null = null;
        for (const quality of [0.82, 0.76, 0.7, minQuality]) {
          const blob = await canvasToBlob(canvas, quality);
          smallestBlob = blob;
          if (blob.size <= targetBytes) {
            resolve(blob);
            return;
          }
        }

        if (!smallestBlob || Math.max(canvas.width, canvas.height) <= 1200) {
          resolve(smallestBlob ?? await canvasToBlob(canvas, minQuality));
          return;
        }

        const downscale = Math.sqrt(targetBytes / Math.max(smallestBlob.size, targetBytes));
        const nextMaxWidth = Math.max(1200, Math.round(maxWidth * downscale));
        const nextScale = Math.min(1, nextMaxWidth / canvas.width);
        const resized = document.createElement('canvas');
        resized.width = Math.max(1, Math.round(canvas.width * nextScale));
        resized.height = Math.max(1, Math.round(canvas.height * nextScale));
        resized.getContext('2d')!.drawImage(canvas, 0, 0, resized.width, resized.height);
        resolve(await canvasToBlob(resized, minQuality));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
