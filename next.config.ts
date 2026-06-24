import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // firebase-admin pulls in jwks-rsa → jose (pure ESM). Bundling it into the
  // serverless function makes jwks-rsa require() an ESM module, which throws
  // ERR_REQUIRE_ESM at runtime on Vercel. Keeping it external lets Node resolve
  // the package normally from node_modules instead.
  serverExternalPackages: ['firebase-admin'],
  images: {
    remotePatterns: [
      // GitHub avatars surfaced in the signed-in nav.
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },
};

export default nextConfig;
