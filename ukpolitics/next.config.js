/** @type {import('next').NextConfig} */
const isGitHubPages = process.env.GITHUB_PAGES === 'true';
const repoName = 'Eu261';  // must match exact GitHub repo casing
const basePath = isGitHubPages ? `/${repoName}/ukpolitics` : '';

const nextConfig = {
  output: 'export',
  basePath,
  assetPrefix: isGitHubPages ? `/${repoName}/ukpolitics/` : '',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Expose basePath to client-side fetch calls
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

module.exports = nextConfig;
