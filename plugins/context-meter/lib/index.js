// plugins/context-meter/src/index.ts
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";

// plugins/shared/http.ts
var DEFAULT_MAX_BODY_BYTES = 64 * 1024;
function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

// plugins/context-meter/src/index.ts
var name = "context-meter";
var inject = [];
var PRICES_NS = settingsNamespace("prices");
var PRICES_SCHEMA = z.object({
  rates: z.dict(z.any()).default({}),
  overrides: z.dict(z.any()).default({})
});
function apply(ctx) {
  installSettingsSection(
    ctx,
    PRICES_NS,
    PRICES_SCHEMA,
    { rates: {}, overrides: {} },
    {
      setSource: () => {
      },
      onChange: () => {
      }
    }
  );
  try {
    ctx.inject(["webServer"], (scope) => {
      const server = scope.webServer;
      server.register({
        kind: "exact",
        path: "/context-meter/prices",
        handler: (req, res) => {
          if (req.method !== "GET") {
            sendJson(res, 405, { ok: false, error: "method not allowed" });
            return;
          }
          const settings = ctx.get(
            "settings"
          );
          const doc = settings?.get(PRICES_NS);
          if (doc === void 0) {
            sendJson(res, 503, { ok: false, error: "prices unavailable" });
            return;
          }
          sendJson(res, 200, {
            ok: true,
            prices: {
              rates: doc.rates ?? {},
              overrides: doc.overrides ?? {}
            }
          });
        }
      });
    });
  } catch {
  }
}
export {
  apply,
  inject,
  name
};
