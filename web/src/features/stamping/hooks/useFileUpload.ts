/**
 * @fileoverview File Upload and Drag & Drop Hook
 */

import { useState, useRef, useCallback } from 'react';
import { pageLogger } from '@/core/utils/logger';

export function useFileUpload() {
  const [attachments, setAttachments] = useState<File[]>([]);
  const [imageURLs, setImageURLs] = useState<string[]>([]);
  const [dragCounter, setDragCounter] = useState(0);
  const [isWobbling, setIsWobbling] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const fileInputRef = useRef<HTMLInputElement>(null!);

  const onFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    pageLogger.info('📎 Files selected via input:', { count: files.length });
    setAttachments((prev) => [...prev, ...files]);

    // Create image previews for image files
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    imageFiles.forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        setImageURLs((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(f);
    });

    // Reset input to allow re-uploading the same file
    if (e.target) {
      e.target.value = '';
    }
  }, []);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter((prev) => prev + 1);
    setIsWobbling(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter((prev) => {
      const newCount = prev - 1;
      if (newCount <= 0) {
        setIsWobbling(false);
        return 0; // Ensure counter never goes negative
      }
      return newCount;
    });
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Reset drag state immediately and force re-render
    setDragCounter(0);
    setIsWobbling(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) {
      // Ensure state is reset even with no files
      setTimeout(() => {
        setDragCounter(0);
        setIsWobbling(false);
      }, 0);
      return;
    }

    pageLogger.info('📎 Files dropped:', { count: files.length });
    setAttachments((prev) => [...prev, ...files]);

    // Create image previews for image files
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    imageFiles.forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        setImageURLs((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(f);
    });

    // Additional safety: reset state after processing
    setTimeout(() => {
      setDragCounter(0);
      setIsWobbling(false);
    }, 100);
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, idx) => idx !== index));
    // Also remove corresponding image URL if it exists
    setImageURLs((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
    setImageURLs([]);
  }, []);

  const resetDragState = useCallback(() => {
    setDragCounter(0);
    setIsWobbling(false);
    // Force re-render by setting state again
    setTimeout(() => {
      setDragCounter(0);
      setIsWobbling(false);
    }, 0);
  }, []);

  return {
    attachments,
    imageURLs,
    dragCounter,
    isWobbling,
    fileInputRef,
    onFileInputChange,
    onDragEnter,
    onDragLeave,
    onDrop,
    removeAttachment,
    clearAttachments,
    resetDragState,
  };
}
