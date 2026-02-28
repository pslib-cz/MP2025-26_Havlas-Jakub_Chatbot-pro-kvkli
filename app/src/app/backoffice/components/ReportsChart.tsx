"use client";

import { PieChart, Pie, Cell, Legend, Tooltip } from "recharts";
import type { ReportsData } from "../../../../types";

type ReportsChartProps = {
  reportsData: ReportsData | undefined;
  loading: boolean;
};

export default function ReportsChart({ reportsData, loading }: ReportsChartProps) {
  const pieData = reportsData
    ? [
        { name: "👍 Positive", value: reportsData.reports.positive, color: "#16a34a" },
        { name: "👎 Negative", value: reportsData.reports.negative, color: "#dc2626" },
        { name: "❓ No feedback", value: reportsData.reports.noFeedback, color: "#6b7280" },
      ]
    : [];

  return (
    <div className="mb-8 flex justify-center">
      {loading ? (
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
  );
}
