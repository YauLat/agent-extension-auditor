import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Copy the production scanner and its pinned TOML parser without build-machine metadata.
// Keep the complete third-party license and copyright notices in the bundle.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = process.argv[2];
if (!destination) throw new Error("Usage: node scripts/package-runtime.mjs <destination>");
await fs.mkdir(destination, { recursive: true });
await fs.cp(path.join(root, "dist"), path.join(destination, "dist"), { recursive: true });
await fs.writeFile(path.join(destination, "package.json"), JSON.stringify({ type: "module" }));
const dependency = "smol-toml";
const source = path.join(root, "node_modules", dependency);
const output = path.join(destination, "node_modules", dependency);
const manifest = JSON.parse(await fs.readFile(path.join(source, "package.json"), "utf8"));
if (Object.keys(manifest.dependencies ?? {}).length) throw new Error("Review TOML parser runtime dependencies before packaging.");
await fs.mkdir(output, { recursive: true });
await fs.cp(path.join(source, "dist"), path.join(output, "dist"), { recursive: true });
await fs.copyFile(path.join(source, "LICENSE"), path.join(output, "LICENSE"));
const runtimeManifest = Object.fromEntries(["name", "version", "type", "main", "module", "exports", "license"].map((key) => [key, manifest[key]]));
await fs.writeFile(path.join(output, "package.json"), JSON.stringify(runtimeManifest, null, 2) + "\n");
