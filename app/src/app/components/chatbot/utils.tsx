import React from "react";

export function renderMarkdown(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const content = part.slice(2, -2);
      return (
        <strong key={index} className="font-bold text-lg">
          {content}
        </strong>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export const WAITING_MESSAGES = [
  "Už vařím",
  "Chvilku strpení, prosím",
  "Hledám nejlepší odpověď"
];
