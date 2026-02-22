"use client";

import React, { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";

const parseMarkdownLinks = (text: string): React.ReactNode => {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.substring(lastIndex, match.index));
        }
        parts.push(
            <a key={match.index} href={match[2]} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                {match[1]}
            </a>
        );
        lastIndex = linkRegex.lastIndex;
    }

    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
};

interface MessageBubbleProps {
    message: string;
    answer?: string;
    onLike: () => void;
    onDislike: () => void;
    showFeedbackAnimation?: boolean;
}

export default function MessageBubble({
    message,
    answer,
    onLike,
    onDislike,
    showFeedbackAnimation = false,
}: MessageBubbleProps) {
    const [clickedButton, setClickedButton] = useState<'like' | 'dislike' | null>(null);

    const handleLike = () => {
        setClickedButton('like');
        onLike();
        setTimeout(() => setClickedButton(null), 300);
    };

    const handleDislike = () => {
        setClickedButton('dislike');
        onDislike();
        setTimeout(() => setClickedButton(null), 300);
    };

    return (
        <>
            {/* User message */}
            <div className="flex justify-end">
                <div className="bg-[#3d4b6e] text-white px-4 py-2 rounded-2xl rounded-tr-none max-w-[80%]">
                    {message}
                </div>
            </div>

            {/* Bot answer */}
            {answer && (
                <div className="flex gap-2 items-start justify-start mb-2">
                    <div className="bg-white text-gray-800 rounded-lg p-3 max-w-xs shadow-sm">
                        {parseMarkdownLinks(answer)}

                        <div className="flex gap-2 mt-2">
                            <button
                                onClick={handleLike}
                                className={`text-gray-500 hover:text-green-600 transition-all ${
                                    clickedButton === 'like' ? 'animate-pulse shadow-lg scale-110' : ''
                                }`}
                                aria-label="Like"
                            >
                                <ThumbsUp size={16} />
                            </button>
                            <button
                                onClick={handleDislike}
                                className={`text-gray-500 hover:text-red-600 transition-all ${
                                    clickedButton === 'dislike' ? 'animate-pulse shadow-lg scale-110' : ''
                                }`}
                                aria-label="Dislike"
                            >
                                <ThumbsDown size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
