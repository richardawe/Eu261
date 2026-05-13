/** @type {import('next').NextConfig} */
const isGitHubPages = process.env.GITHUB_PAGES === 'true';
const repoName = 'eu261';

const nextConfig = {
  output: 'export',
  basePath: isGitHubPages ? `/${repoName}/ukpolitics` : '',
  assetPrefix: isGitHubPages ? `/${repoName}/ukpolitics/` : '',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // Required for static export — disable server-only features
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
