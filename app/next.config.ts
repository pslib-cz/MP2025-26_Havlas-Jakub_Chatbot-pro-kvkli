import type { NextConfig } from "next";

const nextConfig: NextConfig = {
 reactStrictMode: true,
 output: "standalone",

 // Trust the reverse proxy (Apache) forwarded headers
 serverExternalPackages: ["pino", "pino-pretty"],
 
 // Set workspace root to silence lockfile warning
 outputFileTracingRoot: process.cwd(),

 // Expose /graphql as public alias for /api/graphql
 async rewrites() {
   return [
     {
       source: "/graphql",
       destination: "/api/graphql",
     },
   ];
 },

 // Security & caching headers for all routes
 async headers() {
   return [
     {
       source: "/(.*)",
       headers: [
         { key: "X-Content-Type-Options", value: "nosniff" },
         { key: "X-Frame-Options", value: "DENY" },
         { key: "X-XSS-Protection", value: "1; mode=block" },
         { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
         { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
         { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
       ],
     },
   ];
 },

 poweredByHeader: false,

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
