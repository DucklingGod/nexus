import { useState, useEffect, useCallback } from 'react';
import type { ErrorType } from '../../lib/errorHandler';

interface ErrorToastProps {
  type: ErrorType;
  message: string;
  onRetry?: () => void;
  onDismiss: () => void;
}

const TYPE_STYLES: Record<ErrorType, { border: string; bg: string; icon: string; accent: string }> = {
  network: {
    border: 'border-yellow-900/40',
    bg: 'bg-yellow-950/30',
    icon: '⚡',
    accent: 'text-yellow-400',
  },
  'api-key': {
    border: 'border-red-900/40',
    bg: 'bg-red-950/30',
    icon: '🔑',
    accent: 'text-red-400',
  },
  tool: {
    border: 'border-orange-900/40',
    bg: 'bg-orange-950/30',
    icon: '🔧',
    accent: 'text-orange-400',
  },
  generic: {
    border: 'border-red-900/40',
    bg: 'bg-red-950/30',
    icon: '⚠',
    accent: 'text-red-400',
  },
};

export function ErrorToast({ type, message, onRetry, onDismiss }: ErrorToastProps) {
  const [visible, setVisible] = useState(true);
  const style = TYPE_STYLES[type];

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(onDismiss, 200);
  }, [onDismiss]);

  useEffect(() => {
    const timer = setTimeout(handleDismiss, 5000);
    return () => clearTimeout(timer);
  }, [handleDismiss]);

  if (!visible) return null;

  return (
    <div
      className={`mx-6 mb-2 flex items-start gap-3 rounded-lg border ${style.border} ${style.bg} px-3 py-2.5 text-[11px] transition-opacity ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <span className="mt-0.5 flex-shrink-0">{style.icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`font-medium ${style.accent}`}>{message}</p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {onRetry && (
          <button
            onClick={onRetry}
            className={`rounded px-2 py-0.5 text-[10px] font-medium ${style.accent} border ${style.border} hover:bg-white/5 transition`}
          >
            Retry
          </button>
        )}
        <button
          onClick={handleDismiss}
          className="rounded p-0.5 text-nexus-muted/40 hover:text-nexus-muted transition"
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <path d="M4 12l8-8M12 12l-8-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
