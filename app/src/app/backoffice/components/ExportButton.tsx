"use client";

import { useLazyQuery } from "@apollo/client/react";
import { GET_ALL_PROMPTS } from "../queries";
import { escapeCsvField } from "../utils/csvExport";
import type { Prompt } from "../../../../types";

export default function ExportButton() {
  const [fetchAllPrompts, { loading }] = useLazyQuery<{ prompts: Prompt[] }>(GET_ALL_PROMPTS);

  const handleExportCsv = async () => {
    try {
      const result = await fetchAllPrompts();
      const allPrompts = result.data?.prompts;
      if (!allPrompts || allPrompts.length === 0) {
        alert("No prompts to export.");
        return;
      }
      const headers = ["promptId", "conversationId", "promptText", "answerText", "userFeedback", "convoFeedback", "convoFeedbackMessage"];
      const rows = allPrompts.map((p) =>
        [
          String(p.promptId),
          String(p.conversationId),
          escapeCsvField(p.promptText),
          escapeCsvField(p.answerText),
          p.userFeedback === true ? "true" : p.userFeedback === false ? "false" : "",
          p.conversation?.userFeedback === true
            ? "positive"
            : p.conversation?.userFeedback === false
            ? "negative"
            : "",
          escapeCsvField(p.conversation?.userFeedbackMessage ?? ""),
        ].join(",")
      );
      const csv = [headers.join(","), ...rows].join("\n");
      const BOM = "\uFEFF";
      const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "prompts_export.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export prompts.");
    }
  };

  return (
    <div className="mb-4 flex justify-end">
      <button
        onClick={handleExportCsv}
        disabled={loading}
        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
      >
        {loading ? "Exporting..." : "Export to CSV"}
      </button>
    </div>
  );
}
