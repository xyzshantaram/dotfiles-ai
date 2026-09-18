// Run logs with redaction for split-utils. Logs stay safe to share.
// Redact phones and tokens before they reach the file.

import { stateRoot } from "./paths.ts";

// Mask a secret value and keep edge chars only.
function maskSecret(value: string): string {
  // Replace short values with one mark.
  if (value.length <= 8) return "[redacted]";
  // Keep first four and last four chars.
  return value.slice(0, 4) + "…" + value.slice(-4);
}

// Mask secrets in a log line and return the safe text.
export function redact(line: string): string {
  // Mask Splitwise consumer key and secret first.
  let out = line.replace(
    /["']?consumer_(key|secret)["']?\s*[:=]\s*["']?([^"'\s;,}]+)/gi,
    (_m: string, kind: string, value: string) => "consumer_" + kind + "=" + maskSecret(value),
  );
  // Mask Zomato api key shapes next.
  out = out.replace(
    /["']?(apiKey|api_key|X-Zomato-API-Key)["']?\s*[:=]\s*["']?([^"'\s;,}]+)/gi,
    (_m: string, key: string, value: string) => key + "=" + maskSecret(value),
  );
  // Mask Zomato client id shapes next.
  out = out.replace(
    /["']?(clientId|client_id|X-Zomato-Client-Id)["']?\s*[:=]\s*["']?([^"'\s;,}]+)/gi,
    (_m: string, key: string, value: string) => key + "=" + maskSecret(value),
  );
  // Mask Zomato access token headers next.
  out = out.replace(
    /["']?(X-Zomato-Access-Token|Authorization)["']?\s*[:=]\s*["']?([^"'\s;,}]+)/gi,
    (_m: string, key: string, value: string) => key + "=" + maskSecret(value),
  );
  // Mask standalone six digit codes next.
  out = out.replace(/(^|[^0-9])(\d{6})(?![0-9])/g, "$1OTP-REDACTED");
  // Mask phone shaped runs and keep the last four digits.
  out = out.replace(/\+?\d[\d\s-]{8,22}\d/g, (m) => {
    // Count digits and skip short runs.
    const digits = m.replace(/\D/g, "");
    // Reject runs outside the phone length band.
    if (digits.length < 10 || digits.length > 14) return m;
    // Keep only the last four digits.
    return "PHONE-…" + digits.slice(-4);
  });
  // Mask email local parts and keep the domain.
  out = out.replace(
    /([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
    "e***@$2",
  );
  // Mask bearer tokens next.
  out = out.replace(/Bearer\s+[^\s;,\"']+/g, "Bearer TOKEN-REDACTED");
  // Mask token and access token values next.
  out = out.replace(/(access_token|token)=([^\s&;,\"']+)/g, "$1=TOKEN-REDACTED");
  // Mask rupee amounts last.
  out = out.replace(/₹\s?[\d,]+(?:\.\d+)?/g, "₹<amount>");
  return out;
}

// One run log file with levelled writes.
export interface RunLog {
  path: string;
  write(level: "info" | "warn" | "error", line: string): void;
  close(summary?: string): void;
}

// Create a run log under the state cache or a given dir.
export function createRunLog(kind: string, dir?: URL | string): RunLog {
  // Use the given dir when present.
  let dirPath: string;
  // Read the caller dir from a string path.
  if (typeof dir === "string") {
    dirPath = dir;
  } else if (dir instanceof URL) {
    // Decode the file URL path for use on disk.
    dirPath = decodeURIComponent(dir.pathname);
  } else {
    // Default to the logs dir under the active state root. This must
    // not derive from import.meta.url: a module loaded from a URL has
    // no directory of its own, and that resolved to "/state".
    dirPath = stateRoot() + "/cache/logs/";
  }
  // Create the dir and ignore errors here.
  try {
    Deno.mkdirSync(dirPath, { recursive: true });
  } catch {
    // Swallow setup errors so runs never break.
  }
  // Build a timestamped file name for this run.
  const fileName = `${Date.now()}-${kind}.log`;
  // Join the dir and the file name.
  const filePath = dirPath.replace(/\/+$/, "") + "/" + fileName;
  // Append one redacted line and never throw.
  function append(level: string, text: string): void {
    try {
      const stamped = new Date().toISOString() + "\t" + level + "\t" +
        redact(text) + "\n";
      Deno.writeTextFile(filePath, stamped, { append: true }).catch(() => {});
    } catch {
      // Swallow logging errors so runs never break.
    }
  }
  return {
    path: filePath,
    write(level: "info" | "warn" | "error", line: string): void {
      // Append the levelled line to the file.
      append(level, line);
    },
    close(summary?: string): void {
      // Append the final done line with the summary.
      append("done", summary ?? "done");
    },
  };
}
