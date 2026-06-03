import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server to accept requests (including the HMR websocket and
  // dev-only endpoints) from other devices on the LAN, not just localhost.
  allowedDevOrigins: ["192.168.0.64"],
};

export default nextConfig;
