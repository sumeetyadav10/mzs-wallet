/** @type {import('next').NextConfig} */
const nextConfig = {
  // Generate consistent build IDs for load balancer environments
  generateBuildId: async () => {
    // Use git commit hash or timestamp for consistent builds
    return process.env.GIT_SHA || `build-${Date.now()}`;
  },

  // Optimize chunk loading
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    if (!isServer) {
      // Add chunk retry logic
      config.plugins.push(
        new webpack.DefinePlugin({
          '__CHUNK_RETRY_DELAY__': JSON.stringify(1000),
          '__CHUNK_MAX_RETRIES__': JSON.stringify(3),
        })
      );

      // Optimize chunk naming for better caching
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        cacheGroups: {
          default: false,
          vendors: false,
          commons: {
            name: 'commons',
            chunks: 'all',
            minChunks: 2,
          },
        },
      };
    }
    return config;
  },

  // Enable proper error handling
  onDemandEntries: {
    // Period (in ms) where the server will keep pages in the buffer
    maxInactiveAge: 120 * 1000,
    // Number of pages that should be kept simultaneously without being disposed
    pagesBufferLength: 5,
  },

  // Experimental features for better error handling
  experimental: {
    // Optimize CSS handling
    optimizeCss: true,
    // Better error recovery
    fallbackNodePolyfills: false,
  },

  // Production optimizations
  productionBrowserSourceMaps: false,
  compress: true,
  poweredByHeader: false,

  // Handle trailing slashes consistently
  trailingSlash: false,
};

module.exports = nextConfig;