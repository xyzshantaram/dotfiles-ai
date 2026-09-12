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
  const [m, p, b] of [["POST", "/v2/order/crystal_v2", "{}"], [
    "GET",
    "/v2/order/crystal_v2",
    null,
  ]] as const
) {
  try {
    const r = await fetch("https://api.zomato.com" + p, {
      method: m,
      headers: H,
      body: b ?? undefined,
    });
    const t = await r.text();
    console.log(`--- ${m} ${p} -> ${r.status} ${r.headers.get("content-type")}`);
    console.log(t.slice(0, 250));
  } catch (e) {
    console.log(`--- ${m} ${p} FAILED: ${(e as Error).message}`);
  }
}
