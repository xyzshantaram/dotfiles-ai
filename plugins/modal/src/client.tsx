/**
 * modal — one modal host for the whole app (client half).
 *
 * WHY IT IS ITS OWN PLUGIN. `plugins/shared/plugin-modal.tsx` is a source
 * module, so every consumer that imports it bundles a private copy: the
 * component and its CSS ship twice today (job-viewer, composer-approvals)
 * and N times at N consumers. Hoisting one container into `shell.overlay`
 * and publishing one global makes the modal a surface every plugin shares
 * instead of a copy-paste convenience. This mirrors `plugins/toast` exactly:
 * one container, one published global, one guarded caller.
 *
 * WHERE IT MOUNTS. `shell.overlay` is declared by `dsh-client-ui-layout` as
 * `{ kind: "list", scope: "root" }` — a root-scoped additive slot rendered in
 * the frame's own overlay layer, above every column and outside any session.
 * A list slot means we add an entry; nothing already there is replaced.
 *
 * THE SEAM: `window.__dshModal__`.
 *
 * The only way a separate bundle can hook in, since imports do not cross
 * bundles. It is versioned so a caller feature-detects a shape rather than
 * assuming one. Unlike toast, a modal IS load-bearing (composer-approvals
 * answers approvals through it), so callers must be TOLD when their modal
 * did not open: the guarded entry points in `./registry` return
 * `{ opened: false, reason }` / `false` instead of degrading to a silent
 * no-op. The future `plugins/shared/modal-client.ts` wraps those for
 * in-repo callers; out-of-tree bundles do the same three-line version check
 * against the global.
 *
 * THE COMPONENT IS NOT FORKED HERE. The container renders the shared
 * `<PluginModal>` and its stylesheet comes with that import (deduped by
 * style id at runtime). This file owns only the host: the registry
 * instance, the global publication, and the slot entry.
 *
 * WHERE THE ATTENTION SURFACE WILL LIVE (#103, Unknown C). That
 * investigation chose "a provided Cordis service, published by the #93
 * modal runtime plugin — NOT a slot, and not (yet) a published global",
 * with the shell owning tab/card chrome and contributors supplying bodies.
 * The service is NOT created here (#103 owns its design), but this plugin
 * is its settled home: when it lands it is provided in this same `apply()`
 * next to the global, sharing this container — not grown as a second seam
 * in a second plugin.
 *
 * BOOT RISK, MANAGED NOT DISCOVERED. The web boot asserts every entry
 * ACTIVE after `loader.await()` and throws "web boot: N entries did not
 * activate". If this shell plugin failed to activate, every consumer would
 * pend and THE WHOLE PAGE would fail to boot — not merely the modal. So
 * this plugin has NO hard dependencies beyond static modules (`inject` is
 * exactly `["slots"]`), and sync.sh installs it BEFORE any consumer, the
 * same ordering discipline toast carries. `registry.test.ts` pins both.
 */
import react from "react";

import { injectStyle } from "../../shared/client-util";
import { PluginModal } from "../../shared/plugin-modal";
import localCss from "./client.module.css";
import {
  MODAL_API_VERSION,
  type ModalApi,
  type ModalOpenRequest,
  type ModalRecord,
  createModalRegistry,
} from "./registry";

const PLUGIN_NAME = "modal";
const STYLE_TAG_ID = "dsh-modal-styles";

var inject = ["slots"];
var name = PLUGIN_NAME;

/**
 * The live registry. Module state, like the toast store: an `open()` issued
 * before this container mounts is stored and rendered on mount rather than
 * dropped, because the initial state below is the CURRENT list.
 */
var registry = createModalRegistry();

/**
 * Close one modal and run its `onClose`, if any. The registry closes first
 * so a throwing consumer callback cannot leave a modal stuck open — and the
 * throw is contained here so one caller's bug cannot break the host that
 * every other caller shares.
 */
function closeRecord(record: ModalRecord): void {
  registry.close(record.id);
  if (typeof record.onClose === "function") {
    try {
      record.onClose();
    } catch (error) {
      console.error("[modal] onClose threw:", error);
    }
  }
}

/**
 * One open modal. A separate component (untyped props, like every other
 * wrapper in this repo) so the list below can key it: `key` is not part of
 * the shared component's typed props, and passing it there fails the
 * typecheck even though React would strip it.
 */
function ModalEntry(props: any) {
  var record = props.record as ModalRecord;
  return (
    <PluginModal
      title={record.title}
      size={record.size}
      onClose={function () {
        closeRecord(record);
      }}
      actions={record.actions}
    >
      {record.body}
    </PluginModal>
  );
}

/**
 * The host. Renders every open request through the shared component, oldest
 * first so concurrent modals stack in open order. Bodies and actions are the
 * caller's nodes rendered in this tree: anything that needs a context only
 * its own tree provides loses it here, which is documented on the registry
 * and is the price of the only cross-bundle seam available.
 */
function ModalHost() {
  const [open, setOpen] = react.useState(function () {
    return registry.getOpen();
  });

  react.useEffect(function () {
    // Re-read on mount as well as subscribing: an open issued between the
    // initial state and this effect would otherwise be missed.
    setOpen(registry.getOpen());
    return registry.subscribe(setOpen);
  }, []);

  if (open.length === 0) return null;
  return (
    <>
      {open.map(function (record) {
        return <ModalEntry key={record.id} record={record} />;
      })}
    </>
  );
}

function apply(ctx: any) {
  ctx.effect(function () {
    injectStyle(PLUGIN_NAME, STYLE_TAG_ID, localCss);
  }, "modal: styles");

  // Publish the cross-bundle seam, and take it down with the plugin so a
  // stopped plugin does not leave a global pointing at a dead registry.
  ctx.effect(function () {
    const api: ModalApi = {
      version: MODAL_API_VERSION,
      open: function (request: ModalOpenRequest) {
        return registry.open(request);
      },
      close: function (id: string) {
        return registry.close(id);
      },
      subscribe: function (listener) {
        return registry.subscribe(listener);
      },
    };
    (globalThis as any).__dshModal__ = api;
    return function () {
      if ((globalThis as any).__dshModal__ === api) {
        delete (globalThis as any).__dshModal__;
      }
    };
  }, "modal: window.__dshModal__");

  ctx.slots.inject("shell.overlay", function () {
    return ctx.slots.register({ name: "shell.overlay", id: PLUGIN_NAME }, ModalHost);
  });
}

export { apply, inject, name };
