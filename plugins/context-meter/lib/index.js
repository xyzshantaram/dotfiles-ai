// plugins/context-meter/src/index.ts
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";
var name = "context-meter";
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
}
export {
  apply,
  name
};
