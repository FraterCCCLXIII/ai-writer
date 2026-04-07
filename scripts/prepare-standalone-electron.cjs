/**
 * After `next build` with `output: "standalone"`, copy public assets into the
 * standalone bundle so the embedded server can serve them.
 * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/output
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pkg = require(path.join(root, "package.json")).name;
const standaloneRoot = path.join(root, ".next", "standalone");
const appDir = path.join(standaloneRoot, pkg);

if (!fs.existsSync(appDir)) {
  console.error(
    `Missing ${appDir}. Run \`npm run build\` first (with output: standalone).`,
  );
  process.exit(1);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`Skip missing: ${src}`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

copyDir(path.join(root, "public"), path.join(appDir, "public"));
copyDir(
  path.join(root, ".next", "static"),
  path.join(appDir, ".next", "static"),
);

console.log("Standalone assets copied for Electron.");
