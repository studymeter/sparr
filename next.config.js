const createNextIntlPlugin = require("next-intl/plugin");

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Smaller production image for Docker (copies only traced server deps).
  output: "standalone",
};

module.exports = withNextIntl(nextConfig);
