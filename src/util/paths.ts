import path from "node:path";

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
  return parts
    .join(":")
    .replace(/[^a-zA-Z0-9_.:-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 180);
}
