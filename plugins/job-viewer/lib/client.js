window.__ModuleLoader__.load({
	id: "job-viewer",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// plugins/job-viewer/src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var import_react = __toESM(require("react"), 1);
var import_react_dom = require("react-dom");

// plugins/job-viewer/node_modules/ansi_up.js
var __makeTemplateObject = function(cooked, raw) {
  if (Object.defineProperty) {
    Object.defineProperty(cooked, "raw", { value: raw });
  } else {
    cooked.raw = raw;
  }
  return cooked;
};
var PacketKind;
(function(PacketKind2) {
  PacketKind2[PacketKind2["EOS"] = 0] = "EOS";
  PacketKind2[PacketKind2["Text"] = 1] = "Text";
  PacketKind2[PacketKind2["Incomplete"] = 2] = "Incomplete";
  PacketKind2[PacketKind2["ESC"] = 3] = "ESC";
  PacketKind2[PacketKind2["Unknown"] = 4] = "Unknown";
  PacketKind2[PacketKind2["SGR"] = 5] = "SGR";
  PacketKind2[PacketKind2["OSCURL"] = 6] = "OSCURL";
})(PacketKind || (PacketKind = {}));
var AnsiUp = class {
  constructor() {
    this.VERSION = "6.0.6";
    this.setup_palettes();
    this._use_classes = false;
    this.bold = false;
    this.faint = false;
    this.italic = false;
    this.underline = false;
    this.fg = this.bg = null;
    this._buffer = "";
    this._url_allowlist = { "http": 1, "https": 1 };
    this._escape_html = true;
    this.boldStyle = "font-weight:bold";
    this.faintStyle = "opacity:0.7";
    this.italicStyle = "font-style:italic";
    this.underlineStyle = "text-decoration:underline";
  }
  set use_classes(arg) {
    this._use_classes = arg;
  }
  get use_classes() {
    return this._use_classes;
  }
  set url_allowlist(arg) {
    this._url_allowlist = arg;
  }
  get url_allowlist() {
    return this._url_allowlist;
  }
  set escape_html(arg) {
    this._escape_html = arg;
  }
  get escape_html() {
    return this._escape_html;
  }
  set boldStyle(arg) {
    this._boldStyle = arg;
  }
  get boldStyle() {
    return this._boldStyle;
  }
  set faintStyle(arg) {
    this._faintStyle = arg;
  }
  get faintStyle() {
    return this._faintStyle;
  }
  set italicStyle(arg) {
    this._italicStyle = arg;
  }
  get italicStyle() {
    return this._italicStyle;
  }
  set underlineStyle(arg) {
    this._underlineStyle = arg;
  }
  get underlineStyle() {
    return this._underlineStyle;
  }
  setup_palettes() {
    this.ansi_colors = [
      [
        { rgb: [0, 0, 0], class_name: "ansi-black" },
        { rgb: [187, 0, 0], class_name: "ansi-red" },
        { rgb: [0, 187, 0], class_name: "ansi-green" },
        { rgb: [187, 187, 0], class_name: "ansi-yellow" },
        { rgb: [0, 0, 187], class_name: "ansi-blue" },
        { rgb: [187, 0, 187], class_name: "ansi-magenta" },
        { rgb: [0, 187, 187], class_name: "ansi-cyan" },
        { rgb: [255, 255, 255], class_name: "ansi-white" }
      ],
      [
        { rgb: [85, 85, 85], class_name: "ansi-bright-black" },
        { rgb: [255, 85, 85], class_name: "ansi-bright-red" },
        { rgb: [0, 255, 0], class_name: "ansi-bright-green" },
        { rgb: [255, 255, 85], class_name: "ansi-bright-yellow" },
        { rgb: [85, 85, 255], class_name: "ansi-bright-blue" },
        { rgb: [255, 85, 255], class_name: "ansi-bright-magenta" },
        { rgb: [85, 255, 255], class_name: "ansi-bright-cyan" },
        { rgb: [255, 255, 255], class_name: "ansi-bright-white" }
      ]
    ];
    this.palette_256 = [];
    this.ansi_colors.forEach((palette) => {
      palette.forEach((rec) => {
        this.palette_256.push(rec);
      });
    });
    let levels = [0, 95, 135, 175, 215, 255];
    for (let r = 0; r < 6; ++r) {
      for (let g = 0; g < 6; ++g) {
        for (let b = 0; b < 6; ++b) {
          let col = { rgb: [levels[r], levels[g], levels[b]], class_name: "truecolor" };
          this.palette_256.push(col);
        }
      }
    }
    let grey_level = 8;
    for (let i = 0; i < 24; ++i, grey_level += 10) {
      let gry = { rgb: [grey_level, grey_level, grey_level], class_name: "truecolor" };
      this.palette_256.push(gry);
    }
  }
  escape_txt_for_html(txt) {
    if (!this._escape_html)
      return txt;
    return txt.replace(/[&<>"']/gm, (str) => {
      if (str === "&")
        return "&amp;";
      if (str === "<")
        return "&lt;";
      if (str === ">")
        return "&gt;";
      if (str === '"')
        return "&quot;";
      if (str === "'")
        return "&#x27;";
    });
  }
  append_buffer(txt) {
    var str = this._buffer + txt;
    this._buffer = str;
  }
  get_next_packet() {
    var pkt = {
      kind: PacketKind.EOS,
      text: "",
      url: ""
    };
    var len = this._buffer.length;
    if (len == 0)
      return pkt;
    var pos = this._buffer.indexOf("\x1B");
    if (pos == -1) {
      pkt.kind = PacketKind.Text;
      pkt.text = this._buffer;
      this._buffer = "";
      return pkt;
    }
    if (pos > 0) {
      pkt.kind = PacketKind.Text;
      pkt.text = this._buffer.slice(0, pos);
      this._buffer = this._buffer.slice(pos);
      return pkt;
    }
    if (pos == 0) {
      if (len < 3) {
        pkt.kind = PacketKind.Incomplete;
        return pkt;
      }
      var next_char = this._buffer.charAt(1);
      if (next_char != "[" && next_char != "]" && next_char != "(") {
        pkt.kind = PacketKind.ESC;
        pkt.text = this._buffer.slice(0, 1);
        this._buffer = this._buffer.slice(1);
        return pkt;
      }
      if (next_char == "[") {
        if (!this._csi_regex) {
          this._csi_regex = rgx(templateObject_1 || (templateObject_1 = __makeTemplateObject(["\n                        ^                           # beginning of line\n                                                    #\n                                                    # First attempt\n                        (?:                         # legal sequence\n                          \x1B[                      # CSI\n                          ([<-?]?)              # private-mode char\n                          ([d;]*)                    # any digits or semicolons\n                          ([ -/]?               # an intermediate modifier\n                          [@-~])                # the command\n                        )\n                        |                           # alternate (second attempt)\n                        (?:                         # illegal sequence\n                          \x1B[                      # CSI\n                          [ -~]*                # anything legal\n                          ([\0-:])              # anything illegal\n                        )\n                    "], ["\n                        ^                           # beginning of line\n                                                    #\n                                                    # First attempt\n                        (?:                         # legal sequence\n                          \\x1b\\[                      # CSI\n                          ([\\x3c-\\x3f]?)              # private-mode char\n                          ([\\d;]*)                    # any digits or semicolons\n                          ([\\x20-\\x2f]?               # an intermediate modifier\n                          [\\x40-\\x7e])                # the command\n                        )\n                        |                           # alternate (second attempt)\n                        (?:                         # illegal sequence\n                          \\x1b\\[                      # CSI\n                          [\\x20-\\x7e]*                # anything legal\n                          ([\\x00-\\x1f:])              # anything illegal\n                        )\n                    "])));
        }
        let match = this._buffer.match(this._csi_regex);
        if (match === null) {
          pkt.kind = PacketKind.Incomplete;
          return pkt;
        }
        if (match[4]) {
          pkt.kind = PacketKind.ESC;
          pkt.text = this._buffer.slice(0, 1);
          this._buffer = this._buffer.slice(1);
          return pkt;
        }
        if (match[1] != "" || match[3] != "m")
          pkt.kind = PacketKind.Unknown;
        else
          pkt.kind = PacketKind.SGR;
        pkt.text = match[2];
        var rpos = match[0].length;
        this._buffer = this._buffer.slice(rpos);
        return pkt;
      } else if (next_char == "]") {
        if (len < 4) {
          pkt.kind = PacketKind.Incomplete;
          return pkt;
        }
        if (this._buffer.charAt(2) != "8" || this._buffer.charAt(3) != ";") {
          pkt.kind = PacketKind.ESC;
          pkt.text = this._buffer.slice(0, 1);
          this._buffer = this._buffer.slice(1);
          return pkt;
        }
        if (!this._osc_st) {
          this._osc_st = rgxG(templateObject_2 || (templateObject_2 = __makeTemplateObject(["\n                        (?:                         # legal sequence\n                          (\x1B\\)                    # ESC                           |                           # alternate\n                          (\x07)                      # BEL (what xterm did)\n                        )\n                        |                           # alternate (second attempt)\n                        (                           # illegal sequence\n                          [\0-]                 # anything illegal\n                          |                           # alternate\n                          [\b-]                 # anything illegal\n                          |                           # alternate\n                          [-]                 # anything illegal\n                        )\n                    "], ["\n                        (?:                         # legal sequence\n                          (\\x1b\\\\)                    # ESC \\\n                          |                           # alternate\n                          (\\x07)                      # BEL (what xterm did)\n                        )\n                        |                           # alternate (second attempt)\n                        (                           # illegal sequence\n                          [\\x00-\\x06]                 # anything illegal\n                          |                           # alternate\n                          [\\x08-\\x1a]                 # anything illegal\n                          |                           # alternate\n                          [\\x1c-\\x1f]                 # anything illegal\n                        )\n                    "])));
        }
        this._osc_st.lastIndex = 0;
        {
          let match2 = this._osc_st.exec(this._buffer);
          if (match2 === null) {
            pkt.kind = PacketKind.Incomplete;
            return pkt;
          }
          if (match2[3]) {
            pkt.kind = PacketKind.ESC;
            pkt.text = this._buffer.slice(0, 1);
            this._buffer = this._buffer.slice(1);
            return pkt;
          }
        }
        {
          let match2 = this._osc_st.exec(this._buffer);
          if (match2 === null) {
            pkt.kind = PacketKind.Incomplete;
            return pkt;
          }
          if (match2[3]) {
            pkt.kind = PacketKind.ESC;
            pkt.text = this._buffer.slice(0, 1);
            this._buffer = this._buffer.slice(1);
            return pkt;
          }
        }
        if (!this._osc_regex) {
          this._osc_regex = rgx(templateObject_3 || (templateObject_3 = __makeTemplateObject(["\n                        ^                           # beginning of line\n                                                    #\n                        \x1B]8;                    # OSC Hyperlink\n                        [ -:<-~]*       # params (excluding ;)\n                        ;                           # end of params\n                        ([!-~]{0,512})        # URL capture\n                        (?:                         # ST\n                          (?:\x1B\\)                  # ESC                           |                           # alternate\n                          (?:\x07)                    # BEL (what xterm did)\n                        )\n                        ([ -~]+)              # TEXT capture\n                        \x1B]8;;                   # OSC Hyperlink End\n                        (?:                         # ST\n                          (?:\x1B\\)                  # ESC                           |                           # alternate\n                          (?:\x07)                    # BEL (what xterm did)\n                        )\n                    "], ["\n                        ^                           # beginning of line\n                                                    #\n                        \\x1b\\]8;                    # OSC Hyperlink\n                        [\\x20-\\x3a\\x3c-\\x7e]*       # params (excluding ;)\n                        ;                           # end of params\n                        ([\\x21-\\x7e]{0,512})        # URL capture\n                        (?:                         # ST\n                          (?:\\x1b\\\\)                  # ESC \\\n                          |                           # alternate\n                          (?:\\x07)                    # BEL (what xterm did)\n                        )\n                        ([\\x20-\\x7e]+)              # TEXT capture\n                        \\x1b\\]8;;                   # OSC Hyperlink End\n                        (?:                         # ST\n                          (?:\\x1b\\\\)                  # ESC \\\n                          |                           # alternate\n                          (?:\\x07)                    # BEL (what xterm did)\n                        )\n                    "])));
        }
        let match = this._buffer.match(this._osc_regex);
        if (match === null) {
          pkt.kind = PacketKind.ESC;
          pkt.text = this._buffer.slice(0, 1);
          this._buffer = this._buffer.slice(1);
          return pkt;
        }
        pkt.kind = PacketKind.OSCURL;
        pkt.url = match[1];
        pkt.text = match[2];
        var rpos = match[0].length;
        this._buffer = this._buffer.slice(rpos);
        return pkt;
      } else if (next_char == "(") {
        pkt.kind = PacketKind.Unknown;
        this._buffer = this._buffer.slice(3);
        return pkt;
      }
    }
  }
  ansi_to_html(txt) {
    this.append_buffer(txt);
    var blocks = [];
    while (true) {
      var packet = this.get_next_packet();
      if (packet.kind == PacketKind.EOS || packet.kind == PacketKind.Incomplete)
        break;
      if (packet.kind == PacketKind.ESC || packet.kind == PacketKind.Unknown)
        continue;
      if (packet.kind == PacketKind.Text)
        blocks.push(this.transform_to_html(this.with_state(packet)));
      else if (packet.kind == PacketKind.SGR)
        this.process_ansi(packet);
      else if (packet.kind == PacketKind.OSCURL)
        blocks.push(this.process_hyperlink(packet));
    }
    return blocks.join("");
  }
  with_state(pkt) {
    return { bold: this.bold, faint: this.faint, italic: this.italic, underline: this.underline, fg: this.fg, bg: this.bg, text: pkt.text };
  }
  process_ansi(pkt) {
    let sgr_cmds = pkt.text.split(";");
    while (sgr_cmds.length > 0) {
      let sgr_cmd_str = sgr_cmds.shift();
      let num = parseInt(sgr_cmd_str, 10);
      if (isNaN(num) || num === 0) {
        this.fg = null;
        this.bg = null;
        this.bold = false;
        this.faint = false;
        this.italic = false;
        this.underline = false;
      } else if (num === 1) {
        this.bold = true;
      } else if (num === 2) {
        this.faint = true;
      } else if (num === 3) {
        this.italic = true;
      } else if (num === 4) {
        this.underline = true;
      } else if (num === 21) {
        this.bold = false;
      } else if (num === 22) {
        this.faint = false;
        this.bold = false;
      } else if (num === 23) {
        this.italic = false;
      } else if (num === 24) {
        this.underline = false;
      } else if (num === 39) {
        this.fg = null;
      } else if (num === 49) {
        this.bg = null;
      } else if (num >= 30 && num < 38) {
        this.fg = this.ansi_colors[0][num - 30];
      } else if (num >= 40 && num < 48) {
        this.bg = this.ansi_colors[0][num - 40];
      } else if (num >= 90 && num < 98) {
        this.fg = this.ansi_colors[1][num - 90];
      } else if (num >= 100 && num < 108) {
        this.bg = this.ansi_colors[1][num - 100];
      } else if (num === 38 || num === 48) {
        if (sgr_cmds.length > 0) {
          let is_foreground = num === 38;
          let mode_cmd = sgr_cmds.shift();
          if (mode_cmd === "5" && sgr_cmds.length > 0) {
            let palette_index = parseInt(sgr_cmds.shift(), 10);
            if (palette_index >= 0 && palette_index <= 255) {
              if (is_foreground)
                this.fg = this.palette_256[palette_index];
              else
                this.bg = this.palette_256[palette_index];
            }
          }
          if (mode_cmd === "2" && sgr_cmds.length > 2) {
            let r = parseInt(sgr_cmds.shift(), 10);
            let g = parseInt(sgr_cmds.shift(), 10);
            let b = parseInt(sgr_cmds.shift(), 10);
            if (r >= 0 && r <= 255 && (g >= 0 && g <= 255) && (b >= 0 && b <= 255)) {
              let c = { rgb: [r, g, b], class_name: "truecolor" };
              if (is_foreground)
                this.fg = c;
              else
                this.bg = c;
            }
          }
        }
      }
    }
  }
  transform_to_html(fragment) {
    let txt = fragment.text;
    if (txt.length === 0)
      return txt;
    txt = this.escape_txt_for_html(txt);
    if (!fragment.bold && !fragment.italic && !fragment.faint && !fragment.underline && fragment.fg === null && fragment.bg === null)
      return txt;
    let styles = [];
    let classes = [];
    let fg = fragment.fg;
    let bg = fragment.bg;
    if (fragment.bold)
      styles.push(this._boldStyle);
    if (fragment.faint)
      styles.push(this._faintStyle);
    if (fragment.italic)
      styles.push(this._italicStyle);
    if (fragment.underline)
      styles.push(this._underlineStyle);
    if (!this._use_classes) {
      if (fg)
        styles.push(`color:rgb(${fg.rgb.join(",")})`);
      if (bg)
        styles.push(`background-color:rgb(${bg.rgb})`);
    } else {
      if (fg) {
        if (fg.class_name !== "truecolor") {
          classes.push(`${fg.class_name}-fg`);
        } else {
          styles.push(`color:rgb(${fg.rgb.join(",")})`);
        }
      }
      if (bg) {
        if (bg.class_name !== "truecolor") {
          classes.push(`${bg.class_name}-bg`);
        } else {
          styles.push(`background-color:rgb(${bg.rgb.join(",")})`);
        }
      }
    }
    let class_string = "";
    let style_string = "";
    if (classes.length)
      class_string = ` class="${classes.join(" ")}"`;
    if (styles.length)
      style_string = ` style="${styles.join(";")}"`;
    return `<span${style_string}${class_string}>${txt}</span>`;
  }
  process_hyperlink(pkt) {
    let parts = pkt.url.split(":");
    if (parts.length < 1)
      return "";
    if (!this._url_allowlist[parts[0]])
      return "";
    let result = `<a href="${this.escape_txt_for_html(pkt.url)}">${this.escape_txt_for_html(pkt.text)}</a>`;
    return result;
  }
};
function rgx(tmplObj, ...subst) {
  let regexText = tmplObj.raw[0];
  let wsrgx = /^\s+|\s+\n|\s*#[\s\S]*?\n|\n/gm;
  let txt2 = regexText.replace(wsrgx, "");
  return new RegExp(txt2);
}
function rgxG(tmplObj, ...subst) {
  let regexText = tmplObj.raw[0];
  let wsrgx = /^\s+|\s+\n|\s*#[\s\S]*?\n|\n/gm;
  let txt2 = regexText.replace(wsrgx, "");
  return new RegExp(txt2, "g");
}
var templateObject_1;
var templateObject_2;
var templateObject_3;

// plugins/job-viewer/src/client.tsx
var import_dsh_client_ui_primitives = __toESM(require("@deepseek-ai/dsh-client-ui-primitives"), 1);

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
function mergeCss(...parts) {
  return parts.flat().filter(Boolean).join("\n");
}
function request(method, url, body) {
  const hasBody = body !== void 0 && method !== "GET";
  console.debug("[client-util] " + method + " " + url);
  return fetch(url, {
    method,
    cache: "no-store",
    ...hasBody ? { headers: { "content-type": "application/json" } } : {},
    ...hasBody ? { body: JSON.stringify(body) } : {}
  }).then(function(res) {
    return res.json().catch(function() {
      return null;
    }).then(function(json) {
      return { ok: res.ok, status: res.status, json };
    });
  }).then(function(result) {
    if (result.json !== null && result.json.error) {
      console.error(
        "[client-util] " + method + " " + url + " failed: server error " + result.status
      );
      return { data: null, error: String(result.json.error) };
    }
    if (!result.ok) {
      console.error("[client-util] " + method + " " + url + " failed: HTTP " + result.status);
      return { data: null, error: "HTTP " + result.status };
    }
    console.info("[client-util] " + method + " " + url + " ok (HTTP " + result.status + ")");
    return { data: result.json, error: null };
  }).catch(function(e) {
    console.error("[client-util] " + method + " " + url + " failed: network error");
    return { data: null, error: String(e && e.message || e) };
  });
}
function fetchJson(url) {
  return request("GET", url);
}
function postJson(url, body) {
  return request("POST", url, body);
}

// css-text:/home/sid/repos/dotfiles-ai/plugins/shared/settings.css
var settings_default = "/* Shared settings-page vocabulary, normalized from the session-archive,\n * subscriptions, and profiles settings panels. One rule set in one file so\n * the three panels cannot drift. Radius and padding disagreements are\n * normalized to the session-archive (or median) value; the var(--dsw-...)\n * aliases the current rules use are kept as-is. */\n\n/* Page-level container:airy vertical rhythm, no own box. */\n.dsp-root {\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n  gap: 0.75rem;\n  padding: 0;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Header row (title + refresh). */\n.dsp-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 0.75rem;\n}\n\n.dsp-title {\n  font-size: 1.5rem;\n  font-weight: 650;\n  margin: 0;\n  line-height: 1.2;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Refresh:session-archive/profiles form (no box, color shift only).\n * subscriptions pads and rounds the hit area; normalized away. */\n.dsp-refresh {\n  cursor: pointer;\n  border: none;\n  background: none;\n  padding: 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 0.9375rem;\n  line-height: 1.25rem;\n}\n.dsp-refresh:hover {\n  color: var(--dsw-alias-label-primary);\n}\n\n.dsp-err {\n  font-size: 0.9375rem;\n  line-height: 1.375rem;\n  color: var(--dsw-alias-state-error-primary);\n}\n\n/* Large setting card. Padding is the median of 16/20/24 (session-archive\n * 20px); the radius is the two-agreeing 20px, not profiles' 12px. */\n.dsp-section {\n  display: flex;\n  flex-direction: column;\n  gap: 0.75rem;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.875rem;\n  padding: 1.25rem;\n  background: var(--dsw-alias-bg-tertiary);\n}\n\n/* Card title:subscriptions' 1.5rem/700 matches the page-title vocabulary;\n * profiles' smaller 16px/600 card title normalized up. */\n.dsp-section-title {\n  font-size: 1.125rem;\n  font-weight: 600;\n  margin: 0;\n  line-height: 1.2;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Setting row:horizontal in session-archive and profiles (subscriptions\n * stacks its label and meta vertically; normalized to the horizontal form). */\n.dsp-row {\n  display: flex;\n  align-items: center;\n  gap: 0.75rem;\n  min-width: 0;\n}\n\n/* Row label:only subscriptions defines one; ported verbatim, with its\n * emphasized <b> children. */\n.dsp-row-label {\n  display: flex;\n  align-items: baseline;\n  gap: 0.625rem;\n  font-size: 0.9375rem;\n  line-height: 1.375rem;\n  color: var(--dsw-alias-label-secondary);\n}\n.dsp-row-label b {\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n  font-size: 0.9375rem;\n}\n.dsp-row-label b:last-child {\n  margin-left: auto;\n}\n";

// css-text:/home/sid/repos/dotfiles-ai/plugins/job-viewer/src/client.module.css
var client_default = "/* job-viewer dropdown and output modal styles. Class names are kebab-case only. */\n\n.jv-root {\n  position: relative;\n  display: inline-block;\n}\n\n.jv-trigger {\n  align-items: center;\n  background: transparent;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.5rem;\n  color: var(--dsw-alias-label-primary);\n  cursor: pointer;\n  display: flex;\n  font-size: 0.8125rem;\n  gap: 0.375rem;\n  line-height: 1.375rem;\n  padding: 0.125rem 0.5rem;\n}\n\n.jv-trigger:hover {\n  background: var(--dsw-alias-bg-tertiary);\n}\n\n.jv-chevron {\n  flex: none;\n  color: var(--dsw-alias-label-caption);\n  transform: rotate(0deg);\n  transition: transform 0.12s;\n}\n\n.jv-chevron-open {\n  transform: rotate(180deg);\n}\n\n.jv-menu {\n  /* The popover needs the MENU token, not the generic page background: the\n     generic one is translucent in this theme, so the conversation showed\n     through the dropdown. This is the token the shipped jobs dropdown used. */\n  background: var(--dsw-specific-menu);\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.5rem;\n  box-shadow: 0 0.25rem 1rem rgb(0 0 0 / 20%);\n  list-style: none;\n  margin: 0;\n  max-height: 60vh;\n  max-width: min(26rem, calc(100vw - 16px));\n  min-width: 18rem;\n  overflow-y: auto;\n  padding: 0.25rem;\n  /* Portaled into document.body, so the sidebar's overflow cannot clip it.\n     Client code anchors it to the trigger (fixed top/left, flipped above\n     when the viewport bottom would overflow). z-index matches the shipped\n     modal overlay: the menu never competes with a modal, since opening a\n     row closes the menu first. */\n  position: fixed;\n  width: max-content;\n  z-index: 1000;\n}\n\n.jv-row {\n  align-items: center;\n  border-radius: 0.375rem;\n  cursor: pointer;\n  display: flex;\n  font-size: 0.8125rem;\n  gap: 0.5rem;\n  line-height: 1.375rem;\n  padding: 0.25rem 0.5rem;\n}\n\n.jv-row:hover {\n  background: var(--dsw-alias-bg-tertiary);\n}\n\n.jv-dot {\n  border-radius: 50%;\n  flex: none;\n  height: 0.5rem;\n  width: 0.5rem;\n  background: var(--dsw-alias-label-tertiary);\n}\n\n.jv-dot[data-live] {\n  background: var(--dsw-alias-state-success-primary);\n}\n\n.jv-kind {\n  background: var(--dsw-alias-bg-tertiary);\n  border-radius: 0.25rem;\n  color: var(--dsw-alias-label-secondary);\n  flex: none;\n  font-size: 0.6875rem;\n  line-height: 1.125rem;\n  padding: 0 0.375rem;\n}\n\n.jv-label {\n  color: var(--dsw-alias-label-primary);\n  flex: 1 1 auto;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.jv-status {\n  color: var(--dsw-alias-label-secondary);\n  flex: none;\n}\n\n.jv-duration {\n  color: var(--dsw-alias-label-tertiary);\n  flex: none;\n  font-variant-numeric: tabular-nums;\n  text-align: right;\n}\n\n.jv-empty {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 0.875rem;\n  font-style: italic;\n  line-height: 1.375rem;\n}\n\n.jv-meta {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 0.8125rem;\n  line-height: 1.375rem;\n}\n\n.jv-autoscroll {\n  align-items: center;\n  color: var(--dsw-alias-label-secondary);\n  display: flex;\n  font-size: 0.8125rem;\n  gap: 0.375rem;\n  line-height: 1.375rem;\n}\n\n.jv-output-wrap {\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.875rem;\n  margin-top: 0.5rem;\n  /* The flexible middle of the fixed-size modal: one constant size with an\n     internal scrollbar. This replaces the old max-height cap, which let the\n     modal grow and shrink with the output. */\n  flex: 1;\n  min-height: 0;\n  overflow: auto;\n}\n\n.jv-output {\n  background: var(--dsw-alias-bg-tertiary);\n  box-sizing: border-box;\n  color: var(--dsw-alias-label-primary);\n  font-family: var(--ds-font-family-code);\n  font-size: 0.8125rem;\n  line-height: 1.5;\n  margin: 0;\n  min-width: 100%;\n  padding: 1rem;\n  white-space: pre;\n}\n\n.jv-modal {\n  /* Sizing hook for primitives' Modal: className lands on the dialog box,\n     the same pattern as the shipped confirmation modal. The settings\n     panel's fixed box instead of the default narrow dialog. Plugin CSS\n     injects after the app bundle, so this wins the specificity tie with\n     the dialog rule. */\n  height: min(800px, 100vh - 48px);\n  max-width: calc(100vw - 48px);\n  width: 800px;\n}\n\n/* contentClassName hook: take the dialog's column so the output area can\n   flex to one constant size. */\n.jv-modal-content {\n  flex: 1;\n  min-height: 0;\n}\n\n/* The Modal body div is always the last child of the content box (header,\n   then the optional description, then the body), so reach it by position:\n   it must flex too, or .jv-output-wrap has nothing to fill. */\n.jv-modal-content > div:last-child {\n  flex: 1;\n  min-height: 0;\n}\n\n.jv-command {\n  /* The job's command/label on its own monospaced line under the heading. */\n  color: var(--dsw-alias-label-primary);\n  font-family: var(--ds-font-family-code);\n  font-size: 0.8125rem;\n  line-height: 1.375rem;\n  margin: 0 0 0.5rem;\n  overflow-wrap: anywhere;\n}\n\n.jv-note {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 0.8125rem;\n  line-height: 1.375rem;\n  margin-top: 0.5rem;\n}\n";

// plugins/job-viewer/src/client.tsx
var ui = import_dsh_client_ui_primitives.default;
var PLUGIN_NAME = "job-viewer";
var STYLE_TAG_ID = "job-viewer/client.css";
var POLL_MS = 2500;
var CONFIRM_MS = 3e3;
var UNKNOWN_JOB_ERROR = "unknown job";
var MENU_GAP = 4;
var MENU_MARGIN = 8;
var makeAnsiUp = function() {
  return new AnsiUp();
};
function isLive(job) {
  return job.status === "running" || job.status === "stopping";
}
function formatDuration(elapsedMs) {
  var total = Math.max(0, Math.floor(elapsedMs / 1e3));
  var seconds = total % 60;
  var minutes = Math.floor(total / 60) % 60;
  var hours = Math.floor(total / 3600);
  if (hours > 0) return hours + "h " + minutes + "m";
  if (minutes > 0) return minutes + "m " + seconds + "s";
  return seconds + "s";
}
function ordered(jobs) {
  return [...jobs].sort(function(left, right) {
    var liveLeft = isLive(left);
    if (liveLeft !== isLive(right)) return liveLeft ? -1 : 1;
    if (liveLeft) return left.startedAt - right.startedAt;
    var finished = (right.finishedAt ?? right.startedAt) - (left.finishedAt ?? left.startedAt);
    return finished !== 0 ? finished : left.startedAt - right.startedAt;
  });
}
function makeJobViewerAction() {
  return function JobViewerAction(props) {
    var sessionId = props.sessionId;
    var useSessions = props.useSessions;
    var jobs = useSessions(function(state) {
      return state.jobsBySession[sessionId] || [];
    });
    var liveCount = jobs.filter(isLive).length;
    var menuOpenState = import_react.default.useState(false);
    var menuOpen = menuOpenState[0];
    var setMenuOpen = menuOpenState[1];
    var nowState = import_react.default.useState(function() {
      return Date.now();
    });
    var now = nowState[0];
    var setNow = nowState[1];
    var openJobState = import_react.default.useState(null);
    var openJobId = openJobState[0];
    var setOpenJobId = openJobState[1];
    var outState = import_react.default.useState(null);
    var out = outState[0];
    var setOut = outState[1];
    var statusState = import_react.default.useState(null);
    var status = statusState[0];
    var setStatus = statusState[1];
    var statusRef = import_react.default.useRef(null);
    var autoscrollState = import_react.default.useState(true);
    var autoscroll = autoscrollState[0];
    var setAutoscroll = autoscrollState[1];
    var killPhaseState = import_react.default.useState("idle");
    var killPhase = killPhaseState[0];
    var setKillPhase = killPhaseState[1];
    var killErrorState = import_react.default.useState(null);
    var killError = killErrorState[0];
    var setKillError = killErrorState[1];
    var outputWrapRef = import_react.default.useRef(null);
    var triggerRef = import_react.default.useRef(null);
    var menuRef = import_react.default.useRef(null);
    var menuPosState = import_react.default.useState(null);
    var menuPos = menuPosState[0];
    var setMenuPos = menuPosState[1];
    import_react.default.useEffect(
      function() {
        if (!menuOpen || liveCount === 0) return;
        setNow(Date.now());
        var timer = setInterval(function() {
          setNow(Date.now());
        }, 1e3);
        return function() {
          clearInterval(timer);
        };
      },
      [menuOpen, liveCount]
    );
    import_react.default.useLayoutEffect(
      function() {
        if (!menuOpen) return;
        var place = function() {
          var btn = triggerRef.current;
          var menu = menuRef.current;
          if (btn === null || menu === null) return;
          var rect = btn.getBoundingClientRect();
          var left = Math.max(
            MENU_MARGIN,
            Math.min(rect.left, window.innerWidth - menu.offsetWidth - MENU_MARGIN)
          );
          var top = rect.bottom + MENU_GAP;
          if (top + menu.offsetHeight > window.innerHeight - MENU_MARGIN) {
            top = Math.max(MENU_MARGIN, rect.top - menu.offsetHeight - MENU_GAP);
          }
          setMenuPos(function(prev) {
            if (prev !== null && prev.top === top && prev.left === left) return prev;
            return { top, left };
          });
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return function() {
          window.removeEventListener("resize", place);
          window.removeEventListener("scroll", place, true);
        };
      },
      [menuOpen, jobs.length]
    );
    import_react.default.useEffect(
      function() {
        if (!menuOpen) return;
        var onPointerDown = function(event) {
          var target = event.target;
          var btn = triggerRef.current;
          var menu = menuRef.current;
          if (btn !== null && btn.contains(target)) return;
          if (menu !== null && menu.contains(target)) return;
          setMenuOpen(false);
        };
        var onKeyDown = function(event) {
          if (event.key === "Escape") setMenuOpen(false);
        };
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return function() {
          document.removeEventListener("pointerdown", onPointerDown);
          document.removeEventListener("keydown", onKeyDown);
        };
      },
      [menuOpen]
    );
    var openJob = function(job) {
      setMenuOpen(false);
      statusRef.current = job.status;
      setStatus(job.status);
      setOut(null);
      setKillPhase("idle");
      setKillError(null);
      setOpenJobId(job.id);
    };
    var closeJob = function() {
      setOpenJobId(null);
      setOut(null);
      setKillPhase("idle");
      setKillError(null);
    };
    import_react.default.useEffect(
      function() {
        if (openJobId === null) return;
        var cancelled = false;
        var timer = null;
        var tick = function() {
          fetchJson("/job-viewer/output?job_id=" + encodeURIComponent(openJobId)).then(
            function(result) {
              if (cancelled) return;
              if (result.error) {
                var unknown = result.error === UNKNOWN_JOB_ERROR;
                var live2 = statusRef.current === "running" || statusRef.current === "stopping";
                if (!unknown || !live2) {
                  setOut({
                    error: unknown ? null : result.error,
                    text: unknown ? "" : null,
                    truncated: false,
                    missing: unknown
                  });
                }
              } else {
                var data = result.data;
                setOut({
                  error: null,
                  text: data && typeof data.text === "string" ? data.text : "",
                  truncated: !!(data && data.truncated === true),
                  evicted: !!(data && data.evicted === true),
                  job: data && data.job ? data.job : void 0
                });
                if (data && data.job && data.job.status) {
                  statusRef.current = data.job.status;
                  setStatus(data.job.status);
                }
              }
              if (statusRef.current === "running" || statusRef.current === "stopping") {
                timer = setTimeout(tick, POLL_MS);
              }
            }
          );
        };
        tick();
        return function() {
          cancelled = true;
          if (timer !== null) clearTimeout(timer);
        };
      },
      [openJobId]
    );
    import_react.default.useEffect(
      function() {
        if (!autoscroll) return;
        var wrap = outputWrapRef.current;
        if (wrap !== null) wrap.scrollTop = wrap.scrollHeight;
      },
      [out && out.text, autoscroll]
    );
    import_react.default.useEffect(
      function() {
        if (killPhase !== "confirming") return;
        var timer = setTimeout(function() {
          setKillPhase("idle");
        }, CONFIRM_MS);
        return function() {
          clearTimeout(timer);
        };
      },
      [killPhase]
    );
    var outputHtml = import_react.default.useMemo(
      function() {
        if (out === null || typeof out.text !== "string" || out.text === "") return "";
        return makeAnsiUp().ansi_to_html(out.text);
      },
      [out && out.text]
    );
    var onKillClick = function() {
      if (openJobId === null) return;
      if (killPhase === "idle") {
        setKillError(null);
        setKillPhase("confirming");
        return;
      }
      if (killPhase !== "confirming") return;
      setKillPhase("killing");
      var jobId = openJobId;
      postJson("/job-viewer/kill", { job_id: jobId }).then(function(result) {
        if (result.error || !result.data || result.data.ok !== true) {
          setKillError(result.error || "Kill request failed");
          setKillPhase("idle");
          return;
        }
        if (result.data.job && result.data.job.status) {
          statusRef.current = result.data.job.status;
          setStatus(result.data.job.status);
        }
        fetchJson("/job-viewer/output?job_id=" + encodeURIComponent(jobId)).then(
          function(fresh) {
            if (fresh.error) {
              setKillError(fresh.error);
              return;
            }
            var data = fresh.data;
            setOut({
              error: null,
              text: data && typeof data.text === "string" ? data.text : "",
              truncated: !!(data && data.truncated === true)
            });
            if (data && data.job && data.job.status) {
              statusRef.current = data.job.status;
              setStatus(data.job.status);
            }
          }
        );
      });
    };
    if (jobs.length === 0) return null;
    var sorted = ordered(jobs);
    var triggerLabel = liveCount > 0 ? liveCount + " running" : jobs.length + " background jobs";
    var rows = sorted.map(function(job) {
      return /* @__PURE__ */ import_react.default.createElement(
        "li",
        {
          key: job.id,
          className: "jv-row",
          onClick: function() {
            openJob(job);
          }
        },
        /* @__PURE__ */ import_react.default.createElement("span", { className: "jv-dot", "data-live": isLive(job) ? "" : void 0 }),
        /* @__PURE__ */ import_react.default.createElement("span", { className: "jv-kind" }, job.kind),
        /* @__PURE__ */ import_react.default.createElement("span", { className: "jv-label" }, job.label),
        /* @__PURE__ */ import_react.default.createElement("span", { className: "jv-status" }, job.status),
        /* @__PURE__ */ import_react.default.createElement("span", { className: "jv-duration" }, formatDuration(
          (isLive(job) ? now : job.finishedAt ?? job.startedAt) - job.startedAt
        ))
      );
    });
    var modal = null;
    if (openJobId !== null) {
      var known = jobs.find(function(job) {
        return job.id === openJobId;
      });
      var live = status === "running" || status === "stopping";
      var killLabel = killPhase === "killing" ? "Stopping\u2026" : killPhase === "confirming" ? "Really stop?" : "Stop job";
      var shown = known !== void 0 ? known : out && out.job ? out.job : null;
      var body = null;
      if (out === null) {
        body = /* @__PURE__ */ import_react.default.createElement("div", { className: "jv-empty" }, "Loading\u2026");
      } else if (out.evicted) {
        body = /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, shown ? /* @__PURE__ */ import_react.default.createElement("div", { className: "jv-command" }, shown.label) : null, /* @__PURE__ */ import_react.default.createElement("div", { className: "jv-empty" }, "Output expired \u2014 finished jobs keep their output for 10 minutes."), /* @__PURE__ */ import_react.default.createElement("div", { className: "jv-meta" }, shown ? shown.kind + " \xB7 " + status : "job status: " + status));
      } else if (out.missing) {
        body = /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, shown ? /* @__PURE__ */ import_react.default.createElement("div", { className: "jv-command" }, shown.label) : null, /* @__PURE__ */ import_react.default.createElement("div", { className: "jv-empty" }, "No output available for this job."));
      } else {
        body = /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, shown ? /* @__PURE__ */ import_react.default.createElement("div", { className: "jv-command" }, shown.label) : null, /* @__PURE__ */ import_react.default.createElement("div", { className: "jv-meta" }, "status: " + status), /* @__PURE__ */ import_react.default.createElement("label", { className: "jv-autoscroll" }, /* @__PURE__ */ import_react.default.createElement(
          "input",
          {
            type: "checkbox",
            checked: autoscroll,
            onChange: function(event) {
              setAutoscroll(event.target.checked);
            }
          }
        ), "Auto-scroll"), /* @__PURE__ */ import_react.default.createElement("div", { className: "jv-output-wrap", ref: outputWrapRef }, /* @__PURE__ */ import_react.default.createElement("pre", { className: "jv-output", dangerouslySetInnerHTML: { __html: outputHtml } })), out.truncated ? /* @__PURE__ */ import_react.default.createElement("div", { className: "jv-note" }, "Earlier output was dropped (buffer full).") : null, out.error ? /* @__PURE__ */ import_react.default.createElement("div", { className: "dsp-err" }, out.error) : null, killError ? /* @__PURE__ */ import_react.default.createElement("div", { className: "dsp-err" }, killError) : null);
      }
      modal = /* @__PURE__ */ import_react.default.createElement(
        ui.Modal,
        {
          open: true,
          onClose: closeJob,
          title: "Job output",
          description: shown ? shown.kind + " \xB7 " + status : "job status: " + status,
          closeLabel: "Close",
          className: "jv-modal",
          contentClassName: "jv-modal-content",
          footer: /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement(ui.Button, { variant: "outline", onClick: closeJob }, "Close"), live ? /* @__PURE__ */ import_react.default.createElement(
            ui.Button,
            {
              variant: "outline",
              disabled: killPhase === "killing",
              onClick: onKillClick
            },
            killLabel
          ) : null)
        },
        body
      );
    }
    return /* @__PURE__ */ import_react.default.createElement("div", { className: "jv-root" }, /* @__PURE__ */ import_react.default.createElement(
      "button",
      {
        className: "jv-trigger",
        ref: triggerRef,
        onClick: function() {
          if (menuOpen) {
            setMenuOpen(false);
            return;
          }
          var btn = triggerRef.current;
          if (btn !== null) {
            var rect = btn.getBoundingClientRect();
            setMenuPos({ top: rect.bottom + MENU_GAP, left: rect.left });
          }
          setMenuOpen(true);
        }
      },
      triggerLabel,
      /* @__PURE__ */ import_react.default.createElement(
        ui.IconChevronDownOutline14,
        {
          className: menuOpen ? "jv-chevron jv-chevron-open" : "jv-chevron",
          "aria-hidden": true
        }
      )
    ), menuOpen ? (0, import_react_dom.createPortal)(
      /* @__PURE__ */ import_react.default.createElement(
        "ul",
        {
          ref: menuRef,
          className: "jv-menu",
          style: menuPos !== null ? { top: menuPos.top, left: menuPos.left } : { visibility: "hidden" }
        },
        rows
      ),
      document.body
    ) : null, modal);
  };
}
var name = PLUGIN_NAME;
var inject = ["slots"];
function apply(ctx) {
  ctx.effect(function() {
    injectStyle(PLUGIN_NAME, STYLE_TAG_ID, mergeCss(settings_default, client_default));
  }, "job-viewer: styles");
  var JobViewerAction = makeJobViewerAction();
  ctx.slots.inject("conversation.session.header.actions", function() {
    return ctx.slots.register(
      { name: "conversation.session.header.actions", id: PLUGIN_NAME, order: 20 },
      JobViewerAction
    );
  });
}
		return module.exports;
	}
});
