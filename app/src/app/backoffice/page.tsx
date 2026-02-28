"use client";

import { useState, useEffect } from "react";
import { gql, ApolloClient, InMemoryCache, createHttpLink } from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { useQuery, useMutation, useLazyQuery, ApolloProvider } from "@apollo/client/react";
import { PieChart, Pie, Cell, Legend, Tooltip } from "recharts";
import CrawlPanel from "./crawlButton";

const PAGE_SIZE = 50;

const LOGIN = gql`
  mutation Login($username: String!, $password: String!) {
    login(username: $username, password: $password) {
      token
    }
  }
`;

const GET_PAGINATED_PROMPTS = gql`
  query GetPaginatedPrompts($offset: Int!, $limit: Int!) {
    paginatedPrompts(offset: $offset, limit: $limit) {
      prompts {
        conversationId
        promptId
        promptText
        answerText
        userFeedback
      }
      totalCount
    }
  }
`;

const GET_ALL_PROMPTS = gql`
  query GetAllPrompts {
    prompts {
      conversationId
      promptId
      promptText
      answerText
      userFeedback
    }
  }
`;

const GET_REPORTS = gql`
  query GetReports {
    reports {
      positive
      negative
      noFeedback
      total
    }
  }
`;

const DELETE_PROMPT = gql`
  mutation DeletePrompt($id: ID!) {
    deletePrompt(id: $id)
  }
`;

type Prompt = {
  promptId: number;
  conversationId: number;
  promptText: string;
  answerText: string;
  userFeedback: boolean | null;
};

type PaginatedPromptsData = {
  paginatedPrompts: {
    prompts: Prompt[];
    totalCount: number;
  };
};

type ReportsData = {
  reports: {
    positive: number;
    negative: number;
    noFeedback: number;
    total: number;
  };
};

function stripMarkdown(text: string): string {
  return text
    // Remove markdown links: **[text](url)** → text (url)
    .replace(/\*\*\[([^\]]*)\]\(([^)]*)\)\*\*/g, "$1 ($2)")
    // Remove remaining markdown links: [text](url) → text (url)
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, "$1 ($2)")
    // Remove bold: **text** → text
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    // Remove italic: *text* → text
    .replace(/\*([^*]*)\*/g, "$1")
    // Remove heading markers
    .replace(/^#{1,6}\s+/gm, "")
    // Normalize bullet points
    .replace(/^[-•]\s*/gm, "- ")
    // Collapse multiple newlines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeCsvField(field: string): string {
  // Strip markdown formatting for cleaner CSV
  let cleaned = stripMarkdown(field);
  // Replace newlines with a space for single-line CSV cells
  cleaned = cleaned.replace(/\r?\n/g, " ").replace(/\s{2,}/g, " ");
  // Escape double quotes and wrap if needed
  if (cleaned.includes(",") || cleaned.includes('"') || cleaned.includes(";")) {
    return `"${cleaned.replace(/"/g, '""')}"`;
  }
  return cleaned;
}

function createAuthClient(token: string) {
  const httpLink = createHttpLink({ uri: "/api/graphql" });
  const authLink = setContext((_, { headers }) => ({
    headers: {
      ...headers,
      authorization: `Bearer ${token}`,
    },
  }));
  return new ApolloClient({
    link: authLink.concat(httpLink),
    cache: new InMemoryCache(),
  });
}

function BackofficeContent({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [page, setPage] = useState(0);

  const { loading, error, data, refetch } = useQuery<PaginatedPromptsData>(
    GET_PAGINATED_PROMPTS,
    { variables: { offset: page * PAGE_SIZE, limit: PAGE_SIZE } }
  );

  const { data: reportsData, loading: reportsLoading, refetch: refetchReports } = useQuery<ReportsData>(GET_REPORTS);

  const [fetchAllPrompts, { loading: exportLoading }] = useLazyQuery<{
    prompts: Prompt[];
  }>(GET_ALL_PROMPTS);

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

  const handleExportCsv = async () => {
    try {
      const result = await fetchAllPrompts();
      const allPrompts = result.data?.prompts;
      if (!allPrompts || allPrompts.length === 0) {
        alert("No prompts to export.");
        return;
      }
      const headers = ["promptId", "conversationId", "promptText", "answerText", "userFeedback"];
      const rows = allPrompts.map((p) =>
        [
          String(p.promptId),
          String(p.conversationId),
          escapeCsvField(p.promptText),
          escapeCsvField(p.answerText),
          p.userFeedback === true ? "true" : p.userFeedback === false ? "false" : "",
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

  if (loading) return <p className="p-4 text-gray-500 dark:text-gray-400">Loading...</p>;
  if (error) return <p className="p-4 text-red-500 dark:text-red-400">Error loading prompts</p>;

  const prompts = data?.paginatedPrompts.prompts ?? [];
  const totalCount = data?.paginatedPrompts.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const pieData = reportsData
    ? [
        { name: "👍 Positive", value: reportsData.reports.positive, color: "#16a34a" },
        { name: "👎 Negative", value: reportsData.reports.negative, color: "#dc2626" },
        { name: "❓ No feedback", value: reportsData.reports.noFeedback, color: "#6b7280" },
      ]
    : [];

  return (
    <div className="p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">All Prompts</h1>
        <button onClick={onLogout} className="text-sm text-gray-500 hover:text-red-500 underline">
          Logout
        </button>
      </div>
      <CrawlPanel />

      <div className="mb-4 flex justify-end">
        <button
          onClick={handleExportCsv}
          disabled={exportLoading}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
        >
          {exportLoading ? "Exporting..." : "Export to CSV"}
        </button>
      </div>

      <div className="mb-8 flex justify-center">
        {reportsLoading ? (
          <p className="text-gray-500 dark:text-gray-400">Loading reports...</p>
        ) : (
          <div className="text-center">
            <PieChart width={300} height={300}>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`}>
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
            {reportsData && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                Total prompts: {reportsData.reports.total}
              </p>
            )}
          </div>
        )}
      </div>

      <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
        Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount} prompts
      </p>

      <div className="flex justify-center items-center gap-4 mb-4">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-40 text-gray-900 dark:text-gray-100"
        >
          ← Previous
        </button>
        <span className="text-sm text-gray-700 dark:text-gray-300">
          Page {page + 1} of {totalPages || 1}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          disabled={page >= totalPages - 1}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-40 text-gray-900 dark:text-gray-100"
        >
          Next →
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-200 dark:border-gray-700 rounded-lg">
          <thead className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100">
            <tr>
              <th className="py-2 px-4 border-b">ID</th>
              <th className="py-2 px-4 border-b">Conversation</th>
              <th className="py-2 px-4 border-b">Prompt Text</th>
              <th className="py-2 px-4 border-b">Answer Text</th>
              <th className="py-2 px-4 border-b">User Feedback</th>
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
                  <button className="text-blue-600 hover:underline" onClick={() => handleDelete(prompt.promptId)}>
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

export default function PromptsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [authClient, setAuthClient] = useState<InstanceType<typeof ApolloClient> | null>(null);

  // Check for existing token in sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem("backoffice_token");
    if (stored) {
      setToken(stored);
      setAuthClient(createAuthClient(stored));
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setAuthError("");

    try {
      const httpLink = createHttpLink({ uri: "/api/graphql" });
      const tempClient = new ApolloClient({
        link: httpLink,
        cache: new InMemoryCache(),
      });

      const { data } = await tempClient.mutate<{ login: { token: string } }>({
        mutation: LOGIN,
        variables: { username, password },
      });

      if (data?.login.token) {
        const t = data.login.token;
        sessionStorage.setItem("backoffice_token", t);
        setToken(t);
        setAuthClient(createAuthClient(t));
      }
    } catch {
      setAuthError("Invalid username or password.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("backoffice_token");
    setToken(null);
    setAuthClient(null);
  };

  if (!token || !authClient) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <form onSubmit={handleLogin} className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-md w-full max-w-sm">
          <h1 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">Backoffice Login</h1>
          {authError && <p className="text-red-500 mb-3 text-sm">{authError}</p>}
          <label className="block mb-2 text-sm text-gray-700 dark:text-gray-300">
            Username
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
          </label>
          <label className="block mb-4 text-sm text-gray-700 dark:text-gray-300">
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
          </label>
          <button type="submit" disabled={loginLoading} className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50">
            {loginLoading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <ApolloProvider client={authClient}>
      <BackofficeContent token={token} onLogout={handleLogout} />
    </ApolloProvider>
  );
}
