import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';

export default function Toast({ message, onDismiss, duration = 1800 }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => onDismiss?.(), duration);
    return () => clearTimeout(t);
  }, [message, duration, onDismiss]);

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-panel px-4 py-2 text-[13px] text-stone-100 shadow-soft"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
