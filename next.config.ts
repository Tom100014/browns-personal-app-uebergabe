import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async redirects() {
    return [
      // Alte/erratene URL auf die kanonische Route umleiten.
      { source: "/schichtplan", destination: "/dienstplan", permanent: true },
    ]
  },
};

export default nextConfig;
