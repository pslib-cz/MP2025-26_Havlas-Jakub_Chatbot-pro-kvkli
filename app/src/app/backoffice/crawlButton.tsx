"use client";
import { gql } from "@apollo/client";
import { useMutation, useQuery } from "@apollo/client/react";
import { useEffect, useState } from "react";

interface CrawlWebsiteResponse {
  crawlWebsite: {
    success: boolean;
    message: string;
    pagesCount: number;
    outputFile: string;
  };
}

interface CrawlProgressResponse {
  crawlProgress: {
    status: string;
    phase: string;
    pagesVisited: number;
    pagesInQueue: number;
    totalPages: number;
    chunksCreated: number;
    chunksToAdd: number;
    chunksToRemove: number;
    currentUrl: string | null;
    startTime: number | null;
    endTime: number | null;
    error: string | null;
    embeddingsGenerated: number;
    embeddingsTotal: number;
    chunksAddedToDB: number;
    chunksRemovedFromDB: number;
  };
}

const CRAWL_WEBSITE = gql`
  mutation CrawlWebsite($url: String) {
    crawlWebsite(url: $url) {
      success
      message
      pagesCount
      outputFile
    }
  }
`;

const GET_CRAWL_PROGRESS = gql`
  query GetCrawlProgress {
    crawlProgress {
      status
      phase
      pagesVisited
      pagesInQueue
      totalPages
      chunksCreated
      chunksToAdd
      chunksToRemove
      currentUrl
      startTime
      endTime
      error
      embeddingsGenerated
      embeddingsTotal
      chunksAddedToDB
      chunksRemovedFromDB
    }
  }
`;

const STOP_CRAWL = gql`
  mutation StopCrawl {
    stopCrawl
  }
`;

function CrawlPanel(): React.ReactElement {
  const [crawlWebsite, { data, loading, error }] = useMutation<CrawlWebsiteResponse>(CRAWL_WEBSITE);
  const [stopCrawlMutation] = useMutation(STOP_CRAWL);
  const [isMonitoring, setIsMonitoring] = useState(false);
  
  const { data: progressData, startPolling, stopPolling } = useQuery<CrawlProgressResponse>(GET_CRAWL_PROGRESS, {
    skip: !isMonitoring,
    pollInterval: isMonitoring ? 2000 : undefined,
    fetchPolicy: 'network-only', // Always fetch fresh data
  });

  const progress = progressData?.crawlProgress;

  useEffect(() => {
    if (progress?.status === 'completed' || progress?.status === 'error') {
      stopPolling();
      setIsMonitoring(false);
    }
  }, [progress?.status, stopPolling]);

  const handleCrawl = async () => {
    try {
      console.log("🚀 Starting crawl mutation...");
      await crawlWebsite({
        variables: { url: "https://www.kvkli.cz" }
      });
      console.log("✅ Crawl mutation initiated");
      // Only start monitoring after mutation succeeds
      setIsMonitoring(true);
      startPolling(2000);
    } catch (err) {
      console.error("❌ Failed to start crawl:", err);
    }
  };

  const handleStop = async () => {
    await stopCrawlMutation();
    stopPolling();
    setIsMonitoring(false);
  };

  const percentage = progress ? Math.round((progress.pagesVisited / progress.totalPages) * 100) : 0;
  const embeddingPercentage = progress?.embeddingsTotal > 0 
    ? Math.round((progress.embeddingsGenerated / progress.embeddingsTotal) * 100) 
    : 0;
  const dbPercentage = progress?.chunksToAdd > 0 
    ? Math.round((progress.chunksAddedToDB / progress.chunksToAdd) * 100) 
    : 0;
  const isRunning = progress?.status === 'running';
  
  // Get phase display info
  const getPhaseInfo = (phase: string) => {
    switch (phase) {
      case 'crawling': return { label: '🕷️ Crawling website', color: 'blue' };
      case 'chunking': return { label: '📦 Creating chunks', color: 'purple' };
      case 'diffing': return { label: '🔍 Analyzing changes', color: 'yellow' };
      case 'updating': return { label: '💾 Updating database', color: 'green' };
      case 'completed': return { label: '✅ Completed', color: 'green' };
      case 'error': return { label: '❌ Error', color: 'red' };
      default: return { label: '⏳ Idle', color: 'gray' };
    }
  };
  
  const phaseInfo = progress ? getPhaseInfo(progress.phase) : { label: '⏳ Idle', color: 'gray' };

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex gap-3">
        <button
          disabled={loading || isRunning}
          onClick={handleCrawl}
          className="px-6 py-3 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isRunning ? "Crawling..." : "Start Crawl"}
        </button>

        {isRunning && (
          <button
            onClick={handleStop}
            className="px-6 py-3 bg-red-600 dark:bg-red-500 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-600 transition-colors font-medium"
          >
            Stop & Discard
          </button>
        )}
      </div>

      {isRunning && progress && (
        <div className="mt-6 p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex justify-between items-center mb-3">
            <span className="text-lg font-semibold text-blue-900 dark:text-blue-100">
              {phaseInfo.label}
            </span>
            <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
              {progress.phase === 'crawling' && `${progress.pagesVisited} / ${progress.totalPages} pages`}
              {progress.phase === 'chunking' && progress.chunksCreated > 0 && `${progress.chunksCreated} chunks created`}
              {progress.phase === 'diffing' && 'Analyzing...'}
              {progress.phase === 'updating' && progress.chunksToAdd > 0 && `Processing ${progress.chunksToAdd} chunks`}
            </span>
          </div>
          
          {progress.phase === 'crawling' && (
            <>
              <div className="w-full bg-blue-200 dark:bg-blue-950 rounded-full h-6 mb-4 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-400 dark:to-blue-500 h-6 rounded-full transition-all duration-500 ease-out flex items-center justify-end pr-2"
                  style={{ width: `${percentage}%` }}
                >
                  {percentage > 10 && (
                    <span className="text-xs font-bold text-white drop-shadow">
                      {percentage}%
                    </span>
                  )}
                </div>
              </div>
            </>
          )}

          {progress.phase === 'updating' && progress.embeddingsTotal > 0 && (
            <div className="space-y-3 mb-4">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">🔮 Generating Embeddings</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">{progress.embeddingsGenerated} / {progress.embeddingsTotal}</span>
                </div>
                <div className="w-full bg-purple-200 dark:bg-purple-950 rounded-full h-5 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-purple-500 to-purple-600 dark:from-purple-400 dark:to-purple-500 h-5 rounded-full transition-all duration-500 ease-out flex items-center justify-end pr-2"
                    style={{ width: `${embeddingPercentage}%` }}
                  >
                    {embeddingPercentage > 10 && (
                      <span className="text-xs font-bold text-white drop-shadow">
                        {embeddingPercentage}%
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {progress.chunksToAdd > 0 && (
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">💾 Adding to ChromaDB</span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">{progress.chunksAddedToDB} / {progress.chunksToAdd}</span>
                  </div>
                  <div className="w-full bg-green-200 dark:bg-green-950 rounded-full h-5 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-green-500 to-green-600 dark:from-green-400 dark:to-green-500 h-5 rounded-full transition-all duration-500 ease-out flex items-center justify-end pr-2"
                      style={{ width: `${dbPercentage}%` }}
                    >
                      {dbPercentage > 10 && (
                        <span className="text-xs font-bold text-white drop-shadow">
                          {dbPercentage}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          
          <div className="space-y-2 text-sm">
            {progress.phase === 'crawling' && (
              <div className="flex justify-between">
                <span className="text-gray-700 dark:text-gray-300 font-medium">Queue:</span>
                <span className="text-gray-900 dark:text-gray-100">{progress.pagesInQueue} pages</span>
              </div>
            )}
            
            {progress.phase !== 'crawling' && progress.chunksCreated > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-700 dark:text-gray-300 font-medium">Total chunks:</span>
                <span className="text-gray-900 dark:text-gray-100">{progress.chunksCreated}</span>
              </div>
            )}
            
            {(progress.phase === 'diffing' || progress.phase === 'updating') && (
              <>
                {progress.chunksToAdd > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-700 dark:text-gray-300 font-medium">To add:</span>
                    <span className="text-green-600 dark:text-green-400 font-semibold">+{progress.chunksToAdd}</span>
                  </div>
                )}
                {progress.chunksToRemove > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-700 dark:text-gray-300 font-medium">To remove:</span>
                    <span className="text-red-600 dark:text-red-400 font-semibold">-{progress.chunksToRemove}</span>
                  </div>
                )}
                {progress.chunksRemovedFromDB > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-700 dark:text-gray-300 font-medium">Removed from DB:</span>
                    <span className="text-orange-600 dark:text-orange-400 font-semibold">{progress.chunksRemovedFromDB}</span>
                  </div>
                )}
              </>
            )}
            
            {progress.currentUrl && (
              <div className="flex flex-col gap-1">
                <span className="text-gray-700 dark:text-gray-300 font-medium">Current URL:</span>
                <span className="text-gray-600 dark:text-gray-400 truncate text-xs bg-white dark:bg-gray-800 px-2 py-1 rounded">
                  {progress.currentUrl}
                </span>
              </div>
            )}
            
            {progress.startTime && (
              <div className="flex justify-between">
                <span className="text-gray-700 dark:text-gray-300 font-medium">Elapsed:</span>
                <span className="text-gray-900 dark:text-gray-100 font-mono">
                  {Math.floor((Date.now() - progress.startTime) / 60000)}m {Math.floor(((Date.now() - progress.startTime) % 60000) / 1000)}s
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {progress?.status === 'completed' && (
        <div className="mt-6 p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <h3 className="text-xl font-bold text-green-800 dark:text-green-200 flex items-center gap-2">
            <span className="text-2xl">✓</span> Crawl Completed!
          </h3>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-green-700 dark:text-green-300 font-medium">Pages crawled:</span>
              <span className="text-green-900 dark:text-green-100 font-semibold">{progress.pagesVisited}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-green-700 dark:text-green-300 font-medium">Chunks added:</span>
              <span className="text-green-900 dark:text-green-100 font-semibold">{progress.chunksAddedToDB}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-green-700 dark:text-green-300 font-medium">Chunks removed:</span>
              <span className="text-green-900 dark:text-green-100 font-semibold">{progress.chunksRemovedFromDB}</span>
            </div>
            {progress.startTime && progress.endTime && (
              <div className="flex justify-between">
                <span className="text-green-700 dark:text-green-300 font-medium">Duration:</span>
                <span className="text-green-900 dark:text-green-100 font-mono">
                  {Math.floor((progress.endTime - progress.startTime) / 60000)}m {Math.floor(((progress.endTime - progress.startTime) % 60000) / 1000)}s
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {(error || progress?.error) && (
        <div className="mt-6 p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <h3 className="text-lg font-bold text-red-800 dark:text-red-200 mb-2">Error</h3>
          <p className="text-red-700 dark:text-red-300">{error?.message || progress?.error}</p>
        </div>
      )}

      {data?.crawlWebsite && !isRunning && (
        <div className="mt-6 p-6 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Response:</h3>
          <p className="text-gray-700 dark:text-gray-300">{data.crawlWebsite.message}</p>
        </div>
      )}
    </div>
  );
}

export default CrawlPanel;
