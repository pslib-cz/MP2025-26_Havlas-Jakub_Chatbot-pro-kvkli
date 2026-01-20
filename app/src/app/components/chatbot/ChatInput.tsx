"use client";

import { Send } from "lucide-react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
}

export default function ChatInput({ value, onChange, onSend }: ChatInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="flex items-center p-3 bg-[#3d4b6e] gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Sem můžete psát..."
        className="flex-1 p-3 rounded-full bg-[#4a5a7f] text-white placeholder-gray-300 border-none outline-none"
      />
      <button
        onClick={onSend}
        className="bg-[#4a5a7f] text-white p-3 rounded-full hover:bg-[#5a6a8f]"
      >
        <Send size={20} />
      </button>
    </div>
  );
}
