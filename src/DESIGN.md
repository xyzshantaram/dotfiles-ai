# Dark Settings Form Control Design System

## 1. Purpose

This design system defines reusable form controls for a dark, desktop-oriented settings interface.

The visual target is:

- Dense but readable.
- Dark gray instead of pure black.
- Low-contrast borders.
- White primary text.
- Muted secondary text.
- Rounded containers and controls.
- Clear grouping without excessive visual decoration.
- Native-looking controls with a custom application visual language.

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

| Element             |      Size | Weight | Color              |
| ------------------- | --------: | -----: | ------------------ |
| Page title          |    1.5rem |    650 | `--text-primary`   |
| Section heading     |  1.125rem |    600 | `--text-primary`   |
| Control label       | 0.9375rem |    500 | `--text-primary`   |
| Description         |  0.875rem |    400 | `--text-secondary` |
| Input text          |  0.875rem |    400 | `--text-primary`   |
| Small control label | 0.8125rem |    400 | `--text-secondary` |
| Helper text         | 0.8125rem |    400 | `--text-secondary` |

Use a line height of approximately `1.5` for descriptions.

The visual hierarchy comes primarily from size, weight, and color. Do not add excessive font styles.

---

## 4. Layout

### Page

Use a centered content column.

```css
.settings-page {
  width: min(100% - 2.5rem, 55rem);
  margin-inline: auto;
  padding-block: 1.5rem 2.5rem;
}
```

The screenshot uses approximately 1.25rem (20px at 16px base) horizontal page margins per side via the width calculation.

### Vertical spacing

Use an 8px spacing grid:

````text
0.5rem
1rem
1.5rem
2rem
2.5rem
3rem

Recommended relationships:

* Heading → description: `0.5rem`
* Description → control: `1rem`
* Section → section: `1.75rem–2rem`
* Card content padding: `1.25rem`
* Form controls: `0.625rem` internal spacing

---

# 5. Section Headers

A section consists of a heading followed by optional explanatory text.

```text
Section heading
Description explaining the purpose of this section.

[controls]
````

### Heading

````css
.section-title {
  margin: 0;
  font-size: 1.125rem;
  line-height: 1.2;
  font-weight: 600;
  color: var(--text-primary);
}

### Description

```css
.section-description {
  margin: 0.625rem 0 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
  line-height: 1.5;
}

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
````

### Container

````css
.setting-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.875rem;
  padding: 1.25rem;
}

Use
  approximately
  `0.875rem`
  (14px at 16px base)
  corner
  radius.
  ###
  Checkbox
  The
  checkbox
  is
  approximately
  1.25rem
  ×
  1.25rem
  (20px at 16px base).
  ```css
  .setting-checkbox {
  width: 1.25rem;
  height: 1.25rem;
  flex: 0 0 1.25rem;
  border-radius: 0.1875rem;
}
````

The checkbox should have a strong checked state.

### Layout

````css
.setting-card {
  display: grid;
  grid-template-columns: 1.25rem 1fr;
  gap: 1rem;
  align-items: start;
}

The checkbox aligns with the first line of the label, not the vertical center of the entire card.

### Label

Use a 0.9375rem label.

### Description

The description begins under the label, not under the checkbox.

This creates the characteristic two-column visual structure:

```text
[checkbox] [label]
           [description]
           [description]
````

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
  padding: 0.25rem;
  border: 1px solid var(--border);
  border-radius: 0.625rem;
  background: var(--surface);
}
```

### Segment

```css
.segment {
  min-width: 8.75rem;
  height: 2.375rem;
  border: 0;
  border-radius: 0.4375rem;
  background: transparent;

  color: var(--text-secondary);
  font-size: 0.875rem;
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

````css
.control-list {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 0.625rem;
  background: var(--surface);
}

### Row ```css .control-list-row {
  min-height: 3rem;
  padding: 0 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.control-list-row + .control-list-row {
  border-top: 1px solid var(--border-subtle);
}
````

The row should not have its own rounded corners.

The outer container owns the radius.

---

# 9. Compact Pills

The `Exact` and `Case-insensitive` controls are compact pill-like buttons.

```text
[ Exact ] [ Case-insensitive ]
```

Use these for small stateful options.

````css
.pill {
  height: 1.75rem;
  padding-inline: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 0.375rem;

  background: transparent;
  color: var(--text-secondary);

  font-size: 0.8125rem;
}

The controls should remain visually secondary to the filename.

For an active state:

```css
.pill[data-active="true"] {
  background: var(--surface-active);
  color: var(--text-primary);
}
````

---

# 10. Destructive / Remove Button

The `×` button at the end of each row is intentionally minimal.

````css
.icon-button {
  width: 2rem;
  height: 2rem;

  display: inline-grid;
  place-items: center;

  border: 0;
  border-radius: 0.375rem;
  background: transparent;

  color: var(--text-secondary);
  font-size: 1.25rem;
}

default: ```text transparent background muted icon;
````

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
  padding: 0.25rem;

  border: 1px solid var(--border);
  border-radius: 0.625rem;
  background: var(--surface);
}

.mode-switch > button {
  height: 2.125rem;
  padding-inline: 1.25rem;

  border: 0;
  border-radius: 0.375rem;

  background: transparent;
  color: var(--text-secondary);

  font-size: 0.875rem;
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

````css
.text-input {
  height: 2.5rem;
  width: 100%;

  padding-inline: 0.75rem;

  border: 1px solid var(--border);
  border-radius: 0.625rem;

  background: var(--surface);
  color: var(--text-primary);

  font-size: 0.875rem;
  outline: none;
}

Placeholder:

```css
.text-input::placeholder {
  color: var(--text-muted);
}
````

Focus:

```css
.text-input:focus {
  border-color: #66676b;
}
```

Do not use a bright blue focus ring unless the application already has a specific accent color.

---

# 13. Primary Action Button

The `+ Add` button is a light, high-contrast action.

````css
.primary-button {
  height: 2.375rem;
  padding-inline: 1.125rem;

  border: 0;
  border-radius: 999rem;

  background: #adb2b8;
  color: #232324;

  font-size: 0.875rem;
  font-weight: 600;
}

The button uses a pill shape because it is an action rather than a text-field control.

Disabled:

```css
.primary-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
````

Do not make disabled buttons completely invisible. They should remain identifiable but clearly inactive.

---

# 14. Checkbox With Label

For smaller standalone checkboxes:

```text
☐ Case-sensitive
```

Use:

````css
.checkbox-field {
  display: flex;
  align-items: center;
  gap: 0.625rem;

  color: var(--text-secondary);
  font-size: 0.84375rem;
}

The checkbox should be approximately `1.125rem` (18px at 16px base).

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
````

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
--border: #3e3e3f;
--border-subtle: #303031;
--border-focus: #66676b;
```

Rules:

- Outer containers use `--border`.
- Internal list separators use `--border-subtle`.
- Focus uses `--border-focus`.
- Do not stack multiple borders around the same control.
- Avoid shadows unless they provide a real elevation cue.

---

# 18. Radius System

Use three main radius sizes:

```css
--radius-sm: 0.375rem;
--radius-md: 0.625rem;
--radius-lg: 0.875rem;
--radius-pill: 999rem;
```

Use:

- `0.375rem` (6px at 16px base): compact pills.
- `0.625rem` (10px): inputs, segmented controls, lists.
- `0.875rem` (14px): large setting cards.
- `999rem`: action buttons.

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

- Reduce page horizontal padding to `1rem`.
- Allow segmented controls to fill the available width.
- Allow list rows to wrap their secondary controls.
- Keep the filename/action relationship intact.
- Do not reduce body text below `0.8125rem`.

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

  --radius-sm: 0.375rem;
  --radius-md: 0.625rem;
  --radius-lg: 0.875rem;
  --radius-pill: 999rem;
  --space-1: 0.5rem;
  --space-2: 1rem;
  --space-3: 1.5rem;
  --space-4: 2rem;
  --space-5: 2.5rem;
  --space-6: 3rem;
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
