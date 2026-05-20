import { useRef, useCallback } from 'react';

interface UseDragSheetOptions {
  onDismiss: () => void;
  minHeight?: number;    // px, minimum panel height
  maxHeight?: number;    // px, maximum panel height
  defaultHeight?: number; // px, initial height when opened
}

export function useDragSheet({ onDismiss, minHeight = 100, maxHeight = 600, defaultHeight }: UseDragSheetOptions) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const startHeight = useRef(0);
  const dragging = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    dragging.current = true;
    startY.current = e.clientY;
    startHeight.current = sheet.offsetHeight;
    sheet.style.transition = 'none';

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !sheetRef.current) return;

    const deltaY = startY.current - e.clientY; // positive = dragging up
    const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight.current + deltaY));
    sheetRef.current.style.height = `${newHeight}px`;
  }, [minHeight, maxHeight]);

  const onPointerUp = useCallback(() => {
    if (!dragging.current || !sheetRef.current) return;
    dragging.current = false;

    const sheet = sheetRef.current;
    const currentHeight = sheet.offsetHeight;
    sheet.style.transition = 'height 0.25s ease';

    // If dragged below minimum, dismiss
    if (currentHeight <= minHeight + 20) {
      onDismiss();
      sheet.style.height = '';
    } else {
      // Snap to current height
      sheet.style.height = `${currentHeight}px`;
    }
  }, [minHeight, onDismiss]);

  // Set default height when panel opens
  const applyDefault = useCallback(() => {
    if (sheetRef.current && defaultHeight) {
      sheetRef.current.style.height = `${defaultHeight}px`;
    }
  }, [defaultHeight]);

  const handleProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    style: { touchAction: 'none' as const, cursor: 'grab' },
  };

  return { sheetRef, handleProps, applyDefault };
}
