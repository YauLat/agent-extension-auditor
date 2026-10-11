import path from "node:path";
import { createHash } from "node:crypto";

export function expandHome(inputPath: string, home: string): string {
  if (inputPath === "~") {
    return home;
  }
  if (inputPath.startsWith("~/")) {
    return path.join(home, inputPath.slice(2));
  }
  return inputPath;
}

export function toDisplayPath(inputPath: string, home: string): string {
  const normalizedHome = path.resolve(home);
  const normalizedPath = path.resolve(inputPath);
  if (normalizedPath === normalizedHome) {
    return "~";
  }
  if (normalizedPath.startsWith(`${normalizedHome}${path.sep}`)) {
    return `~/${path.relative(normalizedHome, normalizedPath)}`;
  }
  return normalizedPath;
}

export function stableId(...parts: string[]): string {
  return `${parts[0]}:${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 24)}`;
}
