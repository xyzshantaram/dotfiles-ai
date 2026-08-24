# Dark Settings Form Control Design System

## 1. Purpose

This design system defines reusable form controls for a dark, desktop-oriented settings interface.

The visual target is:

* Dense but readable.
* Dark gray instead of pure black.
* Low-contrast borders.
* White primary text.
* Muted secondary text.
* Rounded containers and controls.
* Clear grouping without excessive visual decoration.
* Native-looking controls with a custom application visual language.

The system is intended for settings pages, configuration editors, developer tools, and workspace preferences.

---

## 2. Visual Foundations

### 2.1 Color palette

| Token              | Value     | Usage                             |
| ------------------ | --------- | --------------------------------- |
| `--bg`             | `#2C2C2E` | Main page background              |
| `--surface`        | `#232324` | Cards and grouped controls        |
| `--surface-hover`  | `#303032` | Hover state                       |
| `--surface-active` | `#43454A` | Selected tab/control              |
| `--border`         | `#3E3E3F` | Borders and separators            |
| `--border-subtle`  | `#303031` | Internal separators               |
| `--text-primary`   | `#F9FAFB` | Headings and primary labels       |
| `--text-secondary` | `#ADB2B8` | Descriptions and secondary labels |
| `--text-muted`     | `#88898A` | Disabled text and placeholders    |
| `--text-disabled`  | `#757575` | Disabled controls                 |
| `--control-text`   | `#F9FAFB` | Text inside controls              |

The screenshot uses approximately `#2C2C2E` for the page background and `#232324` for the darker grouped surfaces.

Do not use pure `#000000` as the page background.

---

## 3. Typography

Use a system UI font stack.

```css
font-family:
  Inter,
  ui-sans-serif,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

### Type scale

| Element             | Size | Weight | Color              |
| ------------------- | ---: | -----: | ------------------ |
| Page title          | 28px |    700 | `--text-primary`   |
| Section heading     | 24px |    700 | `--text-primary`   |
| Control label       | 20px |    400 | `--text-primary`   |
| Description         | 18px |    400 | `--text-secondary` |
| Input text          | 18px |    400 | `--text-primary`   |
| Small control label | 16px |    400 | `--text-secondary` |
| Helper text         | 16px |    400 | `--text-secondary` |

Use a line height of approximately `1.45` for descriptions.

The visual hierarchy comes primarily from size, weight, and color. Do not add excessive font styles.

---

## 4. Layout

### Page

Use a centered content column.

```css
.settings-page {
  width: min(100% - 60px, 900px);
  margin-inline: auto;
  padding-block: 28px 48px;
}
```

The screenshot uses approximately 30px horizontal page margins.

### Vertical spacing

Use an 8px spacing grid:

```text
8px
16px
24px
32px
40px
48px
```

Recommended relationships:

* Heading → description: `8px`
* Description → control: `20–24px`
* Section → section: `32–40px`
* Card content padding: `24px`
* Form controls: `8–12px` internal spacing

---

# 5. Section Headers

A section consists of a heading followed by optional explanatory text.

```text
Section heading
Description explaining the purpose of this section.

[controls]
```

### Heading

```css
.section-title {
  margin: 0;
  font-size: 24px;
  line-height: 1.2;
  font-weight: 700;
  color: var(--text-primary);
}
```

### Description

```css
.section-description {
  margin: 10px 0 0;
  color: var(--text-secondary);
  font-size: 18px;
  line-height: 1.45;
}
```

Descriptions should be allowed to wrap naturally. Do not force them into a single line.

---

# 6. Checkbox Setting

The first control in the reference is a large settings checkbox.

The entire control behaves as a clickable setting row.

```text
┌─────────────────────────────────────────────────────┐
│ ☑  Enable @ file mentions                           │
│    Turning this off hides the @ path picker...      │
└─────────────────────────────────────────────────────┘
```

### Container

```css
.setting-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 24px;
}
```

Use approximately `20px` corner radius.

### Checkbox

The checkbox is approximately 28px × 28px.

```css
.setting-checkbox {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  border-radius: 3px;
}
```

The checkbox should have a strong checked state.

### Layout

```css
.setting-card {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 20px;
  align-items: start;
}
```

The checkbox aligns with the first line of the label, not the vertical center of the entire card.

### Label

Use a 20px label.

### Description

The description begins under the label, not under the checkbox.

This creates the characteristic two-column visual structure:

```text
[checkbox] [label]
           [description]
           [description]
```

---

# 7. Segmented Control

The `Global / Workspace` control is a two-option segmented control.

```text
┌───────────────────────────────────────────────┐
│ ┌────────────────────┐                        │
│ │       Global       │       Workspace        │
│ └────────────────────┘                        │
└───────────────────────────────────────────────┘
```

### Outer container

```css
.segmented-control {
  display: flex;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
}
```

### Segment

```css
.segment {
  min-width: 175px;
  height: 48px;
  border: 0;
  border-radius: 10px;
  background: transparent;

  color: var(--text-secondary);
  font-size: 20px;
}

.segment[data-active="true"] {
  background: var(--surface-active);
  color: var(--text-primary);
  font-weight: 600;
}
```

The selected segment should look like a raised surface, but without a shadow.

Avoid gradients.

---

# 8. List / Repeating Form Control

The file filter editor uses a bordered container containing multiple rows.

```text
┌────────────────────────────────────────────────────┐
│ desktop.ini       [Exact] [Case-insensitive]  ×   │
├────────────────────────────────────────────────────┤
│ Thumbs.db         [Exact] [Case-insensitive]  ×   │
├────────────────────────────────────────────────────┤
│ .DS_Store         [Exact] [Case-insensitive]  ×   │
└────────────────────────────────────────────────────┘
```

### Container

```css
.control-list {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
}
```

### Row

```css
.control-list-row {
  min-height: 64px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.control-list-row + .control-list-row {
  border-top: 1px solid var(--border-subtle);
}
```

The row should not have its own rounded corners.

The outer container owns the radius.

---

# 9. Compact Pills

The `Exact` and `Case-insensitive` controls are compact pill-like buttons.

```text
[ Exact ] [ Case-insensitive ]
```

Use these for small stateful options.

```css
.pill {
  height: 36px;
  padding-inline: 10px;
  border: 1px solid var(--border);
  border-radius: 7px;

  background: transparent;
  color: var(--text-secondary);

  font-size: 16px;
}
```

The controls should remain visually secondary to the filename.

For an active state:

```css
.pill[data-active="true"] {
  background: var(--surface-active);
  color: var(--text-primary);
}
```

---

# 10. Destructive / Remove Button

The `×` button at the end of each row is intentionally minimal.

```css
.icon-button {
  width: 40px;
  height: 40px;

  display: inline-grid;
  place-items: center;

  border: 0;
  border-radius: 8px;
  background: transparent;

  color: var(--text-secondary);
  font-size: 28px;
}
```

Default:

```text
transparent background
muted icon
```

Hover:

```text
slightly lighter surface
brighter icon
```

Do not use a red background for the normal remove action.

Reserve red for destructive confirmation states.

---

# 11. Mode Switch

The `Exact / Regex` selector uses the same visual language as the segmented control but at a smaller size.

```css
.mode-switch {
  display: inline-flex;
  padding: 4px;

  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
}

.mode-switch > button {
  height: 44px;
  padding-inline: 32px;

  border: 0;
  border-radius: 9px;

  background: transparent;
  color: var(--text-secondary);

  font-size: 18px;
}

.mode-switch > button[data-active="true"] {
  background: var(--surface-active);
  color: var(--text-primary);
  font-weight: 600;
}
```

Use this for mutually exclusive input modes.

---

# 12. Text Input

The text input at the bottom follows the same surface language.

```css
.text-input {
  height: 56px;
  width: 100%;

  padding-inline: 16px;

  border: 1px solid var(--border);
  border-radius: 14px;

  background: var(--surface);
  color: var(--text-primary);

  font-size: 18px;
  outline: none;
}
```

Placeholder:

```css
.text-input::placeholder {
  color: var(--text-muted);
}
```

Focus:

```css
.text-input:focus {
  border-color: #66676B;
}
```

Do not use a bright blue focus ring unless the application already has a specific accent color.

---

# 13. Primary Action Button

The `+ Add` button is a light, high-contrast action.

```css
.primary-button {
  height: 56px;
  padding-inline: 20px;

  border: 0;
  border-radius: 28px;

  background: #ADB2B8;
  color: #232324;

  font-size: 18px;
  font-weight: 600;
}
```

The button uses a pill shape because it is an action rather than a text-field control.

Disabled:

```css
.primary-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
```

Do not make disabled buttons completely invisible. They should remain identifiable but clearly inactive.

---

# 14. Checkbox With Label

For smaller standalone checkboxes:

```text
☐ Case-sensitive
```

Use:

```css
.checkbox-field {
  display: flex;
  align-items: center;
  gap: 12px;

  color: var(--text-secondary);
  font-size: 18px;
}
```

The checkbox should be approximately `24px`.

The label should be clickable.

---

# 15. Form Composition

A typical form should follow this structure:

```text
Page title

[large setting card]

Section title
Section description

[segmented control]

[repeating list]

[mode selector]

[input                              ] [+ Add]

☐ Checkbox setting

Helper text
```

Use spacing to establish hierarchy instead of additional borders.

The screenshot has only three major container types:

1. Large setting cards.
2. Bordered lists.
3. Individual controls.

Do not introduce a border around every form field.

---

# 16. Interaction States

Every interactive control should support at least these states:

| State    | Treatment                       |
| -------- | ------------------------------- |
| Default  | Normal surface and muted border |
| Hover    | Slightly lighter surface        |
| Focus    | Border becomes more visible     |
| Active   | `--surface-active`              |
| Disabled | Reduced contrast                |
| Invalid  | Error border/text               |
| Selected | Stronger text + active surface  |

The visual difference between default and hover should remain small.

This UI relies on subtle contrast rather than animation or strong color changes.

---

# 17. Border System

Use only a small number of border strengths.

```css
--border:        #3E3E3F;
--border-subtle: #303031;
--border-focus:  #66676B;
```

Rules:

* Outer containers use `--border`.
* Internal list separators use `--border-subtle`.
* Focus uses `--border-focus`.
* Do not stack multiple borders around the same control.
* Avoid shadows unless they provide a real elevation cue.

---

# 18. Radius System

Use three main radius sizes:

```css
--radius-sm: 7px;
--radius-md: 12px;
--radius-lg: 20px;
--radius-pill: 999px;
```

Use:

* `7px`: compact pills.
* `12–14px`: inputs, segmented controls, lists.
* `20px`: large setting cards.
* `999px`: action buttons.

The radius should communicate component size.

---

# 19. Component API

A reusable component library can expose the following components:

```text
<SettingsSection>
<SettingCard>
<CheckboxField>
<SegmentedControl>
<ModeSwitch>
<ControlList>
<ControlListItem>
<PillButton>
<IconButton>
<TextInput>
<PrimaryButton>
<HelperText>
```

Example conceptual API:

```tsx
<SettingCard
  checked={enabled}
  label="Enable @ file mentions"
  description="Turning this off hides the @ path picker and reference dock."
  onChange={setEnabled}
/>

<SegmentedControl
  value="global"
  options={["global", "workspace"]}
/>

<ControlList>
  <ControlListItem
    value="desktop.ini"
    actions={...}
  />
</ControlList>

<ModeSwitch
  value="exact"
  options={["exact", "regex"]}
/>

<TextInput placeholder="For example, desktop.ini" />

<PrimaryButton>
  + Add
</PrimaryButton>
```

The exact framework is not part of the visual system. Components should implement the tokens and dimensions defined above.

---

# 20. Responsive Behavior

The reference is optimized for desktop.

Below approximately `700px`:

* Reduce page horizontal padding to `16px`.
* Allow segmented controls to fill the available width.
* Allow list rows to wrap their secondary controls.
* Keep the filename/action relationship intact.
* Do not reduce body text below `16px`.

Large setting cards should retain their rounded container and internal padding.

---

# 21. Design Principles

### Use contrast instead of decoration

The interface should remain visually quiet.

### Use grouping to communicate relationships

A border around several controls means they belong together.

### Keep secondary controls secondary

The filename, label, or main setting should always have more visual weight than its configuration controls.

### Use one visual language for controls

Inputs, segmented controls, pills, and lists should appear to belong to the same application.

### Avoid excessive color

The primary palette is almost entirely:

```text
dark gray
lighter gray
white
muted gray
```

Accent colors should be introduced only for semantic states such as errors or warnings.

### Prefer native affordances

Checkboxes, text fields, buttons, tabs, and selectors should still look and behave like familiar controls. Custom styling should change their visual language, not their interaction model.

---

# 22. Minimal CSS Token Set

A practical implementation can start with this:

```css
:root {
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
}
```

This token set is sufficient to reproduce most of the visual character in the reference without creating a large design system.

---

# Appendix A — Tool visibility (see.ts)

The `see` tool and the `read_image` tool are mutually exclusive by the active
model's image capability. `see.ts` enforces this at runtime:

- If the active model supports image input, unlock `read_image` and hide `see`.
- If the active model does not support image input, unlock `see` and hide
  `read_image`.

The gate runs per agent at `agent/created` and hides the wrong tool from that
agent's tool list. The `see` tool spawns its child on a vision model, so the
child is also denied `see`. This stops `see` from calling itself. Do not show
both tools at once. The toggle is driven by the model's declared capabilities,
not by user preference.

When this panel (or any panel) adds an image-preview affordance, follow the same
rule: a vision-capable model previews inline; a non-vision model routes the
image to `see` instead of calling `read_image`.
