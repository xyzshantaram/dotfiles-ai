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
  let hideDone = false;
  let attempts = 0;
  let warned = false;

  /** Hide the shipped sandbox picker and commands button once their stylesheets exist. */
  function ensureShippedHidden() {
    if (hideDone) return;
    const picker = shippedClass("PermissionSelect.module.css", "_root");
    const add = shippedClass("InputBar.module.css", "_add");
    if (picker === null || add === null) {
      attempts += 1;
      if (attempts >= 20 && !warned) {
        warned = true;
        console.error(
          "composer menu: could not read the shipped sandbox picker and commands classes, so they stay visible next to the menu.",
        );
      }
      return;
    }
    injectStyle(
      PLUGIN_NAME,
      "composer-menu-hide",
      "." + picker + " { display: none !important; }\n." + add + " { display: none !important; }",
    );
    hideDone = true;
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

    const check = react.createElement(
      DropdownMenu.ItemIndicator,
      { className: "composer-menu-indicator" },
      "✓",
    );

    let sandboxBody;
    if (permissions === undefined) {
      sandboxBody = react.createElement(
        DropdownMenu.RadioItem,
        { className: "composer-menu-item", disabled: true },
        [check, "Not available"],
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
              className: "composer-menu-item",
              onSelect: () => choose(props.sessionId, option.value),
            },
            [check, option.label ?? option.value],
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
        "Sandbox",
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
