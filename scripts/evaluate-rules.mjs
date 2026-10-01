import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { scanAgentExtensions } from '../dist/scanner/index.js';
import { VERSION, RULESET_VERSION } from '../dist/version.js';
const raw = await fs.readFile(new URL('./evaluation/corpus.json', import.meta.url));
const digest = createHash('sha256').update(raw).digest('hex');
const frozen = (await fs.readFile(new URL('./evaluation/corpus.sha256', import.meta.url),'utf8')).trim();
if (digest !== frozen) throw new Error('Frozen corpus hash mismatch');
const split = process.argv[2] ?? 'evaluation';
if (!['calibration','evaluation','all'].includes(split)) throw new Error('Use calibration, evaluation or all');
const cases = JSON.parse(raw).cases.filter(c => split === 'all' || c.split === split);
const severity = {info:0,low:1,medium:2,high:3,critical:4};
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'aea-evaluation-')));
const results=[];
try {
  for (const entry of cases) {
    const dir = path.join(root,entry.id);
    for (const [name,content] of Object.entries(entry.files)) {
      const file=path.join(dir,name); await fs.mkdir(path.dirname(file),{recursive:true}); await fs.writeFile(file,content);
    }
    const report=await scanAgentExtensions({cwd:dir,paths:[dir],includeHome:false});
    const detected=report.findings.some(f=>f.ruleId===entry.rule && f.evidence.kind===entry.evidence && severity[f.severity]>=severity[entry.minSeverity]);
    results.push({id:entry.id,rule:entry.rule,evidence:entry.evidence,positive:entry.positive,detected,coverage:report.coverage.status,result:entry.positive?(detected?'TP':'FN'):(detected?'FP':'TN')});
  }
} finally { await fs.rm(root,{recursive:true,force:true}); }
function metrics(group) {
  const count=Object.fromEntries(['TP','FP','FN','TN'].map(k=>[k,group.filter(r=>r.result===k).length]));
  return {...count,precision:count.TP+count.FP?count.TP/(count.TP+count.FP):null,recall:count.TP+count.FN?count.TP/(count.TP+count.FN):null};
}
console.log(JSON.stringify({version:VERSION,ruleset:RULESET_VERSION,corpusHash:digest,split,count:results.length,limitations:'Synthetic templates; evaluation split was frozen before tuning but is not independently authored or representative. Metrics measure target rule/severity/evidence only; not maliciousness or safety.',...metrics(results),byRule:Object.fromEntries([...new Set(results.map(r=>r.rule))].map(k=>[k,metrics(results.filter(r=>r.rule===k))])),byEvidence:Object.fromEntries([...new Set(results.map(r=>r.evidence))].map(k=>[k,metrics(results.filter(r=>r.evidence===k))])),failures:results.filter(r=>r.result==='FP'||r.result==='FN'),incompleteCases:results.filter(r=>r.coverage!=='complete').map(r=>r.id)},null,2));

if (results.some(r => r.result === 'FP' || r.result === 'FN' || r.coverage !== 'complete')) process.exitCode = 1;
