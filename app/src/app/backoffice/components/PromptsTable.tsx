"use client";

import type { Prompt } from "../../../../types";

type PromptsTableProps = {
  prompts: Prompt[];
  onDelete: (promptId: number) => void;
};

export default function PromptsTable({ prompts, onDelete }: PromptsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border border-gray-200 dark:border-gray-700 rounded-lg">
        <thead className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100">
          <tr>
            <th className="py-2 px-4 border-b">ID</th>
            <th className="py-2 px-4 border-b">Conversation</th>
            <th className="py-2 px-4 border-b">Prompt Text</th>
            <th className="py-2 px-4 border-b">Answer Text</th>
            <th className="py-2 px-4 border-b">User Feedback</th>
            <th className="py-2 px-4 border-b">Convo Feedback</th>
            <th className="py-2 px-4 border-b">Convo Message</th>
            <th className="py-2 px-4 border-b">Actions</th>
          </tr>
        </thead>
        <tbody className="text-gray-900 dark:text-gray-100">
          {prompts.map((prompt) => (
            <tr key={prompt.promptId} className="hover:bg-gray-50 dark:hover:bg-gray-700">
              <td className="py-2 px-4 border-b">{prompt.promptId}</td>
              <td className="py-2 px-4 border-b">{prompt.conversationId}</td>
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
  );
}
