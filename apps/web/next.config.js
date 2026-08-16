/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@decal/shared-types", "@decal/db"]
};

module.exports = nextConfig;
