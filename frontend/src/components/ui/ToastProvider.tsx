import React from 'react';
import { useToastStore } from '../../store/toastStore';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export function ToastProvider() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={`flex items-start gap-3 px-4 py-3.5 rounded-2xl max-w-sm w-[350px] shadow-[0_20px_50px_-20px_rgba(14,52,69,0.45)] ${
              toast.type === 'error' ? 'bg-clay-wash text-clay' : 'bg-white text-accent-strong'
            }`}
          >
            <div className="mt-0.5 flex-shrink-0">
              {toast.type === 'error' && <AlertCircle size={18} className="text-clay" />}
              {toast.type === 'success' && <CheckCircle size={18} className="text-[#1b566b]" />}
              {toast.type === 'info' && <Info size={18} className="text-accent" />}
            </div>
            
            <p className="text-sm font-medium flex-1 leading-snug">{toast.message}</p>
            
            <button 
              onClick={() => removeToast(toast.id)} 
              className="flex-shrink-0 text-ink-3 hover:text-ink transition-colors"
            >
              <X size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
