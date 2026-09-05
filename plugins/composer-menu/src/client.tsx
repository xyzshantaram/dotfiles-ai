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

  // The web search toggle from dsh-web-tools is our replacement target. Its
  // trigger class is a stable literal in the plugin's own injected style tag,
  // not a hashed CSS module name, so one plain rule hides it.
  injectStyle(
    PLUGIN_NAME,
    "composer-menu-hide-web-tools",
    ".wt-search-mode-trigger { display: none !important; }",
  );

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
    // composer.overflow.item is a list slot. With no other plugin contributing
    // to it, renderSlot still returns a (visually empty) element, so a
    // hardcoded separator before it showed a rule with nothing under it. The
    // extra content is measured through a ref instead of assumed present.
    const extraRef = react.useRef(null as HTMLDivElement | null);
    const [hasExtra, setHasExtra] = react.useState(false);
    react.useEffect(() => {
      const el = extraRef.current;
      if (el === null) return;
      const update = () => setHasExtra(el.childElementCount > 0);
      update();
      const observer = new MutationObserver(update);
      observer.observe(el, { childList: true });
      return () => observer.disconnect();
    });
    const permissions = props.useProjection("permissions");
    const options =
      permissions === undefined
        ? []
        : permissions.options.filter((option: any) => option.value !== "custom");

    /** Shared shield outline, stroked, used by both the read-only and
     * full-access icons (matches the shipped PermissionSelect glyphs). */
    const SHIELD_OUTLINE =
      "M8.20554 0.899994L14.7901 3.36857V7.01026C14.7901 12 11.0466 14.2103 8.20554 15.3C5.36446 14.2103 1.62012 12 1.62012 7.01026V3.36857L8.20554 0.899994Z";

    /** Path data for each permission level's icon, copied from the shipped
     * PermissionSelect glyphs so the sandbox rows read the same as before. */
    const PERMISSION_PATHS: Record<string, Array<Record<string, string>>> = {
      "read-only": [
        {
          d: SHIELD_OUTLINE,
          stroke: "currentColor",
          strokeWidth: "1.31831",
          strokeLinejoin: "round",
        },
        {
          d: "M12.1654 5.7552L8.9447 9.41475C8.73044 9.65816 8.53628 9.8804 8.35774 10.0423C8.1713 10.2114 7.94235 10.3717 7.64016 10.4254C7.48207 10.4535 7.32 10.4552 7.16151 10.4294C6.85843 10.3801 6.62728 10.2223 6.43836 10.0559C6.25752 9.89653 6.06037 9.67732 5.84264 9.43705L4.72925 8.20897L5.63557 7.38707L6.74897 8.61594C6.98603 8.87755 7.12974 9.03533 7.24673 9.13839C7.31033 9.19443 7.34485 9.21476 7.35823 9.22122C7.38068 9.22484 7.40352 9.22515 7.42593 9.22122C7.40522 9.22502 7.42893 9.23294 7.53583 9.136C7.65132 9.03126 7.79316 8.87139 8.02643 8.60638L11.2479 4.94763L12.1654 5.7552Z",
          fill: "currentColor",
        },
      ],
      "workspace-write": [
        {
          d: "M8.08887 0.251709C8.20479 0.23085 8.32486 0.241168 8.43652 0.282959L15.0215 2.75171C15.2787 2.84819 15.4492 3.09414 15.4492 3.3689V7.0105C15.4492 7.10986 15.4441 7.2081 15.4414 7.30542C15.0285 7.07175 14.5905 6.87695 14.1309 6.73022V3.82495L8.20508 1.60327L2.2793 3.82495V7.0105C2.27936 9.7171 3.4745 11.5379 5.02734 12.7947C5.01025 12.9942 5 13.1962 5 13.4001C5.00001 13.7617 5.02722 14.1169 5.08008 14.4636C2.91555 13.0393 0.961014 10.752 0.960938 7.0105V3.3689C0.960938 3.09417 1.13146 2.84821 1.38867 2.75171L7.97461 0.282959L8.08887 0.251709Z",
          fill: "currentColor",
        },
        { d: "M11.3525 5.64688V6.85688H5V5.64688H11.3525Z", fill: "currentColor" },
        { d: "M9.5824 8.29376V9.50376H5V8.29376H9.5824Z", fill: "currentColor" },
        {
          d: "M14.6647 15.6852H10.0338C10.3878 15.3751 10.7567 15.0517 11.0772 14.7706C11.2531 14.6164 11.4144 14.4746 11.5511 14.3547H14.6647V15.6852Z",
          fill: "currentColor",
        },
        {
          d: "M8.14852 14.1308L7.33925 15.4976C7.22458 15.6912 7.42245 15.9194 7.63037 15.8333L9.09785 15.2254L15.0399 10.0719L14.0905 8.97733L8.14852 14.1308Z",
          fill: "currentColor",
        },
      ],
      "danger-full-access": [
        {
          d: SHIELD_OUTLINE,
          stroke: "currentColor",
          strokeWidth: "1.31831",
          strokeLinejoin: "round",
        },
        { d: "M9.10094 4.5V8.75939H7.59888V4.5H9.10094Z", fill: "currentColor" },
        { d: "M9.10094 9.8114V11.5H7.59888V9.8114H9.10094Z", fill: "currentColor" },
      ],
    };

    /** The permission icon for one option value, or null for a value the
     * shipped design set does not cover (a host-configured custom name). */
    function permissionIcon(value: string) {
      const paths = PERMISSION_PATHS[value];
      if (paths === undefined) return null;
      return react.createElement(
        "svg",
        { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true },
        paths.map((path, i) => react.createElement("path", { key: i, ...path })),
      );
    }

    /** A fresh check mark per item. One shared element would still render, but
     * building it per item keeps each row's children independently keyed. */
    const check = () =>
      react.createElement(
        DropdownMenu.ItemIndicator,
        { className: "composer-menu-indicator" },
        "\u2713",
      );

    /** A row with a fixed leading icon column, a label, and a trailing check
     * that only renders once the row is selected (ItemIndicator handles that
     * on its own). The icon column stays present even when a row has no icon,
     * so labels still line up in a column with the rows that do. */
    const row = (label: string, icon?: any) => [
      react.createElement("span", { key: "icon", className: "composer-menu-icon" }, icon ?? null),
      react.createElement("span", { key: "label", className: "composer-menu-label" }, label),
      react.createElement("span", { key: "mark", className: "composer-menu-mark" }, check()),
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
            row(option.label ?? option.value, permissionIcon(option.value)),
          ),
        ),
      );
    }

    // The web search toggle, moved out of dsh-web-tools' left-edge button.
    // Data comes from that plugin's routes: mode "required" forces a search
    // before the answer, "auto" leaves the choice to the agent. The row
    // refetches on every mount (the menu content only mounts while open) and
    // on window focus; an always-visible control needed polling, a menu row
    // does not.
    const SEARCH_MODE_API = "/web-tools/api/search-mode";
    function SearchToggle() {
      const [mode, setMode] = react.useState(null as null | "auto" | "required");
      const [available, setAvailable] = react.useState(true);
      const inFlight = react.useRef(false);

      /** Read the current mode. Failures keep the last known state. */
      const refresh = react.useCallback(() => {
        postJson(SEARCH_MODE_API + "/get", { sessionId: props.sessionId }).then((result) => {
          const value = result.data && result.data.value;
          if (result.error || !value) {
            if (result.error) console.error("composer menu: " + result.error);
            return;
          }
          setMode(value.mode);
          setAvailable(value.available !== false);
        });
      }, [props.sessionId]);

      react.useEffect(() => {
        refresh();
        window.addEventListener("focus", refresh);
        return () => window.removeEventListener("focus", refresh);
      }, [refresh]);

      /** Optimistic switch with a revert to the previous mode on failure.
       * One request at a time, so a fast second click cannot revert to a
       * stale value. */
      const toggle = () => {
        if (mode === null || !available || inFlight.current) return;
        const previous = mode;
        const next = mode === "required" ? "auto" : "required";
        inFlight.current = true;
        setMode(next);
        postJson(SEARCH_MODE_API + "/set", { sessionId: props.sessionId, mode: next }).then(
          (result) => {
            inFlight.current = false;
            if (result.error) {
              setMode(previous);
              console.error("composer menu: " + result.error);
              return;
            }
            refresh();
          },
        );
      };

      const on = mode === "required";
      return react.createElement(
        DropdownMenu.Item,
        { className: "composer-menu-item", disabled: mode === null || !available, onSelect: toggle },
        react.createElement("span", { key: "icon", className: "composer-menu-icon" }),
        react.createElement(
          "span",
          { key: "label", className: "composer-menu-label" },
          "Web search",
        ),
        react.createElement(
          "span",
          {
            key: "switch",
            className: "composer-menu-toggle-track",
            "data-on": on ? "true" : "false",
            "data-pending": mode === null ? "true" : undefined,
            role: "switch",
            "aria-checked": on,
            "aria-label": "Web search",
          },
          react.createElement("span", { className: "composer-menu-toggle-knob" }),
        ),
      );
    }
    const searchRow = react.createElement(SearchToggle);

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
          searchRow,
          hasExtra
            ? react.createElement(DropdownMenu.Separator, { className: "composer-menu-separator" })
            : null,
          // display: contents keeps this div out of layout entirely, so it is
          // purely a measuring point for the MutationObserver above; it never
          // shows as an empty row. The renderer only binds renderSlot when the
          // entry declares children, so a future edit that drops the
          // declaration would crash the menu rather than just lose the
          // contributed items. Fail soft instead.
          react.createElement(
            "div",
            { ref: extraRef, style: { display: "contents" } },
            typeof props.renderSlot === "function"
              ? props.renderSlot("composer.overflow.item", {})
              : null,
          ),
        ),
      ),
    );
  }
}

export { apply, inject, name };
