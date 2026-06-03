import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // ~/bun.lock 等が祖先にあると Next.js がワークスペースルートを誤認するので、
  // このディレクトリを明示してファイル監視範囲を codemap 内に固定する。
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
