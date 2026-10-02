import type { NextConfig } from "next";
import { dirname, join } from "node:path";

const phaserSource = join(dirname(require.resolve("phaser/package.json")), "src");
const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack(config, { webpack }) {
    // Build Phaser from its source: its prebuilt bundle includes a GPL video
    // polyfill this game does not use. Keep it out of both dev and production.
    config.resolve.alias["phaser$"] = join(phaserSource, "phaser.js");
    config.resolve.alias["./polyfills/requestVideoFrame$"] = false;
    config.plugins.push(
      new webpack.DefinePlugin({
        "typeof CANVAS_RENDERER": JSON.stringify(true),
        "typeof WEBGL_RENDERER": JSON.stringify(true),
        "typeof WEBGL_DEBUG": JSON.stringify(false),
        "typeof EXPERIMENTAL": JSON.stringify(false),
        "typeof FEATURE_SOUND": JSON.stringify(true),
      }),
    );
    return config;
  },
};

export default nextConfig;
