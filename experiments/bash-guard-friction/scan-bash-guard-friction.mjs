// Streaming extractor over dsh session logs (session.jsonl.zstd).
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

const ROOT = '/home/sid/.dsh/sessions';
const workspaces = readdirSync(ROOT, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);

const stats = {
  files: 0, lines: 0, badLines: 0, sessions: 0,
  bashCalls: 0,
  interventions: { translated: 0, could_not_translate: 0, parse_fail: 0, denied_by_rule: 0, blocked_approval: 0, not_run_directly: 0, other_guard: 0 },
  tokenSteps: { totalSteps: 0, refusedSteps: 0, totalIn: 0, totalOut: 0, refusedIn: 0, refusedOut: 0 },
};
const failByCmd = new Map(), failExamples = new Map();
const okByCmd = new Map(), okExamples = new Map();
const byWorkspace = {}, byMonth = {};
const failReasons = new Map();

function lead(cmd) {
  const m = String(cmd).trim().match(/^(?:sudo\s+|env\s+\S+=\S+\s+)?([A-Za-z][\w./-]*)/);
  return m ? m[1].replace(/^.*\//, '') : '(none)';
}
const bump = (m, k, v = 1) => m.set(k, (m.get(k) || 0) + v);
const wsAgg = ws => byWorkspace[ws] ||= { calls: 0, translated: 0, fail: 0, denied: 0, other: 0 };
const monthAgg = ts => byMonth[new Date(ts).toISOString().slice(0, 7)] ||= { calls: 0, fail: 0, denied: 0, translated: 0 };

async function processFile(path, ws) {
  stats.files++;
  const child = spawn('zstd', ['-dc', path], { stdio: ['ignore', 'pipe', 'ignore'] });
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const calls = new Map();
  const stepUsage = new Map();
  for await (const line of rl) {
    stats.lines++;
    if (!line.trim()) continue;
    let ev; try { ev = JSON.parse(line); } catch { stats.badLines++; continue; }
    const d = ev.data;
    if (ev.type === 'session') stats.sessions++;
    if (ev.type === 'assistant/message' && d?.message?.content) {
      for (const b of d.message.content) {
        if (b.type === 'tool-call' && b.name === 'bash') {
          stats.bashCalls++;
          let cmd = ''; try { cmd = JSON.parse(b.arguments).command || ''; } catch {}
          calls.set(b.id, cmd);
          wsAgg(ws).calls++; monthAgg(ev.time).calls++;
        }
      }
    }
    if (ev.type === 'assistant/chunk' && d?.chunk?.type === 'usage') {
      const u = d.chunk.usage; const key = `${d.turn}:${d.step}`;
      const s = stepUsage.get(key) || { in: 0, out: 0, hasRefused: false };
      s.in += (u.inputTokens || 0) + (u.cacheReadTokens || 0) + (u.cacheWriteTokens || 0);
      s.out += u.outputTokens || 0;
      stepUsage.set(key, s);
    }
    if (ev.type === 'tool/result' && d?.message?.source?.kind === 'tool') {
      const callId = d.message.source.callId;
      const text = (d.message.content || []).map(c => (c?.content || []).map(t => t.text || '').join('') || '').join('\n');
      let kind = null;
      if (d.meta?.rewritten === true) {
        stats.interventions.translated_silent = (stats.interventions.translated_silent || 0) + 1;
        const cmd2 = calls.get(callId) || d.meta?.ran || '(unknown)';
        bump(okByCmd, lead(cmd2));
        if (!okExamples.has(lead(cmd2))) okExamples.set(lead(cmd2), { cmd: String(cmd2).slice(0,300), ran: String(d.meta?.ran || '').slice(0,300) });
        wsAgg(ws).translated++; monthAgg(ev.time).translated++;
        continue;
      }
      const m = text.match(/^\s*(?:Error:\s*)?(bash-guard: [^\n]{0,200})/);
      if (!m) continue;
      {
        const t = m[1];
        if (t.startsWith('bash-guard: ran this instead:')) kind = 'translated';
        else if (t.startsWith('bash-guard: could not translate')) kind = 'could_not_translate';
        else if (t.startsWith('bash-guard: could not parse') || t.startsWith('bash-guard: parse errors')) kind = 'parse_fail';
        else if (t.startsWith('bash-guard: the following command was denied')) kind = 'denied_by_rule';
        else if (t.startsWith('bash-guard: the user rejected')) kind = 'user_rejected';
        else if (t.includes(' denied by ') || t.includes(' blocked by ')) kind = 'denied_by_rule';
        else if (t.startsWith('bash-guard: that command is not run directly')) kind = 'not_run_directly';
        else if (t.startsWith('bash-guard: could not apply')) kind = 'could_not_apply';
        else kind = 'other_guard';
      }
      stats.interventions[kind] = (stats.interventions[kind] || 0) + 1;
      const cmd = calls.get(callId) || d.meta?.ran || '(unknown)';
      const leadTok = lead(cmd);
      const wsa = wsAgg(ws), ma = monthAgg(ev.time);
      const s = stepUsage.get(`${d.turn}:${d.step}`);
      if (kind === 'translated') {
        wsa.translated++; ma.translated++;
        bump(okByCmd, leadTok);
        if (!okExamples.has(leadTok)) okExamples.set(leadTok, { cmd: cmd.slice(0, 300), ran: String(d.meta?.ran || '').slice(0, 300) });
      } else if (kind === 'denied_by_rule' || kind === 'blocked_approval') {
        wsa.denied++; ma.denied++;
        bump(failByCmd, leadTok);
        if (!failExamples.has(leadTok)) failExamples.set(leadTok, { cmd: cmd.slice(0, 300), text: text.slice(0, 250) });
        if (s) s.hasRefused = true;
      } else {
        wsa.fail++; ma.fail++;
        bump(failByCmd, leadTok);
        if (!failExamples.has(leadTok)) failExamples.set(leadTok, { cmd: cmd.slice(0, 300), text: text.slice(0, 250) });
        const rs = text.replace(/^Error:\s*/, '').split(/\. (?=[A-Z`])/)[0].slice(0, 160);
        bump(failReasons, rs);
        if (s) s.hasRefused = true;
      }
    }
  }
  for (const s of stepUsage.values()) {
    if (!s.out && !s.in) continue;
    stats.tokenSteps.totalSteps++; stats.tokenSteps.totalIn += s.in; stats.tokenSteps.totalOut += s.out;
    if (s.hasRefused) { stats.tokenSteps.refusedSteps++; stats.tokenSteps.refusedIn += s.in; stats.tokenSteps.refusedOut += s.out; }
  }
  child.kill();
}

for (const ws of workspaces) {
  const dir = join(ROOT, ws);
  for (const e of readdirSync(dir, { withFileTypes: true }).filter(x => x.isDirectory())) {
    try { await processFile(join(dir, e.name, 'session.jsonl.zstd'), ws); } catch (err) { console.error('ERR', e.name, err.message); }
  }
}
const top = (m, n = 25) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
console.log(JSON.stringify({
  stats,
  topFailures: top(failByCmd).map(([k, v]) => ({ cmd: k, count: v, example: failExamples.get(k) })),
  topSuccess: top(okByCmd).map(([k, v]) => ({ cmd: k, count: v, example: okExamples.get(k) })),
  topReasons: top(failReasons),
  byWorkspace, byMonth,
}, null, 1));
