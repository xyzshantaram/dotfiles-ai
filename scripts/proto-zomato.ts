// Zomato prototype CLI for split-utils.
// Plain Deno only.
// Run from the split-utils root.
// Commands are login verify tokens history detail extract.

import {
  completeConsent,
  exchangeCode,
  fetchHistoryPage,
  fetchLoginChallenge,
  fetchOrderDetail,
  type HistorySkeleton,
  loadLoginState,
  loadTokens,
  mapHistoryOrder,
  parseBill,
  parseHistoryPage,
  saveTokens,
  sendOtp,
  TOKENS_FILE,
  verifyOtp,
} from "../src/zomato.ts";

const RUN_DIR = "/tmp/dsh/zomato-run";

// Print use and stop with an error.
function usage(): never {
  console.log(
    "use: proto-zomato.ts login <phone> | verify <phone> <otp> | tokens | history [maxPages] | detail <orderId> | extract",
  );
  Deno.exit(1);
}

// Load the access token or stop and name the login step.
async function needToken(): Promise<string> {
  const stored = await loadTokens();
  if (!stored) {
    console.error("no tokens found (run login then verify first)");
    Deno.exit(1);
  }
  return stored.access_token;
}

// Pull history pages up to maxPages.
// Return cards plus raw pages for dumps.
async function loadHistory(
  token: string,
  maxPages: number,
): Promise<{ orders: HistorySkeleton[]; postback: string; raws: unknown[] }> {
  const orders: HistorySkeleton[] = [];
  const raws: unknown[] = [];
  let postback = "";
  for (let page = 0; page < maxPages; page++) {
    const raw = await fetchHistoryPage(token, postback || undefined);
    raws.push(raw);
    const root = raw as Record<string, unknown>;
    if (!Array.isArray(root["results"])) {
      console.error("history call failed (run login then verify first)");
      console.error(`server body ${JSON.stringify(raw).slice(0, 300)}`);
      Deno.exit(1);
    }
    const parsed = parseHistoryPage(raw);
    orders.push(...parsed.orders);
    postback = parsed.postback;
    if (!parsed.hasMore) break;
  }
  return { orders, postback, raws };
}

const [cmd, ...args] = Deno.args;

switch (cmd) {
  case "login": {
    const phone = args[0];
    if (!phone) usage();
    let state;
    try {
      state = await fetchLoginChallenge();
    } catch (e) {
      console.error(`login challenge failed (${(e as Error).message})`);
      Deno.exit(1);
    }
    const res = await sendOtp(phone, state);
    const body = await res.json().catch(() => null) as
      | { status?: boolean; message?: string }
      | null;
    if (!res.ok || !body?.status) {
      console.error(
        `OTP request failed (status ${res.status} body ${JSON.stringify(body)?.slice(0, 300)})`,
      );
      Deno.exit(1);
    }
    console.log(`OTP sent to ${phone}. Next: proto-zomato.ts verify ${phone} <otp>`);
    break;
  }

  case "verify": {
    const phone = args[0];
    const otp = args[1];
    if (!phone || !otp) usage();
    const state = await loadLoginState();
    if (!state) {
      console.error("no login state (run login first)");
      Deno.exit(1);
    }
    let consentUrl: string;
    try {
      ({ consentUrl } = await verifyOtp(phone, otp, state));
    } catch (e) {
      console.error(`OTP check failed (${(e as Error).message})`);
      Deno.exit(1);
    }
    let grant: { code: string; state: string; scope: string };
    try {
      grant = await completeConsent(consentUrl, state);
    } catch (e) {
      console.error(`consent step failed (${(e as Error).message})`);
      Deno.exit(1);
    }
    const pair = await exchangeCode(grant, state);
    await saveTokens(pair.access_token, pair.refresh_token);
    console.log("tokens saved (access + refresh)");
    break;
  }

  case "tokens": {
    try {
      const raw = await Deno.readTextFile(TOKENS_FILE);
      const data = JSON.parse(raw) as { obtained_at?: string };
      console.log(`tokens present (obtained_at ${data.obtained_at ?? "unknown"})`);
    } catch {
      console.log("no tokens stored (run the login step first)");
    }
    break;
  }

  case "history": {
    const maxPages = args[0] ? parseInt(args[0], 10) : 3;
    if (!Number.isFinite(maxPages) || maxPages < 1) usage();
    const token = await needToken();
    const { orders, postback, raws } = await loadHistory(token, maxPages);
    await Deno.mkdir(RUN_DIR, { recursive: true });
    await Deno.writeTextFile(
      `${RUN_DIR}/first-history.json`,
      JSON.stringify(raws[0] ?? null, null, 2),
    );
    await Deno.writeTextFile(
      "out/zomato-orders-raw.json",
      JSON.stringify({ orders, postback }, null, 2),
    );
    for (const o of orders) console.log(`${o.orderId} ${o.date} ${o.paid} ${o.restaurant}`);
    break;
  }

  case "detail": {
    const orderId = args[0];
    if (!orderId) usage();
    const token = await needToken();
    const raw = await fetchOrderDetail(token, orderId);
    await Deno.mkdir(RUN_DIR, { recursive: true });
    await Deno.writeTextFile(`${RUN_DIR}/detail-${orderId}.json`, JSON.stringify(raw, null, 2));
    console.log(`top keys ${(Object.keys((raw as Record<string, unknown>) ?? {})).join(" ")}`);
    break;
  }

  case "extract": {
    const maxPages = args[0] ? parseInt(args[0], 10) : 3;
    if (!Number.isFinite(maxPages) || maxPages < 1) usage();
    const token = await needToken();
    const { orders } = await loadHistory(token, maxPages);
    const out = [];
    for (const skel of orders) {
      try {
        const detail = await fetchOrderDetail(token, skel.orderId);
        const lines = parseBill(detail);
        const mapped = mapHistoryOrder(skel);
        for (const l of lines) {
          if (/delivery partner fee/i.test(l.name)) {
            mapped.fees.delivery += l.price;
          } else {
            let name = l.name, price = l.price;
            if (/^gst/i.test(name)) name = "[GST]";
            else if (/platform fee/i.test(name)) name = "[Handling]";
            else if (/delivery partner tip/i.test(name)) name = "[Tip]";
            else if (/coupon applied|item discount/i.test(name)) {
              name = "[Discount]";
              price = -Math.abs(price);
            } else if (/item total/i.test(name)) continue; // informational
            mapped.items.push({ name, price, quantity: l.quantity });
          }
        }
        const sum = mapped.items.reduce((s, i) => s + i.price * i.quantity, 0) +
          mapped.fees.delivery + mapped.fees.packaging;
        if (Math.abs(sum - mapped.paid) >= 0.01) {
          console.error(
            `balance miss for order ${skel.orderId} (sum ${sum.toFixed(2)} paid ${mapped.paid})`,
          );
          Deno.exit(1);
        }
        out.push(mapped);
      } catch (e) {
        console.error(
          `extract blocked at bill parse for order ${skel.orderId} (${(e as Error).message})`,
        );
        Deno.exit(1);
      }
    }
    await Deno.writeTextFile("out/orders-zomato.json", JSON.stringify(out, null, 2));
    console.log(`wrote out/orders-zomato.json (${out.length} orders)`);
    break;
  }

  default:
    usage();
}
