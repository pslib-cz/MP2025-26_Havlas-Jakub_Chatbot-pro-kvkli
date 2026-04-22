"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client/react";
import { GET_PAGINATED_PROMPTS, GET_REPORTS, DELETE_PROMPT, DELETE_CONVERSATION, PAGE_SIZE } from "../queries";
import type { PaginatedPromptsData, ReportsData } from "../../../../types";
import CrawlPanel from "../crawlButton";
import ReportsChart from "./ReportsChart";
import Pagination from "./Pagination";
import PromptsTable from "./PromptsTable";
import ExportButton from "./ExportButton";

type BackofficeContentProps = {
  token: string;
  onLogout: () => void;
};

export default function BackofficeContent({ token, onLogout }: BackofficeContentProps) {
  const [page, setPage] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const dateVars = {
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  };

  const { loading, error, data, refetch } = useQuery<PaginatedPromptsData>(
    GET_PAGINATED_PROMPTS,
    { variables: { offset: page * PAGE_SIZE, limit: PAGE_SIZE, ...dateVars } }
  );

  const { data: reportsData, loading: reportsLoading, refetch: refetchReports } = useQuery<ReportsData>(
    GET_REPORTS,
    { variables: dateVars }
  );

  const [deletePrompt] = useMutation<{ deletePrompt: number }, { id: number }>(DELETE_PROMPT);
  const [deleteConversation] = useMutation<{ deleteConversation: number }, { id: number }>(DELETE_CONVERSATION);

  const handleDelete = async (promptId: number) => {
    try {
      await deletePrompt({ variables: { id: promptId } });
      alert(`Prompt ${promptId} deleted successfully.`);
      refetch();
      refetchReports();
    } catch (err) {
      console.error("Error deleting prompt:", err);
      alert(`Failed to delete prompt ${promptId}.`);
    }
  };

  const handleDeleteConversation = async (conversationId: number) => {
    try {
      await deleteConversation({ variables: { id: conversationId } });
      alert(`Conversation ${conversationId} deleted successfully.`);
      refetch();
      refetchReports();
    } catch (err) {
      console.error("Error deleting conversation:", err);
      alert(`Failed to delete conversation ${conversationId}.`);
    }
  };

  if (loading) return <p className="p-4 text-gray-500 dark:text-gray-400">Loading...</p>;
  if (error) return <p className="p-4 text-red-500 dark:text-red-400">Error loading prompts</p>;

  const prompts = data?.paginatedPrompts.prompts ?? [];
  const totalCount = data?.paginatedPrompts.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">All Prompts</h1>
        <button onClick={onLogout} className="text-sm text-gray-500 hover:text-red-500 underline">
          Logout
        </button>
      </div>

      <CrawlPanel />
      <ExportButton />

      <div className="flex flex-wrap items-end gap-4 mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
            className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
            className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(""); setDateTo(""); setPage(0); }}
            className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium px-3 py-1.5"
          >
            Clear dates
          </button>
        )}
      </div>

      <ReportsChart reportsData={reportsData} loading={reportsLoading} />
      <Pagination
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
      <PromptsTable prompts={prompts} onDelete={handleDelete} onDeleteConversation={handleDeleteConversation} />
    </div>
  );
}
