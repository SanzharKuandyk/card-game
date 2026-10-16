import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const candidates = [
  process.env.CARD_GAME_NODE,
  resolve(".runtime/node-v24.22.0-win-x64/node.exe"),
  process.execPath,
].filter(Boolean);
const binary = candidates.find(
  (p) =>
    existsSync(p) &&
    /^v24\.(?:2[2-9]|[3-9]\d)\./.test(
      spawnSync(p, ["--version"], { encoding: "utf8" }).stdout,
    ),
);
if (!binary) {
  console.error(
    "Node 24.22 LTS is required. Set CARD_GAME_NODE to its executable.",
  );
  process.exit(1);
}
const result = spawnSync(binary, process.argv.slice(2), {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
