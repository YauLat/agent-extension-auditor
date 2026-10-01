import fs from "node:fs/promises";
import path from "node:path";

export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readSmallFile(filePath: string, maxBytes: number): Promise<string | undefined> {
  try {
    const stat = await fs.lstat(filePath);
    if (!stat.isFile() || stat.size > maxBytes) {
      return undefined;
    }
    return await fs.readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
}

export async function findFiles(
  root: string,
  matcher: (filePath: string) => boolean,
  maxDepth: number
): Promise<string[]> {
  const results: string[] = [];
  try {
    if (!(await fs.lstat(root)).isDirectory()) return results;
  } catch {
    return results;
  }

  async function walk(current: string, depth: number): Promise<void> {
    if (depth > maxDepth) {
      return;
    }
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
        continue;
      }
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath, depth + 1);
      } else if (entry.isFile() && matcher(entryPath)) {
        results.push(entryPath);
      }
    }
  }

  await walk(root, 0);
  return results.sort();
}

// Only check below the supplied boundary; system aliases such as macOS /var
// may legitimately appear above a caller-provided home or workspace.
export async function hasSymlinkBelow(filePath: string, boundary: string): Promise<boolean> {
  const relative = path.relative(boundary, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
  let current = boundary;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) return true;
    } catch { return false; }
  }
  return false;
}
