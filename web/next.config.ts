import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The receipt, the injection test and the policies used to be three screens.
  // They are one now — three blocks of the same evidence page — so the old
  // paths keep working and land on the block they used to be.
  async redirects () {
    return [
      { source: '/run', destination: '/proof#receipt', permanent: false },
      { source: '/injection', destination: '/proof#injection', permanent: false },
      { source: '/policies', destination: '/proof#policies', permanent: false }
    ]
  }
}

export default nextConfig
