"use client";

import { useMemo, useState } from "react";
import type { Prompt } from "../../../../types";

type PromptsTableProps = {
  prompts: Prompt[];
  onDelete: (promptId: number) => void;
  onDeleteConversation: (conversationId: number) => void;
};

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PromptsTable({ prompts, onDelete, onDeleteConversation }: PromptsTableProps) {
  const [filterConversationId, setFilterConversationId] = useState<number | null>(null);

  const conversationIds = useMemo(() => {
    const ids = [...new Set(prompts.map((p) => p.conversationId))];
    ids.sort((a, b) => b - a);
    return ids;
  }, [prompts]);

  const filteredPrompts = useMemo(() => {
    if (filterConversationId === null) return prompts;
    return prompts.filter((p) => p.conversationId === filterConversationId);
  }, [prompts, filterConversationId]);

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Filter by Conversation:
        </label>
        <select
          value={filterConversationId ?? ""}
          onChange={(e) =>
            setFilterConversationId(e.target.value === "" ? null : Number(e.target.value))
          }
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        >
          <option value="">All conversations</option>
          {conversationIds.map((id) => (
            <option key={id} value={id}>
              Conversation #{id}
            </option>
          ))}
        </select>
        {filterConversationId !== null && (
          <button
            onClick={() => {
              if (confirm(`Delete entire conversation #${filterConversationId} and all its prompts?`)) {
                onDeleteConversation(filterConversationId);
                setFilterConversationId(null);
              }
            }}
            className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium"
          >
            Delete Conversation #{filterConversationId}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-200 dark:border-gray-700 rounded-lg">
          <thead className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100">
            <tr>
              <th className="py-2 px-4 border-b">ID</th>
              <th className="py-2 px-4 border-b">Conversation</th>
              <th className="py-2 px-4 border-b">Created At</th>
              <th className="py-2 px-4 border-b">Prompt Text</th>
              <th className="py-2 px-4 border-b">Answer Text</th>
              <th className="py-2 px-4 border-b">User Feedback</th>
              <th className="py-2 px-4 border-b">Convo Feedback</th>
              <th className="py-2 px-4 border-b">Convo Message</th>
              <th className="py-2 px-4 border-b">Actions</th>
            </tr>
          </thead>
          <tbody className="text-gray-900 dark:text-gray-100">
            {filteredPrompts.map((prompt) => (
              <tr key={prompt.promptId} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="py-2 px-4 border-b">{prompt.promptId}</td>
                <td className="py-2 px-4 border-b">{prompt.conversationId}</td>
                <td className="py-2 px-4 border-b whitespace-nowrap">{formatDate(prompt.createdAt)}</td>
                <td className="py-2 px-4 border-b">{prompt.promptText}</td>
                <td className="py-2 px-4 border-b">{prompt.answerText}</td>
                <td className="py-2 px-4 border-b">
                  {prompt.userFeedback === true ? "👍" : prompt.userFeedback === false ? "👎" : "❓"}
                </td>
                <td className="py-2 px-4 border-b">
                  {prompt.conversation?.userFeedback === true
                    ? "👍"
                    : prompt.conversation?.userFeedback === false
                    ? "👎"
                    : "—"}
                </td>
                <td className="py-2 px-4 border-b max-w-xs truncate" title={prompt.conversation?.userFeedbackMessage ?? ""}>
                  {prompt.conversation?.userFeedbackMessage || "—"}
                </td>
                <td className="py-2 px-4 border-b">
                  <button className="text-blue-600 hover:underline" onClick={() => onDelete(prompt.promptId)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
