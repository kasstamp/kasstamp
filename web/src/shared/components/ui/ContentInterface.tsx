import React from 'react';
import {Button} from './Button';
import {Toggle} from './Toggle';
import {Tooltip} from './Tooltip';
import {FileUp, Lock, X, ArrowUp, Loader2, Zap, Plus, QrCode} from 'lucide-react';

export interface ContentInterfaceProps {
  // Text
  text: string;
  onTextChange: (value: string) => void;

  // Drag & Drop state
  dragCounter: number;
  isWobbling: boolean;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;

  // Attachments
  attachments: File[];
  imageURLs: string[];
  onRemoveAttachment: (index: number) => void;

  // File input
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;

  // QR Scanner
  onScanQR?: () => void;

  // Privacy toggle
  mode: 'private' | 'public';
  onModeChange: (next: 'private' | 'public') => void;

  // Priority toggle
  isPriority: boolean;
  onPriorityChange: (checked: boolean) => void;

  // Save control
  selectedBytes: number;
  saving: boolean;
  onSave: () => void;

  // Footnotes
  estimatedCostText: string;
}

export function ContentInterface(props: ContentInterfaceProps) {
  const {
    text,
    onTextChange,
    dragCounter,
    isWobbling,
    onDragEnter,
    onDragLeave,
    onDrop,
    onDragEnd,
    attachments,
    imageURLs,
    onRemoveAttachment,
    fileInputRef,
    onFileInputChange,
    onScanQR,
    mode,
    onModeChange,
    isPriority,
    onPriorityChange,
    selectedBytes,
    saving,
    onSave,
    estimatedCostText,
  } = props;

  return (
    <div>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        className={`content-interface box-interactive relative ${dragCounter > 0 ? 'box-interactive--dragover dragdrop' : ''} ${isWobbling ? 'box-interactive--wobble' : ''}`}
      >
        {/* Estimated cost aligned to box padding */}
        <div className="mb-2 w-full text-right text-xs text-[color:var(--text)]">
          Estimated cost: <span className="font-medium">{estimatedCostText}</span>
        </div>
        <textarea
          rows={1}
          placeholder="Enter file receipt, text or drag files here"
          value={text}
          onChange={(e) => {
            onTextChange(e.target.value);
            // Auto-resize textarea
            const textarea = e.target;
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 600) + 'px';
          }}
        />

        {attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {attachments.map((f, idx) => (
              <div
                key={idx}
                className="group inline-flex max-w-full items-center gap-2 rounded-3xl border border-[var(--border-primary)] bg-[var(--background)] px-2 py-1 text-xs text-[color:var(--text-primary)] transition-colors hover:border-[var(--border-secondary)] hover:bg-[var(--bg-secondary)]"
              >
                {imageURLs[idx] ? (
                  <img
                    src={imageURLs[idx]}
                    alt={f.name}
                    className="h-10 w-10 flex-shrink-0 rounded object-cover"
                  />
                ) : (
                  <FileUp className="h-3.5 w-3.5 flex-shrink-0 text-[color:var(--text-secondary)]"/>
                )}
                <span className="max-w-[120px] truncate sm:max-w-[200px]">{f.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Remove attachment"
                  onClick={() => onRemoveAttachment(idx)}
                  className="h-6 w-6 rounded p-0"
                >
                  <X className="h-3.5 w-3.5"/>
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex flex-shrink-0 items-center gap-2">
            {/* Attachment Button */}
            <div>
              <Button
                variant="outline"
                size="sm"
                className="h-10 w-10 rounded-full p-0 text-sm sm:h-auto sm:w-auto sm:gap-2 sm:px-4 sm:py-2 sm:text-base"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach files"
              >
                <Plus className="h-5 w-5 sm:hidden"/>
                <FileUp className="hidden h-4 w-4 sm:block"/>
                <span className="hidden sm:inline">Attachment</span>
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={onFileInputChange}
              />
            </div>

            {/* QR Scanner Button - Only on mobile */}
            {onScanQR && (
              <Tooltip content="Scan receipt QR code" side="top">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 w-10 rounded-full p-0 text-sm sm:hidden"
                  onClick={onScanQR}
                  aria-label="Scan QR code"
                >
                  <QrCode className="h-5 w-5"/>
                </Button>
              </Tooltip>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center justify-end gap-1.5 sm:gap-3">
            <Tooltip content="Encrypted by your private wallet" side="top">
              <Toggle
                size="sm"
                className="px-2 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-base [&_.toggle]:h-5 [&_.toggle]:w-9 sm:[&_.toggle]:h-6 sm:[&_.toggle]:w-11 [&_.toggle-indicator]:h-4 [&_.toggle-indicator]:w-4 sm:[&_.toggle-indicator]:h-5 sm:[&_.toggle-indicator]:w-5"
                label={<span className="hidden text-sm sm:inline sm:text-base">Private</span>}
                prefix={<Lock className="h-4 w-4"/>}
                checked={mode === 'private'}
                onCheckedChange={(v: boolean) => onModeChange(v ? 'private' : 'public')}
                aria-label="Toggle private mode"
              />
            </Tooltip>
            <Tooltip content="Priority transaction with higher fees" side="top">
              <Toggle
                size="sm"
                className="px-2 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-base [&_.toggle]:h-5 [&_.toggle]:w-9 sm:[&_.toggle]:h-6 sm:[&_.toggle]:w-11 [&_.toggle-indicator]:h-4 [&_.toggle-indicator]:w-4 sm:[&_.toggle-indicator]:h-5 sm:[&_.toggle-indicator]:w-5"
                label={<span className="hidden text-sm sm:inline sm:text-base">Priority</span>}
                prefix={<Zap className="h-4 w-4"/>}
                checked={isPriority}
                onCheckedChange={onPriorityChange}
                aria-label="Toggle priority mode"
              />
            </Tooltip>
            <Button
              className={`h-10 w-10 flex-shrink-0 rounded-full p-0 transition-all duration-300 ease-out sm:h-auto sm:w-auto sm:p-2 ${
                selectedBytes ? 'primary' : ''
              } ${
                !selectedBytes
                  ? 'scale-90 bg-gray-400 opacity-50 hover:bg-gray-400'
                  : 'scale-100 opacity-100'
              }`}
              disabled={!selectedBytes || saving}
              onClick={onSave}
              aria-label="Save"
            >
              {saving ? (
                <Loader2 className="h-5 w-5 animate-spin"/>
              ) : (
                <ArrowUp className="h-5 w-5" strokeWidth={3}/>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-4 max-w-sm text-center text-xs">
        By uploading, you agree to our{' '}
        <a
          href="/terms"
          className="text-emerald-600 underline hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          Terms of Service
        </a>{' '}
        and{' '}
        <a
          href="/privacy"
          className="text-emerald-600 underline hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          Privacy Policy
        </a>
        .
      </div>
    </div>
  );
}
