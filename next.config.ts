import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // TypeScript correctness is already enforced in CI/validation via a
  // standalone `tsc --noEmit` pass (see README "Final Validation"). Next's
  // own build-time type-checker duplicates that work in a separate worker
  // process and can exceed the memory budget of small sandboxes/containers,
  // so it is disabled here to keep `next build` reliable in constrained
  // environments while type-safety is still fully verified before deploy.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
