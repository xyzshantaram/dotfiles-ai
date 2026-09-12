// Set up Splitwise access and run the OAuth handshake.
// Shared by the first run flow and the Settings menu.
import { MepCLI } from "mepcli";
import { confirm, open_url, say, step } from "../src/wizardkit.ts";
import { stateRoot } from "../src/runstate.ts";
import { loadCredentials, saveToken, SplitwiseAPI } from "../src/splitwise.ts";
import type { RunLog } from "../src/log.ts";

// True when a Splitwise key pair is already saved.
export async function splitwiseConfigured(): Promise<boolean> {
  try {
    await Deno.stat(stateRoot() + "/config/splitwise.env");
    return true;
  } catch {
    return false;
  }
}

// Ask for the key pair, save it, and offer the handshake.
export async function setupSplitwise(log: RunLog | null): Promise<void> {
  const replacing = await splitwiseConfigured();
  say("To push expenses, this app needs its own Consumer Key and Consumer Secret from Splitwise.");
  say(
    "They are free: register this app at secure.splitwise.com/apps and copy the two codes it shows.",
  );
  const open = await confirm("Open that page in your browser now?");
  if (open) {
    await open_url("https://secure.splitwise.com/apps");
  }
  const has = await confirm("Do you have the Consumer Key and Consumer Secret?");
  if (!has) {
    say("No problem. A friend with API access can push for you.");
    say("Read the README section Sharing without an API key for the full guide.");
    return;
  }
  if (replacing) {
    say("This replaces the saved key.");
  }
  const key = await MepCLI.text({ message: "Paste the Consumer Key" });
  const secret = await MepCLI.secret({ message: "Paste the Consumer Secret" });
  const envPath = stateRoot() + "/config/splitwise.env";
  await Deno.mkdir(stateRoot() + "/config", { recursive: true });
  // Write owner only so secrets stay private.
  await Deno.writeTextFile(
    envPath,
    "CONSUMER_KEY=" + key.trim() + "\nCONSUMER_SECRET=" + secret.trim() + "\n",
    { mode: 0o600 },
  );
  // Fix the mode again for existing files.
  try {
    await Deno.chmod(envPath, 0o600);
  } catch {
    // Ignore chmod errors on non posix disks.
  }
  say("Saved your Splitwise access.");
  log?.write("info", "wrote splitwise env " + envPath);
  const go = await confirm("Connect to Splitwise now?");
  if (!go) return;
  const credentials = await loadCredentials(envPath);
  const api = new SplitwiseAPI(credentials);
  const pair = await api.getAuthorizeUrl();
  await open_url(pair.url);
  step("Choose Allow on the Splitwise page.");
  step("Copy the code the page shows and paste it here.");
  const verifier = await MepCLI.text({ message: "Paste the code from the Splitwise page" });
  const token = await api.getAccessToken(pair.requestToken, verifier.trim());
  await saveToken(token);
  const authed = new SplitwiseAPI(credentials, token);
  const me = await authed.getCurrentUser();
  const first = typeof me["first_name"] === "string" ? me["first_name"] : "";
  const last = typeof me["last_name"] === "string" ? me["last_name"] : "";
  const name = (first + " " + last).trim();
  say("Signed in as " + (name ? name : JSON.stringify(me)));
}
