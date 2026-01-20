"use client";

import { motion, AnimatePresence } from "framer-motion";
import { WAITING_MESSAGES } from "./utils";

function AnimatedDots() {
  return (
    <div className="flex gap-1 items-center">
      <motion.div
        className="w-2 h-2 bg-white rounded-full"
        animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
        transition={{ duration: 0.8, repeat: Infinity, delay: 0 }}
      />
      <motion.div
        className="w-2 h-2 bg-white rounded-full"
        animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
        transition={{ duration: 0.8, repeat: Infinity, delay: 0.2 }}
      />
      <motion.div
        className="w-2 h-2 bg-white rounded-full"
        animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
        transition={{ duration: 0.8, repeat: Infinity, delay: 0.4 }}
      />
    </div>
  );
}

interface LoadingIndicatorProps {
  messageIndex: number;
}

export default function LoadingIndicator({ messageIndex }: LoadingIndicatorProps) {
  return (
    <div className="flex gap-2 items-center">
      <div className="bg-[#3d4b6e] text-white p-3 rounded-full">
        <AnimatedDots />
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={messageIndex}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="text-gray-500 italic max-w-[85%] p-3 whitespace-pre-wrap"
        >
          {WAITING_MESSAGES[messageIndex]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
