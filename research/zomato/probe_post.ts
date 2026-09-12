const H = {
  "Accept": "application/json",
  "Content-Type": "application/json; charset=UTF-8",
  "X-Zomato-API-Key": "7749b19667964b87a3efc739e254ada2",
  "X-Zomato-Client-Id": "5276d7f1-910b-4243-92ea-d27e758ad02b",
  "X-Zomato-App-Version": "986",
  "X-Zomato-App-Version-Code": "1710019860",
  "User-Agent": "okhttp/4.12.0",
};
for (
  const p of [
    "/gw/order/history/online_order",
    "/gw/consumer/order_history",
    "/gw/order/order_summary",
  ]
) {
  try {
    const r = await fetch("https://api.zomato.com" + p, { method: "POST", headers: H, body: "{}" });
    const t = await r.text();
    console.log(`--- POST ${p} -> ${r.status} ${r.headers.get("content-type")}`);
    console.log(t.slice(0, 300));
  } catch (e) {
    console.log(`--- POST ${p} FAILED: ${(e as Error).message}`);
  }
}
