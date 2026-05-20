import { useRef, useState, useEffect } from 'react';
import { compressImage } from '../utils/imageCompress';

interface Props {
  onUpload: (blob: Blob, previewUrl: string) => void;
}

export default function ImageUpload({ onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('正在处理图片…');
  const prevPreviewRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (prevPreviewRef.current) URL.revokeObjectURL(prevPreviewRef.current);
    };
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setLoadingText('正在处理图片…');
    try {
      const blob = await compressImage(file);
      const previewUrl = URL.createObjectURL(blob);
      if (prevPreviewRef.current) URL.revokeObjectURL(prevPreviewRef.current);
      prevPreviewRef.current = previewUrl;
      setPreview(previewUrl);
      onUpload(blob, previewUrl);
    } catch (err) {
      console.error('Image compression failed', err);
    } finally {
      setLoading(false);
      // Reset input so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div
      onClick={() => !loading && inputRef.current?.click()}
      className="relative cursor-pointer overflow-hidden transition-all"
      style={{
        minHeight: '160px',
        border: '2px dashed rgba(255,255,255,0.15)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {loading ? (
        <div className="flex flex-col items-center justify-center h-40 gap-3">
          <div
            className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{loadingText}</span>
        </div>
      ) : preview ? (
        <div className="relative group">
          <img
            src={preview}
            alt="preview"
            className="w-full object-cover max-h-64"
            style={{ borderRadius: 'var(--radius-lg)' }}
          />
          <div
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
            style={{ background: 'rgba(0,0,0,0.5)', borderRadius: 'var(--radius-lg)' }}
          >
            <span style={{ color: 'var(--text-primary)', fontSize: '14px' }}>点击重新上传</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-40 gap-2">
          <span className="text-4xl">📷</span>
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}>
            点击上传照片
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            自动压缩后上传，支持手机照片
          </span>
        </div>
      )}
    </div>
  );
}
