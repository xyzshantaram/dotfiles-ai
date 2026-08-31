#!/usr/bin/env node
// Sandbox-failure analysis.
//
// Counts only REAL failures:
//   - non-bash tools: item.isError === true
//   - bash: isError, or an "[exit code: N]" marker with N != 0
//
// Classifies each failure as:
//   marked   - carries the "[sandbox: ...]" denial marker (actionable: the
//              model is told escalation is available)
//   opaque   - looks like a permission/readonly problem but carries NO marker
//              (EROFS, EACCES, EPERM, read-only file system, cannot lock ref,
//              unable to open database file)
//
// Then tracks what the model did on its VERY NEXT call:
//   escalated_same_tool  - retried with sandbox_permissions
//   other                - did something else
// and whether that next call succeeded.
//
// Also counts the two escalation misuse modes:
//   not_wider  - asked for a mode it is already in
//   rejected   - the user refused

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
const outDir = process.argv[3] || '/tmp/dsh/sandbox-report';

// SINCE=YYYY-MM-DD limits the scan to sessions modified on or after that date.
// Use it for a retest. Without it the scan covers every session ever recorded,
// and the old data hides any change.
const sinceMs = process.env.SINCE ? Date.parse(process.env.SINCE) : null;
if (process.env.SINCE && Number.isNaN(sinceMs)) {
  console.error(`Bad SINCE value: ${process.env.SINCE}`);
  process.exit(1);
}

const MARKER_RE = /\[sandbox:/i;
const OPAQUE_RE = /EROFS|read-only file system|\bEACCES\b|\bEPERM\b|cannot lock ref|unable to open database file|Permission denied|Operation not permitted/i;
const NOT_WIDER_RE = /not strictly wider/i;
const REJECTED_RE = /rejected escalating/i;
const EXIT_RE = /\[exit code:\s*(\d+)\]/;

function findAll(r) {
  const out = [];
  for (const p of fs.readdirSync(r, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const pd = path.join(r, p.name);
    let sds; try { sds = fs.readdirSync(pd, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { continue; }
    for (const sd of sds) {
      const dd = path.join(pd, sd.name);
      let fl; try { fl = fs.readdirSync(dd); } catch { continue; }
      for (const f of fl) if (f.startsWith('session.jsonl') && f.includes('zstd')) {
        const full = path.join(dd, f);
        if (sinceMs !== null) {
          try { if (fs.statSync(full).mtimeMs < sinceMs) continue; } catch { continue; }
        }
        out.push({ project: p.name, sessionId: sd.name, file: full });
      }
    }
  }
  return out;
}

function scan(entry) {
  return new Promise((resolve) => {
    const calls = new Map();
    const events = []; // ordered failures + all calls, to inspect "next call"
    const ordered = []; // {ordinal, tool, hasEscalation, ok, kind}
    let ordinal = 0;
    const stats = {
      marked: 0, opaque: 0, notWider: 0, rejected: 0,
      markedByTool: {}, opaqueByTool: {},
      opaqueSamples: [], notWiderSamples: [],
    };

    let child;
    try { child = spawn('zstdcat', [entry.file], { stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch { resolve({ stats, ordered }); return; }
    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });

    rl.on('line', (line) => {
      if (!line) return;
      let ev; try { ev = JSON.parse(line); } catch { return; }

      if (ev.type === 'tool/call') {
        const d = ev.data;
        if (!d) return;
        ordinal += 1;
        const args = String(d.arguments || '');
        calls.set(d.callId, {
          name: d.name, ordinal, args,
          hasEscalation: /"sandbox_permissions"\s*:/.test(args),
          escTarget: (args.match(/"sandbox_permissions"\s*:\s*"([^"]+)"/) || [])[1] || null,
          cmd: (args.match(/"command"\s*:\s*"((?:[^"\\]|\\.){0,120})/) || [])[1] || null,
        });
        return;
      }
      if (ev.type !== 'tool/result') return;
      const d = ev.data;
      const items = d && d.message && Array.isArray(d.message.content) ? d.message.content : [];
      for (const item of items) {
        if (!item || item.type !== 'tool-result') continue;
        const call = calls.get(item.toolCallId);
        if (!call) continue;
        calls.delete(item.toolCallId);

        let text = '';
        try {
          const inner = item.content;
          if (Array.isArray(inner)) { for (const b of inner) if (b && typeof b.text === 'string') text += b.text; }
          else if (typeof inner === 'string') text = inner;
        } catch {}

        // Determine real failure.
        let failed = item.isError === true;
        const exitMatch = text.match(EXIT_RE);
        if (!failed && call.name === 'bash' && exitMatch && exitMatch[1] !== '0') failed = true;

        let kind = null;
        if (failed) {
          if (NOT_WIDER_RE.test(text)) {
            kind = 'not_wider';
            stats.notWider += 1;
            if (stats.notWiderSamples.length < 4) {
              stats.notWiderSamples.push({
                tool: call.name, target: call.escTarget,
                cmd: call.cmd ? call.cmd.slice(0, 90) : null,
              });
            }
          } else if (REJECTED_RE.test(text)) {
            kind = 'rejected';
            stats.rejected += 1;
          } else if (MARKER_RE.test(text)) {
            kind = 'marked';
            stats.marked += 1;
            stats.markedByTool[call.name] = (stats.markedByTool[call.name] || 0) + 1;
          } else if (OPAQUE_RE.test(text)) {
            kind = 'opaque';
            stats.opaque += 1;
            stats.opaqueByTool[call.name] = (stats.opaqueByTool[call.name] || 0) + 1;
            if (stats.opaqueSamples.length < 6) {
              stats.opaqueSamples.push({
                project: entry.project, sessionId: entry.sessionId,
                tool: call.name,
                cmd: call.cmd ? call.cmd.slice(0, 90) : null,
                text: text.slice(0, 170).replace(/\s+/g, ' ').trim(),
              });
            }
          }
        }

        ordered.push({
          ordinal: call.ordinal, tool: call.name,
          hasEscalation: call.hasEscalation, escTarget: call.escTarget,
          failed, kind, ok: !failed,
        });
      }
    });
    rl.on('close', () => resolve({ stats, ordered }));
    child.on('error', () => resolve({ stats, ordered }));
  });
}

const files = findAll(root);
console.error(`scanning ${files.length} sessions`);

const total = {
  marked: 0, opaque: 0, notWider: 0, rejected: 0,
  markedByTool: {}, opaqueByTool: {},
  opaqueSamples: [], notWiderSamples: [],
  // recovery
  afterMarked: { escalated: 0, other: 0, escalatedThenOk: 0, escalatedThenFail: 0 },
  afterOpaque: { escalated: 0, other: 0, escalatedThenOk: 0, escalatedThenFail: 0 },
};

let i = 0, scanned = 0;
async function worker() {
  while (i < files.length) {
    const f = files[i++];
    const { stats, ordered } = await scan(f);
    scanned++;
    total.marked += stats.marked;
    total.opaque += stats.opaque;
    total.notWider += stats.notWider;
    total.rejected += stats.rejected;
    for (const [k, v] of Object.entries(stats.markedByTool)) total.markedByTool[k] = (total.markedByTool[k] || 0) + v;
    for (const [k, v] of Object.entries(stats.opaqueByTool)) total.opaqueByTool[k] = (total.opaqueByTool[k] || 0) + v;
    for (const s of stats.opaqueSamples) if (total.opaqueSamples.length < 12) total.opaqueSamples.push(s);
    for (const s of stats.notWiderSamples) if (total.notWiderSamples.length < 8) total.notWiderSamples.push(s);

    // recovery: sort by ordinal, look at the next entry
    ordered.sort((a, b) => a.ordinal - b.ordinal);
    for (let n = 0; n < ordered.length; n++) {
      const cur = ordered[n];
      if (cur.kind !== 'marked' && cur.kind !== 'opaque') continue;
      const bucket = cur.kind === 'marked' ? total.afterMarked : total.afterOpaque;
      const next = ordered[n + 1];
      if (!next) { bucket.other += 1; continue; }
      if (next.hasEscalation && next.tool === cur.tool) {
        bucket.escalated += 1;
        if (next.ok) bucket.escalatedThenOk += 1; else bucket.escalatedThenFail += 1;
      } else {
        bucket.other += 1;
      }
    }
    if (scanned % 100 === 0) console.error(`...${scanned}/${files.length}`);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'sandbox-report.json'), JSON.stringify(total, null, 2));

const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(0)}%` : 'n/a');
console.log('=== REAL SANDBOX-RELATED FAILURES ===');
console.log(`marked (has "[sandbox: ...]" hint): ${total.marked}`);
console.log('   by tool:', JSON.stringify(total.markedByTool));
console.log(`opaque (permission-ish, NO hint):  ${total.opaque}`);
console.log('   by tool:', JSON.stringify(total.opaqueByTool));
console.log(`escalation to a mode already held: ${total.notWider}`);
console.log(`escalation refused by user:        ${total.rejected}`);
console.log('');
console.log('=== WHAT THE MODEL DID NEXT ===');
for (const [label, b] of [['after MARKED denial', total.afterMarked], ['after OPAQUE failure', total.afterOpaque]]) {
  const n = b.escalated + b.other;
  console.log(`${label}: n=${n}`);
  console.log(`   escalated next call: ${b.escalated} (${pct(b.escalated, n)})  -> ok ${b.escalatedThenOk}, failed ${b.escalatedThenFail}`);
  console.log(`   did something else:  ${b.other} (${pct(b.other, n)})`);
}
console.log('');
console.log('=== OPAQUE SAMPLES ===');
for (const s of total.opaqueSamples) console.log(`  [${s.tool}] cmd=${s.cmd || '-'}\n     ${s.text.slice(0, 150)}`);
console.log('');
console.log('=== not_wider SAMPLES (escalation target requested) ===');
for (const s of total.notWiderSamples) console.log(`  [${s.tool}] target=${s.target} cmd=${s.cmd || '-'}`);
