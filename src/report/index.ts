import type { ScanReport } from "../types.js";
import { renderJson } from "./json.js";
import { renderMarkdown } from "./markdown.js";
import { renderTerminal } from "./terminal.js";

export type ReportFormat = "terminal" | "markdown" | "json";

export function renderReport(report: ScanReport, format: ReportFormat): string {
  if (format === "json") {
    return renderJson(report);
  }
  if (format === "markdown") {
    return renderMarkdown(report);
  }
  return renderTerminal(report);
}
