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
            className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border shadow-xl max-w-sm w-[350px] backdrop-blur-md ${
              toast.type === 'error' ? 'bg-[#1A0A0A]/90 border-[#331111] text-red-200' :
              toast.type === 'success' ? 'bg-[#0A1A10]/90 border-[#11331A] text-green-200' :
              'bg-surface/90 border-line text-ink'
            }`}
          >
            <div className="mt-0.5 flex-shrink-0">
              {toast.type === 'error' && <AlertCircle size={18} className="text-red-600" />}
              {toast.type === 'success' && <CheckCircle size={18} className="text-emerald-700" />}
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
