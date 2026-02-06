import type { NextConfig } from "next";

const nextConfig: NextConfig = {
 reactStrictMode: true,
 
 // Set workspace root to silence lockfile warning
 outputFileTracingRoot: 'C:\\Users\\Kuba\\Documents\\repos\\MP2025-26_Havlas-Jakub_Chatbot-pro-kvkli\\app',
 
 // Exclude large files from serverless functions
 outputFileTracingExcludes: {
   '*': [
     './node_modules/onnxruntime-node/**/*',
     './node_modules/@img/**/*', 
     './node_modules/@huggingface/**/*',
     './node_modules/sharp/**/*',
     './crawler-output/**/*',
     './chroma_db/**/*',
     './model/**/*',
     './tests/**/*',
     './coverage/**/*',
     './public/*.json',
   ],
 },

 // Only include essential files for API routes
 outputFileTracingIncludes: {
   '/api/**/*': [
     './generated/prisma/schema.prisma',
     './generated/prisma/libquery_engine*',
     './generated/prisma/query_engine*',
   ],
 },
 
 webpack: (config, { isServer }) => {
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      '@yaacovcr/transform': false,
    };
    
    // Exclude heavy dependencies from bundles
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'onnxruntime-node': false,
        '@img/sharp': false,
        'sharp': false,
      };
    }
    
    // Externalize heavy dependencies in server build
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        'onnxruntime-node': 'commonjs onnxruntime-node',
        'sharp': 'commonjs sharp',
      });
    }
    
    return config;
  },

};

export default nextConfig;
