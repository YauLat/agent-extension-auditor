import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import type { DiagnosticCode, ScanCoverage, ScanDiagnostic, TargetLocation } from "../types.js";
import { toDisplayPath } from "../util/paths.js";

const messages: Record<DiagnosticCode, string> = {
  not_found: "Optional scan location does not exist.",
  user_excluded: "Outside the user-selected scope.",
  default_excluded: "Dependency, build or version-control directory excluded by scan policy.",
  size_limit: "File exceeds the configured byte limit.",
  depth_limit: "Directory exceeds the configured depth limit; its contents were not counted.",
  access_denied: "Permission denied while inspecting this location.",
  read_failed: "Location could not be read or changed during the scan.",
  unsupported_type: "File type is outside the supported text formats.",
  binary_file: "Binary or invalid UTF-8 content was not inspected.",
  parse_failed: "Invalid configuration syntax; structured inspection was not completed.",
  invalid_config: "Configuration must contain an object or table.",
  structure_limit: "Configuration nesting exceeds the inspection limit.",
  symlink_broken: "Symbolic link does not resolve to an existing location.",
  symlink_cycle: "Symbolic link cycle was not followed.",
  outside_scope: "Resolved location is outside the approved scan roots."
};

export interface DiscoveredFile {
  path: string;
  aliases: Set<string>;
  agents: Set<string>;
}

export function isInside(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/** Read-only, bounded traversal. Diagnostics contain fixed messages, never exception text. */
export class ScanReader {
  readonly files = new Map<string, DiscoveredFile>();
  private readonly diagnostics = new Map<string, ScanDiagnostic>();
  private readonly contents = new Map<string, string | undefined>();
  private readonly readPaths = new Set<string>();
  readonly excludedDirectories = ["node_modules", ".git", "dist"];

  constructor(
    private readonly roots: TargetLocation[],
    private readonly home: string,
    readonly scope: ScanCoverage["scope"]
  ) {}

  selected(candidate: string, directory = false): boolean {
    if (this.scope.excludePaths.some((excluded) => isInside(candidate, excluded))) return false;
    return this.scope.includePaths.length === 0 || this.scope.includePaths.some((included) =>
      isInside(candidate, included) || (directory && isInside(included, candidate))
    );
  }

  diagnostic(code: DiagnosticCode, filePath: string, kind: ScanDiagnostic["kind"] = "file"): void {
    this.diagnostics.set(`${code}:${filePath}`, {
      code, path: filePath, displayPath: toDisplayPath(filePath, this.home), kind,
      affectsCompleteness: !["not_found", "user_excluded", "default_excluded"].includes(code),
      message: messages[code]
    });
  }

  private approved(candidate: string): boolean {
    return this.roots.some((root) => root.kind.endsWith("-root")
      ? isInside(candidate, root.path) : candidate === root.path);
  }

  async discover(target: TargetLocation): Promise<DiscoveredFile[]> {
    const found = new Set<string>();
    const walk = async (logical: string, depth: number, ancestors: Set<string>, isTarget = false,
      hint: ScanDiagnostic["kind"] = "target"): Promise<void> => {
      if (!this.selected(logical, true)) {
        this.diagnostic("user_excluded", logical, hint);
        return;
      }
      let isLink = false;
      let kind: ScanDiagnostic["kind"] = hint;
      try {
        const entry = await fs.lstat(logical);
        isLink = entry.isSymbolicLink();
        const canonical = await fs.realpath(logical);
        if (!this.approved(canonical)) {
          this.diagnostic("outside_scope", logical, kind);
          return;
        }
        if (!this.selected(canonical, true)) {
          this.diagnostic("user_excluded", logical, kind);
          return;
        }
        const approvedRoot = this.roots.filter((root) => root.kind.endsWith("-root") && isInside(canonical, root.path))
          .sort((a, b) => b.path.length - a.path.length)[0];
        if (approvedRoot && path.relative(approvedRoot.path, canonical).split(path.sep)
          .some((part) => this.excludedDirectories.includes(part))) {
          this.diagnostic("default_excluded", logical, kind);
          return;
        }
        const stat = isLink ? await fs.stat(canonical) : entry;
        if (stat.isDirectory()) {
          kind = "directory";
          if (ancestors.has(canonical)) {
            this.diagnostic("symlink_cycle", logical, kind);
            return;
          }
          if (depth > this.scope.maxDepth) {
            this.diagnostic("depth_limit", logical, kind);
            return;
          }
          const nextAncestors = new Set([...ancestors, canonical]);
          const entries = await fs.readdir(canonical, { withFileTypes: true });
          for (const child of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            const childPath = path.join(logical, child.name);
            if (this.excludedDirectories.includes(child.name) && (child.isDirectory() || child.isSymbolicLink())) {
              this.diagnostic("default_excluded", childPath, "directory");
              continue;
            }
            await walk(childPath, depth + (child.isDirectory() || child.isSymbolicLink() ? 1 : 0), nextAncestors, false,
              child.isDirectory() ? "directory" : child.isFile() ? "file" : "target");
          }
        } else if (stat.isFile()) {
          if (!this.selected(logical) || !this.selected(canonical)) {
            this.diagnostic("user_excluded", logical);
            return;
          }
          const file = this.files.get(canonical) ?? { path: canonical, aliases: new Set<string>(), agents: new Set<string>() };
          file.aliases.add(logical);
          if (target.agent) file.agents.add(target.agent);
          this.files.set(canonical, file);
          found.add(canonical);
        } else {
          this.diagnostic("unsupported_type", logical, kind);
        }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        this.diagnostic(code === "EACCES" || code === "EPERM" ? "access_denied"
          : code === "ELOOP" ? "symlink_cycle"
          : code === "ENOENT" || code === "ENOTDIR" ? (isLink ? "symlink_broken" : isTarget ? "not_found" : "read_failed")
          : "read_failed", logical, kind);
      }
    };
    await walk(target.path, 0, new Set(), true);
    return [...found].sort().map((key) => this.files.get(key)!);
  }

  async read(filePath: string): Promise<string | undefined> {
    if (this.contents.has(filePath)) return this.contents.get(filePath);
    let handle;
    try {
      // Check scope again after traversal; do not follow a replaced final symlink.
      const canonical = await fs.realpath(filePath);
      if (canonical !== filePath || !this.approved(canonical) || !this.selected(canonical)) {
        this.diagnostic("outside_scope", filePath);
        return undefined;
      }
      handle = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const before = await handle.stat();
      if (!before.isFile()) {
        this.diagnostic("unsupported_type", filePath);
        return undefined;
      }
      if (before.size > this.scope.maxFileBytes) {
        this.diagnostic("size_limit", filePath);
        return undefined;
      }
      // Bounded even if the file grows between stat and read.
      const buffer = Buffer.alloc(this.scope.maxFileBytes + 1);
      let size = 0;
      while (size < buffer.length) {
        const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
        if (bytesRead === 0) break;
        size += bytesRead;
      }
      const after = await handle.stat();
      if (size > this.scope.maxFileBytes) {
        this.diagnostic("size_limit", filePath);
        return undefined;
      }
      const current = await fs.stat(filePath);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== current.ino || before.dev !== current.dev
        || await fs.realpath(filePath) !== filePath) {
        this.diagnostic("read_failed", filePath);
        return undefined;
      }
      const bytes = buffer.subarray(0, size);
      let text: string;
      try {
        if (bytes.includes(0)) throw new Error();
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        this.diagnostic("binary_file", filePath);
        return undefined;
      }
      this.readPaths.add(filePath);
      this.contents.set(filePath, text);
      return text;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      this.diagnostic(code === "EACCES" || code === "EPERM" ? "access_denied" : "read_failed", filePath);
      return undefined;
    } finally {
      await handle?.close();
      if (!this.contents.has(filePath)) this.contents.set(filePath, undefined);
    }
  }

  coverage(): ScanCoverage {
    const diagnostics = [...this.diagnostics.values()].sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
    const incomplete = diagnostics.some((entry) => entry.affectsCompleteness);
    return {
      status: incomplete ? (this.readPaths.size ? "partial" : "failed") : "complete",
      filesRead: this.readPaths.size,
      filesSkipped: new Set(diagnostics.filter((entry) => entry.kind === "file").map((entry) => entry.path)).size,
      directoriesSkipped: new Set(diagnostics.filter((entry) => entry.kind === "directory").map((entry) => entry.path)).size,
      diagnostics, scope: this.scope
    };
  }
}
