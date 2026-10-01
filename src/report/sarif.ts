import { pathToFileURL } from 'node:url';
import type { ScanReport } from '../types.js';
import { rules } from '../rules/definitions.js';
export function renderSarif(report: ScanReport): string {
  return JSON.stringify({ version: '2.1.0', $schema: 'https://json.schemastore.org/sarif-2.1.0.json', runs: [{
    tool: { driver: { name: report.tool, version: report.version, rules: rules.map(r => ({ id:r.id, shortDescription:{text:r.title}, help:{text:r.recommended_action} })) } },
    invocations: [{ executionSuccessful: report.coverage?.status === 'complete', toolExecutionNotifications: (report.coverage?.diagnostics ?? []).filter(d=>d.affectsCompleteness).map(d=>({level:'warning', message:{text:d.message}, descriptor:{id:d.code}})) }],
    properties: { coverageStatus: report.coverage?.status ?? 'unknown' },
    results: report.findings.map(f=>({ ruleId:f.ruleId, level: f.severity === 'critical' || f.severity === 'high' ? 'error' : f.severity === 'medium' ? 'warning' : 'note',
      message:{text:f.message}, partialFingerprints:{'agentAudit/v1':f.fingerprint ?? f.id ?? f.ruleId},
      locations:[{physicalLocation:{artifactLocation:{uri:pathToFileURL(f.location.path).href}, ...(f.location.line ? {region:{startLine:f.location.line}} : {})}}],
      properties:{severity:f.severity,evidence:f.evidence} }))
  }] }, null, 2)+'\n';
}
