import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api/client';

interface PollResult {
  status: 'queued' | 'processing' | 'done' | 'failed';
  audioUrls: string[] | null;
  estimatedWait: number | null;
}

export function useGenerationPolling(submissionId: string | null) {
  const [result, setResult] = useState<PollResult | null>(null);
  const [generation, setGeneration] = useState(0);
  const intervalRef = useRef<number>(undefined);

  const restart = useCallback(() => {
    clearInterval(intervalRef.current);
    setResult(null);
    setGeneration((g) => g + 1);
  }, []);

  useEffect(() => {
    if (!submissionId) return;

    const resetTimer = window.setTimeout(() => setResult(null), 0);

    const poll = async () => {
      try {
        const res = await api.get(`/generations/${submissionId}`);
        const data = res.data.data as PollResult;
        setResult(data);
        if (data.status === 'done' || data.status === 'failed') {
          clearInterval(intervalRef.current);
        }
      } catch { /* keep polling */ }
    };

    poll();
    intervalRef.current = window.setInterval(poll, 3000);
    return () => {
      window.clearTimeout(resetTimer);
      clearInterval(intervalRef.current);
    };
  }, [submissionId, generation]);

  return { result, restart };
}
