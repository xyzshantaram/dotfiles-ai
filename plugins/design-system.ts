/**
 * Dark settings form control design system — shared client module.
 *
 * One source of truth for the token set and the control component rules in
 * src/DESIGN.md. Client bundles inject DESIGN_TOKENS and CONTROLS_CSS into
 * their own <style> tag, then retune their component rules against these
 * values (padding roughly 20% below the old values, radii inside the
 * DESIGN.md band). Plain constants only: no types, no JSX. The build step
 * bundles this module into each client bundle that imports it.
 */

/**
 * §22 — the `:root` token block, verbatim from DESIGN.md. Colors, the
 * radius system (sm/md/lg/pill), and the 8px spacing grid.
 */
export const DESIGN_TOKENS = `:root {
  --bg: #2c2c2e;
  --surface: #232324;
  --surface-hover: #303032;
  --surface-active: #43454a;

  --border: #3e3e3f;
  --border-subtle: #303031;
  --border-focus: #66676b;

  --text-primary: #f9fafb;
  --text-secondary: #adb2b8;
  --text-muted: #88898a;

  --radius-sm: 7px;
  --radius-md: 12px;
  --radius-lg: 20px;
  --radius-pill: 999px;

  --space-1: 8px;
  --space-2: 16px;
  --space-3: 24px;
  --space-4: 32px;
  --space-5: 40px;
  --space-6: 48px;
}`;

/**
 * §6–§14 — control component rules, written against the tokens above.
 * Exact DESIGN.md shapes: setting cards, segmented controls, control lists,
 * compact pills, icon buttons, mode switch, text input, primary button,
 * checkbox field. Class names are kebab-case shared vocabulary; bundles
 * that inject this keep the class names.
 */
export const CONTROLS_CSS = `
.setting-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:var(--space-3);display:grid;grid-template-columns:28px 1fr;gap:20px;align-items:start}
.setting-checkbox{width:28px;height:28px;flex:0 0 28px;border-radius:3px}
.segmented-control{display:flex;padding:4px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}
.segment{min-width:175px;height:48px;border:0;border-radius:10px;background:transparent;color:var(--text-secondary);font-size:20px}
.segment[data-active="true"]{background:var(--surface-active);color:var(--text-primary);font-weight:600}
.control-list{overflow:hidden;border:1px solid var(--border);border-radius:14px;background:var(--surface)}
.control-list-row{min-height:64px;padding:0 20px;display:flex;align-items:center;gap:12px}
.control-list-row + .control-list-row{border-top:1px solid var(--border-subtle)}
.pill{height:36px;padding-inline:10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:transparent;color:var(--text-secondary);font-size:16px}
.pill[data-active="true"]{background:var(--surface-active);color:var(--text-primary)}
.icon-button{width:40px;height:40px;display:inline-grid;place-items:center;border:0;border-radius:8px;background:transparent;color:var(--text-secondary);font-size:28px}
.icon-button:hover{background:var(--surface-hover);color:var(--text-primary)}
.mode-switch{display:inline-flex;padding:4px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface)}
.mode-switch>button{height:44px;padding-inline:32px;border:0;border-radius:9px;background:transparent;color:var(--text-secondary);font-size:18px}
.mode-switch>button[data-active="true"]{background:var(--surface-active);color:var(--text-primary);font-weight:600}
.text-input{height:56px;width:100%;padding-inline:16px;border:1px solid var(--border);border-radius:14px;background:var(--surface);color:var(--text-primary);font-size:18px;outline:none}
.text-input::placeholder{color:var(--text-muted)}
.text-input:focus{border-color:var(--border-focus)}
.primary-button{height:56px;padding-inline:20px;border:0;border-radius:28px;background:#adb2b8;color:#232324;font-size:18px;font-weight:600}
.primary-button:disabled{opacity:.45;cursor:not-allowed}
.checkbox-field{display:flex;align-items:center;gap:12px;color:var(--text-secondary);font-size:18px}
`.trim();

/** Join CSS strings with newlines, dropping empty parts. */
export const mergeCss = (...parts: string[]) => parts.filter(Boolean).join("\n");
