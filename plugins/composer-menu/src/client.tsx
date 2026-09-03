// Client half of the composer overflow menu.
//
// One trigger sits at the left edge of the composer tool row. It opens a
// Radix dropdown that holds the sandbox picker, moved out of the shipped
// PermissionSelect, and any rows other plugins contribute to the child slot
// composer.overflow.item.
import * as react from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { injectStyle, postJson, shippedClass } from "../../shared/client-util";
import localCss from "./client.module.css";

const PLUGIN_NAME = "composer-menu";

var inject = ["slots"];
var name = PLUGIN_NAME;

function apply(ctx: any) {
  injectStyle(PLUGIN_NAME, "composer-menu", localCss);

  ctx.slots.inject("conversation.input.left", function* () {
    yield ctx.slots.register(
      {
        name: "conversation.input.left",
        id: "composer-overflow",
        order: -100,
        children: { "composer.overflow.item": { kind: "list", scope: "session" } },
      },
      Menu,
    );
  });

  // Both shipped class names are read from the stylesheets that package
  // injects, because their hashes change per DSH build. apply() runs at boot
  // and can run BEFORE those stylesheets exist, so resolve them lazily on
  // render and keep retrying until they appear.
  // Each control is hidden on its own. Coupling them once meant a single wrong
  // suffix left BOTH shipped controls on screen beside the menu.
  const HIDE_TARGETS = [
    {
      id: "composer-menu-hide-picker",
      module: "PermissionSelect.module.css",
      // PermissionSelect renders a Fragment, not a wrapper, so there is no
      // `_root` class. Its only visible part is the trigger button.
      suffix: "_trigger",
      what: "the sandbox picker",
    },
    {
      id: "composer-menu-hide-add",
      module: "InputBar.module.css",
      suffix: "_add",
      what: "the commands button",
    },
  ];
  const done = new Set<string>();
  const warned = new Set<string>();
  let attempts = 0;

  /** Hide each shipped control as soon as its stylesheet appears. */
  function ensureShippedHidden() {
    if (done.size === HIDE_TARGETS.length) return;
    attempts += 1;
    for (const target of HIDE_TARGETS) {
      if (done.has(target.id)) continue;
      const cls = shippedClass(target.module, target.suffix);
      if (cls === null) {
        if (attempts >= 20 && !warned.has(target.id)) {
          warned.add(target.id);
          console.error(
            "composer menu: could not read the class for " +
              target.what +
              ", so it stays visible beside the menu.",
          );
        }
        continue;
      }
      injectStyle(PLUGIN_NAME, target.id, "." + cls + " { display: none !important; }");
      done.add(target.id);
    }
  }

  /** Post one preset choice to the host route. */
  function choose(sessionId: string, preset: string) {
    postJson("/composer-menu/api/permission", { sessionId: sessionId, preset: preset }).then(
      (result) => {
        if (result.error) console.error("composer menu: " + result.error);
      },
    );
  }

  function Menu(props: any) {
    react.useEffect(() => {
      ensureShippedHidden();
    });

    const [open, setOpen] = react.useState(false);
    const permissions = props.useProjection("permissions");
    const options =
      permissions === undefined
        ? []
        : permissions.options.filter((option: any) => option.value !== "custom");

    /** A fresh check mark per item. One shared element would still render, but
     * building it per item keeps each row's children independently keyed. */
    const check = () =>
      react.createElement(
        DropdownMenu.ItemIndicator,
        { className: "composer-menu-indicator" },
        "✓",
      );

    /** The leading slot is always present, so labels line up whether or not the
     * row is the selected one. */
    const row = (label: string) => [
      react.createElement("span", { key: "mark", className: "composer-menu-mark" }, check()),
      react.createElement("span", { key: "label", className: "composer-menu-label" }, label),
    ];

    let sandboxBody;
    if (permissions === undefined) {
      // A RadioItem outside a RadioGroup has no group state to read, so the
      // empty case uses a plain disabled Item.
      sandboxBody = react.createElement(
        DropdownMenu.Item,
        { className: "composer-menu-item", disabled: true },
        row("Not available"),
      );
    } else {
      sandboxBody = react.createElement(
        DropdownMenu.RadioGroup,
        { value: permissions.currentValue },
        options.map((option: any) =>
          react.createElement(
            DropdownMenu.RadioItem,
            {
              key: option.value,
              value: option.value,
              className: "composer-menu-item",
              onSelect: () => choose(props.sessionId, option.value),
            },
            row(option.label ?? option.value),
          ),
        ),
      );
    }

    const sandboxSub = react.createElement(
      DropdownMenu.Sub,
      null,
      react.createElement(
        DropdownMenu.SubTrigger,
        { className: "composer-menu-item", disabled: permissions === undefined },
        react.createElement("span", { key: "mark", className: "composer-menu-mark" }),
        react.createElement("span", { key: "label", className: "composer-menu-label" }, "Sandbox"),
        react.createElement("span", { key: "chev", className: "composer-menu-chevron" }, "›"),
      ),
      react.createElement(
        DropdownMenu.Portal,
        null,
        react.createElement(
          DropdownMenu.SubContent,
          { className: "composer-menu-content" },
          sandboxBody,
        ),
      ),
    );

    return react.createElement(
      DropdownMenu.Root,
      { open: open, onOpenChange: setOpen },
      react.createElement(
        DropdownMenu.Trigger,
        { asChild: true },
        react.createElement(
          "button",
          { type: "button", className: "composer-menu-trigger", "aria-label": "More options" },
          react.createElement(
            "svg",
            { width: 14, height: 14, viewBox: "0 0 14 14", "aria-hidden": true },
            [
              react.createElement("rect", {
                key: "a",
                x: 1,
                y: 3,
                width: 12,
                height: 2,
                fill: "currentColor",
              }),
              react.createElement("rect", {
                key: "b",
                x: 1,
                y: 6,
                width: 12,
                height: 2,
                fill: "currentColor",
              }),
              react.createElement("rect", {
                key: "c",
                x: 1,
                y: 9,
                width: 12,
                height: 2,
                fill: "currentColor",
              }),
            ],
          ),
        ),
      ),
      react.createElement(
        DropdownMenu.Portal,
        null,
        react.createElement(
          DropdownMenu.Content,
          { side: "top", align: "start", sideOffset: 8, className: "composer-menu-content" },
          sandboxSub,
          react.createElement(DropdownMenu.Separator, { className: "composer-menu-separator" }),
          // The renderer only binds renderSlot when the entry declares children,
          // so a future edit that drops the declaration would crash the menu
          // rather than just lose the contributed items. Fail soft instead.
          typeof props.renderSlot === "function"
            ? props.renderSlot("composer.overflow.item", {})
            : null,
        ),
      ),
    );
  }
}

export { apply, inject, name };
