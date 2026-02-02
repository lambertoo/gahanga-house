import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Important: on this machine, Next detected multiple lockfiles outside this repo
  // and inferred the wrong workspace root. Pin Turbopack's root to THIS project so
  // builds (locally + on Vercel) don't accidentally pick up unrelated configs.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;

