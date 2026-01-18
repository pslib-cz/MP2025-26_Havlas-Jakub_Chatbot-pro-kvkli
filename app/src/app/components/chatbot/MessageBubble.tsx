"use client";

import Image from "next/image";
import { renderMarkdown } from "./utils";

interface MessageBubbleProps {
  message: string;
  answer?: string;
  onLike: () => void;
  onDislike: () => void;
}

export default function MessageBubble({ message, answer, onLike, onDislike }: MessageBubbleProps) {
  return (
    <div className="space-y-3">
      {/* User message */}
      <div className="flex justify-end">
        <div className="bg-gray-200 text-black max-w-[75%] p-3 rounded-2xl rounded-tr-sm">
          {message}
        </div>
      </div>

      {/* Bot answer */}
      {answer && (
        <div className="flex gap-2 items-start">
          <div className="flex flex-col gap-1 flex-1">
            <div className="bg-[#3d4b6e] text-white max-w-[85%] p-3 rounded-2xl rounded-tl-sm whitespace-pre-wrap">
              {renderMarkdown(answer)}
            </div>
            <div className="flex gap-2 items-center">
              <button onClick={onLike} className="hover:bg-gray-200 p-1 rounded">
                <Image src="/thumbs-up.svg" alt="Like" width={16} height={16} />
              </button>
              <button onClick={onDislike} className="hover:bg-gray-200 p-1 rounded">
                <Image src="/thumbs-down.svg" alt="Dislike" width={16} height={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
