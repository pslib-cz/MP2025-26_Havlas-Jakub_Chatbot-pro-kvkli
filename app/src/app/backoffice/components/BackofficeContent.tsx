"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client/react";
import { GET_PAGINATED_PROMPTS, GET_REPORTS, DELETE_PROMPT, PAGE_SIZE } from "../queries";
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

  const { loading, error, data, refetch } = useQuery<PaginatedPromptsData>(
    GET_PAGINATED_PROMPTS,
    { variables: { offset: page * PAGE_SIZE, limit: PAGE_SIZE } }
  );

  const { data: reportsData, loading: reportsLoading, refetch: refetchReports } = useQuery<ReportsData>(GET_REPORTS);

  const [deletePrompt] = useMutation<{ deletePrompt: number }, { id: number }>(DELETE_PROMPT);

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
      <ReportsChart reportsData={reportsData} loading={reportsLoading} />
      <Pagination
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
      <PromptsTable prompts={prompts} onDelete={handleDelete} />
    </div>
  );
}
