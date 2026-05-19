// build-widget.mjs — run with: node build-widget.mjs
import { build } from "esbuild";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pkg = require("./package.json");

const reactVersion = pkg.dependencies.react?.replace(/[^0-9.]/g, "") ?? "18";
console.log(`Building widget.js (React ${reactVersion})…`);

await build({
    entryPoints: ["widget/index.tsx"],
    bundle: true,
    minify: true,
    platform: "browser",
    target: ["es2017", "chrome80", "firefox75", "safari13"],
    format: "iife",
    // Self-invoking function — no globals leaked
    globalName: undefined,
    outfile: "widget/widget.js",
    define: {
        "process.env.NODE_ENV": '"production"',
    },
    loader: {
        ".tsx": "tsx",
        ".ts": "ts",
    },
    logLevel: "info",
});

console.log("✓ widget.js written");
