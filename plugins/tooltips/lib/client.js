window.__ModuleLoader__.load({
	id: "tooltips",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// plugins/tooltips/src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);

// plugins/shared/client-util.ts
function injectStyle(pluginName, styleId, cssText) {
  if (typeof document === "undefined") return;
  if (document.querySelector(
    'style[data-plugin-css="' + (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(styleId) : String(styleId).replace(/"/g, '\\"')) + '"]'
  ) !== null)
    return;
  const tag = document.createElement("style");
  tag.dataset.plugin = pluginName;
  tag.dataset.pluginCss = styleId;
  tag.textContent = cssText;
  document.head.appendChild(tag);
}
var HLJS_THEME_CSS = [
  ".hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#ff7b72}",
  ".hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#d2a8ff}",
  ".hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-variable,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id{color:#79c0ff}",
  ".hljs-regexp,.hljs-string,.hljs-meta .hljs-string{color:#a5d6ff}",
  ".hljs-built_in,.hljs-symbol{color:#ffa657}",
  ".hljs-comment,.hljs-code,.hljs-formula{color:#8b949e}",
  ".hljs-name,.hljs-quote,.hljs-selector-tag,.hljs-selector-pseudo{color:#7ee787}",
  ".hljs-subst{color:#c9d1d9}",
  ".hljs-section{color:#1f6feb;font-weight:bold}",
  ".hljs-bullet{color:#f2cc60}",
  ".hljs-emphasis{color:#c9d1d9;font-style:italic}",
  ".hljs-strong{color:#c9d1d9;font-weight:bold}",
  ".hljs-addition{color:#aff5b4;background-color:#033a16}",
  ".hljs-deletion{color:#ffdcd7;background-color:#67060c}"
].join("");

// plugins/tooltips/src/client.tsx
var PLUGIN_NAME = "tooltips";
var css = `
.dsh-tip {
  position: fixed;
  z-index: 2147483000;
  pointer-events: none;
  max-width: 22rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--dsw-alias-line-secondary);
  border-radius: 0.375rem;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-size: 0.75rem;
  line-height: 1.125rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.24);
}
.dsh-tip[hidden] {
  display: none;
}
`;
var activeTarget = null;
var showTimer = null;
var tipNode = null;
var savedDescribedBy = null;
var describedByWasAbsent = false;
var disabled = false;
function environmentOk() {
  return typeof document !== "undefined" && document.body !== null;
}
function scheduleShow(target) {
  if (disabled || !environmentOk()) return;
  hide();
  activeTarget = target;
  showTimer = window.setTimeout(function() {
    showTimer = null;
    show(target);
  }, 350);
}
function show(target) {
  if (disabled) return;
  try {
    var title = target.getAttribute("title");
    if (title === null || title.trim() === "") {
      if (activeTarget === target) activeTarget = null;
      return;
    }
    target.setAttribute("data-dsh-tip-title", title);
    target.removeAttribute("title");
    var previous = target.getAttribute("aria-describedby");
    describedByWasAbsent = previous === null;
    savedDescribedBy = previous;
    target.setAttribute("aria-describedby", "dsh-tip");
    var tip = ensureTipNode();
    tip.textContent = title;
    tip.hidden = false;
    position(tip, target);
  } catch (error) {
    fail(error);
  }
}
function position(tip, target) {
  var rect = target.getBoundingClientRect();
  var width = tip.offsetWidth;
  var height = tip.offsetHeight;
  var left = rect.left + rect.width / 2 - width / 2;
  left = Math.min(Math.max(left, 8), window.innerWidth - width - 8);
  var top = rect.top - height - 4;
  if (top < 8) top = rect.bottom + 4;
  tip.style.left = left + "px";
  tip.style.top = top + "px";
}
function ensureTipNode() {
  if (tipNode !== null) return tipNode;
  var tip = document.createElement("div");
  tip.id = "dsh-tip";
  tip.setAttribute("role", "tooltip");
  tip.className = "dsh-tip";
  tip.hidden = true;
  document.body.appendChild(tip);
  tipNode = tip;
  return tip;
}
function hide() {
  if (showTimer !== null) {
    window.clearTimeout(showTimer);
    showTimer = null;
  }
  var target = activeTarget;
  activeTarget = null;
  if (target !== null) {
    var saved = target.getAttribute("data-dsh-tip-title");
    if (saved !== null) {
      if (target.getAttribute("title") === null) target.setAttribute("title", saved);
      target.removeAttribute("data-dsh-tip-title");
    }
    if (describedByWasAbsent) {
      target.removeAttribute("aria-describedby");
    } else if (savedDescribedBy !== null) {
      target.setAttribute("aria-describedby", savedDescribedBy);
    }
  }
  savedDescribedBy = null;
  describedByWasAbsent = false;
  if (tipNode !== null) tipNode.hidden = true;
}
function fail(error) {
  var stranded = activeTarget;
  if (stranded !== null) {
    try {
      var rescued = stranded.getAttribute("data-dsh-tip-title");
      if (rescued !== null && stranded.getAttribute("title") === null) {
        stranded.setAttribute("title", rescued);
      }
    } catch (restoreError) {
      console.warn("[tooltips] last-resort title restore threw", restoreError);
    }
  }
  try {
    hide();
  } catch (hideError) {
    console.warn("[tooltips] restore during failure also threw", hideError);
  }
  if (tipNode !== null) {
    try {
      tipNode.remove();
    } catch (removeError) {
      console.warn("[tooltips] removing the tooltip node threw", removeError);
    }
    tipNode = null;
  }
  disabled = true;
  console.warn("[tooltips] disabled, falling back to the native title tooltip", error);
}
function optedIn(event) {
  var node = event.target;
  if (!(node instanceof Element)) return null;
  return node.closest("[data-dsh-tip]");
}
function stillInside(event, target) {
  var related = event.relatedTarget;
  return related instanceof Node && target.contains(related);
}
var name = PLUGIN_NAME;
var inject = [];
function apply(ctx) {
  injectStyle(PLUGIN_NAME, "dsh-tooltips", css);
  if (!environmentOk()) return;
  var onPointerOver = function(event) {
    var target = optedIn(event);
    if (target !== null) scheduleShow(target);
  };
  var onPointerOut = function(event) {
    var target = optedIn(event);
    if (target === null) return;
    if (stillInside(event, target)) return;
    hide();
  };
  var onFocusIn = function(event) {
    var target = optedIn(event);
    if (target !== null) scheduleShow(target);
  };
  var onFocusOut = function(event) {
    var target = optedIn(event);
    if (target === null) return;
    if (stillInside(event, target)) return;
    hide();
  };
  var onKeyDown = function(event) {
    if (event.key === "Escape") hide();
  };
  var onScroll = function() {
    hide();
  };
  var onPointerDown = function() {
    hide();
  };
  ctx.effect(function() {
    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("pointerdown", onPointerDown);
    return function() {
      hide();
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("pointerdown", onPointerDown);
      if (tipNode !== null) {
        tipNode.remove();
        tipNode = null;
      }
    };
  }, "tooltips: listeners");
}
		return module.exports;
	}
});
