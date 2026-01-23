"use client";

import React from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";

interface MessageBubbleProps {
    message: string;
    answer?: string;
    onLike: () => void;
    onDislike: () => void;
}

function parseMarkdownLinks(text: string): React.ReactElement[] {
    const parts: React.ReactElement[] = [];
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = linkRegex.exec(text)) !== null) {
        // Add text before the link
        if (match.index > lastIndex) {
            parts.push(
                <span key={`text-${key++}`}>
                    {text.substring(lastIndex, match.index)}
                </span>
            );
        }

        // Add the link
        const linkText = match[1];
        const url = match[2];
        parts.push(
            <a
                key={`link-${key++}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:text-gray-200 underline"
            >
                {linkText}
            </a>
        );

        lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
        parts.push(
            <span key={`text-${key++}`}>
                {text.substring(lastIndex)}
            </span>
        );
    }

    return parts.length > 0 ? parts : [<span key="text-0">{text}</span>];
}

export default function MessageBubble({
    message,
    answer,
    onLike,
    onDislike,
}: MessageBubbleProps) {
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
                <div className="flex flex-col gap-2">
                    <div className="bg-[#3d4b6e] text-white px-4 py-2 rounded-2xl rounded-tl-none max-w-[80%] shadow-sm whitespace-pre-wrap">
                        {parseMarkdownLinks(answer)}
                    </div>
                    <div className="flex gap-2 ml-2">
                        <button
                            onClick={onLike}
                            className="p-1 hover:bg-gray-200 rounded-full transition-colors"
                            aria-label="Like"
                        >
                            <ThumbsUp size={16} className="text-gray-500" />
                        </button>
                        <button
                            onClick={onDislike}
                            className="p-1 hover:bg-gray-200 rounded-full transition-colors"
                            aria-label="Dislike"
                        >
                            <ThumbsDown size={16} className="text-gray-500" />
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
