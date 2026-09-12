// Tests for run log redaction and drift detection. Run with deno test.
// Each case checks one rule from the T15 ticket.

import { createRunLog, redact } from "../src/log.ts";
import { detectDrift, driftMessage, ISSUES_URL } from "../src/drift.ts";

// Throw on a false check with a plain message.
function assert(cond: boolean, msg: string): void {
  // Raise a plain error when the check fails.
  if (!cond) throw new Error("assert failed: " + msg);
}

Deno.test("redact masks phones mails tokens cash and codes", () => {
  // Check a ten digit phone keeps only the last four.
  const phone = redact("call 9876543210 now");
  // Assert the short phone form lands in the text.
  assert(phone.includes("PHONE-…3210"), "phone keeps last four digits");
  // Assert the full phone number never survives.
  assert(!phone.includes("9876543210"), "phone drops full number");
  // Check a four digit number stays untouched.
  const short = redact("code 1234 done");
  // Assert short numbers pass through unchanged.
  assert(short.includes("1234"), "four digit number stays");
  // Check an email masks the local part.
  const mail = redact("mail me at foo@example.com please");
  // Assert the masked mail keeps the domain.
  assert(mail.includes("e***@example.com"), "email masks local part");
  // Assert the raw local part never survives.
  assert(!mail.includes("foo@example.com"), "email drops local part");
  // Check a bearer token masks its value.
  const bearer = redact("auth Bearer abc123 here");
  // Assert the bearer value turns into the token mark.
  assert(bearer.includes("Bearer TOKEN-REDACTED"), "bearer masks value");
  // Assert the raw bearer value never survives.
  assert(!bearer.includes("abc123"), "bearer drops raw value");
  // Check a rupee amount masks its digits.
  const cash = redact("paid ₹1,234.50 today");
  // Assert the cash mark lands in the text.
  assert(cash.includes("₹<amount>"), "cash masks amount");
  // Assert the raw digits never survive.
  assert(!cash.includes("1,234.50"), "cash drops raw digits");
  // Check a standalone six digit code masks as one time code.
  const otp = redact("otp 981713 ok");
  // Assert the code mark lands in the text.
  assert(otp.includes("OTP-REDACTED"), "code masks six digits");
  // Assert the raw code never survives.
  assert(!otp.includes("981713"), "code drops raw digits");
});

Deno.test("redact masks splitwise consumer key", () => {
  // Feed a JSON consumer key line.
  const out = redact('"consumer_key": "ABCDEFGHIJ1234567890"');
  // Assert the full key never survives.
  assert(!out.includes("ABCDEFGHIJ1234567890"), "consumer key drops full value");
  // Assert the edge chars survive in short form.
  assert(out.includes("ABCD…7890"), "consumer key keeps edge chars");
});

Deno.test("redact masks splitwise consumer secret", () => {
  // Feed a text consumer secret line.
  const out = redact("consumer_secret=SECRETVALUE987654321");
  // Assert the full secret never survives.
  assert(!out.includes("SECRETVALUE987654321"), "consumer secret drops full value");
  // Assert the edge chars survive in short form.
  assert(out.includes("SECR…4321"), "consumer secret keeps edge chars");
});

Deno.test("redact masks zomato api key and client id", () => {
  // Feed Zomato header shapes in one line.
  const out = redact(
    "X-Zomato-API-Key: 7749b19667964b87a3efc739e254ada2 clientId=5276d7f1-910b-4243-92ea-d27e758ad02b",
  );
  // Assert the api key never survives.
  assert(!out.includes("7749b19667964b87a3efc739e254ada2"), "api key drops full value");
  // Assert the client id never survives.
  assert(!out.includes("5276d7f1-910b-4243-92ea-d27e758ad02b"), "client id drops full value");
  // Assert the api key edge chars survive.
  assert(out.includes("7749…ada2"), "api key keeps edge chars");
});

Deno.test("redact masks zomato access token header", () => {
  // Feed a Zomato access token header line.
  const out = redact("X-Zomato-Access-Token: TOKENVALUEABCDEFGHIJ1234");
  // Assert the full token never survives.
  assert(!out.includes("TOKENVALUEABCDEFGHIJ1234"), "access token drops full value");
  // Assert the token edge chars survive.
  assert(out.includes("TOKE…1234"), "access token keeps edge chars");
});

Deno.test("detectDrift flags three 401s as auth-universal", () => {
  // Build three plain auth failures.
  const failures = [1, 2, 3].map((n) => ({
    platform: "site" + n,
    kind: "http" as const,
    status: 401,
    detail: "denied",
  }));
  // Assert the auth signature wins.
  assert(detectDrift(failures) === "auth-universal", "three 401s flag auth");
});

Deno.test("detectDrift returns null for only two 401s", () => {
  // Build two plain auth failures with no third hit.
  const failures = [1, 2].map((n) => ({
    platform: "site" + n,
    kind: "http" as const,
    status: 401,
    detail: "denied",
  }));
  // Assert two hits stay below the bar.
  assert(detectDrift(failures) === null, "two 401s stay null");
});

Deno.test("detectDrift flags a history 500", () => {
  // Assert a history 500 maps to the history signature.
  assert(
    detectDrift([{
      platform: "zomato",
      kind: "http",
      status: 500,
      detail: "history fetch failed",
    }]) === "history-server-error",
    "history 500 flags history",
  );
});

Deno.test("detectDrift flags an all parse list", () => {
  // Build a list with only parse failures.
  const failures = [1, 2].map((n) => ({
    platform: "site" + n,
    kind: "parse" as const,
    detail: "bill shape changed",
  }));
  // Assert the parse list maps to the bills signature.
  assert(detectDrift(failures) === "bills-not-parsing", "all parse flags bills");
});

Deno.test("detectDrift returns null for an empty list", () => {
  // Assert no failures means no drift.
  assert(detectDrift([]) === null, "empty list stays null");
});

Deno.test("createRunLog writes redacted lines", async () => {
  // Make a temp dir for the run log.
  const dir = await Deno.makeTempDir();
  // Create the log inside the temp dir.
  const log = createRunLog("testkind", dir);
  // Assert the log path sits inside the temp dir.
  assert(log.path.startsWith(dir), "log path sits in temp dir");
  // Write a line with a full phone number.
  log.write("info", "user phone 9876543210 called");
  // Poll the file until content lands or time runs out.
  let text = "";
  // Read in a loop while the background write lands.
  for (let i = 0; i < 50; i++) {
    try {
      text = await Deno.readTextFile(log.path);
      // Stop polling once the redacted phone lands.
      if (text.includes("PHONE-…3210")) break;
    } catch {
      // Ignore missing file reads while the write lands.
    }
    // Pause briefly before the next read.
    await new Promise((r) => setTimeout(r, 100));
  }
  // Check the last four digits survive.
  assert(text.includes("PHONE-…3210"), "log keeps last four digits");
  // Check the full number never lands on disk.
  assert(!text.includes("9876543210"), "log drops full number");
});

Deno.test("driftMessage names the tracker and the log", () => {
  // Build the message for a fixed fake log path.
  const msg = driftMessage("auth-universal", "/tmp/fake-run.log");
  // Assert the user text links the issue tracker.
  assert(msg.user.includes(ISSUES_URL), "user text links tracker");
  // Assert the user text names the log path.
  assert(msg.user.includes("/tmp/fake-run.log"), "user text names log");
});
