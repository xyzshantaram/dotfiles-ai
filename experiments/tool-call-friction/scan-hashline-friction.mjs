#!/usr/bin/env node
/**
 * Measure dsh-better-edit tool friction across dsh session logs.
 *
 * Usage:
 *   node scan-hashline-friction.mjs [sessionsRoot] [outDir]
 *
 * Environment:
 *   SINCE=2026-09-07        Count only events at or after this time.
 *   SINCE=2026-09-07T20:36   A time is allowed, and matters when a deploy
 *                           lands part way through a working day.
 *
 * The filter applies to the EVENT timestamp, not the session file's mtime.
 * That distinction is not cosmetic. A session that started before the deploy
 * and kept running writes new bytes, so its mtime looks recent while most of
 * its events are old. Filtering by mtime therefore counts pre-deploy failures
 * as post-deploy ones, and can report a change in the wrong direction.
 *
 * File mtime is still used, but only to skip whole files that cannot hold a
 * matching event. That is safe, because a file's mtime is never older than
 * its newest event.
 *
 * The script reads compressed session logs with zstdcat. It pairs every
 * tool/call with its tool/result and counts the failures. It never prints
 * file contents. It keeps only short error previews.
 *
 * Reported metrics:
 *   1. Tool call totals per tool.
 *   2. Failure counts per error code.
 *   3. Failure rate per mutating call. This is the headline number.
 *   4. Root cause split for E_RANGE_UNVERIFIED:
 *        drifted_after_edit  - the anchor was served for this file, then an
 *                              edit to the same file invalidated the served
 *                              mirror. This is the bug the fork fixes.
 *        no_intervening_edit - the anchor was served, no edit came between.
 *        served_other_file   - the anchor was served for a different file.
 *        never_served        - the anchor was never shown. The model invented it.
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import fs from "node:fs";
import path from "node:path";

const sessionsRoot =
	process.argv[2] || path.join(process.env.HOME || "", ".dsh", "sessions");
const outDir = process.argv[3] || "./hashline-friction-report";

const MUTATE = new Set(["edit", "batch_edit"]);
const ALL = new Set(["read", "edit", "batch_edit", "undo_last_edit"]);
const ANCHOR_ROW_RE = /(?:^|\n)\s*[+\- ]?([A-Za-z0-9]{3})│/g;

const sinceMs = process.env.SINCE ? Date.parse(process.env.SINCE) : null;
if (process.env.SINCE && Number.isNaN(sinceMs)) {
	console.error(`Bad SINCE value: ${process.env.SINCE}`);
	process.exit(1);
}

/** True when an event timestamp falls inside the requested window. */
function inWindow(time) {
	if (sinceMs === null) return true;
	if (typeof time !== "number") return false;
	return time >= sinceMs;
}

function findSessionFiles(root) {
	const out = [];
	let projects;
	try {
		projects = fs
			.readdirSync(root, { withFileTypes: true })
			.filter((d) => d.isDirectory());
	} catch (error) {
		console.error(`Cannot read ${root}: ${error.message}`);
		process.exit(1);
	}
	for (const project of projects) {
		const projectDir = path.join(root, project.name);
		let sessionDirs;
		try {
			sessionDirs = fs
				.readdirSync(projectDir, { withFileTypes: true })
				.filter((d) => d.isDirectory());
		} catch {
			continue;
		}
		for (const sessionDir of sessionDirs) {
			const dir = path.join(projectDir, sessionDir.name);
			let files;
			try {
				files = fs.readdirSync(dir);
			} catch {
				continue;
			}
			for (const file of files) {
				if (!file.startsWith("session.jsonl") || !file.includes("zstd")) continue;
				const full = path.join(dir, file);
				if (sinceMs !== null) {
					try {
						// Safe pre-filter only: a file whose mtime predates the cut cannot
						// hold an event after it. Per-event filtering still happens below.
						if (fs.statSync(full).mtimeMs < sinceMs) continue;
					} catch {
						continue;
					}
				}
				out.push({
					project: project.name,
					sessionId: sessionDir.name,
					file: full,
				});
			}
		}
	}
	return out;
}

function argPath(argsText) {
	const match = argsText.match(/"(?:path|file_path)"\s*:\s*"([^"]+)"/);
	return match ? match[1] : null;
}

function scanOne({ project, sessionId, file }) {
	return new Promise((resolve) => {
		const calls = new Map();
		const servedAt = new Map(); // anchor -> Map(path -> ordinal)
		const lastEditOrdinal = new Map(); // path -> ordinal
		const toolCallCounts = {};
		const codeCounts = {};
		const unverifiedBuckets = {};
		const examples = [];
		let ordinal = 0;

		let child;
		try {
			child = spawn("zstdcat", [file], { stdio: ["ignore", "pipe", "ignore"] });
		} catch {
			resolve({ toolCallCounts, codeCounts, unverifiedBuckets, examples });
			return;
		}

		const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
		rl.on("line", (line) => {
			if (!line) return;
			let event;
			try {
				event = JSON.parse(line);
			} catch {
				return;
			}

			if (event.type === "tool/call") {
				const data = event.data;
				if (!data || !ALL.has(data.name)) return;
				ordinal += 1;
				const args = String(data.arguments || "");
				// Count the call only when it falls in the window. The call is still
				// registered below, because a post-window result may pair with it.
				if (inWindow(event.time)) {
					toolCallCounts[data.name] = (toolCallCounts[data.name] || 0) + 1;
				}
				calls.set(data.callId, {
					name: data.name,
					ordinal,
					args,
					path: argPath(args),
				});
				return;
			}
			if (event.type !== "tool/result") return;

			const data = event.data;
			const items =
				data && data.message && Array.isArray(data.message.content)
					? data.message.content
					: [];
			for (const item of items) {
				if (!item || item.type !== "tool-result") continue;
				const call = calls.get(item.toolCallId);
				if (!call) continue;
				calls.delete(item.toolCallId);

				let text = "";
				try {
					const inner = item.content;
					if (Array.isArray(inner)) {
						for (const block of inner) {
							if (block && typeof block.text === "string") text += block.text;
						}
					} else if (typeof inner === "string") {
						text = inner;
					}
				} catch {
					// keep text empty
				}
				const filePath = call.path;

				if (item.isError !== true) {
					if (filePath) {
						ANCHOR_ROW_RE.lastIndex = 0;
						for (const match of text.matchAll(ANCHOR_ROW_RE)) {
							let byPath = servedAt.get(match[1]);
							if (!byPath) {
								byPath = new Map();
								servedAt.set(match[1], byPath);
							}
							byPath.set(filePath, call.ordinal);
						}
						if (MUTATE.has(call.name)) {
							lastEditOrdinal.set(filePath, call.ordinal);
						}
					}
					continue;
				}

				// Anchor and edit history above is tracked for EVERY event, in or out
				// of the window, because bucket classification needs the full history.
				// Only the failure counters below are gated.
				if (!inWindow(event.time)) continue;

				const bracket = text.match(/\[([A-Z_]+)\]/);
				const structured = data.error && data.error.code ? data.error.code : null;
				const code = bracket ? bracket[1] : structured || "NO_CODE";
				codeCounts[code] = (codeCounts[code] || 0) + 1;

				if (code !== "E_RANGE_UNVERIFIED" || !filePath) continue;

				const submitted = new Set();
				for (const match of call.args.matchAll(
					/"remove_(?:from|to)"\s*:\s*"([A-Za-z0-9]{3})"/g,
				)) {
					submitted.add(match[1]);
				}
				for (const anchor of submitted) {
					const byPath = servedAt.get(anchor);
					let bucket;
					if (!byPath || byPath.size === 0) {
						bucket = "never_served";
					} else if (!byPath.has(filePath)) {
						bucket = "served_other_file";
					} else {
						const servedOrdinal = byPath.get(filePath);
						const editOrdinal = lastEditOrdinal.get(filePath);
						bucket =
							editOrdinal !== undefined && editOrdinal > servedOrdinal
								? "drifted_after_edit"
								: "no_intervening_edit";
					}
					unverifiedBuckets[bucket] = (unverifiedBuckets[bucket] || 0) + 1;
					if (examples.length < 3) {
						examples.push({
							project,
							sessionId,
							anchor,
							bucket,
							preview: text.slice(0, 160).replace(/\s+/g, " ").trim(),
						});
					}
				}
			}
		});
		rl.on("close", () =>
			resolve({ toolCallCounts, codeCounts, unverifiedBuckets, examples }),
		);
		child.on("error", () =>
			resolve({ toolCallCounts, codeCounts, unverifiedBuckets, examples }),
		);
	});
}

function addInto(target, source) {
	for (const [key, value] of Object.entries(source)) {
		target[key] = (target[key] || 0) + value;
	}
}

async function main() {
	const files = findSessionFiles(sessionsRoot);
	if (files.length === 0) {
		console.error("No session files matched. Check the path and SINCE value.");
		process.exit(1);
	}
	console.error(
		`Scanning ${files.length} session files${sinceMs !== null ? ` modified since ${process.env.SINCE}` : ""}.`,
	);

	const toolCallCounts = {};
	const codeCounts = {};
	const unverifiedBuckets = {};
	const examples = [];
	let scanned = 0;

	const CONCURRENCY = 8;
	let index = 0;
	async function worker() {
		while (index < files.length) {
			const entry = files[index++];
			const result = await scanOne(entry);
			scanned += 1;
			addInto(toolCallCounts, result.toolCallCounts);
			addInto(codeCounts, result.codeCounts);
			addInto(unverifiedBuckets, result.unverifiedBuckets);
			for (const example of result.examples) {
				if (examples.length < 20) examples.push(example);
			}
			if (scanned % 50 === 0) {
				console.error(`...${scanned}/${files.length}`);
			}
		}
	}
	await Promise.all(Array.from({ length: CONCURRENCY }, worker));

	const mutatingCalls =
		(toolCallCounts.edit || 0) + (toolCallCounts.batch_edit || 0);
	const totalFailures = Object.values(codeCounts).reduce((a, b) => a + b, 0);
	const unverified = codeCounts.E_RANGE_UNVERIFIED || 0;
	const rate = (n) =>
		mutatingCalls > 0 ? Number(((n / mutatingCalls) * 100).toFixed(2)) : null;

	const report = {
		generatedAt: new Date().toISOString(),
		since: process.env.SINCE || null,
		scannedFiles: scanned,
		toolCallCounts,
		mutatingCalls,
		totalFailures,
		codeCounts,
		unverifiedBuckets,
		headline: {
			failuresPerHundredMutatingCalls: rate(totalFailures),
			unverifiedPerHundredMutatingCalls: rate(unverified),
			driftedAfterEditPerHundredMutatingCalls: rate(
				unverifiedBuckets.drifted_after_edit || 0,
			),
		},
		examples,
	};

	fs.mkdirSync(outDir, { recursive: true });
	fs.writeFileSync(
		path.join(outDir, "report.json"),
		JSON.stringify(report, null, 2),
	);

	const lines = [];
	lines.push(`Generated: ${report.generatedAt}`);
	lines.push(`SINCE filter: ${report.since || "(none - all sessions)"}`);
	lines.push(`Sessions scanned: ${scanned}`);
	lines.push("");
	lines.push("Tool calls:");
	for (const [tool, count] of Object.entries(toolCallCounts).sort(
		(a, b) => b[1] - a[1],
	)) {
		lines.push(`  ${tool}: ${count}`);
	}
	lines.push(`  mutating calls (edit + batch_edit): ${mutatingCalls}`);
	lines.push("");
	lines.push("Failures by error code:");
	for (const [code, count] of Object.entries(codeCounts).sort(
		(a, b) => b[1] - a[1],
	)) {
		lines.push(`  ${code}: ${count}`);
	}
	lines.push("");
	lines.push("E_RANGE_UNVERIFIED root cause:");
	for (const [bucket, count] of Object.entries(unverifiedBuckets).sort(
		(a, b) => b[1] - a[1],
	)) {
		lines.push(`  ${bucket}: ${count}`);
	}
	lines.push("");
	lines.push("HEADLINE (compare these against the baseline):");
	lines.push(
		`  failures per 100 mutating calls: ${report.headline.failuresPerHundredMutatingCalls}`,
	);
	lines.push(
		`  E_RANGE_UNVERIFIED per 100 mutating calls: ${report.headline.unverifiedPerHundredMutatingCalls}`,
	);
	lines.push(
		`  drifted_after_edit per 100 mutating calls: ${report.headline.driftedAfterEditPerHundredMutatingCalls}`,
	);
	fs.writeFileSync(path.join(outDir, "summary.txt"), `${lines.join("\n")}\n`);

	console.error(`Wrote report.json and summary.txt to ${outDir}`);
	console.error("");
	console.error(lines.slice(-4).join("\n"));
}

main();
