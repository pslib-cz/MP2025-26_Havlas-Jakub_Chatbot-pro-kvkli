"use client";

type PaginationProps = {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

export default function Pagination({ page, totalPages, totalCount, pageSize, onPageChange }: PaginationProps) {
  return (
    <>
      <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
        Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount} prompts
      </p>

      <div className="flex justify-center items-center gap-4 mb-4">
        <button
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-40 text-gray-900 dark:text-gray-100"
        >
          ← Previous
        </button>
        <span className="text-sm text-gray-700 dark:text-gray-300">
          Page {page + 1} of {totalPages || 1}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-40 text-gray-900 dark:text-gray-100"
        >
          Next →
        </button>
      </div>
    </>
  );
}
