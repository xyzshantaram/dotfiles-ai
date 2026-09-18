window.__ModuleLoader__.load({
	id: "tool-render",
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
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
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

// node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/lib/core.js
var require_core = __commonJS({
  "node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/lib/core.js"(exports, module2) {
    function deepFreeze(obj) {
      if (obj instanceof Map) {
        obj.clear = obj.delete = obj.set = function() {
          throw new Error("map is read-only");
        };
      } else if (obj instanceof Set) {
        obj.add = obj.clear = obj.delete = function() {
          throw new Error("set is read-only");
        };
      }
      Object.freeze(obj);
      Object.getOwnPropertyNames(obj).forEach((name2) => {
        const prop = obj[name2];
        const type = typeof prop;
        if ((type === "object" || type === "function") && !Object.isFrozen(prop)) {
          deepFreeze(prop);
        }
      });
      return obj;
    }
    var Response = class {
      /**
       * @param {CompiledMode} mode
       */
      constructor(mode) {
        if (mode.data === void 0) mode.data = {};
        this.data = mode.data;
        this.isMatchIgnored = false;
      }
      ignoreMatch() {
        this.isMatchIgnored = true;
      }
    };
    function escapeHTML(value) {
      return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
    }
    function inherit$1(original, ...objects) {
      const result = /* @__PURE__ */ Object.create(null);
      for (const key in original) {
        result[key] = original[key];
      }
      objects.forEach(function(obj) {
        for (const key in obj) {
          result[key] = obj[key];
        }
      });
      return (
        /** @type {T} */
        result
      );
    }
    var SPAN_CLOSE = "</span>";
    var emitsWrappingTags = (node) => {
      return !!node.scope;
    };
    var scopeToCSSClass = (name2, { prefix }) => {
      if (name2.startsWith("language:")) {
        return name2.replace("language:", "language-");
      }
      if (name2.includes(".")) {
        const pieces = name2.split(".");
        return [
          `${prefix}${pieces.shift()}`,
          ...pieces.map((x, i) => `${x}${"_".repeat(i + 1)}`)
        ].join(" ");
      }
      return `${prefix}${name2}`;
    };
    var HTMLRenderer = class {
      /**
       * Creates a new HTMLRenderer
       *
       * @param {Tree} parseTree - the parse tree (must support `walk` API)
       * @param {{classPrefix: string}} options
       */
      constructor(parseTree, options) {
        this.buffer = "";
        this.classPrefix = options.classPrefix;
        parseTree.walk(this);
      }
      /**
       * Adds texts to the output stream
       *
       * @param {string} text */
      addText(text) {
        this.buffer += escapeHTML(text);
      }
      /**
       * Adds a node open to the output stream (if needed)
       *
       * @param {Node} node */
      openNode(node) {
        if (!emitsWrappingTags(node)) return;
        const className = scopeToCSSClass(
          node.scope,
          { prefix: this.classPrefix }
        );
        this.span(className);
      }
      /**
       * Adds a node close to the output stream (if needed)
       *
       * @param {Node} node */
      closeNode(node) {
        if (!emitsWrappingTags(node)) return;
        this.buffer += SPAN_CLOSE;
      }
      /**
       * returns the accumulated buffer
      */
      value() {
        return this.buffer;
      }
      // helpers
      /**
       * Builds a span element
       *
       * @param {string} className */
      span(className) {
        this.buffer += `<span class="${className}">`;
      }
    };
    var newNode = (opts = {}) => {
      const result = { children: [] };
      Object.assign(result, opts);
      return result;
    };
    var TokenTree = class _TokenTree {
      constructor() {
        this.rootNode = newNode();
        this.stack = [this.rootNode];
      }
      get top() {
        return this.stack[this.stack.length - 1];
      }
      get root() {
        return this.rootNode;
      }
      /** @param {Node} node */
      add(node) {
        this.top.children.push(node);
      }
      /** @param {string} scope */
      openNode(scope) {
        const node = newNode({ scope });
        this.add(node);
        this.stack.push(node);
      }
      closeNode() {
        if (this.stack.length > 1) {
          return this.stack.pop();
        }
        return void 0;
      }
      closeAllNodes() {
        while (this.closeNode()) ;
      }
      toJSON() {
        return JSON.stringify(this.rootNode, null, 4);
      }
      /**
       * @typedef { import("./html_renderer").Renderer } Renderer
       * @param {Renderer} builder
       */
      walk(builder) {
        return this.constructor._walk(builder, this.rootNode);
      }
      /**
       * @param {Renderer} builder
       * @param {Node} node
       */
      static _walk(builder, node) {
        if (typeof node === "string") {
          builder.addText(node);
        } else if (node.children) {
          builder.openNode(node);
          node.children.forEach((child) => this._walk(builder, child));
          builder.closeNode(node);
        }
        return builder;
      }
      /**
       * @param {Node} node
       */
      static _collapse(node) {
        if (typeof node === "string") return;
        if (!node.children) return;
        if (node.children.every((el) => typeof el === "string")) {
          node.children = [node.children.join("")];
        } else {
          node.children.forEach((child) => {
            _TokenTree._collapse(child);
          });
        }
      }
    };
    var TokenTreeEmitter = class extends TokenTree {
      /**
       * @param {*} options
       */
      constructor(options) {
        super();
        this.options = options;
      }
      /**
       * @param {string} text
       */
      addText(text) {
        if (text === "") {
          return;
        }
        this.add(text);
      }
      /** @param {string} scope */
      startScope(scope) {
        this.openNode(scope);
      }
      endScope() {
        this.closeNode();
      }
      /**
       * @param {Emitter & {root: DataNode}} emitter
       * @param {string} name
       */
      __addSublanguage(emitter, name2) {
        const node = emitter.root;
        if (name2) node.scope = `language:${name2}`;
        this.add(node);
      }
      toHTML() {
        const renderer = new HTMLRenderer(this, this.options);
        return renderer.value();
      }
      finalize() {
        this.closeAllNodes();
        return true;
      }
    };
    function source(re) {
      if (!re) return null;
      if (typeof re === "string") return re;
      return re.source;
    }
    function lookahead(re) {
      return concat("(?=", re, ")");
    }
    function anyNumberOfTimes(re) {
      return concat("(?:", re, ")*");
    }
    function optional(re) {
      return concat("(?:", re, ")?");
    }
    function concat(...args) {
      const joined = args.map((x) => source(x)).join("");
      return joined;
    }
    function stripOptionsFromArgs(args) {
      const opts = args[args.length - 1];
      if (typeof opts === "object" && opts.constructor === Object) {
        args.splice(args.length - 1, 1);
        return opts;
      } else {
        return {};
      }
    }
    function either(...args) {
      const opts = stripOptionsFromArgs(args);
      const joined = "(" + (opts.capture ? "" : "?:") + args.map((x) => source(x)).join("|") + ")";
      return joined;
    }
    function countMatchGroups(re) {
      return new RegExp(re.toString() + "|").exec("").length - 1;
    }
    function startsWith(re, lexeme) {
      const match = re && re.exec(lexeme);
      return match && match.index === 0;
    }
    var BACKREF_RE = new RegExp(either(
      /\[(?:[^\\\]]|\\.)*\]/,
      // a character class, inside which ( and \ lose their meaning
      /\(\?<(?![=!])[^>]+>/,
      // a named capture group `(?<name>` (not a lookbehind `(?<=` / `(?<!`)
      /\(\?'[^']+'/,
      // a named capture group `(?'name'`
      /\(\??/,
      // an opening parenthesis, capturing or non-capturing / lookahead
      /\\([1-9][0-9]*)/,
      // a backreference like `\1`
      /\\./
      // any other escape sequence
    ));
    function _rewriteBackreferences(regexps, { joinWith }) {
      let numCaptures = 0;
      return regexps.map((regex) => {
        numCaptures += 1;
        const offset = numCaptures;
        let re = source(regex);
        let out = "";
        while (re.length > 0) {
          const match = BACKREF_RE.exec(re);
          if (!match) {
            out += re;
            break;
          }
          out += re.substring(0, match.index);
          re = re.substring(match.index + match[0].length);
          if (match[0][0] === "\\" && match[1]) {
            out += "\\" + String(Number(match[1]) + offset);
          } else {
            out += match[0];
            if (match[0] === "(" || /^\(\?[<']/.test(match[0])) {
              numCaptures++;
            }
          }
        }
        return out;
      }).map((re) => `(${re})`).join(joinWith);
    }
    var MATCH_NOTHING_RE = /\b\B/;
    var IDENT_RE3 = "[a-zA-Z]\\w*";
    var UNDERSCORE_IDENT_RE = "[a-zA-Z_]\\w*";
    var NUMBER_RE = "\\b\\d+(\\.\\d+)?";
    var C_NUMBER_RE = "(-?)(\\b0[xX][a-fA-F0-9]+|(\\b\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?)";
    var BINARY_NUMBER_RE = "\\b(0b[01]+)";
    var RE_STARTERS_RE = "!|!=|!==|%|%=|&|&&|&=|\\*|\\*=|\\+|\\+=|,|-|-=|/=|/|:|;|<<|<<=|<=|<|===|==|=|>>>=|>>=|>=|>>>|>>|>|\\?|\\[|\\{|\\(|\\^|\\^=|\\||\\|=|\\|\\||~";
    var SHEBANG = (opts = {}) => {
      const beginShebang = /^#![ ]*\//;
      if (opts.binary) {
        opts.begin = concat(
          beginShebang,
          /.*\b/,
          opts.binary,
          /\b.*/
        );
      }
      return inherit$1({
        scope: "meta",
        begin: beginShebang,
        end: /$/,
        relevance: 0,
        /** @type {ModeCallback} */
        "on:begin": (m, resp) => {
          if (m.index !== 0) resp.ignoreMatch();
        }
      }, opts);
    };
    var BACKSLASH_ESCAPE = {
      begin: "\\\\[\\s\\S]",
      relevance: 0
    };
    var APOS_STRING_MODE = {
      scope: "string",
      begin: "'",
      end: "'",
      illegal: "\\n",
      contains: [BACKSLASH_ESCAPE]
    };
    var QUOTE_STRING_MODE = {
      scope: "string",
      begin: '"',
      end: '"',
      illegal: "\\n",
      contains: [BACKSLASH_ESCAPE]
    };
    var PHRASAL_WORDS_MODE = {
      begin: /\b(a|an|the|are|I'm|isn't|don't|doesn't|won't|but|just|should|pretty|simply|enough|gonna|going|wtf|so|such|will|you|your|they|like|more)\b/
    };
    var COMMENT = function(begin, end, modeOptions = {}) {
      const mode = inherit$1(
        {
          scope: "comment",
          begin,
          end,
          contains: []
        },
        modeOptions
      );
      mode.contains.push({
        scope: "doctag",
        // hack to avoid the space from being included. the space is necessary to
        // match here to prevent the plain text rule below from gobbling up doctags
        begin: "[ ]*(?=(TODO|FIXME|NOTE|BUG|OPTIMIZE|HACK|XXX):)",
        end: /(TODO|FIXME|NOTE|BUG|OPTIMIZE|HACK|XXX):/,
        excludeBegin: true,
        relevance: 0
      });
      const ENGLISH_WORD = either(
        // list of common 1 and 2 letter words in English
        "I",
        "a",
        "is",
        "so",
        "us",
        "to",
        "at",
        "if",
        "in",
        "it",
        "on",
        // note: this is not an exhaustive list of contractions, just popular ones
        /[A-Za-z]+['](d|ve|re|ll|t|s|n)/,
        // contractions - can't we'd they're let's, etc
        /[A-Za-z]+[-][a-z]+/,
        // `no-way`, etc.
        /[A-Za-z][a-z]{2,}/
        // allow capitalized words at beginning of sentences
      );
      mode.contains.push(
        {
          // TODO: how to include ", (, ) without breaking grammars that use these for
          // comment delimiters?
          // begin: /[ ]+([()"]?([A-Za-z'-]{3,}|is|a|I|so|us|[tT][oO]|at|if|in|it|on)[.]?[()":]?([.][ ]|[ ]|\))){3}/
          // ---
          // this tries to find sequences of 3 english words in a row (without any
          // "programming" type syntax) this gives us a strong signal that we've
          // TRULY found a comment - vs perhaps scanning with the wrong language.
          // It's possible to find something that LOOKS like the start of the
          // comment - but then if there is no readable text - good chance it is a
          // false match and not a comment.
          //
          // for a visual example please see:
          // https://github.com/highlightjs/highlight.js/issues/2827
          begin: concat(
            /[ ]+/,
            // necessary to prevent us gobbling up doctags like /* @author Bob Mcgill */
            "(",
            ENGLISH_WORD,
            /[.]?[:]?([.][ ]|[ ])/,
            "){3}"
          )
          // look for 3 words in a row
        }
      );
      return mode;
    };
    var C_LINE_COMMENT_MODE = COMMENT("//", "$");
    var C_BLOCK_COMMENT_MODE = COMMENT("/\\*", "\\*/");
    var HASH_COMMENT_MODE = COMMENT("#", "$");
    var NUMBER_MODE = {
      scope: "number",
      begin: NUMBER_RE,
      relevance: 0
    };
    var C_NUMBER_MODE = {
      scope: "number",
      begin: C_NUMBER_RE,
      relevance: 0
    };
    var BINARY_NUMBER_MODE = {
      scope: "number",
      begin: BINARY_NUMBER_RE,
      relevance: 0
    };
    var REGEXP_MODE = {
      scope: "regexp",
      begin: /\/(?=[^/\n]*\/)/,
      end: /\/[gimuy]*/,
      contains: [
        BACKSLASH_ESCAPE,
        {
          begin: /\[/,
          end: /\]/,
          relevance: 0,
          contains: [BACKSLASH_ESCAPE]
        }
      ]
    };
    var TITLE_MODE = {
      scope: "title",
      begin: IDENT_RE3,
      relevance: 0
    };
    var UNDERSCORE_TITLE_MODE = {
      scope: "title",
      begin: UNDERSCORE_IDENT_RE,
      relevance: 0
    };
    var METHOD_GUARD = {
      // excludes method names from keyword processing
      begin: "\\.\\s*" + UNDERSCORE_IDENT_RE,
      relevance: 0
    };
    var END_SAME_AS_BEGIN = function(mode) {
      return Object.assign(
        mode,
        {
          /** @type {ModeCallback} */
          "on:begin": (m, resp) => {
            resp.data._beginMatch = m[1];
          },
          /** @type {ModeCallback} */
          "on:end": (m, resp) => {
            if (resp.data._beginMatch !== m[1]) resp.ignoreMatch();
          }
        }
      );
    };
    var MODES2 = /* @__PURE__ */ Object.freeze({
      __proto__: null,
      APOS_STRING_MODE,
      BACKSLASH_ESCAPE,
      BINARY_NUMBER_MODE,
      BINARY_NUMBER_RE,
      COMMENT,
      C_BLOCK_COMMENT_MODE,
      C_LINE_COMMENT_MODE,
      C_NUMBER_MODE,
      C_NUMBER_RE,
      END_SAME_AS_BEGIN,
      HASH_COMMENT_MODE,
      IDENT_RE: IDENT_RE3,
      MATCH_NOTHING_RE,
      METHOD_GUARD,
      NUMBER_MODE,
      NUMBER_RE,
      PHRASAL_WORDS_MODE,
      QUOTE_STRING_MODE,
      REGEXP_MODE,
      RE_STARTERS_RE,
      SHEBANG,
      TITLE_MODE,
      UNDERSCORE_IDENT_RE,
      UNDERSCORE_TITLE_MODE
    });
    function skipIfHasPrecedingDot(match, response) {
      const before = match.input[match.index - 1];
      if (before === ".") {
        response.ignoreMatch();
      }
    }
    function scopeClassName(mode, _parent) {
      if (mode.className !== void 0) {
        mode.scope = mode.className;
        delete mode.className;
      }
    }
    function beginKeywords(mode, parent) {
      if (!parent) return;
      if (!mode.beginKeywords) return;
      mode.begin = "\\b(" + mode.beginKeywords.split(" ").join("|") + ")(?!\\.)(?=\\b|\\s)";
      mode.__beforeBegin = skipIfHasPrecedingDot;
      mode.keywords = mode.keywords || mode.beginKeywords;
      delete mode.beginKeywords;
      if (mode.relevance === void 0) mode.relevance = 0;
    }
    function compileIllegal(mode, _parent) {
      if (!Array.isArray(mode.illegal)) return;
      mode.illegal = either(...mode.illegal);
    }
    function compileMatch(mode, _parent) {
      if (!mode.match) return;
      if (mode.begin || mode.end) throw new Error("begin & end are not supported with match");
      mode.begin = mode.match;
      delete mode.match;
    }
    function compileRelevance(mode, _parent) {
      if (mode.relevance === void 0) mode.relevance = 1;
    }
    var beforeMatchExt = (mode, parent) => {
      if (!mode.beforeMatch) return;
      if (mode.starts) throw new Error("beforeMatch cannot be used with starts");
      const originalMode = Object.assign({}, mode);
      Object.keys(mode).forEach((key) => {
        delete mode[key];
      });
      mode.keywords = originalMode.keywords;
      mode.begin = concat(originalMode.beforeMatch, lookahead(originalMode.begin));
      mode.starts = {
        relevance: 0,
        contains: [
          Object.assign(originalMode, { endsParent: true })
        ]
      };
      mode.relevance = 0;
      delete originalMode.beforeMatch;
    };
    var COMMON_KEYWORDS = [
      "of",
      "and",
      "for",
      "in",
      "not",
      "or",
      "if",
      "then",
      "parent",
      // common variable name
      "list",
      // common variable name
      "value"
      // common variable name
    ];
    var DEFAULT_KEYWORD_SCOPE = "keyword";
    function compileKeywords(rawKeywords, caseInsensitive, scopeName = DEFAULT_KEYWORD_SCOPE) {
      const compiledKeywords = /* @__PURE__ */ Object.create(null);
      if (typeof rawKeywords === "string") {
        compileList(scopeName, rawKeywords.split(" "));
      } else if (Array.isArray(rawKeywords)) {
        compileList(scopeName, rawKeywords);
      } else {
        Object.keys(rawKeywords).forEach(function(scopeName2) {
          Object.assign(
            compiledKeywords,
            compileKeywords(rawKeywords[scopeName2], caseInsensitive, scopeName2)
          );
        });
      }
      return compiledKeywords;
      function compileList(scopeName2, keywordList) {
        if (caseInsensitive) {
          keywordList = keywordList.map((x) => x.toLowerCase());
        }
        keywordList.forEach(function(keyword) {
          const pair = keyword.split("|");
          compiledKeywords[pair[0]] = [scopeName2, scoreForKeyword(pair[0], pair[1])];
        });
      }
    }
    function scoreForKeyword(keyword, providedScore) {
      if (providedScore) {
        return Number(providedScore);
      }
      return commonKeyword(keyword) ? 0 : 1;
    }
    function commonKeyword(keyword) {
      return COMMON_KEYWORDS.includes(keyword.toLowerCase());
    }
    var seenDeprecations = {};
    var error = (message) => {
      console.error(message);
    };
    var warn2 = (message, ...args) => {
      console.log(`WARN: ${message}`, ...args);
    };
    var deprecated = (version2, message) => {
      if (seenDeprecations[`${version2}/${message}`]) return;
      console.log(`Deprecated as of ${version2}. ${message}`);
      seenDeprecations[`${version2}/${message}`] = true;
    };
    var MultiClassError = new Error();
    function remapScopeNames(mode, regexes, { key }) {
      let offset = 0;
      const scopeNames = mode[key];
      const emit = {};
      const positions = {};
      for (let i = 1; i <= regexes.length; i++) {
        positions[i + offset] = scopeNames[i];
        emit[i + offset] = true;
        offset += countMatchGroups(regexes[i - 1]);
      }
      mode[key] = positions;
      mode[key]._emit = emit;
      mode[key]._multi = true;
    }
    function beginMultiClass(mode) {
      if (!Array.isArray(mode.begin)) return;
      if (mode.skip || mode.excludeBegin || mode.returnBegin) {
        error("skip, excludeBegin, returnBegin not compatible with beginScope: {}");
        throw MultiClassError;
      }
      if (typeof mode.beginScope !== "object" || mode.beginScope === null) {
        error("beginScope must be object");
        throw MultiClassError;
      }
      remapScopeNames(mode, mode.begin, { key: "beginScope" });
      mode.begin = _rewriteBackreferences(mode.begin, { joinWith: "" });
    }
    function endMultiClass(mode) {
      if (!Array.isArray(mode.end)) return;
      if (mode.skip || mode.excludeEnd || mode.returnEnd) {
        error("skip, excludeEnd, returnEnd not compatible with endScope: {}");
        throw MultiClassError;
      }
      if (typeof mode.endScope !== "object" || mode.endScope === null) {
        error("endScope must be object");
        throw MultiClassError;
      }
      remapScopeNames(mode, mode.end, { key: "endScope" });
      mode.end = _rewriteBackreferences(mode.end, { joinWith: "" });
    }
    function scopeSugar(mode) {
      if (mode.scope && typeof mode.scope === "object" && mode.scope !== null) {
        mode.beginScope = mode.scope;
        delete mode.scope;
      }
    }
    function MultiClass(mode) {
      scopeSugar(mode);
      if (typeof mode.beginScope === "string") {
        mode.beginScope = { _wrap: mode.beginScope };
      }
      if (typeof mode.endScope === "string") {
        mode.endScope = { _wrap: mode.endScope };
      }
      beginMultiClass(mode);
      endMultiClass(mode);
    }
    function compileLanguage(language) {
      function langRe(value, global) {
        return new RegExp(
          source(value),
          "m" + (language.case_insensitive ? "i" : "") + (language.unicodeRegex ? "u" : "") + (global ? "g" : "")
        );
      }
      class MultiRegex {
        constructor() {
          this.matchIndexes = {};
          this.regexes = [];
          this.matchAt = 1;
          this.position = 0;
        }
        // @ts-ignore
        addRule(re, opts) {
          opts.position = this.position++;
          this.matchIndexes[this.matchAt] = opts;
          this.regexes.push([opts, re]);
          this.matchAt += countMatchGroups(re) + 1;
        }
        compile() {
          if (this.regexes.length === 0) {
            this.exec = () => null;
          }
          const terminators = this.regexes.map((el) => el[1]);
          this.matcherRe = langRe(_rewriteBackreferences(terminators, { joinWith: "|" }), true);
          this.lastIndex = 0;
        }
        /** @param {string} s */
        exec(s) {
          this.matcherRe.lastIndex = this.lastIndex;
          const match = this.matcherRe.exec(s);
          if (!match) {
            return null;
          }
          const i = match.findIndex((el, i2) => i2 > 0 && el !== void 0);
          const matchData = this.matchIndexes[i];
          match.splice(0, i);
          return Object.assign(match, matchData);
        }
      }
      class ResumableMultiRegex {
        constructor() {
          this.rules = [];
          this.multiRegexes = [];
          this.count = 0;
          this.lastIndex = 0;
          this.regexIndex = 0;
        }
        // @ts-ignore
        getMatcher(index) {
          if (this.multiRegexes[index]) return this.multiRegexes[index];
          const matcher = new MultiRegex();
          this.rules.slice(index).forEach(([re, opts]) => matcher.addRule(re, opts));
          matcher.compile();
          this.multiRegexes[index] = matcher;
          return matcher;
        }
        resumingScanAtSamePosition() {
          return this.regexIndex !== 0;
        }
        considerAll() {
          this.regexIndex = 0;
        }
        // @ts-ignore
        addRule(re, opts) {
          this.rules.push([re, opts]);
          if (opts.type === "begin") this.count++;
        }
        /** @param {string} s */
        exec(s) {
          const m = this.getMatcher(this.regexIndex);
          m.lastIndex = this.lastIndex;
          let result = m.exec(s);
          if (this.resumingScanAtSamePosition()) {
            if (result && result.index === this.lastIndex) ;
            else {
              const m2 = this.getMatcher(0);
              m2.lastIndex = this.lastIndex + 1;
              result = m2.exec(s);
            }
          }
          if (result) {
            this.regexIndex += result.position + 1;
            if (this.regexIndex === this.count) {
              this.considerAll();
            }
          }
          return result;
        }
      }
      function buildModeRegex(mode) {
        const mm = new ResumableMultiRegex();
        mode.contains.forEach((term) => mm.addRule(term.begin, { rule: term, type: "begin" }));
        if (mode.terminatorEnd) {
          mm.addRule(mode.terminatorEnd, { type: "end" });
        }
        if (mode.illegal) {
          mm.addRule(mode.illegal, { type: "illegal" });
        }
        return mm;
      }
      function compileMode(mode, parent) {
        const cmode = (
          /** @type CompiledMode */
          mode
        );
        if (mode.isCompiled) return cmode;
        [
          scopeClassName,
          // do this early so compiler extensions generally don't have to worry about
          // the distinction between match/begin
          compileMatch,
          MultiClass,
          beforeMatchExt
        ].forEach((ext) => ext(mode, parent));
        language.compilerExtensions.forEach((ext) => ext(mode, parent));
        mode.__beforeBegin = null;
        [
          beginKeywords,
          // do this later so compiler extensions that come earlier have access to the
          // raw array if they wanted to perhaps manipulate it, etc.
          compileIllegal,
          // default to 1 relevance if not specified
          compileRelevance
        ].forEach((ext) => ext(mode, parent));
        mode.isCompiled = true;
        let keywordPattern = null;
        if (typeof mode.keywords === "object" && mode.keywords.$pattern) {
          mode.keywords = Object.assign({}, mode.keywords);
          keywordPattern = mode.keywords.$pattern;
          delete mode.keywords.$pattern;
        }
        keywordPattern = keywordPattern || /\w+/;
        if (mode.keywords) {
          mode.keywords = compileKeywords(mode.keywords, language.case_insensitive);
        }
        cmode.keywordPatternRe = langRe(keywordPattern, true);
        if (parent) {
          if (!mode.begin) mode.begin = /\B|\b/;
          cmode.beginRe = langRe(cmode.begin);
          if (!mode.end && !mode.endsWithParent) mode.end = /\B|\b/;
          if (mode.end) cmode.endRe = langRe(cmode.end);
          cmode.terminatorEnd = source(cmode.end) || "";
          if (mode.endsWithParent && parent.terminatorEnd) {
            cmode.terminatorEnd += (mode.end ? "|" : "") + parent.terminatorEnd;
          }
        }
        if (mode.illegal) cmode.illegalRe = langRe(
          /** @type {RegExp | string} */
          mode.illegal
        );
        if (!mode.contains) mode.contains = [];
        mode.contains = [].concat(...mode.contains.map(function(c2) {
          return expandOrCloneMode(c2 === "self" ? mode : c2);
        }));
        mode.contains.forEach(function(c2) {
          compileMode(
            /** @type Mode */
            c2,
            cmode
          );
        });
        if (mode.starts) {
          compileMode(mode.starts, parent);
        }
        cmode.matcher = buildModeRegex(cmode);
        return cmode;
      }
      if (!language.compilerExtensions) language.compilerExtensions = [];
      if (language.contains && language.contains.includes("self")) {
        throw new Error("ERR: contains `self` is not supported at the top-level of a language.  See documentation.");
      }
      language.classNameAliases = inherit$1(language.classNameAliases || {});
      return compileMode(
        /** @type Mode */
        language
      );
    }
    function dependencyOnParent(mode) {
      if (!mode) return false;
      return mode.endsWithParent || dependencyOnParent(mode.starts);
    }
    function expandOrCloneMode(mode) {
      if (mode.variants && !mode.cachedVariants) {
        mode.cachedVariants = mode.variants.map(function(variant) {
          return inherit$1(mode, { variants: null }, variant);
        });
      }
      if (mode.cachedVariants) {
        return mode.cachedVariants;
      }
      if (dependencyOnParent(mode)) {
        return inherit$1(mode, { starts: mode.starts ? inherit$1(mode.starts) : null });
      }
      if (Object.isFrozen(mode)) {
        return inherit$1(mode);
      }
      return mode;
    }
    var version = "11.12.0";
    var HTMLInjectionError = class extends Error {
      constructor(reason, html) {
        super(reason);
        this.name = "HTMLInjectionError";
        this.html = html;
      }
    };
    var escape = escapeHTML;
    var inherit = inherit$1;
    var NO_MATCH = /* @__PURE__ */ Symbol("nomatch");
    var MAX_KEYWORD_HITS = 7;
    var HLJS = function(hljs) {
      const languages = /* @__PURE__ */ Object.create(null);
      const aliases = /* @__PURE__ */ Object.create(null);
      const plugins = [];
      let SAFE_MODE = true;
      const LANGUAGE_NOT_FOUND = "Could not find the language '{}', did you forget to load/include a language module?";
      const PLAINTEXT_LANGUAGE = { disableAutodetect: true, name: "Plain text", contains: [] };
      let options = {
        ignoreUnescapedHTML: false,
        throwUnescapedHTML: false,
        noHighlightRe: /^(no-?highlight)$/i,
        languageDetectRe: /\blang(?:uage)?-([\w-]+)\b/i,
        classPrefix: "hljs-",
        cssSelector: "pre code",
        languages: null,
        // beta configuration options, subject to change, welcome to discuss
        // https://github.com/highlightjs/highlight.js/issues/1086
        __emitter: TokenTreeEmitter
      };
      function shouldNotHighlight(languageName) {
        return options.noHighlightRe.test(languageName);
      }
      function blockLanguage(block) {
        let classes = block.className + " ";
        classes += block.parentNode ? block.parentNode.className : "";
        const match = options.languageDetectRe.exec(classes);
        if (match) {
          const language = getLanguage(match[1]);
          if (!language) {
            warn2(LANGUAGE_NOT_FOUND.replace("{}", match[1]));
            warn2("Falling back to no-highlight mode for this block.", block);
          }
          return language ? match[1] : "no-highlight";
        }
        return classes.split(/\s+/).find((_class) => shouldNotHighlight(_class) || getLanguage(_class));
      }
      function highlight2(codeOrLanguageName, optionsOrCode, ignoreIllegals) {
        let code = "";
        let languageName = "";
        if (typeof optionsOrCode === "object") {
          code = codeOrLanguageName;
          ignoreIllegals = optionsOrCode.ignoreIllegals;
          languageName = optionsOrCode.language;
        } else {
          deprecated("10.7.0", "highlight(lang, code, ...args) has been deprecated.");
          deprecated("10.7.0", "Please use highlight(code, options) instead.\nhttps://github.com/highlightjs/highlight.js/issues/2277");
          languageName = codeOrLanguageName;
          code = optionsOrCode;
        }
        if (ignoreIllegals === void 0) {
          ignoreIllegals = true;
        }
        const context = {
          code,
          language: languageName
        };
        fire("before:highlight", context);
        const result = context.result ? context.result : _highlight(context.language, context.code, ignoreIllegals);
        result.code = context.code;
        fire("after:highlight", result);
        return result;
      }
      function _highlight(languageName, codeToHighlight, ignoreIllegals, continuation) {
        const keywordHits = /* @__PURE__ */ Object.create(null);
        function keywordData(mode, matchText) {
          return mode.keywords[matchText];
        }
        function processKeywords() {
          if (!top.keywords) {
            emitter.addText(modeBuffer);
            return;
          }
          let lastIndex = 0;
          top.keywordPatternRe.lastIndex = 0;
          let match = top.keywordPatternRe.exec(modeBuffer);
          let buf = "";
          while (match) {
            buf += modeBuffer.substring(lastIndex, match.index);
            const word = language.case_insensitive ? match[0].toLowerCase() : match[0];
            const data = keywordData(top, word);
            if (data) {
              const [kind, keywordRelevance] = data;
              emitter.addText(buf);
              buf = "";
              keywordHits[word] = (keywordHits[word] || 0) + 1;
              if (keywordHits[word] <= MAX_KEYWORD_HITS) relevance += keywordRelevance;
              if (kind.startsWith("_")) {
                buf += match[0];
              } else {
                const cssClass = language.classNameAliases[kind] || kind;
                emitKeyword(match[0], cssClass);
              }
            } else {
              buf += match[0];
            }
            lastIndex = top.keywordPatternRe.lastIndex;
            match = top.keywordPatternRe.exec(modeBuffer);
          }
          buf += modeBuffer.substring(lastIndex);
          emitter.addText(buf);
        }
        function processSubLanguage() {
          if (modeBuffer === "") return;
          let result2 = null;
          if (typeof top.subLanguage === "string") {
            if (!languages[top.subLanguage]) {
              emitter.addText(modeBuffer);
              return;
            }
            result2 = _highlight(top.subLanguage, modeBuffer, true, continuations[top.subLanguage]);
            continuations[top.subLanguage] = /** @type {CompiledMode} */
            result2._top;
          } else {
            result2 = highlightAuto(modeBuffer, top.subLanguage.length ? top.subLanguage : null);
          }
          if (top.relevance > 0) {
            relevance += result2.relevance;
          }
          emitter.__addSublanguage(result2._emitter, result2.language);
        }
        function processBuffer() {
          if (top.subLanguage != null) {
            processSubLanguage();
          } else {
            processKeywords();
          }
          modeBuffer = "";
        }
        function emitKeyword(keyword, scope) {
          if (keyword === "") return;
          emitter.startScope(scope);
          emitter.addText(keyword);
          emitter.endScope();
        }
        function emitMultiClass(scope, match) {
          let i = 1;
          const max = match.length - 1;
          while (i <= max) {
            if (!scope._emit[i]) {
              i++;
              continue;
            }
            const klass = language.classNameAliases[scope[i]] || scope[i];
            const text = match[i];
            if (klass) {
              emitKeyword(text, klass);
            } else {
              modeBuffer = text;
              processKeywords();
              modeBuffer = "";
            }
            i++;
          }
        }
        function startNewMode(mode, match) {
          if (mode.scope && typeof mode.scope === "string") {
            emitter.openNode(language.classNameAliases[mode.scope] || mode.scope);
          }
          if (mode.beginScope) {
            if (mode.beginScope._wrap) {
              emitKeyword(modeBuffer, language.classNameAliases[mode.beginScope._wrap] || mode.beginScope._wrap);
              modeBuffer = "";
            } else if (mode.beginScope._multi) {
              emitMultiClass(mode.beginScope, match);
              modeBuffer = "";
            }
          }
          top = Object.create(mode, { parent: { value: top } });
          return top;
        }
        function endOfMode(mode, match, matchPlusRemainder) {
          let matched = startsWith(mode.endRe, matchPlusRemainder);
          if (matched) {
            if (mode["on:end"]) {
              const resp = new Response(mode);
              mode["on:end"](match, resp);
              if (resp.isMatchIgnored) matched = false;
            }
            if (matched) {
              while (mode.endsParent && mode.parent) {
                mode = mode.parent;
              }
              return mode;
            }
          }
          if (mode.endsWithParent) {
            return endOfMode(mode.parent, match, matchPlusRemainder);
          }
        }
        function doIgnore(lexeme) {
          if (top.matcher.regexIndex === 0) {
            modeBuffer += lexeme[0];
            return 1;
          } else {
            resumeScanAtSamePosition = true;
            return 0;
          }
        }
        function doBeginMatch(match) {
          const lexeme = match[0];
          const newMode = match.rule;
          const resp = new Response(newMode);
          const beforeCallbacks = [newMode.__beforeBegin, newMode["on:begin"]];
          for (const cb of beforeCallbacks) {
            if (!cb) continue;
            cb(match, resp);
            if (resp.isMatchIgnored) return doIgnore(lexeme);
          }
          if (newMode.skip) {
            modeBuffer += lexeme;
          } else {
            if (newMode.excludeBegin) {
              modeBuffer += lexeme;
            }
            processBuffer();
            if (!newMode.returnBegin && !newMode.excludeBegin) {
              modeBuffer = lexeme;
            }
          }
          startNewMode(newMode, match);
          return newMode.returnBegin ? 0 : lexeme.length;
        }
        function doEndMatch(match) {
          const lexeme = match[0];
          const matchPlusRemainder = codeToHighlight.substring(match.index);
          const endMode = endOfMode(top, match, matchPlusRemainder);
          if (!endMode) {
            return NO_MATCH;
          }
          const origin = top;
          if (top.endScope && top.endScope._wrap) {
            processBuffer();
            emitKeyword(lexeme, top.endScope._wrap);
          } else if (top.endScope && top.endScope._multi) {
            processBuffer();
            emitMultiClass(top.endScope, match);
          } else if (origin.skip) {
            modeBuffer += lexeme;
          } else {
            if (!(origin.returnEnd || origin.excludeEnd)) {
              modeBuffer += lexeme;
            }
            processBuffer();
            if (origin.excludeEnd) {
              modeBuffer = lexeme;
            }
          }
          do {
            if (top.scope) {
              emitter.closeNode();
            }
            if (!top.skip && !top.subLanguage) {
              relevance += top.relevance;
            }
            top = top.parent;
          } while (top !== endMode.parent);
          if (endMode.starts) {
            startNewMode(endMode.starts, match);
          }
          return origin.returnEnd ? 0 : lexeme.length;
        }
        function processContinuations() {
          const list = [];
          for (let current = top; current !== language; current = current.parent) {
            if (current.scope) {
              list.unshift(current.scope);
            }
          }
          list.forEach((item) => emitter.openNode(item));
        }
        let lastMatch = {};
        function processLexeme(textBeforeMatch, match) {
          const lexeme = match && match[0];
          modeBuffer += textBeforeMatch;
          if (lexeme == null) {
            processBuffer();
            return 0;
          }
          if (lastMatch.type === "begin" && match.type === "end" && lastMatch.index === match.index && lexeme === "") {
            modeBuffer += codeToHighlight.slice(match.index, match.index + 1);
            if (!SAFE_MODE) {
              const err = new Error(`0 width match regex (${languageName})`);
              err.languageName = languageName;
              err.badRule = lastMatch.rule;
              throw err;
            }
            return 1;
          }
          lastMatch = match;
          if (match.type === "begin") {
            return doBeginMatch(match);
          } else if (match.type === "illegal" && !ignoreIllegals) {
            const err = new Error('Illegal lexeme "' + lexeme + '" for mode "' + (top.scope || "<unnamed>") + '"');
            err.mode = top;
            throw err;
          } else if (match.type === "end") {
            const processed = doEndMatch(match);
            if (processed !== NO_MATCH) {
              return processed;
            }
          }
          if (match.type === "illegal" && lexeme === "") {
            if (match.index === codeToHighlight.length) ;
            else {
              modeBuffer += "\n";
            }
            return 1;
          }
          if (iterations > 1e5 && iterations > match.index * 3) {
            const err = new Error("potential infinite loop, way more iterations than matches");
            throw err;
          }
          modeBuffer += lexeme;
          return lexeme.length;
        }
        const language = getLanguage(languageName);
        if (!language) {
          error(LANGUAGE_NOT_FOUND.replace("{}", languageName));
          throw new Error('Unknown language: "' + languageName + '"');
        }
        const md = compileLanguage(language);
        let result = "";
        let top = continuation || md;
        const continuations = {};
        const emitter = new options.__emitter(options);
        processContinuations();
        let modeBuffer = "";
        let relevance = 0;
        let index = 0;
        let iterations = 0;
        let resumeScanAtSamePosition = false;
        try {
          if (!language.__emitTokens) {
            top.matcher.considerAll();
            for (; ; ) {
              iterations++;
              if (resumeScanAtSamePosition) {
                resumeScanAtSamePosition = false;
              } else {
                top.matcher.considerAll();
              }
              top.matcher.lastIndex = index;
              const match = top.matcher.exec(codeToHighlight);
              if (!match) break;
              const beforeMatch = codeToHighlight.substring(index, match.index);
              const processedCount = processLexeme(beforeMatch, match);
              index = match.index + processedCount;
            }
            processLexeme(codeToHighlight.substring(index));
          } else {
            language.__emitTokens(codeToHighlight, emitter);
          }
          emitter.finalize();
          result = emitter.toHTML();
          return {
            language: languageName,
            value: result,
            relevance,
            illegal: false,
            _emitter: emitter,
            _top: top
          };
        } catch (err) {
          if (err.message && err.message.includes("Illegal")) {
            return {
              language: languageName,
              value: escape(codeToHighlight),
              illegal: true,
              relevance: 0,
              _illegalBy: {
                message: err.message,
                index,
                context: codeToHighlight.slice(index - 100, index + 100),
                mode: err.mode,
                resultSoFar: result
              },
              _emitter: emitter
            };
          } else if (SAFE_MODE) {
            return {
              language: languageName,
              value: escape(codeToHighlight),
              illegal: false,
              relevance: 0,
              errorRaised: err,
              _emitter: emitter,
              _top: top
            };
          } else {
            throw err;
          }
        }
      }
      function justTextHighlightResult(code) {
        const result = {
          value: escape(code),
          illegal: false,
          relevance: 0,
          _top: PLAINTEXT_LANGUAGE,
          _emitter: new options.__emitter(options)
        };
        result._emitter.addText(code);
        return result;
      }
      function highlightAuto(code, languageSubset) {
        languageSubset = languageSubset || options.languages || Object.keys(languages);
        const plaintext = justTextHighlightResult(code);
        const results = languageSubset.filter(getLanguage).filter(autoDetection).map(
          (name2) => _highlight(name2, code, false)
        );
        results.unshift(plaintext);
        const sorted = results.sort((a, b) => {
          if (a.relevance !== b.relevance) return b.relevance - a.relevance;
          if (a.language && b.language) {
            if (getLanguage(a.language).supersetOf === b.language) {
              return 1;
            } else if (getLanguage(b.language).supersetOf === a.language) {
              return -1;
            }
          }
          return 0;
        });
        const [best, secondBest] = sorted;
        const result = best;
        result.secondBest = secondBest;
        return result;
      }
      function updateClassName(element, currentLang, resultLang) {
        const language = currentLang && aliases[currentLang] || resultLang;
        element.classList.add("hljs");
        element.classList.add(`language-${language}`);
      }
      function highlightElement(element) {
        let node = null;
        const language = blockLanguage(element);
        if (shouldNotHighlight(language)) return;
        fire(
          "before:highlightElement",
          { el: element, language }
        );
        if (element.dataset.highlighted) {
          console.log("Element previously highlighted. To highlight again, first unset `dataset.highlighted`.", element);
          return;
        }
        if (element.children.length > 0) {
          if (!options.ignoreUnescapedHTML) {
            console.warn("One of your code blocks includes unescaped HTML. This is a potentially serious security risk.");
            console.warn("https://github.com/highlightjs/highlight.js/wiki/security");
            console.warn("The element with unescaped HTML:");
            console.warn(element);
          }
          if (options.throwUnescapedHTML) {
            const err = new HTMLInjectionError(
              "One of your code blocks includes unescaped HTML.",
              element.innerHTML
            );
            throw err;
          }
        }
        node = element;
        const text = node.textContent;
        const result = language ? highlight2(text, { language, ignoreIllegals: true }) : highlightAuto(text);
        element.innerHTML = result.value;
        element.dataset.highlighted = "yes";
        updateClassName(element, language, result.language);
        element.result = {
          language: result.language,
          // TODO: remove with version 11.0
          re: result.relevance,
          relevance: result.relevance
        };
        if (result.secondBest) {
          element.secondBest = {
            language: result.secondBest.language,
            relevance: result.secondBest.relevance
          };
        }
        fire("after:highlightElement", { el: element, result, text });
      }
      function configure(userOptions) {
        options = inherit(options, userOptions);
      }
      const initHighlighting = () => {
        highlightAll();
        deprecated("10.6.0", "initHighlighting() deprecated.  Use highlightAll() now.");
      };
      function initHighlightingOnLoad() {
        highlightAll();
        deprecated("10.6.0", "initHighlightingOnLoad() deprecated.  Use highlightAll() now.");
      }
      let wantsHighlight = false;
      function highlightAll() {
        function boot() {
          highlightAll();
        }
        if (document.readyState === "loading") {
          if (!wantsHighlight) {
            window.addEventListener("DOMContentLoaded", boot, false);
          }
          wantsHighlight = true;
          return;
        }
        const blocks = document.querySelectorAll(options.cssSelector);
        blocks.forEach(highlightElement);
      }
      function registerLanguage(languageName, languageDefinition) {
        let lang = null;
        try {
          lang = languageDefinition(hljs);
        } catch (error$1) {
          error("Language definition for '{}' could not be registered.".replace("{}", languageName));
          if (!SAFE_MODE) {
            throw error$1;
          } else {
            error(error$1);
          }
          lang = PLAINTEXT_LANGUAGE;
        }
        if (!lang.name) lang.name = languageName;
        languages[languageName] = lang;
        lang.rawDefinition = languageDefinition.bind(null, hljs);
        if (lang.aliases) {
          registerAliases(lang.aliases, { languageName });
        }
      }
      function unregisterLanguage(languageName) {
        delete languages[languageName];
        for (const alias of Object.keys(aliases)) {
          if (aliases[alias] === languageName) {
            delete aliases[alias];
          }
        }
      }
      function listLanguages() {
        return Object.keys(languages);
      }
      function getLanguage(name2) {
        name2 = (name2 || "").toLowerCase();
        return languages[name2] || languages[aliases[name2]];
      }
      function registerAliases(aliasList, { languageName }) {
        if (typeof aliasList === "string") {
          aliasList = [aliasList];
        }
        aliasList.forEach((alias) => {
          aliases[alias.toLowerCase()] = languageName;
        });
      }
      function autoDetection(name2) {
        const lang = getLanguage(name2);
        return lang && !lang.disableAutodetect;
      }
      function upgradePluginAPI(plugin) {
        if (plugin["before:highlightBlock"] && !plugin["before:highlightElement"]) {
          plugin["before:highlightElement"] = (data) => {
            plugin["before:highlightBlock"](
              Object.assign({ block: data.el }, data)
            );
          };
        }
        if (plugin["after:highlightBlock"] && !plugin["after:highlightElement"]) {
          plugin["after:highlightElement"] = (data) => {
            plugin["after:highlightBlock"](
              Object.assign({ block: data.el }, data)
            );
          };
        }
      }
      function addPlugin(plugin) {
        upgradePluginAPI(plugin);
        plugins.push(plugin);
      }
      function removePlugin(plugin) {
        const index = plugins.indexOf(plugin);
        if (index !== -1) {
          plugins.splice(index, 1);
        }
      }
      function fire(event, args) {
        const cb = event;
        plugins.forEach(function(plugin) {
          if (plugin[cb]) {
            plugin[cb](args);
          }
        });
      }
      function deprecateHighlightBlock(el) {
        deprecated("10.7.0", "highlightBlock will be removed entirely in v12.0");
        deprecated("10.7.0", "Please use highlightElement now.");
        return highlightElement(el);
      }
      Object.assign(hljs, {
        highlight: highlight2,
        highlightAuto,
        highlightAll,
        highlightElement,
        // TODO: Remove with v12 API
        highlightBlock: deprecateHighlightBlock,
        configure,
        initHighlighting,
        initHighlightingOnLoad,
        registerLanguage,
        unregisterLanguage,
        listLanguages,
        getLanguage,
        registerAliases,
        autoDetection,
        inherit,
        addPlugin,
        removePlugin
      });
      hljs.debugMode = function() {
        SAFE_MODE = false;
      };
      hljs.safeMode = function() {
        SAFE_MODE = true;
      };
      hljs.versionString = version;
      hljs.regex = {
        concat,
        lookahead,
        either,
        optional,
        anyNumberOfTimes
      };
      for (const key in MODES2) {
        if (typeof MODES2[key] === "object") {
          deepFreeze(MODES2[key]);
        }
      }
      Object.assign(hljs, MODES2);
      return hljs;
    };
    var highlight = HLJS({});
    highlight.newInstance = () => HLJS({});
    module2.exports = highlight;
    highlight.HighlightJS = highlight;
    highlight.default = highlight;
  }
});

// plugins/tool-render/src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  bashGraphCacheKey: () => bashGraphCacheKey,
  ensureBashGraphMeasure: () => ensureBashGraphMeasure,
  getBashGraphPanels: () => getBashGraphPanels,
  inject: () => inject,
  name: () => name,
  stripBashGraphRoot: () => stripBashGraphRoot,
  toggleBashGraphBlock: () => toggleBashGraphBlock
});
module.exports = __toCommonJS(client_exports);

// node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/core.js
var import_core = __toESM(require_core(), 1);
var core_default = import_core.default;

// plugins/tool-render/src/text.ts
function deIndent(text) {
  if (typeof text !== "string" || text === "") return text;
  var expanded = text.replace(/\t/g, "    ");
  var lines = expanded.split("\n");
  var min = -1;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    var count = 0;
    while (count < lines[i].length && lines[i].charAt(count) === " ") count++;
    if (min === -1 || count < min) min = count;
  }
  if (min <= 0) return expanded;
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    out.push(lines[i].trim() === "" ? "" : lines[i].slice(min));
  }
  return out.join("\n");
}
var HASH_ROW_RE = /^([A-Za-z0-9]{3})│/;
function isBuiltinReadEnvelope(lines) {
  return lines.length > 0 && /^<path>/.test(lines[0]) && lines.indexOf("<content>") !== -1;
}
function readStartLine(args, output) {
  if (args !== null && typeof args === "object" && typeof args.offset === "number" && Number.isInteger(args.offset) && args.offset >= 1) {
    return args.offset;
  }
  var lines = String(output).split("\n");
  if (lines.length > 0 && HASH_ROW_RE.test(lines[0])) {
    var m = /\[Showing lines (\d+)-(\d+) of \d+/.exec(String(output));
    if (m !== null) return parseInt(m[1], 10);
  }
  var b = /\(Showing lines (\d+)-\d+/.exec(String(output));
  if (b !== null) return parseInt(b[1], 10);
  return 1;
}
function numberedReadRows(output, startLine) {
  var lines = String(output).split("\n");
  var hashline = lines.length > 0 && HASH_ROW_RE.test(lines[0]);
  var builtin = !hashline && isBuiltinReadEnvelope(lines);
  var rows = [];
  var next = startLine;
  for (var i = 0; i < lines.length; i++) {
    if (hashline && HASH_ROW_RE.test(lines[i])) {
      rows.push({ number: next, text: lines[i].slice(4) });
      next++;
    } else if (hashline) {
      rows.push({ number: null, text: lines[i] });
    } else if (builtin) {
      if (i === 0 || /^<type>/.test(lines[i]) || lines[i] === "<content>" || lines[i] === "</content>") {
        continue;
      }
      var bm = /^(\d+): ?/.exec(lines[i]);
      if (bm !== null) {
        rows.push({ number: parseInt(bm[1], 10), text: lines[i].slice(bm[0].length) });
      } else {
        rows.push({ number: null, text: lines[i] });
      }
    } else {
      rows.push({ number: next, text: lines[i] });
      next++;
    }
  }
  var content = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].number !== null) content.push(rows[i].text);
  }
  var leveled = deIndent(content.join("\n")).split("\n");
  var at = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].number !== null) rows[i].text = leveled[at++];
  }
  return rows;
}
function cleanReadTextForDiff(text) {
  var lines = String(text).split("\n");
  var builtin = isBuiltinReadEnvelope(lines);
  if (builtin) {
    var bkept = [];
    var inContent = false;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i] === "<content>") {
        inContent = true;
        continue;
      }
      if (!inContent || lines[i] === "</content>") continue;
      var bm = /^(\d+): ?/.exec(lines[i]);
      if (bm !== null) bkept.push(lines[i].slice(bm[0].length));
    }
    return { content: bkept.join("\n"), start: readStartLine(null, text) };
  }
  if (lines.length === 0 || !HASH_ROW_RE.test(lines[0])) {
    return { content: text, start: readStartLine(null, text) };
  }
  var kept = [];
  for (var i = 0; i < lines.length; i++) {
    if (HASH_ROW_RE.test(lines[i])) kept.push(lines[i].slice(4));
  }
  return { content: kept.join("\n"), start: readStartLine(null, text) };
}
var SKILL_CONTENT_RE = /^<skill_content name="([^"]*)">\n<skill_resources>\n([\s\S]*?)\n<\/skill_resources>\n\n<skill_instructions>\n([\s\S]*?)\n<\/skill_instructions>\n<\/skill_content>$/;
function unescapeAttr(value) {
  return value.replaceAll("&lt;", "<").replaceAll("&quot;", '"').replaceAll("&amp;", "&");
}
function parseSkillContent(text) {
  if (typeof text !== "string") return null;
  var m = SKILL_CONTENT_RE.exec(text.trim());
  if (m === null) return null;
  return { name: unescapeAttr(m[1]), resourceHint: m[2], instructions: m[3] };
}
var SYSTEM_REMINDER_RE = /<system-reminder>\n([\s\S]*?)\n<\/system-reminder>/g;
function splitSystemReminders(text) {
  if (typeof text !== "string" || text === "") return [];
  var segments = [];
  var lastEnd = 0;
  var re = new RegExp(SYSTEM_REMINDER_RE.source, "g");
  var m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastEnd) segments.push({ reminder: false, text: text.slice(lastEnd, m.index) });
    segments.push({ reminder: true, text: m[1] });
    lastEnd = m.index + m[0].length;
  }
  if (lastEnd < text.length) segments.push({ reminder: false, text: text.slice(lastEnd) });
  return segments;
}
function looksLikeRawHtml(text) {
  if (typeof text !== "string") return false;
  var head = text.replace(/^\s+/, "").slice(0, 200);
  if (head.charAt(0) !== "<") return false;
  return /^<[a-z][a-z0-9-]*(\s|>|\/>)/i.test(head);
}
function stripOuterFence(text) {
  if (typeof text !== "string" || text === "") return text;
  var trimmed = text.trim();
  var match = /^(`{3,})[^\n]*\n([\s\S]*?)\n?\1$/.exec(trimmed);
  return match === null ? text : match[2];
}
function compactionCommandError(data) {
  if (data === null || data === void 0 || typeof data !== "object") return null;
  var command = data.command;
  if (command === null || command === void 0 || typeof command !== "object") return null;
  var outcome = command.outcome;
  if (outcome === null || outcome === void 0 || typeof outcome !== "object") return null;
  if (outcome.kind !== "error") return null;
  return typeof outcome.text === "string" && outcome.text !== "" ? outcome.text : "compaction failed";
}
function compactionSummaryNode(data) {
  if (data === null || data === void 0 || typeof data !== "object") return null;
  if (data.kind === "compaction") return data;
  var wrapped = data.compaction;
  if (wrapped !== null && wrapped !== void 0 && typeof wrapped === "object") {
    if (wrapped.kind === "compaction") return wrapped;
  }
  return null;
}
var AGENT_LINE_RE = /^(\S+)\s+\[([^\]]+)\](?:\s+parent=(\S+)\s+depth=(-?\d+))?(?:\s+—\s+([\s\S]*))?$/;
function parseAgentLines(text) {
  if (typeof text !== "string" || text === "") return [];
  var out = [];
  var lines = text.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line === "" || line === "(no subagents)") continue;
    var m = AGENT_LINE_RE.exec(line);
    if (m === null) continue;
    var mark = m[2];
    var diagnostic = mark.indexOf("diagnostic:") === 0;
    out.push({
      id: m[1],
      status: diagnostic ? null : mark,
      reason: diagnostic ? mark.slice("diagnostic:".length).trim() : null,
      parent: m[3] !== void 0 ? m[3] : null,
      depth: m[4] !== void 0 ? Number(m[4]) : null,
      label: m[5] !== void 0 ? m[5] : ""
    });
  }
  return out;
}
function extractHunk(readText, removeFrom, removeTo, replacementText, startLine) {
  if (typeof readText !== "string" || readText === "") return null;
  var rows = [];
  var lines = readText.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var m = HASH_ROW_RE.exec(lines[i]);
    if (m !== null) rows.push({ hash: m[1], content: lines[i].slice(4) });
  }
  if (rows.length === 0) return null;
  var from = -1;
  for (var k = 0; k < rows.length; k++) {
    if (rows[k].hash === removeFrom) {
      from = k;
      break;
    }
  }
  if (from === -1) return null;
  var to = from;
  if (typeof removeTo === "string" && removeTo !== "") {
    to = -1;
    for (var j = from; j < rows.length; j++) {
      if (rows[j].hash === removeTo) {
        to = j;
        break;
      }
    }
    if (to === -1) return null;
  }
  var before = [];
  for (var n = from; n <= to; n++) before.push(rows[n].content);
  var base = typeof startLine === "number" && startLine >= 1 ? startLine : readStartLine(null, readText);
  return {
    before: before.join("\n"),
    after: typeof replacementText === "string" ? replacementText : "",
    oldStart: base + from
  };
}
function firstTokenOf(cmdStr) {
  if (typeof cmdStr !== "string" || cmdStr === "") return "";
  var trimmed = cmdStr.trim();
  var match = /^[^\s]+/.exec(trimmed);
  return match ? match[0] : "";
}
function guardRewriteLabel(originalCmd, rewrittenCmd) {
  var origToken = firstTokenOf(originalCmd);
  var rewriteToken = firstTokenOf(rewrittenCmd);
  if (origToken === "" || rewriteToken === "") return "ran instead";
  if (origToken === rewriteToken) return "rewrote arguments to";
  return "translated to " + rewriteToken;
}
var GUARD_REWRITE_MARKER = "bash-guard: ran this instead:";
function guardRewriteFromText(text) {
  if (typeof text !== "string") return null;
  var at = text.lastIndexOf(GUARD_REWRITE_MARKER);
  if (at === -1) return null;
  var lines = text.slice(at + GUARD_REWRITE_MARKER.length).split("\n");
  var ran = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line === "") continue;
    if (line.slice(0, 2) === "  ") {
      ran.push(line.slice(2));
      continue;
    }
    break;
  }
  if (ran.length === 0) return null;
  var command = ran.join("\n").trim();
  if (command.length === 0) return null;
  return { ran: command };
}
var ERROR_TOKEN_RE = /\[(?:E_|exit code:|sandbox:)/;
var TRAILING_MARKER_LINE_RE = /^\[(?:E_|exit code:|exit codes:|sandbox:|timed out|killed by signal:)/;
function trailingMarkerLines(text) {
  var lines = text.split("\n");
  var out = [];
  for (var i = lines.length - 1; i >= 0; i--) {
    if (!TRAILING_MARKER_LINE_RE.test(lines[i])) break;
    out.unshift(lines[i]);
  }
  return out;
}
function firstLineOfError(text) {
  if (typeof text !== "string" || text === "") return text;
  var markers = trailingMarkerLines(text);
  for (var i = 0; i < markers.length; i++) {
    if (ERROR_TOKEN_RE.test(markers[i])) return markers[i];
  }
  var at = text.indexOf("\n");
  return at === -1 ? text : text.slice(0, at);
}
var BASH_ERROR_MARKERS = /\[sandbox: file access denied under|\[exit code: [1-9]/;
function bashErrorState(state, output, meta) {
  if (state === "running") return state;
  if (meta !== null && typeof meta === "object" && !Array.isArray(meta)) {
    if (meta.denied === true) return "error";
    if (typeof meta.exitCode === "number" && meta.exitCode !== 0) return "error";
    if (typeof meta.exitCode === "number" || typeof meta.denied === "boolean") {
      return state;
    }
  }
  if (typeof output !== "string" || output === "") return state;
  var lines = output.split("\n");
  for (var i = lines.length - 1; i >= 0; i--) {
    if (!TRAILING_MARKER_LINE_RE.test(lines[i])) break;
    if (BASH_ERROR_MARKERS.test(lines[i])) return "error";
  }
  return state;
}

// plugins/tool-render/src/questions.ts
var ASK_TOOL_NAME = "ask_user_question";
function isSettled(block) {
  return block !== null && typeof block === "object" && "kind" in block;
}
function blockName(block) {
  if (isSettled(block)) {
    return block.call && typeof block.call.name === "string" ? block.call.name : "";
  }
  return block !== null && typeof block === "object" && typeof block.name === "string" ? block.name : "";
}
function blockCallId(block) {
  return block !== null && typeof block === "object" && typeof block.callId === "string" ? block.callId : null;
}
function rootBlocksOf(snapshot) {
  const nodes = snapshot && snapshot.chat && snapshot.chat.nodes;
  if (nodes === void 0 || nodes === null || typeof nodes.values !== "function") return [];
  const iter = nodes.values();
  if (iter === null || iter === void 0) return [];
  const entries = typeof iter.next === "function" ? (() => {
    const out2 = [];
    for (let entry = iter.next(); entry.done !== true; entry = iter.next()) out2.push(entry.value);
    return out2;
  })() : Array.isArray(iter) ? iter : [];
  const out = [];
  for (const node of entries) {
    if (node === void 0 || node === null || node.kind !== "tool-call") continue;
    const block = node.data !== void 0 && node.data !== null ? node.data.root : void 0;
    if (block === void 0 || block === null) continue;
    out.push(block);
  }
  return out;
}
function walkCalls(block, visit3) {
  visit3(block);
  const sub = block !== null && typeof block === "object" && Array.isArray(block.subCalls) ? block.subCalls : [];
  for (const child of sub) walkCalls(child, visit3);
}
function pendingQuestionsOf(snapshot) {
  const pending = snapshot !== null && snapshot !== void 0 && Array.isArray(snapshot.pending) ? snapshot.pending : [];
  const out = [];
  for (const item of pending) {
    if (item === null || item === void 0 || item.kind !== "question") continue;
    out.push(item);
  }
  return out;
}
function runningAskCallIdsOf(snapshot) {
  const out = [];
  for (const root of rootBlocksOf(snapshot)) {
    walkCalls(root, (block) => {
      if (isSettled(block)) return;
      if (blockName(block) !== ASK_TOOL_NAME) return;
      const callId = blockCallId(block);
      if (callId !== null) out.push(callId);
    });
  }
  return out;
}
function pendingQuestionForCall(snapshot, callId) {
  const running = runningAskCallIdsOf(snapshot);
  const index = running.indexOf(callId);
  if (index === -1) return null;
  const pendings = pendingQuestionsOf(snapshot);
  return index < pendings.length ? pendings[index] : null;
}
function questionsOfPending(pending) {
  const payload = pending !== null && pending !== void 0 ? pending.payload : void 0;
  const questions = payload !== null && payload !== void 0 ? payload.questions : void 0;
  return Array.isArray(questions) ? questions : null;
}
function blankDrafts(count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push({ selected: [], custom: "", skipped: false });
  return out;
}
function isMulti(question) {
  return question !== null && typeof question === "object" && question.multiSelect === true;
}
function chooseInDraft(question, draft, label) {
  if (isMulti(question)) {
    const selected = draft.selected.includes(label) ? draft.selected.filter((item) => item !== label) : [...draft.selected, label];
    return { ...draft, selected, skipped: false };
  }
  return { selected: [label], custom: "", skipped: false };
}
function typeCustomInDraft(question, draft, value) {
  return {
    ...draft,
    selected: isMulti(question) ? draft.selected : [],
    custom: value,
    skipped: false
  };
}
function skipDraft() {
  return { selected: [], custom: "", skipped: true };
}
function draftAnswered(draft) {
  return draft.selected.length > 0 || draft.custom.trim() !== "";
}
function draftCompleted(draft) {
  return draftAnswered(draft) || draft.skipped;
}
function buildAnswerBatch(questions, drafts) {
  for (let i = 0; i < drafts.length; i++) {
    if (!draftCompleted(drafts[i])) return { ok: false, missingIndex: i };
  }
  return {
    ok: true,
    batch: {
      answers: questions.map((item, index) => {
        const value = drafts[index];
        if (value.skipped) return { id: item.id, selected: [] };
        const custom = value.custom.trim();
        return {
          id: item.id,
          selected: custom === "" || isMulti(item) ? value.selected : [],
          ...custom === "" ? {} : { custom }
        };
      })
    }
  };
}
function answerMessage(pending, batch) {
  return { ok: true, value: { sessionId: pending.sessionId, answer: batch } };
}
function cancelMessage() {
  return {
    ok: false,
    error: { code: "cancelled", message: "the user closed this question request", details: {} }
  };
}
function parseRecommendedLabel(label) {
  const suffix = /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i;
  return suffix.test(label) ? { label: label.replace(suffix, ""), recommended: true } : { label, recommended: false };
}

// plugins/tool-render/src/pretty.ts
function isPrettyView(value) {
  if (value === null || typeof value !== "object") return false;
  if (value.version !== 1) return false;
  var span = value.span;
  if (span === null || typeof span !== "object") return false;
  if (typeof span.minSeq !== "number" || typeof span.maxSeq !== "number") return false;
  if (!Array.isArray(value.items)) return false;
  var stats = value.stats;
  if (stats === null || typeof stats !== "object") return false;
  if (typeof stats.droppedResultTokens !== "number") return false;
  if (typeof stats.erroredCalls !== "number") return false;
  if (typeof stats.hiddenCalls !== "number") return false;
  if (value.tail !== null && value.tail !== void 0) {
    var tail = value.tail;
    if (typeof tail !== "object") return false;
    if (typeof tail.count !== "number" || typeof tail.tokens !== "number") return false;
    if (typeof tail.fromSeq !== "number") return false;
  }
  return true;
}
function prettyRows(view) {
  if (!isPrettyView(view)) return [];
  var out = [];
  var items = Array.isArray(view.items) ? view.items : [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (item === null || typeof item !== "object") continue;
    if (item.type === "message") {
      if (typeof item.text !== "string") continue;
      var role = item.role === "user" || item.role === "assistant" || item.role === "system" ? item.role : "system";
      out.push({ kind: "message", seq: item.seq, role, text: item.text });
    } else if (item.type === "toolStrip") {
      if (typeof item.tool !== "string" || typeof item.count !== "number") continue;
      out.push({ kind: "toolStrip", seq: item.seq, tool: item.tool, count: item.count });
    } else if (item.type === "elided") {
      if (typeof item.note !== "string") continue;
      out.push({ kind: "elided", seq: item.seq, note: item.note });
    } else if (item.type === "media") {
      if (typeof item.label !== "string") continue;
      out.push({ kind: "media", seq: item.seq, label: item.label });
    }
  }
  return out;
}
function countMessageRows(rows) {
  var count = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].kind === "message") count++;
  }
  return count;
}

// plugins/tool-render/src/run-code.ts
var RUN_CODE_NO_OUTPUT = "(run_code completed with no output)";
function parseArgs(raw) {
  if (typeof raw !== "string" || raw === "") return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}
function firstLine(text) {
  var at = String(text).indexOf("\n");
  return at === -1 ? String(text) : String(text).slice(0, at);
}
function runCodeSummary(argsRaw) {
  var parsed = parseArgs(argsRaw);
  if (parsed !== null && typeof parsed === "object") {
    var description = parsed.description;
    if (typeof description === "string" && description !== "") return firstLine(description);
    for (var key of Object.keys(parsed)) {
      var value = parsed[key];
      if (typeof value === "string" && value !== "") return firstLine(value);
    }
  }
  var raw = firstLine(typeof argsRaw === "string" ? argsRaw : "");
  return raw !== "" ? raw : "Code";
}
function runCodeBodyText(argsRaw) {
  if (typeof argsRaw !== "string" || argsRaw === "") return null;
  var parsed = parseArgs(argsRaw);
  if (parsed === void 0) return argsRaw;
  if (parsed !== null && typeof parsed === "object") {
    var code = parsed.code;
    if (typeof code === "string" && code !== "") return code;
  }
  if (parsed === null) return argsRaw;
  return JSON.stringify(parsed, null, 2);
}
function flattenResultText(content, isError, error) {
  var parts = [];
  var blocks = Array.isArray(content) ? content : [];
  for (var i = 0; i < blocks.length; i++) {
    var item = blocks[i];
    if (item !== null && typeof item === "object" && item.type === "text" && typeof item.text === "string") {
      parts.push(item.text);
    } else if (item !== null && item !== void 0) {
      try {
        parts.push(JSON.stringify(item, null, 2));
      } catch (error2) {
      }
    }
  }
  if (parts.length === 0 && error !== void 0 && error !== null) {
    parts.push(String(error.name) + ": " + String(error.code));
  }
  return parts.join("\n");
}
function runCodeOutputText(content, isError, error) {
  var text = flattenResultText(content, isError, error);
  if (text === "") return null;
  if (text === RUN_CODE_NO_OUTPUT) return null;
  if (text.trim() === "") return null;
  return text;
}
function runCodeLineCount(text) {
  if (typeof text !== "string" || text === "") return 0;
  var parts = text.split("\n");
  if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts.length;
}
function runCodeInSummary(codeText) {
  return "ts [" + String(runCodeLineCount(codeText)) + "]";
}
function runCodeOutSummary(outText) {
  var count = runCodeLineCount(outText);
  return String(count) + (count === 1 ? " line" : " lines");
}

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
var PERMISSION_OUTLINE_CSS = `:root {
  --dsh-outline-escalated: #ff8c00;
  --dsh-outline-guard: #00b7ff;
}`;
var PLAN_ROW_CSS = `
.dsh-plan-item {
  align-items: baseline;
  display: flex;
  gap: 0.375rem;
  padding: 0.125rem 0 0.125rem 0.25rem;
}
.dsh-plan-checkbox {
  align-self: center;
  border: 1px solid var(--dsw-alias-border-l3);
  border-radius: 0.1875rem;
  flex: none;
  height: 0.875rem;
  position: relative;
  width: 0.875rem;
}
.dsh-plan-item[data-done] .dsh-plan-checkbox {
  border-color: var(--dsw-alias-state-success-primary);
}
/* State hue on the box itself: pending is queued (blue), active is running
   (amber), done keeps its green. Matches the header badge state colors. */
.dsh-plan-item[data-pending] .dsh-plan-checkbox {
  border-color: var(--dsw-alias-state-business-primary);
}
.dsh-plan-item[data-active] .dsh-plan-checkbox {
  border-color: var(--dsw-alias-state-warn-primary);
}
.dsh-plan-item[data-done] .dsh-plan-checkbox::after {
  color: var(--dsw-alias-state-success-primary);
  content: "\u2713";
  display: block;
  font-size: 0.6875rem;
  line-height: 0.8125rem;
  text-align: center;
}
.dsh-plan-item[data-active] .dsh-plan-checkbox::after {
  background: var(--dsw-alias-state-warn-primary);
  content: "";
  height: 0.09375rem;
  left: 0.1875rem;
  position: absolute;
  right: 0.1875rem;
  top: 50%;
}
.dsh-plan-content {
  font-size: 0.8125rem;
  line-height: 1.25rem;
  overflow-wrap: anywhere;
}
.dsh-plan-item[data-done] .dsh-plan-content {
  color: var(--dsw-alias-label-tertiary);
}
.dsh-plan-item[data-active] .dsh-plan-content {
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
}
.dsh-plan-item[data-pending] .dsh-plan-content {
  color: var(--dsw-alias-label-secondary);
}
`;
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
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// css-text:/home/sid/repos/dotfiles-ai/plugins/tool-render/src/client.module.css
var client_default = '/* ==========================================================================\n * THE SCALE (#169) \u2014 the file\'s contract. Read this before adding a rule.\n *\n * Seven tickets (#148, #149, #160, #162, #164, #165, #167) each added\n * surfaces to solve their own problem, and the audit counted the result:\n * 14+ padding values, 8 radii, five rem type sizes plus raw 10/11/12px, a\n * raw 5px 12px, a raw 4px, and one hardcoded rgba red. Every rule below is\n * on exactly one step of each scale in this header. A value not listed here\n * is a fifth scheme, not a judgment call.\n *\n * SCOPE: the whole file, deliberately. The raw pixels lived OUTSIDE the\n * diagram (ask buttons, approval buttons, the verdict stamp, the reason\n * lines) \u2014 a diagram-only pass would have added a scale without removing\n * the alternatives, which is the worst outcome. So every family below \u2014\n * row chrome, run-code sections, card outlines, ask form, roster, bodies,\n * approval, diagram \u2014 cites these steps.\n *\n * INHERITED, not revisited (#168, minutes old): the box-earning rule (a\n * stage draws its box only for redirects, an exit pill, or verbatim words),\n * the conditional chip, the part card values, the weighted panel voice,\n * and the tightened rhythm (statement stack 1.25rem -> 0.875rem, in-panel\n * gap 0.375 -> 0.25rem). If this scale ever wants one of those values\n * changed, that is a new ticket with a screenshot, not a drive-by here.\n * Inherited from #167 the same way: the bg-base field, content-sized\n * stages, the rail-free boundary, nowrap+scroll (C0).\n *\n * PADDING steps (vertical rhythm is margin+gap as well as padding \u2014 the\n * steps are shared). P-FLUSH 0. P-HAIR 0.0625rem. P-TIGHT 0.125rem.\n * P-CHIP 0.25rem. P-STAMP 0.375rem. P-CARD 0.5rem. P-CODE-V 0.625rem.\n * P-BTN-W 0.75rem. P-CODE-H 0.8125rem. Indents: 1.125rem (lists),\n * 1.375rem (nested calls), 1.625rem (answer notes). The full closed set is\n * pinned in bash-chain-panel.test.ts \u2014 any padding outside it fails the\n * suite. Named idioms: pill P-HAIR P-STAMP (badges, name badge, reminder\n * chip); chip-inline `0 P-CHIP` in dense chip rows (argument chips) vs\n * `0 P-STAMP` for standalone stamps (conditional, exit, diagram badge);\n * card P-STAMP P-CARD (#168 rhythm); card-tight 0.15625rem P-CARD (#165\'s\n * restraint, kept verbatim); verbatim block P-CODE-V P-CODE-H; text body\n * P-CARD P-CODE-V (steps are per-axis values and re-compose across\n * idioms); button P-CHIP P-BTN-W (was raw 5px 12px, now exact-rem\n * except 1px tighter vertically \u2014 flagged in the #169 report).\n *\n * RADIUS steps. R-DOT 0.0625rem (the sep dot only). R-CHIP 0.25rem (every\n * chip, badge, pill, heredoc, tab focus \u2014 absorbs raw 4px exactly).\n * R-CONTROL 0.375rem (name badge, inspect, text bodies, approval comment \u2014\n * absorbs 0.4375rem and the 6px join corners exactly). R-CARD 0.5rem\n * (stage, part, ask options). R-GROUP 0.625rem (the dashed verbatim group\n * ONLY \u2014 see below). R-PANEL 0.75rem (card, verbatim blocks, chain panel).\n * R-PILL 999px (pills read as pills at any height). R-FLAT 0 (joined\n * card corners where sections meet).\n *\n * TYPE steps, each with its line-height voice. T-STAMP 0.6875rem/1rem\n * (chips, badges, pills, tabs, captions, the verdict stamp \u2014 absorbs raw\n * 10px and 11px, +1px flagged). T-META 0.75rem/1.125rem (endpoints,\n * arguments, conditional, heredoc, roster ids; the roster rows pair it\n * with 1.25rem). T-CODE 0.8125rem/1.375rem (verbatim blocks; the diagram\n * surface and UI prose pair 0.8125rem with 1.25rem, dense notes with\n * 1.125rem). T-TITLE 0.875rem/1.5rem (row title; the summary override\n * drops to 0.8125rem for de-emphasis). T-ICON 1rem/1 (pager glyphs only \u2014\n * an icon metric, exempt by nature). `font: inherit` is always allowed: it\n * inherits a scale step, it is not a new one.\n *\n * BORDER levels \u2014 what each MEANS, not merely that three exist. L1 is a\n * line drawn ON a surface to divide content: code-block edges, text-body\n * edges, question separators, the compaction footer, the diff-path rule.\n * L2 is the edge of a discrete OBJECT against its field: the card, the\n * part, the run-code section sides, the conditional chip (dashed). L3 is\n * glance chrome: token chips, badges, pills, the stage box, the hover\n * lift, ask options. DASHED is the annotation voice \u2014 a claim ABOUT the\n * command (conditional, heredoc, endpoint, verbatim group, bound value),\n * answered at a glance against solid-outline token chips (pieces OF the\n * command). Dashed takes the level that reads against its host (L2 on\n * layer-1, L3 on code-block); that is contrast, not a fourth level.\n *\n * SURFACES \u2014 visual difference MEANS something. REGION is bg-base: the\n * chain panel field, and markdown `pre` blocks (a region nested inside a\n * body). OBJECT is bg-layer-1: the card, the part, argument chips, the\n * run-code sections. VERBATIM is markdown-code-block: outputs, code,\n * diffs, the earned stage box \u2014 bytes from the machine. CHROME is\n * interactive-bg-hover (+solid) and label-secondary fills: badges, the\n * reminder chip, primary buttons \u2014 UI the renderer added, not command\n * content. GLYPH is label-caption / border-l2-as-background: the sep dot,\n * the diff-sep rules \u2014 marks, not surfaces.\n *\n * STATE MARKS ride OUTLINES, never backgrounds: 0.1875rem escalated /\n * guard / answered / pending, 0.125rem error / stopped / focus. Outlines\n * paint outside the box, so a state change never reflows a row. #fff is\n * absolute bright on purpose (the pending ask must win on either theme);\n * the diff hues (orange/blue del/add, marker hexes) are a content language\n * \u2014 a deletion is not an error \u2014 and deliberately NOT theme tokens.\n *\n * THE THEME CONTRACT (criterion 5): every token above is a dsw-alias \u2014\n * elevation, not colour. bg-base stays distinguishable from bg-layer-1\n * either way the themes flip it (#167\'s proof, inherited). The error wash\n * derives from the theme\'s own error token via color-mix, so it follows\n * the theme instead of fighting it (the old hardcoded rgba red assumed\n * one theme). The one standing px exception is the picture edge: a 2px\n * label-tertiary border that must read against ARBITRARY image content,\n * where the quiet border tokens are exactly wrong (commented at the rule).\n * 1px hairlines are the other: a physical hairline is 1px in both themes.\n * ========================================================================== */\n.tool-render-row {\n  align-items: center;\n  min-width: 0;\n  height: 2rem;\n  display: flex;\n  position: relative;\n  overflow: hidden;\n}\n.tool-render-row[data-expandable] {\n  cursor: pointer;\n}\n.tool-render-chevron {\n  color: var(--dsw-alias-label-secondary);\n  flex: none;\n  margin-right: 0.25rem;\n  transform: rotate(-90deg);\n  transition: transform 0.12s;\n}\n.tool-render-chevron-open {\n  transform: rotate(0deg);\n}\n.tool-render-chevron-disabled {\n  opacity: 0.35;\n  pointer-events: none;\n}\n.tool-render-title {\n  color: var(--dsw-alias-label-secondary);\n  flex: none;\n  font-size: 0.875rem;\n  line-height: 1.5rem;\n}\n/* The always-on raw tool-name badge: the row\'s own icon plus the registered\n   tool name, on a hashed-hue background. */\n.tool-render-name-badge {\n  box-sizing: border-box;\n  display: inline-flex;\n  align-items: center;\n  justify-content: flex-start;\n  gap: 0.25rem;\n  width: 6.75rem;\n  height: 1.5rem;\n  flex: none;\n  overflow: hidden;\n  border: 1px solid;\n  border-radius: 0.375rem;\n  padding: 0.0625rem 0.375rem;\n  margin-right: 0.375rem;\n  color: var(--dsw-alias-label-primary);\n}\n.tool-render-name-badge-icon {\n  display: inline-flex;\n  flex: none;\n  align-items: center;\n}\n.tool-render-name-badge-text {\n  flex: 1;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  text-align: center;\n  font-size: 0.75rem;\n  line-height: 1.125rem;\n  font-weight: 500;\n}\n/* The producer/source badge on a context-injection or send_message row.\n   A small pill, not the sentence-in-body treatment it replaces. This is the\n   older optional per-row badge, not the tool-name badge above. */\n.tool-render-badge {\n  flex: none;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-interactive-bg-hover);\n  border-radius: 999px;\n  margin-left: 0.375rem;\n  padding: 0.0625rem 0.375rem;\n  font-size: 0.6875rem;\n  line-height: 1rem;\n}\n.tool-render-sep {\n  background: var(--dsw-alias-label-caption);\n  border-radius: 0.0625rem;\n  flex: none;\n  width: 0.125rem;\n  height: 0.125rem;\n  margin: 0 0.5rem;\n}\n.tool-render-summary {\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  min-width: 0;\n  color: var(--dsw-alias-label-tertiary);\n  flex: auto;\n  font-size: 0.875rem;\n  line-height: 1.5rem;\n  overflow: hidden;\n}\n.tool-render-summary[tool-render-error] {\n  color: var(--dsw-alias-state-error-primary);\n  font-weight: 500;\n}\n.tool-render-path {\n  color: var(--dsw-alias-label-tertiary);\n  cursor: pointer;\n  min-width: 0;\n  max-width: 100%;\n  display: inline-block;\n  vertical-align: bottom;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 0.875rem;\n  line-height: 1.5rem;\n}\n.tool-render-path:hover {\n  color: var(--dsw-alias-label-primary);\n  text-decoration: underline;\n}\n.tool-render-body {\n  flex-direction: column;\n  display: flex;\n}\n.tool-render-io {\n  flex-direction: column;\n  display: flex;\n}\n.tool-render-cmd-label {\n  font-family: var(--ds-font-family-code);\n  font-size: 0.6875rem;\n  line-height: 1rem;\n  color: var(--dsw-alias-label-tertiary);\n  opacity: 0.75;\n  margin: 0.375rem 0 0 0.25rem;\n}\n.tool-render-command {\n  font-family: var(--ds-font-family-code);\n  white-space: pre-wrap;\n  word-break: break-word;\n  color: var(--dsw-alias-label-tertiary);\n  margin: 0.25rem 0 0 0.25rem;\n  padding: 0.125rem 0;\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n}\n.tool-render-command code.hljs {\n  background: transparent;\n  padding: 0;\n  font-family: inherit;\n  font-size: inherit;\n  line-height: inherit;\n  white-space: inherit;\n}\n.tool-render-output {\n  box-sizing: border-box;\n  background: var(--dsw-alias-markdown-code-block);\n  font-family: var(--ds-font-family-code);\n  white-space: pre-wrap;\n  word-break: break-word;\n  color: var(--dsw-alias-label-primary);\n  border-radius: 0.75rem;\n  margin: 0.25rem 0 0.25rem 0.25rem;\n  padding: 0.625rem 0.8125rem;\n  font-size: 0.8125rem;\n  line-height: 1.375rem;\n  max-height: 17.5rem;\n  overflow-y: auto;\n}\n.tool-render-output[tool-render-error] {\n  color: var(--dsw-alias-state-error-primary);\n  /* #169: the error wash derives from the theme\'s own error token instead\n     of a hardcoded rgba red \u2014 darker wash in the dark theme, tinted wash in\n     the light one, the same 45%/8% weights either way. */\n  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent);\n  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);\n  font-weight: 500;\n}\n/* #152 Part C: IN / TOOL CALLS / OUT read as ONE card with the nested calls.\n   All three section labels reuse .tool-render-code-out-label \u2014 one visual\n   language, not a new one. The IN code block reuses .tool-render-code and the\n   OUT text reuses .tool-render-output; the cap below mirrors the rule the OUT\n   row has today: upstream .ioSection scrolls internally past 150px\n   (max-height:150px; overflow-y:auto), so long output scrolls instead of\n   flooding the transcript, with the full text retained in the DOM. */\n.tool-render-code-out {\n  display: flex;\n  flex-direction: column;\n}\n.tool-render-code-out-label {\n  font-family: var(--ds-font-family-code);\n  font-size: 0.6875rem;\n  line-height: 1rem;\n  color: var(--dsw-alias-label-caption);\n  margin: 0.375rem 0 0 0.25rem;\n}\n.tool-render-output.tool-render-code-out-text {\n  max-height: 9.375rem;\n}\n/* The IN/OUT section spoilers: a chevron plus a mono line-count summary\n   (`ts [263]`, `2 lines`), collapsed by default. A button element, so keyboard\n   interaction is native; the reset below strips the native button chrome so it\n   reads as a row, not a control. An errored OUT spoiler reads red even while\n   collapsed, so the failure signals without opening. */\n.tool-render-runcode-spoiler {\n  display: flex;\n  align-items: center;\n  gap: 0.25rem;\n  align-self: flex-start;\n  background: none;\n  border: none;\n  padding: 0.125rem 0;\n  margin: 0 0 0 0.25rem;\n  cursor: pointer;\n  font-family: var(--ds-font-family-code);\n  font-size: 0.8125rem;\n  line-height: 1.375rem;\n  color: var(--dsw-alias-label-secondary);\n  text-align: left;\n}\n.tool-render-runcode-spoiler:hover {\n  color: var(--dsw-alias-label-primary);\n}\n.tool-render-runcode-spoiler:focus-visible {\n  outline: 0.125rem solid var(--dsw-alias-state-business-primary);\n  outline-offset: -0.125rem;\n}\n.tool-render-runcode-spoiler-label {\n  white-space: nowrap;\n}\n.tool-render-runcode-spoiler[tool-render-error] {\n  color: var(--dsw-alias-state-error-primary);\n  font-weight: 500;\n}\n\n/* #152 nesting layout: head -> IN -> TOOL CALLS label -> nested -> OUT.\n\n   THE SHAPE, measured in the live DOM rather than inferred from the bundle --\n   an earlier version of this block guessed and matched nothing:\n\n     div[data-chat-call-id]                     <- upstream\'s call row\n       div[data-slot="tool.call.toolview"]      <- THE RENDERER\'S WRAPPER,\n                                                    style="display: contents"\n         .tool-render-card[data-run-code]       <- our head\n         .tool-render-runcode-in                <- our IN section\n         .tool-render-runcode-calls-label       <- our TOOL CALLS label\n         .tool-render-runcode-out               <- our OUT section\n       div.<hashed>subCalls                     <- the nested calls\n\n   Two consequences, and the layout hangs on both. (1) Our nodes are NOT direct\n   children of the call row, so any `:has(> .tool-render-card\u2026)` selector fails\n   silently -- which is exactly how this shipped broken once. (2) The wrapper\n   carries `display: contents`, so it generates no box and OUR FOUR NODES BECOME\n   FLEX ITEMS OF THE CALL ROW ANYWAY. That is the only reason ordering can work\n   across the wrapper at all; if upstream ever gives that wrapper a real display\n   value, the sections stop being siblings of .subCalls and this flattens back\n   to DOM order -- ugly, not broken.\n\n   On the hook: data-chat-call-id is stamped by upstream on every call row and\n   is stable and unhashed, which is why it is used here. It is NOT read by\n   upstream\'s own code -- the bundle contains exactly one occurrence, the write\n   -- so this is a public attribute we rely on, not a contract upstream would\n   notice breaking. */\ndiv[data-chat-call-id]:has(> [data-slot="tool.call.toolview"] > .tool-render-card[data-run-code]) {\n  display: flex;\n  flex-direction: column;\n}\n.tool-render-card[data-run-code] {\n  order: 0;\n}\n.tool-render-runcode-in {\n  order: 1;\n}\n.tool-render-runcode-calls-label {\n  order: 2;\n}\n.tool-render-runcode-out {\n  order: 4;\n}\n/* Everything else upstream puts in the row -- today only the nested-call\n   container -- sits between the TOOL CALLS label and OUT. Selected by\n   excluding the slot wrapper rather than by upstream\'s .subCalls class, which\n   is content-hashed and turns over every build. */\ndiv[data-chat-call-id]:has(> [data-slot="tool.call.toolview"] > .tool-render-card[data-run-code])\n  > *:not([data-slot]) {\n  order: 3;\n}\n/* No nested calls, no TOOL CALLS heading: a card with no nested calls must\n   not show an empty label. Whether nested calls exist is unknowable from our\n   props \u2014 upstream renders them outside our view \u2014 so the row hides our label\n   when it carries no non-wrapper child. The label renders by default and only\n   this rule removes it, so dropping the wrapper step here fails LOUD (an empty\n   heading on every plain card) rather than SILENT. */\ndiv[data-chat-call-id]:has(> [data-slot="tool.call.toolview"] > .tool-render-card[data-run-code]):not(:has(> *:not([data-slot]))) > [data-slot="tool.call.toolview"] > .tool-render-runcode-calls-label {\n  display: none;\n}\n\n/* The five read as ONE card: the head loses its bottom rounding, the middle\n   sections continue the side borders, the OUT block loses its top rounding,\n   and the nested calls are indented between the TOOL CALLS label and OUT with\n   the side borders continued. */\n.tool-render-card[data-run-code] {\n  border-bottom-left-radius: 0;\n  border-bottom-right-radius: 0;\n  border-bottom: 0;\n  margin-bottom: 0;\n}\n.tool-render-runcode-in,\n.tool-render-runcode-calls-label {\n  border-left: 1px solid var(--dsw-alias-border-l2);\n  border-right: 1px solid var(--dsw-alias-border-l2);\n  margin: 0;\n  background: var(--dsw-alias-bg-layer-1);\n}\n.tool-render-runcode-in {\n  padding: 0 0.5rem 0.375rem;\n}\n.tool-render-runcode-calls-label {\n  padding: 0 0.5rem 0.125rem;\n}\n.tool-render-runcode-out {\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-top: 0;\n  border-radius: 0 0 0.375rem 0.375rem;\n  background: var(--dsw-alias-bg-layer-1);\n  padding: 0 0.5rem 0.375rem;\n}\ndiv[data-chat-call-id]:has(> [data-slot="tool.call.toolview"] > .tool-render-card[data-run-code])\n  > *:not([data-slot]) {\n  border-left: 1px solid var(--dsw-alias-border-l2);\n  border-right: 1px solid var(--dsw-alias-border-l2);\n  margin: 0;\n  padding: 0.25rem 0.5rem 0.25rem 1.375rem;\n  background: var(--dsw-alias-bg-layer-1);\n}\n.tool-render-row[data-state="error"] .tool-render-title {\n  color: var(--dsw-alias-state-error-primary);\n  font-weight: 500;\n}\n/* A stopped call mutes its title and summary, since it no longer has its own\n   state dot to mark it. */\n.tool-render-row[data-state="stopped"] .tool-render-title,\n.tool-render-row[data-state="stopped"] .tool-render-summary {\n  color: var(--dsw-alias-label-tertiary);\n}\n.tool-render-code {\n  box-sizing: border-box;\n  background: var(--dsw-alias-markdown-code-block);\n  font-family: var(--ds-font-family-code);\n  white-space: pre-wrap;\n  word-break: break-word;\n  color: var(--dsw-alias-label-primary);\n  border-radius: 0.75rem;\n  margin: 0.25rem 0 0.25rem 0.25rem;\n  padding: 0.625rem 0.8125rem;\n  font-size: 0.8125rem;\n  line-height: 1.375rem;\n  max-height: 25rem;\n  overflow-y: auto;\n}\n.tool-render-inspect {\n  border: 1px solid var(--dsw-alias-border-l2);\n  background: var(--dsw-alias-bg-base);\n  color: var(--dsw-alias-label-secondary);\n  cursor: pointer;\n  opacity: 0;\n  border-radius: 0.375rem;\n  align-self: flex-start;\n  align-items: center;\n  gap: 0.25rem;\n  margin: 0.25rem 0 0.125rem 0.25rem;\n  padding: 0.125rem 0.375rem;\n  font-size: 0.6875rem;\n  line-height: 1rem;\n  transition: opacity 0.1s;\n  display: inline-flex;\n}\n.tool-render-card:hover .tool-render-inspect,\n.tool-render-inspect:focus-visible {\n  opacity: 1;\n}\n.tool-render-inspect:hover {\n  background: var(--dsw-alias-interactive-bg-hover-solid);\n  color: var(--dsw-alias-label-primary);\n}\n.tool-render-diff-fallback {\n  box-sizing: border-box;\n  background: var(--dsw-alias-markdown-code-block);\n  font-family: var(--ds-font-family-code);\n  white-space: pre-wrap;\n  word-break: break-word;\n  color: var(--dsw-alias-label-primary);\n  border-radius: 0.75rem;\n  margin: 0.25rem 0 0.25rem 0.25rem;\n  padding: 0.625rem 0.8125rem;\n  font-size: 0.8125rem;\n  line-height: 1.375rem;\n  max-height: 25rem;\n  overflow-y: auto;\n}\n.tool-render-fallback-note {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 0.75rem;\n  line-height: 1.125rem;\n  margin-bottom: 0.375rem;\n}\n.tool-render-write {\n  flex-direction: column;\n  display: flex;\n}\n.tool-render-write-diff {\n  box-sizing: border-box;\n  background: var(--dsw-alias-markdown-code-block);\n  font-family: var(--ds-font-family-code);\n  white-space: pre-wrap;\n  word-break: break-word;\n  color: var(--dsw-alias-label-primary);\n  border-radius: 0.75rem;\n  margin: 0.25rem 0 0.25rem 0.25rem;\n  padding: 0.625rem 0.8125rem;\n  font-size: 0.8125rem;\n  line-height: 1.375rem;\n  max-height: 25rem;\n  overflow-y: auto;\n}\n.tool-render-line-same {\n  color: var(--dsw-alias-label-primary);\n}\n.tool-render-diff-row.tool-render-line-del,\n.tool-render-diff-cell.tool-render-line-del {\n  background: rgba(255, 166, 87, 0.16);\n}\n.tool-render-diff-row.tool-render-line-add,\n.tool-render-diff-cell.tool-render-line-add {\n  background: rgba(125, 180, 255, 0.16);\n}\n.tool-render-diff-marker {\n  flex: none;\n  width: 2ch;\n  text-align: center;\n  align-self: flex-start;\n  user-select: none;\n  color: var(--dsw-alias-label-tertiary);\n}\n.tool-render-diff-marker-del {\n  color: #ffb86c;\n}\n.tool-render-diff-marker-add {\n  color: #7db4ff;\n}\n.tool-render-write-note {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 0.75rem;\n  line-height: 1.125rem;\n  margin-bottom: 0.375rem;\n}\n.tool-render-code-row,\n.tool-render-diff-row {\n  display: flex;\n  align-items: flex-start;\n  min-width: 0;\n}\n.tool-render-diff-pair {\n  display: flex;\n  align-items: stretch;\n  min-width: 0;\n}\n.tool-render-diff-cell {\n  flex: 1 1 0;\n  min-width: 0;\n  display: flex;\n  align-items: flex-start;\n}\n.tool-render-diff-cell + .tool-render-diff-cell {\n  border-left: 0.0625rem solid var(--dsw-alias-border-l2);\n}\n.tool-render-gutter {\n  flex: none;\n  align-self: flex-start;\n  padding-right: 0.75rem;\n  text-align: right;\n  color: var(--dsw-alias-label-tertiary);\n  user-select: none;\n  font-family: var(--ds-font-family-code);\n  font-size: 0.8125rem;\n  line-height: 1.375rem;\n}\n.tool-render-line-cell {\n  flex: auto;\n  min-width: 0;\n  display: block;\n  font-family: var(--ds-font-family-code);\n  font-size: 0.8125rem;\n  line-height: 1.375rem;\n  white-space: pre-wrap;\n  word-break: break-word;\n}\n.tool-render-line-cell.hljs {\n  background: transparent;\n  padding: 0;\n  font-family: inherit;\n  font-size: inherit;\n  line-height: inherit;\n  white-space: inherit;\n}\n.tool-render-diff-path {\n  color: var(--dsw-alias-label-secondary);\n  font-family: var(--ds-font-family-code);\n  font-size: 0.8125rem;\n  line-height: 1.375rem;\n  border-bottom: 0.0625rem solid var(--dsw-alias-border-l2);\n  padding-bottom: 0.25rem;\n  margin-bottom: 0.375rem;\n}\n.tool-render-diff-sep {\n  display: flex;\n  align-items: center;\n  gap: 0.625rem;\n  color: var(--dsw-alias-label-caption);\n  font-family: var(--ds-font-family-code);\n  font-size: 0.75rem;\n  line-height: 1.125rem;\n  margin: 0.5rem 0;\n}\n.tool-render-diff-sep::before,\n.tool-render-diff-sep::after {\n  content: "";\n  flex: 1;\n  height: 0.0625rem;\n  background: var(--dsw-alias-border-l2);\n}\n.tool-render-card {\n  box-sizing: border-box;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.75rem;\n  background: var(--dsw-alias-bg-layer-1);\n  padding: 0.15625rem 0.5rem;\n}\n/* A call that bash-guard approved carries electric blue as its durable\n   mark, so it reads differently from a sandbox_permissions escalation.\n   This rule comes BEFORE the escalated one at equal (0,2,0) specificity,\n   so a call that carries both marks settles yellow. A rewritten command\n   keeps the mark permanently, because the rewrite is recorded in the\n   durable result metadata. A pending approval that caused no rewrite\n   loses the mark once it is answered. */\n.tool-render-card[data-guard-approval] {\n  outline: 0.1875rem solid var(--dsh-outline-guard);\n}\n/* A call that asked for sandbox escalation carries yellow as its durable\n   mark. It follows the guard rule at equal (0,2,0) specificity, so the\n   later rule wins the both case and the chip and the outline state the\n   same thing. It still loses to the error rule below, exactly as before,\n   so a failed escalation reads red. */\n.tool-render-card[data-escalated] {\n  outline: 0.1875rem solid var(--dsh-outline-escalated);\n}\n/* Once answered, the outline dulls to translucent white instead of\n   vanishing. This rule sits BEFORE error/stopped/guard so a failed or\n   guarded call keeps its own stronger mark. */\n.tool-render-card[data-question-answered] {\n  outline: 0.1875rem solid color-mix(in srgb, #fff 40%, transparent);\n}\n/* An errored call is outlined the way an escalated one is, in red and a little\n   thinner. The outline follows the card\'s rounded corners. It replaces the old\n   tinted row background and inset left bar. */\n.tool-render-card[data-error] {\n  outline: 0.125rem solid var(--dsw-alias-state-error-primary);\n}\n/* A stopped call (interrupted) gets a dimmer red outline, since it no longer\n   carries its own state dot. */\n.tool-render-card[data-stopped] {\n  outline: 0.125rem solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 55%, transparent);\n}\n/* The durable guard mark outranks error and stopped, and nothing else. A\n   rewritten command often exits non-zero (rg exits 1 on no match, and\n   bashErrorState promotes any [exit code: N>=1] result to error), which\n   used to hand blue to the later red rules at equal (0,2,0) specificity.\n   The doubled attribute selector plus the two exclusions counts (0,5,0),\n   so it wins over error, stopped, answered, and both single-mark rules\n   without !important. Each :not() names a rule it must lose to. The\n   [data-escalated] exclusion hands the settled both case to the yellow\n   rule above. The [data-escalation-pending] exclusion hands an open\n   escalation ask to the pending yellow rule below, even before the call\n   args carry the mark. The pending blue rule below agrees with this one,\n   so no exclusion names it. Question pending keeps its own place last,\n   and the tie cannot happen because guard approvals are bash-only. */\n.tool-render-card[data-guard-approval][data-guard-approval]:not([data-escalated]):not([data-escalation-pending]) {\n  outline: 0.1875rem solid var(--dsh-outline-guard);\n}\n/* The open guard ask names its own colour. While a bash-guard approval\n   is open for this call the outline stays blue even when the call\n   already carries a settled escalation mark. This single-attribute rule\n   counts (0,2,0) and needs no doubling. It sits after every settled rule\n   it must beat, and the durable guard rule above already agrees with it,\n   so position alone decides. */\n.tool-render-card[data-guard-pending] {\n  outline: 0.1875rem solid var(--dsh-outline-guard);\n}\n/* The open escalation ask names its own colour. While a sandbox\n   escalation approval is open for this call the outline turns yellow\n   even when the call already carries a durable guard mark. Like its blue\n   twin this rule counts (0,2,0) and wins by position alone. It follows\n   the guard pending rule, so when both asks are somehow open at once the\n   later ask in the known sequence wins. No order assumption lives here\n   beyond that tiebreak. Each pending rule reads the open approval kind\n   directly, so an escalation ask that arrives first still paints yellow. */\n.tool-render-card[data-escalation-pending] {\n  outline: 0.1875rem solid var(--dsh-outline-escalated);\n}\n/* A call waiting on the human\'s answer to its question is outlined in\n   solid white at the same 3px weight as the other state outlines. This\n   rule sits after error/stopped/guard so the bright "answer me" mark wins\n   while pending (a pending call is still running, so error/stopped cannot\n   co-occur; the doubled guard rule above still wins a true tie, which\n   cannot happen because guard approvals are bash-only). */\n.tool-render-card[data-question-pending] {\n  outline: 0.1875rem solid #fff;\n}\n.tool-render-card:hover {\n  border-color: var(--dsw-alias-border-l3);\n}\n.tool-render-title {\n  font-weight: 500;\n}\n.tool-render-summary,\n.tool-render-path {\n  font-size: 0.8125rem;\n}\n.tool-render-output,\n.tool-render-code,\n.tool-render-write-diff,\n.tool-render-diff-fallback {\n  border: 1px solid var(--dsw-alias-border-l1);\n}\n.tool-render-row:focus-visible {\n  outline: 0.125rem solid var(--dsw-alias-state-business-primary);\n  outline-offset: -0.125rem;\n}\n\n/* todo_write and ask_user_question shared body layout. */\n.tool-render-plan {\n  flex-direction: column;\n  display: flex;\n}\n/* Plan row (item, checkbox, content) is shared PLAN_ROW_CSS from\n   shared/client-util.ts, injected via the dsh-plan-row style tag. */\n\n/* ask_user_question questions, options, and answers. */\n.tool-render-ask {\n  flex-direction: column;\n  display: flex;\n}\n.tool-render-question {\n  flex-direction: column;\n  display: flex;\n  padding: 0.125rem 0;\n}\n.tool-render-question + .tool-render-question {\n  border-top: 1px solid var(--dsw-alias-border-l1);\n  margin-top: 0.25rem;\n  padding-top: 0.375rem;\n}\n.tool-render-question-prompt {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n  overflow-wrap: anywhere;\n  padding: 0 0 0.125rem 0.25rem;\n}\n.tool-render-option {\n  align-items: baseline;\n  display: flex;\n  gap: 0.375rem;\n  padding: 0.125rem 0 0.125rem 0.25rem;\n}\n.tool-render-option-marker {\n  flex: none;\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n  width: 1rem;\n}\n.tool-render-option-text {\n  display: flex;\n  flex-direction: column;\n  gap: 0.0625rem;\n  min-width: 0;\n}\n.tool-render-option-label {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n  overflow-wrap: anywhere;\n}\n.tool-render-option-description {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 0.8125rem;\n  line-height: 1.125rem;\n  overflow-wrap: anywhere;\n}\n.tool-render-option[data-selected] .tool-render-option-label {\n  color: var(--dsw-alias-label-primary);\n  font-weight: 700;\n}\n.tool-render-answer-note {\n  color: var(--dsw-alias-label-caption);\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n  font-style: italic;\n  padding: 0.125rem 0 0 1.625rem;\n  overflow-wrap: anywhere;\n}\n.tool-render-ask[tool-render-error] .tool-render-question-prompt {\n  color: var(--dsw-alias-label-tertiary);\n}\n/* Each of the four ask-card text fields now renders through MarkdownText,\n   which wraps even one plain line in its own markup. That cost two things\n   this row depended on: MarkdownText\'s own prose elements carry their own\n   color and font shorthand at every level of whatever it nests (a wrapper\n   div, then a <p>, and so on), overriding these four classes\' own colors\n   (including the data-selected bold+primary label) and sizes, and a\n   paragraph\'s default block margin added unwanted vertical gaps in what is\n   one line of layout, not a markdown body. `*` resets color and font on\n   EVERY descendant, however deep MarkdownText nests -- each level inherits\n   from its own immediate parent, so the reset cascades all the way down to\n   the actual text, including an ancestor\'s font-weight or font-style such as\n   data-selected\'s bold or the note\'s italic. `margin: 0` on `p` alone\n   removes the paragraph gap. A genuine list or heading inside an answer\n   still renders; it just does not get this rule\'s own tight spacing or\n   color override. */\n.tool-render-question-prompt *,\n.tool-render-option-label *,\n.tool-render-option-description *,\n.tool-render-answer-note * {\n  color: inherit;\n  font: inherit;\n}\n.tool-render-question-prompt p,\n.tool-render-option-label p,\n.tool-render-option-description p,\n.tool-render-answer-note p {\n  margin: 0;\n}\n\n/* ask_user_question answer form: the interactive UI on the pending card,\n   ported from the shipped QuestionComposer. Option buttons follow the\n   approval-btn recipe (1px border, surface bg); the selected option takes\n   the business-primary border, the primary action the filled recipe. */\n.tool-render-qform {\n  flex-direction: column;\n  display: flex;\n  gap: 0.375rem;\n  padding: 0.25rem 0 0.25rem 0.25rem;\n}\n.tool-render-qheader {\n  align-items: flex-start;\n  justify-content: space-between;\n  display: flex;\n  gap: 0.5rem;\n}\n.tool-render-qheading {\n  min-width: 0;\n  flex: 1 1 auto;\n}\n.tool-render-qeyebrow {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 0.6875rem;\n  line-height: 1rem;\n}\n.tool-render-qtitle {\n  color: var(--dsw-alias-label-primary);\n  font-size: 0.8125rem;\n  font-weight: 600;\n  line-height: 1.25rem;\n  overflow-wrap: anywhere;\n}\n.tool-render-qdismiss {\n  flex: none;\n  border: none;\n  background: none;\n  color: var(--dsw-alias-label-tertiary);\n  cursor: pointer;\n  font-size: 0.6875rem;\n  line-height: 1rem;\n  padding: 0.0625rem 0.25rem;\n  text-decoration: underline dotted;\n}\n.tool-render-qdismiss:hover:enabled {\n  color: var(--dsw-alias-label-primary);\n}\n.tool-render-qdismiss:disabled {\n  opacity: 0.55;\n  cursor: default;\n}\n.tool-render-qbody {\n  flex-direction: column;\n  display: flex;\n  gap: 0.375rem;\n}\n.tool-render-qdetail {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n  overflow-wrap: anywhere;\n}\n.tool-render-qoptions {\n  flex-direction: column;\n  display: flex;\n  gap: 0.25rem;\n}\n.tool-render-qoption {\n  align-items: baseline;\n  display: flex;\n  gap: 0.375rem;\n  width: 100%;\n  box-sizing: border-box;\n  text-align: left;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.5rem;\n  background: var(--dsw-alias-bg-base);\n  color: inherit;\n  font: inherit;\n  cursor: pointer;\n  padding: 0.375rem 0.5rem;\n}\n.tool-render-qoption:hover:enabled {\n  background: var(--dsw-alias-interactive-bg-hover-solid);\n}\n.tool-render-qoption:disabled {\n  cursor: default;\n}\n.tool-render-qoption[data-selected] {\n  border-color: var(--dsw-alias-state-business-primary);\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n.tool-render-qoption-marker {\n  flex: none;\n  width: 1rem;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n  text-align: center;\n}\n.tool-render-qoption[data-selected] .tool-render-qoption-marker {\n  color: var(--dsw-alias-state-business-primary);\n}\n.tool-render-qoption-text {\n  display: flex;\n  flex-direction: column;\n  min-width: 0;\n  flex: 1 1 auto;\n}\n.tool-render-qoption-line {\n  align-items: baseline;\n  display: flex;\n  flex-wrap: wrap;\n  gap: 0.25rem 0.5rem;\n}\n.tool-render-qoption-label {\n  color: var(--dsw-alias-label-primary);\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n  overflow-wrap: anywhere;\n}\n.tool-render-qoption[data-selected] .tool-render-qoption-label {\n  font-weight: 700;\n}\n.tool-render-qoption-description {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 0.8125rem;\n  line-height: 1.125rem;\n  overflow-wrap: anywhere;\n}\n.tool-render-qbadge {\n  flex: none;\n  border: 1px solid var(--dsw-alias-state-business-primary);\n  border-radius: 999px;\n  color: var(--dsw-alias-state-business-primary);\n  font-size: 0.6875rem;\n  line-height: 1rem;\n  padding: 0 0.375rem;\n}\n.tool-render-qcustom-row {\n  align-items: center;\n  display: flex;\n  gap: 0.375rem;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.5rem;\n  background: var(--dsw-alias-bg-base);\n  padding: 0.375rem 0.5rem;\n}\n.tool-render-qcustom-row[data-active] {\n  border-color: var(--dsw-alias-state-business-primary);\n}\n.tool-render-qcustom-input {\n  flex: 1 1 auto;\n  min-width: 0;\n  border: none;\n  outline: none;\n  background: none;\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  padding: 0;\n}\n.tool-render-qcustom-input::placeholder {\n  color: var(--dsw-alias-label-caption);\n}\n.tool-render-qcustom-textarea {\n  box-sizing: border-box;\n  width: 100%;\n  resize: vertical;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.5rem;\n  background: var(--dsw-alias-bg-base);\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  padding: 0.375rem 0.5rem;\n}\n.tool-render-qcustom-textarea:focus {\n  border-color: var(--dsw-alias-state-business-primary);\n  outline: none;\n}\n.tool-render-qfooter {\n  align-items: center;\n  display: flex;\n  gap: 0.5rem;\n}\n.tool-render-qpager {\n  flex: none;\n  align-items: center;\n  display: flex;\n  gap: 0.25rem;\n}\n.tool-render-qnav {\n  border: none;\n  background: none;\n  color: var(--dsw-alias-label-tertiary);\n  cursor: pointer;\n  border-radius: 999px;\n  font-size: 1rem;\n  line-height: 1;\n  padding: 0.125rem 0.375rem;\n}\n.tool-render-qnav:hover:enabled {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n.tool-render-qnav:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n.tool-render-qprogress {\n  color: var(--dsw-alias-label-secondary);\n  white-space: nowrap;\n  font-size: 0.8125rem;\n  font-weight: 500;\n  line-height: 1.25rem;\n}\n.tool-render-qfeedback {\n  flex: 1 1 auto;\n  min-height: 1rem;\n  color: var(--dsw-alias-state-error-primary);\n  font-size: 0.6875rem;\n  line-height: 1rem;\n}\n.tool-render-qactions {\n  flex: none;\n  align-items: center;\n  display: flex;\n  gap: 0.25rem;\n}\n.tool-render-qbtn {\n  border: 1px solid var(--dsw-alias-border-l3);\n  background: var(--dsw-alias-bg-base);\n  color: var(--dsw-alias-label-secondary);\n  border-radius: 0.25rem;\n  cursor: pointer;\n  font-size: 0.75rem;\n  line-height: 1.25rem;\n  padding: 0.25rem 0.75rem;\n}\n.tool-render-qbtn:hover:enabled {\n  background: var(--dsw-alias-interactive-bg-hover-solid);\n  color: var(--dsw-alias-label-primary);\n}\n.tool-render-qbtn:disabled {\n  opacity: 0.45;\n  cursor: default;\n}\n.tool-render-qbtn-primary {\n  border-color: transparent;\n  background: var(--dsw-alias-label-secondary);\n  color: var(--dsw-alias-bg-base);\n  font-weight: 600;\n}\n.tool-render-qbtn-primary:hover:enabled {\n  background: var(--dsw-alias-label-secondary);\n  color: var(--dsw-alias-bg-base);\n  filter: brightness(1.15);\n}\n\n/* list_agents roster: one line per agent, status first so the column reads\n   down the left edge. A descendants listing indents each line by its own\n   depth through an inline padding, so the tree shape is visible without a\n   parent id on every row. */\n.tool-render-agents {\n  display: flex;\n  flex-direction: column;\n  padding: 0.125rem 0 0.125rem 0.25rem;\n}\n.tool-render-agent {\n  align-items: baseline;\n  display: flex;\n  gap: 0.375rem;\n  min-width: 0;\n  padding: 0.0625rem 0;\n}\n.tool-render-agent-status {\n  flex: none;\n  width: 5rem;\n  font-size: 0.75rem;\n  line-height: 1.25rem;\n  color: var(--dsw-alias-label-caption);\n}\n.tool-render-agent-status[data-status="running"] {\n  color: var(--dsh-outline-guard);\n}\n.tool-render-agent-status[data-status="diagnostic"] {\n  color: var(--dsw-alias-state-error-primary);\n}\n.tool-render-agent-id {\n  flex: none;\n  font-family: var(--ds-font-family-code);\n  font-size: 0.75rem;\n  line-height: 1.25rem;\n  color: var(--dsw-alias-label-tertiary);\n  max-width: 12rem;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.tool-render-agent-label {\n  color: var(--dsw-alias-label-primary);\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n/* Shared capped, scrollable markdown body. Used by every row whose body is\n   rendered text: subagent prompt, context injection, send_message delivery.\n   One block, so a future row family member gets the same rules for free\n   instead of a fourth copy. */\n.tool-render-markdown-body {\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 0.375rem;\n  margin: 0.25rem 0 0.125rem 0.25rem;\n  max-height: 16rem;\n  overflow-y: auto;\n  padding: 0.5rem 0.625rem;\n}\n.tool-render-markdown-body :where(h1, h2, h3, h4, h5, h6),\n.tool-render-fetch-body :where(h1, h2, h3, h4, h5, h6) {\n  font-size: 0.875rem;\n  line-height: 1.25rem;\n  margin: 0.5rem 0 0.25rem;\n}\n.tool-render-markdown-body :where(h1, h2, h3, h4, h5, h6):first-child,\n.tool-render-fetch-body :where(h1, h2, h3, h4, h5, h6):first-child {\n  margin-top: 0;\n}\n.tool-render-markdown-body :where(p, ul, ol, pre, blockquote, table),\n.tool-render-fetch-body :where(p, ul, ol, pre, blockquote, table) {\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n  margin: 0.25rem 0;\n}\n.tool-render-markdown-body :where(ul, ol),\n.tool-render-fetch-body :where(ul, ol) {\n  padding-left: 1.125rem;\n}\n.tool-render-markdown-body :where(pre),\n.tool-render-fetch-body :where(pre) {\n  background: var(--dsw-alias-bg-base);\n  border-radius: 0.25rem;\n  overflow-x: auto;\n  padding: 0.375rem 0.5rem;\n}\n.tool-render-markdown-body :where(code),\n.tool-render-fetch-body :where(code) {\n  font-family: var(--ds-font-family-code);\n}\n.tool-render-markdown-body :where(code):not(:where(pre code)),\n.tool-render-fetch-body :where(code):not(:where(pre code)) {\n  background: var(--dsw-alias-bg-base);\n  border-radius: 0.25rem;\n  padding: 0 0.25rem;\n}\n\n/* web_fetch body. Same bounded-scroll shape as the markdown body but its\n   own block, so a fetched page scrolls inside the card. A raw-HTML page\n   renders as escaped code text in this container instead, never as\n   markup. */\n.tool-render-fetch-body {\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 0.375rem;\n  margin: 0.25rem 0 0.125rem 0.25rem;\n  max-height: 16rem;\n  overflow-y: auto;\n  padding: 0.5rem 0.625rem;\n}\n.tool-render-fetch-raw {\n  font-family: var(--ds-font-family-code);\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n  white-space: pre-wrap;\n  word-break: break-word;\n  color: var(--dsw-alias-label-primary);\n  margin: 0;\n}\n/* A <system-reminder> block, framed instead of hidden: every character of\n   its text still renders, just under a chip instead of literal tags. The\n   left border this used to carry read as a blockquote and was mistaken for\n   a stray outline on the whole card; dropped. */\n.tool-render-reminder {\n  margin: 0.5rem 0;\n}\n.tool-render-reminder-chip {\n  display: inline-block;\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-interactive-bg-hover);\n  border-radius: 999px;\n  margin-bottom: 0.25rem;\n  padding: 0.0625rem 0.375rem;\n  font-size: 0.6875rem;\n  line-height: 1rem;\n}\n/* Skill frontmatter table (name, resource-resolution hint). Only what the\n   loaded skill\'s canonical output actually carries -- description and\n   whenToUse are catalog-only fields, stripped before a skill loads. */\n.tool-render-skill-table {\n  border-collapse: collapse;\n  margin-bottom: 0.5rem;\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n}\n.tool-render-skill-table th {\n  color: var(--dsw-alias-label-tertiary);\n  text-align: left;\n  font-weight: 400;\n  padding: 0.125rem 0.5rem 0.125rem 0;\n  vertical-align: top;\n  white-space: nowrap;\n}\n.tool-render-skill-table td {\n  color: var(--dsw-alias-label-primary);\n  padding: 0.125rem 0;\n  white-space: pre-wrap;\n}\n\n/* read_image and see image bodies. One bounded container per card, with one\n   interior scroll area. Picture cards hold mixed content, so this rule is\n   shaped like .tool-render-markdown-body but stands alone instead of\n   overloading it. */\n.tool-render-image-body {\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 0.375rem;\n  margin: 0.25rem 0 0.125rem 0.25rem;\n  max-height: 25rem;\n  overflow-y: auto;\n  padding: 0.5rem 0.625rem;\n}\n.tool-render-image-body > .tool-render-markdown-body {\n  margin: 0 0 0.375rem;\n}\n/* The picture shrinks to the card width, keeps its aspect ratio, and never\n   grows past its natural pixel size. width and height stay auto, so the\n   browser only ever scales down. The link centers the picture when it is\n   narrower than the card. */\n.tool-render-image-link {\n  display: flex;\n  justify-content: center;\n}\n/* A 2px border in a LABEL token, not a border token: the border tokens are\n   tuned to sit quietly against panel backgrounds, which is exactly wrong\n   here, where the job is to mark where the picture\'s own edge is against\n   arbitrary image content. */\n.tool-render-image {\n  max-width: 100%;\n  width: auto;\n  height: auto;\n  border: 0.125rem solid var(--dsw-alias-label-tertiary);\n  border-radius: 0.25rem;\n}\n/* Metadata lines under the picture: name, type, full path. */\n.tool-render-image-meta {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 0.75rem;\n  line-height: 1.125rem;\n  overflow-wrap: anywhere;\n  margin-top: 0.375rem;\n}\n/* A path the route cannot serve. The message sits where the picture would\n   sit, so a broken load is always visible. */\n.tool-render-image-broken {\n  color: var(--dsw-alias-state-error-primary);\n  font-size: 0.75rem;\n  line-height: 1.125rem;\n  overflow-wrap: anywhere;\n  padding: 0.5rem 0;\n  text-align: center;\n}\n/* The see row description clamp. The cap applies only while collapsed, so\n   this rule rides beside .tool-render-markdown-body and comes after it in\n   this file to win the max-height and overflow contest. */\n.tool-render-see-desc {\n  max-height: 8rem;\n  overflow: hidden;\n}\n.tool-render-see-toggle {\n  align-self: flex-start;\n  background: transparent;\n  border: none;\n  color: var(--dsw-alias-label-secondary);\n  cursor: pointer;\n  margin: 0 0 0.375rem;\n  padding: 0;\n  font-size: 0.75rem;\n  line-height: 1.125rem;\n}\n.tool-render-see-toggle:hover {\n  color: var(--dsw-alias-label-primary);\n  text-decoration: underline;\n}\n\n/* Compaction checkpoint card. One line per compacted message, count-badged\n   tool strips, elision notes, and a stats footer. Message lines clamp to a\n   single line with an ellipsis: the full text lives on the surface the\n   marker replaced, so the card only summarizes. */\n.tool-render-compaction {\n  flex-direction: column;\n  display: flex;\n  padding-bottom: 0.25rem;\n}\n.tool-render-compaction-line {\n  display: flex;\n  align-items: baseline;\n  gap: 0.375rem;\n  min-width: 0;\n  padding: 0.0625rem 0 0.0625rem 0.25rem;\n}\n.tool-render-compaction-role {\n  flex: none;\n  color: var(--dsw-alias-label-caption);\n  font-size: 0.6875rem;\n  line-height: 1.125rem;\n  text-transform: uppercase;\n}\n.tool-render-compaction-text {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n}\n.tool-render-compaction-strip {\n  display: flex;\n  align-items: center;\n  gap: 0.375rem;\n  min-width: 0;\n  padding: 0.0625rem 0 0.0625rem 0.25rem;\n}\n.tool-render-compaction-strip .tool-render-compaction-text {\n  flex: 0 1 auto;\n}\n.tool-render-compaction-note {\n  color: var(--dsw-alias-label-caption);\n  font-style: italic;\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  padding: 0.0625rem 0 0.0625rem 0.25rem;\n}\n.tool-render-compaction-stats {\n  color: var(--dsw-alias-label-caption);\n  font-size: 0.6875rem;\n  line-height: 1.125rem;\n  border-top: 1px solid var(--dsw-alias-border-l1);\n  margin-top: 0.25rem;\n  padding: 0.25rem 0 0 0.25rem;\n}\n\n/* ---- Approval answer bar and decided badge. While an approval that\n   carries this card\'s callId is pending, the card answers it inline; once\n   decided, a durable badge keeps the outcome. The strip is additive: the\n   card keeps rendering its normal content above it. */\n/* A COLUMN, not a row: the comment affordance is a precondition of the\n   decision, so it reads above the buttons rather than beside them. Order is\n   "add comment" (left) -> optional textarea (full width) -> the decision\n   pair (right), which is also the order the user moves through them. */\n.tool-render-approval-strip {\n  display: flex;\n  flex-direction: column;\n  align-items: stretch;\n  gap: 0.25rem;\n  /* Bottom margin matches .tool-render-output\'s own 0.25rem, so the\n     strip\'s last row does not kiss the card\'s bottom border. */\n  margin: 0.25rem 0 0.25rem 0.25rem;\n}\n/* Reject/approve pack to the card\'s bottom-right corner (aidos queue recipe:\n   actions sit at the end of their container). */\n.tool-render-approval-actions {\n  display: flex;\n  align-items: center;\n  justify-content: flex-end;\n  gap: 0.25rem;\n  padding-bottom: 0.25rem;\n}\n/* The toggle sits above the buttons on the card\'s RIGHT edge, matching the\n   actions below it \u2014 the whole comment affordance reads as one right-aligned\n   column, and only the textarea spans the full width. */\n.tool-render-approval-comment-toggle {\n  align-self: flex-end;\n}\n/* (The decided badge that used to live here was retired on 2026-09-08: the\n   durable verdict is now a badge on the collapsed row, .tool-render-verdict,\n   and the answer bar renders nothing once a decision has settled.) */\n/* Aidios review-queue button recipe, mapped onto dsw-alias tokens and the\n   #169 scale: 1px hairline border, surface bg, secondary text, R-CHIP\n   radius, T-META type, P-CHIP P-BTN-W padding, hover raises surface +\n   primary text, disabled 0.45. (Was raw 5px 12px: 12px is exactly\n   P-BTN-W, 5px tightens 1px to P-CHIP \u2014 flagged in the #169 report.) */\n.tool-render-approval-btn {\n  border: 1px solid var(--dsw-alias-border-l3);\n  background: var(--dsw-alias-bg-base);\n  color: var(--dsw-alias-label-secondary);\n  border-radius: 0.25rem;\n  cursor: pointer;\n  font-size: 0.75rem;\n  line-height: 1.25rem;\n  padding: 0.25rem 0.75rem;\n}\n.tool-render-approval-btn:hover:enabled {\n  background: var(--dsw-alias-interactive-bg-hover-solid);\n  color: var(--dsw-alias-label-primary);\n}\n.tool-render-approval-btn:disabled {\n  opacity: 0.45;\n  cursor: default;\n}\n.tool-render-approval-reject {\n  color: var(--dsw-alias-state-error-primary);\n  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 55%, var(--dsw-alias-border-l3));\n}\n/* First click arms ("? Confirm reject"), second click rejects; the armed\n   fill makes the confirm step read unmistakably. */\n.tool-render-approval-reject[data-armed] {\n  background: var(--dsw-alias-state-error-primary);\n  border-color: var(--dsw-alias-state-error-primary);\n  color: #fff;\n  font-weight: 600;\n}\n/* Primary/confirm button of the recipe: filled secondary-label bg with\n   surface text, weight 600, no border. */\n.tool-render-approval-approve {\n  border-color: transparent;\n  background: var(--dsw-alias-label-secondary);\n  color: var(--dsw-alias-bg-base);\n  font-weight: 600;\n}\n.tool-render-approval-approve:hover:enabled {\n  background: var(--dsw-alias-label-secondary);\n  color: var(--dsw-alias-bg-base);\n  filter: brightness(1.15);\n}\n/* A comment draft relabels the action "Approve + send", so it reads warn:\n   the click now also steers the comment to the running agent. */\n.tool-render-approval-approve[data-with-comment] {\n  color: var(--dsw-alias-state-warn-primary);\n}\n.tool-render-approval-approve[data-with-comment]:hover:enabled {\n  background: var(--dsw-alias-label-secondary);\n  color: var(--dsw-alias-state-warn-primary);\n  filter: brightness(1.15);\n}\n.tool-render-approval-comment-toggle {\n  border: none;\n  background: none;\n  color: var(--dsw-alias-label-tertiary);\n  cursor: pointer;\n  font-size: 0.6875rem;\n  line-height: 1rem;\n  padding: 0.0625rem 0.25rem;\n  text-decoration: underline dotted;\n}\n.tool-render-approval-comment-toggle:hover:enabled {\n  color: var(--dsw-alias-label-primary);\n}\n.tool-render-approval-comment-toggle:disabled {\n  opacity: 0.55;\n  cursor: default;\n}\n.tool-render-approval-comment {\n  box-sizing: border-box;\n  flex-basis: 100%;\n  resize: vertical;\n  min-height: 2.5rem;\n  border: 1px solid var(--dsw-alias-border-l3);\n  border-radius: 0.375rem;\n  background: var(--dsw-alias-bg-base);\n  color: var(--dsw-alias-label-primary);\n  font-family: inherit;\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n  padding: 0.25rem 0.5rem;\n}\n.tool-render-approval-comment:focus {\n  outline: 0.125rem solid var(--dsw-alias-state-business-primary);\n  outline-offset: -0.0625rem;\n}\n/* The durable approval verdict on the COLLAPSED row (owner, 2026-09-08):\n   [shield | APPROVED], sitting immediately after the tool-call label badge.\n   It reads as a small status stamp \u2014 uppercase, tight, nowrap \u2014 so the row\n   still scans as one line and the verdict is legible without expanding.\n   Approved carries no accent: at row scale a coloured pill competes with the\n   tool name for attention, and "it was approved" is the unremarkable case.\n   Rejected keeps the error tint, because a refusal that looks identical to an\n   approval is worth exactly one colour.\n   Sourced from the guarded-approvals fold, so it survives a page reload. */\n.tool-render-verdict {\n  display: inline-flex;\n  align-items: center;\n  gap: 0.25rem;\n  flex: none;\n  border: 1px solid var(--dsw-alias-border-l3);\n  border-radius: 0.25rem;\n  padding: 0 0.375rem;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 0.6875rem;\n  font-weight: 600;\n  letter-spacing: 0.04em;\n  line-height: 1.125rem;\n  white-space: nowrap;\n}\n.tool-render-verdict[data-outcome="rejected"] {\n  color: var(--dsw-alias-state-error-primary);\n  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 55%, var(--dsw-alias-border-l3));\n}\n.tool-render-verdict-shield {\n  flex: none;\n}\n/* The pending ask\'s reason (owner, 2026-09-08): while an approval is open the\n   card must say WHY it is being asked. Tertiary label, wrapping, sitting above\n   the actions so the question reads before the answer. */\n.tool-render-approval-reason {\n  align-self: stretch;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 0.75rem;\n  line-height: 1.125rem;\n  margin-bottom: 0.25rem;\n  overflow-wrap: anywhere;\n  white-space: pre-wrap;\n}\n/* The sandbox-escalation banner (owner, 2026-09-09). The label line reuses\n   the guard rewrite banner\'s .tool-render-cmd-label styling, so the two\n   "something happened to this call" annotations read as one family. The\n   mode rides the label line as its own chip \u2014 it decides how far the\n   sandbox widens, so it stays discoverable without being jammed into the\n   justification sentence. The justification below is prose in the same\n   tertiary 12px/18px voice as the approval reason, never code. */\n/* The chip carries the ESCALATION colour, not a neutral one (owner,\n   2026-09-09). The mode is the single most consequential fact on the card \u2014\n   how far the sandbox widens \u2014 and a grey chip made it read as incidental\n   metadata beside its own warning. Sharing --dsh-outline-escalated with the\n   card outline means the chip and the outline state the same thing in the\n   same colour, so the eye pairs them.\n\n   The outline half of #105 landed in #177. A settled escalation now keeps\n   the yellow outline even when the call was also guard approved, and an\n   open escalation ask paints yellow while it waits. The chip and the\n   outline agree in every state, so a mismatch between them is a bug, not\n   a known gap. Do not fix one by neutralising the chip again. The outline\n   was the wrong half, and now it is the right one. */\n.tool-render-escalation-mode {\n  font: inherit;\n  white-space: nowrap;\n  color: var(--dsh-outline-escalated);\n  border: 1px solid var(--dsh-outline-escalated);\n  border-radius: 0.25rem;\n  margin-left: 0.375rem;\n  padding: 0 0.25rem;\n}\n.tool-render-escalation-reason {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 0.75rem;\n  line-height: 1.125rem;\n  margin: 0.125rem 0 0.25rem 0.25rem;\n  overflow-wrap: anywhere;\n  white-space: pre-wrap;\n}\n/* The settled ask (approved OR rejected \u2014 the trigger is settledness, not\n   approval): muted and small, so a decided request no longer reads as\n   though it still needed an answer. This quiets the ASK only \u2014 the outcome\n   keeps its own surfaces (the collapsed-row verdict badge, the error\n   outline), which this rule never touches. */\n.tool-render-escalation-reason-muted {\n  color: var(--dsw-alias-label-caption);\n  font-size: 0.6875rem;\n  line-height: 1rem;\n}\n/* #149: read-only dataflow diagram for pipe/redirect bash commands. Stages\n   are blocks in execution order joined by typed arrows; redirects are\n   labelled endpoints under their stage; heredoc bodies collapse to one\n   disclosure each. Plain flexbox + glyphs, no graph dependency. */\n.tool-render-diagram {\n  font-family: var(--ds-font-family-code);\n  margin: 0.25rem 0 0 0.25rem;\n  padding: 0.125rem 0;\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n  color: var(--dsw-alias-label-tertiary);\n}\n/* #162 criterion 0. v1/v2 shipped `row wrap`, and the LIVE measurements\n   against real commands showed why that lied by layout: flex line-breaking\n   runs on items\' MAX-content base sizes (a stage with a long flag cluster\n   or a quoted string carries a 380-640px base), so the row wrapped as soon\n   as the base sum exceeded the pane -- at the dsh chat column\'s 748px cap,\n   the owner\'s journalctl|rg|tail fixture wrapped its tail stage and a\n   `node -e "..."` stage never fit below ~1270px. A wrapped row is visually\n   indistinguishable from a stacked sequence, so the horizontal=pipe/axis\n   claim did not exist at those widths. The fix: the stage row stays ONE row\n   ALWAYS (nowrap); stages shrink inside it (see the stage rule) and only\n   overflow horizontally with a scroll when a pipeline genuinely cannot\n   fit. An overflowed pipe row reads as one band cut at its right edge with\n   a scroll affordance -- nothing like the stacked vertical sequence, whose\n   members have no lateral overflow (-- #162 criterion 0\'s stated answer:\n   horizontal scroll, plus content-proportional shrink, below). */\n/* #167 criterion 8: equal HEIGHT stays \u2014 a measured decision, not the\n   default. The screenshot\'s empty boxes had TWO causes: equal width (fixed\n   in the stage rule below) and every item stretching to the tallest. Both\n   were measured on the owner\'s command (see the ticket report): the width\n   fix drops the row from four lines to two, so keeping `align-items:\n   stretch` leaves each short box one line emptier than its content; hugging\n   (`flex-start`) removes that line but breaks the row into ragged bottoms \u2014\n   and a ragged pipe row stops reading as ONE band, which is the axis\n   contract\'s whole claim above. One line of dead space keeps the band; the\n   declaration below is the decision, not an inheritance. */\n.tool-render-diagram-flow {\n  display: flex;\n  flex-flow: row nowrap;\n  align-items: stretch;\n  gap: 0.25rem;\n  overflow-x: auto;\n}\n/* Content-proportional stage blocks (#167 criterion 6, narrowing #162\'s\n   equal-share a second time). #162 set `flex: 1 1 0%` DELIBERATELY, to spend\n   horizontal width rather than waste it (the freed width goes to the\n   parsed-argument chips). #165 narrowed it once: a LONE stage hugs content,\n   because it has nothing to share with \u2014 but kept equal-share where several\n   stages share a row. The owner\'s screenshot sanctions narrowing it again:\n   equal slices give the `rg` stage (regex plus a long path) one fifth of the\n   row, so it wraps to four lines and sets a row height four nearly-empty\n   boxes inherit. `flex: 1 1 auto` keeps the GROW (the row still spends its\n   full width \u2014 #162\'s criterion is honoured, not reverted) but sizes from\n   CONTENT (flex-basis auto): free space beyond the content bases still\n   spreads evenly, so a longer stage gets more width and wraps less, which\n   drops the row height for every box in it. THE TRADE, stated plainly: short\n   stages no longer soak an equal share, and rows whose natural widths exceed\n   the pane reach their horizontal scroll sooner (C0 below: they scroll, they\n   never wrap). min-width 0 plus the words block\'s pre-wrap still lets long\n   content wrap INSIDE its share; a genuinely unbreakable token still slides\n   the row into its own horizontal scroll (-- #162: the pipe row never\n   becomes a stack). */\n.tool-render-diagram-stage {\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n  gap: 0.25rem;\n  flex: 1 1 auto;\n  min-width: 0;\n  background: var(--dsw-alias-markdown-code-block);\n  border: 1px solid var(--dsw-alias-border-l3);\n  border-radius: 0.5rem;\n  padding: 0.375rem 0.5rem;\n}\n.tool-render-diagram-words {\n  white-space: pre-wrap;\n  word-break: break-word;\n  color: var(--dsw-alias-label-primary);\n}\n.tool-render-diagram-words code.hljs {\n  background: transparent;\n  padding: 0;\n  font-family: inherit;\n  font-size: inherit;\n  line-height: inherit;\n  white-space: inherit;\n}\n/* #162 criteria 3-5: parsed-argument chips. Each chip\'s text is the\n   VERBATIM source slice of the token it names (never a re-serialisation \u2014\n   criterion 3; quoting/escaping/spacing read as typed). Roles: the command\n   head (first chip), flags, a bound value, a subcommand, positionals.\n   .tool-render-diagram-args is a wrap ROW so chips hug horizontally and the\n   freed width the equal-share stage blocks freed (criterion 1) goes here.\n   Chips are plain code text, not highlighted: the slice is data the reader\n   checks against the raw command, and hljs would REPRINT it. */\n.tool-render-diagram-args {\n  display: flex;\n  flex-flow: row wrap;\n  gap: 0.25rem;\n  min-width: 0;\n}\n.tool-render-diagram-arg {\n  box-sizing: border-box;\n  font-family: var(--ds-font-family-code);\n  font-size: 0.75rem;\n  line-height: 1.125rem;\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-bg-layer-1);\n  border: 1px solid var(--dsw-alias-border-l3);\n  border-radius: 0.25rem;\n  padding: 0 0.25rem;\n  white-space: pre-wrap;\n  word-break: break-word;\n  min-width: 0;\n}\n.tool-render-diagram-arg-cmd {\n  color: var(--dsw-alias-label-primary);\n  font-weight: 600;\n}\n.tool-render-diagram-arg-subcommand {\n  font-weight: 600;\n  border-color: var(--dsw-alias-border-l2);\n}\n.tool-render-diagram-arg-value {\n  color: var(--dsw-alias-label-tertiary);\n  border-style: dashed;\n}\n.tool-render-diagram-arg-positional {\n  color: var(--dsw-alias-label-tertiary);\n}\n/* The arrow carries its verbatim operator as text (`|` vs `|&`), so the two\n   are visually distinguishable without the tooltip; the title states what\n   each carries for discoverability. */\n.tool-render-diagram-arrow {\n  align-self: center;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-tertiary);\n}\n.tool-render-diagram-arrow-stderr {\n  color: var(--dsw-alias-label-primary);\n  font-weight: 600;\n}\n.tool-render-diagram-endpoint {\n  font-size: 0.75rem;\n  line-height: 1.125rem;\n  white-space: pre-wrap;\n  word-break: break-word;\n  color: var(--dsw-alias-label-tertiary);\n  border-top: 1px dashed var(--dsw-alias-border-l3);\n  padding-top: 0.25rem;\n}\n.tool-render-diagram-endpoint code.hljs {\n  background: transparent;\n  padding: 0;\n  font-family: inherit;\n  font-size: inherit;\n  line-height: inherit;\n  white-space: inherit;\n}\n.tool-render-diagram-badge {\n  display: inline-block;\n  font-size: 0.6875rem;\n  line-height: 1rem;\n  color: var(--dsw-alias-label-tertiary);\n  border: 1px solid var(--dsw-alias-border-l3);\n  border-radius: 0.25rem;\n  padding: 0 0.375rem;\n  margin: 0 0.375rem 0.375rem 0;\n  white-space: nowrap;\n}\n.tool-render-diagram-exit {\n  font-size: 0.6875rem;\n  line-height: 1rem;\n  white-space: nowrap;\n  border: 1px solid var(--dsw-alias-border-l3);\n  border-radius: 0.25rem;\n  padding: 0 0.375rem;\n  align-self: flex-start;\n}\n.tool-render-diagram-exit-ok {\n  color: var(--dsw-alias-label-tertiary);\n}\n.tool-render-diagram-exit-fail {\n  color: var(--dsw-alias-state-error-primary);\n  border-color: var(--dsw-alias-state-error-primary);\n  font-weight: 600;\n}\n.tool-render-diagram-heredoc {\n  font: inherit;\n  font-size: 0.75rem;\n  line-height: 1.125rem;\n  color: var(--dsw-alias-label-tertiary);\n  background: transparent;\n  border: 1px dashed var(--dsw-alias-border-l3);\n  border-radius: 0.25rem;\n  padding: 0.125rem 0.375rem;\n  cursor: pointer;\n  text-align: left;\n  white-space: pre-wrap;\n  word-break: break-word;\n}\n.tool-render-diagram-heredoc-open {\n  display: flex;\n  flex-direction: column;\n  gap: 0.25rem;\n  align-items: flex-start;\n}\n.tool-render-diagram-heredoc-body {\n  box-sizing: border-box;\n  margin: 0;\n  max-width: 100%;\n  max-height: 10rem;\n  overflow-y: auto;\n  white-space: pre-wrap;\n  word-break: break-word;\n  font-size: 0.75rem;\n  line-height: 1.125rem;\n  color: var(--dsw-alias-label-primary);\n}\n/* #160: a multi-statement script as an ordered sequence of statement groups.\n   The visual contract against #149\'s refusal: pipes lay stages side-by-side\n   in one row (left to right = data movement) with the verbatim operator plus\n   `\u2192`; sequence members stack VERTICALLY here (top to bottom = time order),\n   joined by a "then \u2193" marker that shares no glyph with any pipe. The word\n   "then" is doing the work \u2014 plain English for order, impossible to read as\n   bytes flowing. Verbatim text groups (subshells, &&-chains) get a dashed\n   outline to signal "shown, not drawn". */\n.tool-render-diagram-seq {\n  display: flex;\n  flex-direction: column;\n  gap: 0.25rem;\n}\n/* A reused single-statement diagram nested in a sequence keeps v1\'s blocks\n   untouched; only its outer margin is neutralised so members align. */\n.tool-render-diagram-seq .tool-render-diagram {\n  margin: 0;\n}\n/* #167 criterion 1: NO RAIL between independent statements. #162 made the\n   unconditional boundary a rail-with-no-word so it could never be mistaken\n   for a conditional one \u2014 "one is nothing, the other is prominent text".\n   The rail still drew a connector between statements that are INDEPENDENT\n   (the second runs whether or not the first succeeded), implying a\n   dependency that does not exist \u2014 the same class of falsehood #162 removed\n   the `then` marker for. The boundary is now genuinely nothing: an empty\n   separator paints no box at all (its padding/min-height is pure vertical\n   rhythm, kept wider than the in-panel card gap so statement edges breathe\n   more than chain-part edges). A comment riding the separator is CONTENT,\n   not chrome, and still renders verbatim in its muted voice beside nothing\n   \u2014 removing the rail must never remove the comment with it (pinned). The\n   conditional boundary stays marked ON the dependent part\'s own panel (see\n   .tool-render-diagram-conditional): one is nothing, the other is prominent\n   text \u2014 that distinction never touched the rail. */\n.tool-render-diagram-seq-sep {\n  display: flex;\n  flex-flow: row nowrap;\n  align-items: baseline;\n  gap: 0.5rem;\n  margin-left: 0.375rem;\n  padding: 0.0625rem 0 0.0625rem 0.5rem;\n  min-height: 0.25rem;\n}\n.tool-render-diagram-seq-sep-text {\n  background: transparent;\n  padding: 0;\n  font-family: inherit;\n  font-size: 0.75rem;\n  line-height: 1.125rem;\n  white-space: pre-wrap;\n  word-break: break-word;\n  color: var(--dsw-alias-label-tertiary);\n}\n/* #162 criterion 2 (amended by #168): the conditional marker is a CHIP at\n   the top of the DEPENDENT row\'s own panel \u2014 just `&&` or `||`, with the\n   plain-language condition on hover (title + data-dsh-tip: one string feeds\n   the styled tooltip and the screen-reader name alike, so no aria-label is\n   introduced that could drift from the visual). Never on a chain\'s base row\n   (the base runs unconditionally, #162 criterion 2b). Chip-sized, but never\n   mistaken for an argument chip: it leads the card ABOVE the stage flow\n   (never inline in the chip row), and the dashed outline against bold type\n   answers the solid-outline regular-weight argument chips at a glance. */\n.tool-render-diagram-conditional {\n  display: inline-flex;\n  flex-flow: row nowrap;\n  align-items: baseline;\n  font-size: 0.75rem;\n  line-height: 1.125rem;\n  font-weight: 700;\n  color: var(--dsw-alias-label-primary);\n  border: 1px dashed var(--dsw-alias-border-l2);\n  border-radius: 0.25rem;\n  padding: 0 0.375rem;\n  margin-bottom: 0.25rem;\n  white-space: nowrap;\n}\n/* #168: a stage that earns no box. Chips already delimit themselves, so the\n   stage outline is redundant here \u2014 transparent border and background plus\n   zero padding leave the chips and arrows to read as the row. The rule for\n   earning a box lives in BashCommandDiagram (redirects, an exit pill, or\n   verbatim words); this class only removes the chrome, never the layout \u2014\n   the nowrap flow, the scroll, and the content-proportional flex above are\n   untouched, so #162\'s C0 holds exactly as pinned. */\n.tool-render-diagram-stage-bare {\n  border-color: transparent;\n  background: transparent;\n  padding: 0;\n}\n.tool-render-diagram-text {\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n  gap: 0.25rem;\n  border: 1px dashed var(--dsw-alias-border-l3);\n  border-radius: 0.625rem;\n  padding: 0.5rem 0.625rem;\n  min-width: 0;\n  max-width: 100%;\n}\n/* #165: one `&&`/`||` chain as ONE panel, rows as cards inside it. #167\n   changed the panel\'s voice from outline to weight (see the rule below):\n   the panel is a weighted field (darker than the card in the dark theme),\n   and each part keeps its card outline exactly\n   (same border, layer-1 background, tight 0.15625rem vertical padding \u2014 the\n   restraint that makes the target read clean). The part, not\n   the stage box, is now the outline unit: stages inside a part go FLAT\n   (borderless, backgroundless, paddingless \u2014 see the descendant rule below),\n   which removes the second outline level the ticket calls excessive. A\n   reused single-statement diagram nested in a part keeps v1\'s blocks\n   untouched otherwise; only its outer margin is neutralised, as in sequences.\n   AXIS CONTRACT (criterion 3): parts stack vertically at CONTENT width\n   (align-items: flex-start \u2014 time passes, like sequence members) and never\n   sit side by side, so they cannot read as pipe stages; a pipe row keeps its\n   horizontal nowrap band with `|`/`\u2192` glyphs and its own scroll (C0 below,\n   untouched). max-width + min-width keep an overlong pipeline\'s scroll\n   inside the card instead of breaking the pane. */\n/* #167 criteria 3-5, THE TOKEN CHOICE: bg-base. These aliases are ELEVATION,\n   not literal darkness \u2014 base is the canvas layer-1 sits on in BOTH themes,\n   so a base field stays distinguishable from the layer-1 tool card behind\n   it either way (darker field in the dark theme, lighter field in the light\n   one: the direction flips, the region-vs-objects read does not). layer-2\n   would elevate the WRONG way (a raised surface, not a field); mask/primary/\n   tertiary are overlays and accents, not surfaces. The parts reuse layer-1\n   exactly as before, so the field cannot collide with them: base and\n   layer-1 are adjacent but distinct steps on the scale, and every part keeps\n   its own border-l2 outline on top. Radius and padding stay: they shape the\n   field and inset the cards, not draw an outline. */\n.tool-render-diagram-chainpanel {\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n  gap: 0.25rem;\n  background: var(--dsw-alias-bg-base);\n  border-radius: 0.75rem;\n  padding: 0.375rem 0.5rem;\n  min-width: 0;\n  max-width: 100%;\n}\n.tool-render-diagram-part {\n  box-sizing: border-box;\n  align-self: flex-start;\n  min-width: 0;\n  max-width: 100%;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.5rem;\n  background: var(--dsw-alias-bg-layer-1);\n  padding: 0.15625rem 0.5rem;\n}\n.tool-render-diagram-part .tool-render-diagram {\n  margin: 0;\n  padding: 0;\n}\n.tool-render-diagram-part .tool-render-diagram-stage {\n  border-color: transparent;\n  background: transparent;\n  padding: 0;\n}\n/* #165, THE DELIBERATE TRADE against #162 criterion 1 \u2014 kept by #167.\n   #162 set equal-share stages ON PURPOSE, to spend horizontal width rather\n   than waste it (the freed width goes to the parsed-argument chips).\n   Equal-share is exactly what stretches a SHORT command across a wide row:\n   a single stage has nothing to share its row WITH, so equal-share there is\n   pure stretch \u2014 the "negative space created by the empty portion of a\n   command line" the owner is describing. The reversal is therefore NARROW:\n   single-stage flows (data-stages="1", set by BashCommandDiagram) size to\n   content with NO grow (`flex: 0 1 auto`), while multi-stage pipelines now\n   size from content WITH grow (`flex: 1 1 auto` above, #167) \u2014 #162\'s\n   spend-the-width decision stands everywhere as grow, but no stage starts\n   from a zero base anymore.\n   #162\'s C0 re-checked in the same breath: the flow rule above stays\n   `flex-flow: row nowrap` with `overflow-x: auto`, so a pipeline row still\n   never wraps into a column (a wrapped pipe row is indistinguishable from a\n   stacked sequence) \u2014 it scrolls. Single-stage hug cannot break C0: one\n   stage has no row-mate to wrap against; its chips wrap INSIDE it, as before. */\n.tool-render-diagram-flow[data-stages="1"] .tool-render-diagram-stage {\n  flex: 0 1 auto;\n}\n.tool-render-diagram-lead {\n  white-space: pre-wrap;\n  word-break: break-word;\n  font-size: 0.75rem;\n  line-height: 1.125rem;\n  color: var(--dsw-alias-label-tertiary);\n  margin-bottom: 0.375rem;\n}\n/* #164: Graph / Command tabs on the expanded bash row. The strip reuses the\n   repo\'s existing chrome rather than inventing a tab language: the button\n   reset and focus ring come from the run_code spoiler\n   (.tool-render-runcode-spoiler), the mono small-label voice from the IN/OUT\n   section labels (.tool-render-code-out-label), and the selected-border idiom\n   from the ask form\'s selected option (.tool-render-qoption[data-selected]).\n   The selected paint keys on the SAME aria-selected attribute assistive\n   technology reads, so the two cannot disagree. */\n.tool-render-bash-tabs {\n  display: flex;\n  flex-flow: row nowrap;\n  gap: 0.25rem;\n  margin: 0.375rem 0 0 0.25rem;\n}\n.tool-render-bash-tab {\n  background: none;\n  border: none;\n  border-bottom: 0.125rem solid transparent;\n  padding: 0.125rem 0.375rem;\n  cursor: pointer;\n  font-family: var(--ds-font-family-code);\n  font-size: 0.6875rem;\n  line-height: 1rem;\n  color: var(--dsw-alias-label-tertiary);\n  text-align: left;\n}\n.tool-render-bash-tab:hover {\n  color: var(--dsw-alias-label-primary);\n}\n.tool-render-bash-tab[aria-selected="true"] {\n  color: var(--dsw-alias-label-primary);\n  font-weight: 600;\n  border-bottom-color: var(--dsw-alias-state-business-primary);\n}\n.tool-render-bash-tab:focus-visible {\n  outline: 0.125rem solid var(--dsw-alias-state-business-primary);\n  outline-offset: 0.125rem;\n  border-radius: 0.25rem;\n}\n/* The tab panel is a neutral container: the graph and the command keep their\n   own margins and scrolling, so switching tabs changes the content, never\n   the card\'s shape language. */\n.tool-render-bash-panel {\n  display: flex;\n  flex-direction: column;\n  min-width: 0;\n}\n/* #173: production home for the fair-copy highlight colours. The module\n   references --proto-str/path/flag/var, whose only definitions lived in the\n   prototype :root blocks; those blocks do not ship (stripBashGraphRoot drops\n   them: global token values would leak across the page). The names resolve\n   here instead, scoped to the graph panel, in both themes. The values are\n   the prototype\'s per-theme stand-ins, kept because they were tuned against\n   this palette; the host --dsw-* tokens they sit beside resolve from the\n   production theme untouched. */\n.tool-render-bash-panel {\n  --proto-str: #9ece6a;\n  --proto-path: #e0af68;\n  --proto-flag: #7aa2f7;\n  --proto-var: #bb9af7;\n}\nhtml[data-theme="light"] .tool-render-bash-panel {\n  --proto-str: #2c7a2c;\n  --proto-path: #9a5b00;\n  --proto-flag: #1d4fd7;\n  --proto-var: #6d28d9;\n}\n';

// node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/languages/javascript.js
var IDENT_RE = "[A-Za-z$_][0-9A-Za-z$_]*";
var KEYWORDS = [
  "as",
  // for exports
  "in",
  "of",
  "if",
  "for",
  "while",
  "finally",
  "var",
  "new",
  "function",
  "do",
  "return",
  "void",
  "else",
  "break",
  "catch",
  "instanceof",
  "with",
  "throw",
  "case",
  "default",
  "try",
  "switch",
  "continue",
  "typeof",
  "delete",
  "let",
  "yield",
  "const",
  "class",
  // JS handles these with a special rule
  // "get",
  // "set",
  "debugger",
  "async",
  "await",
  "static",
  "import",
  "from",
  "export",
  "extends",
  // It's reached stage 3, which is "recommended for implementation":
  "using"
];
var LITERALS = [
  "true",
  "false",
  "null",
  "undefined",
  "NaN",
  "Infinity"
];
var TYPES = [
  // Fundamental objects
  "Object",
  "Function",
  "Boolean",
  "Symbol",
  // numbers and dates
  "Math",
  "Date",
  "Number",
  "BigInt",
  // text
  "String",
  "RegExp",
  // Indexed collections
  "Array",
  "Float32Array",
  "Float64Array",
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Int32Array",
  "Uint16Array",
  "Uint32Array",
  "BigInt64Array",
  "BigUint64Array",
  // Keyed collections
  "Set",
  "Map",
  "WeakSet",
  "WeakMap",
  // Structured data
  "ArrayBuffer",
  "SharedArrayBuffer",
  "Atomics",
  "DataView",
  "JSON",
  // Control abstraction objects
  "Promise",
  "Generator",
  "GeneratorFunction",
  "AsyncFunction",
  // Reflection
  "Reflect",
  "Proxy",
  // Internationalization
  "Intl",
  // WebAssembly
  "WebAssembly"
];
var ERROR_TYPES = [
  "Error",
  "EvalError",
  "InternalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError"
];
var BUILT_IN_GLOBALS = [
  "setInterval",
  "setTimeout",
  "clearInterval",
  "clearTimeout",
  "require",
  "exports",
  "eval",
  "isFinite",
  "isNaN",
  "parseFloat",
  "parseInt",
  "decodeURI",
  "decodeURIComponent",
  "encodeURI",
  "encodeURIComponent",
  "escape",
  "unescape"
];
var BUILT_IN_VARIABLES = [
  "arguments",
  "this",
  "super",
  "console",
  "window",
  "document",
  "localStorage",
  "sessionStorage",
  "module",
  "self",
  "global"
  // Node.js
];
var BUILT_INS = [].concat(
  BUILT_IN_GLOBALS,
  TYPES,
  ERROR_TYPES
);
function javascript(hljs) {
  const regex = hljs.regex;
  const hasClosingTag = (match, { after }) => {
    const tag = "</" + match[0].slice(1);
    const pos = match.input.indexOf(tag, after);
    return pos !== -1;
  };
  const IDENT_RE$1 = IDENT_RE;
  const FRAGMENT = {
    begin: "<>",
    end: "</>"
  };
  const XML_SELF_CLOSING = /<[A-Za-z0-9\\._:-]+\s*\/>/;
  const XML_TAG = {
    begin: /<[A-Za-z0-9\\._:-]+/,
    end: /\/[A-Za-z0-9\\._:-]+>|\/>/,
    /**
     * @param {RegExpMatchArray} match
     * @param {CallbackResponse} response
     */
    isTrulyOpeningTag: (match, response) => {
      const afterMatchIndex = match[0].length + match.index;
      const nextChar = match.input[afterMatchIndex];
      if (
        // HTML should not include another raw `<` inside a tag
        // nested type?
        // `<Array<Array<number>>`, etc.
        nextChar === "<" || // the , gives away that this is not HTML
        // `<T, A extends keyof T, V>`
        nextChar === ","
      ) {
        response.ignoreMatch();
        return;
      }
      if (nextChar === ">") {
        if (!hasClosingTag(match, { after: afterMatchIndex })) {
          response.ignoreMatch();
        }
      }
      let m;
      const afterMatch = match.input.substring(afterMatchIndex);
      if (m = afterMatch.match(/^\s*=/)) {
        response.ignoreMatch();
        return;
      }
      if (m = afterMatch.match(/^\s+extends\s+/)) {
        if (m.index === 0) {
          response.ignoreMatch();
          return;
        }
      }
    }
  };
  const KEYWORDS$1 = {
    $pattern: IDENT_RE,
    keyword: KEYWORDS,
    literal: LITERALS,
    built_in: BUILT_INS,
    "variable.language": BUILT_IN_VARIABLES
  };
  const decimalDigits2 = "[0-9](_?[0-9])*";
  const frac2 = `\\.(${decimalDigits2})`;
  const decimalInteger = `0|[1-9](_?[0-9])*|0[0-7]*[89][0-9]*`;
  const NUMBER = {
    className: "number",
    variants: [
      // DecimalLiteral
      { begin: `(\\b(${decimalInteger})((${frac2})|\\.)?|(${frac2}))[eE][+-]?(${decimalDigits2})\\b` },
      { begin: `\\b(${decimalInteger})\\b((${frac2})\\b|\\.)?|(${frac2})\\b` },
      // DecimalBigIntegerLiteral
      { begin: `\\b(0|[1-9](_?[0-9])*)n\\b` },
      // NonDecimalIntegerLiteral
      { begin: "\\b0[xX][0-9a-fA-F](_?[0-9a-fA-F])*n?\\b" },
      { begin: "\\b0[bB][0-1](_?[0-1])*n?\\b" },
      { begin: "\\b0[oO][0-7](_?[0-7])*n?\\b" },
      // LegacyOctalIntegerLiteral (does not include underscore separators)
      // https://tc39.es/ecma262/#sec-additional-syntax-numeric-literals
      { begin: "\\b0[0-7]+n?\\b" }
    ],
    relevance: 0
  };
  const SUBST = {
    className: "subst",
    begin: "\\$\\{",
    end: "\\}",
    keywords: KEYWORDS$1,
    contains: []
    // defined later
  };
  const HTML_TEMPLATE = {
    begin: ".?html`",
    end: "",
    starts: {
      end: "`",
      returnEnd: false,
      contains: [
        hljs.BACKSLASH_ESCAPE,
        SUBST
      ],
      subLanguage: "xml"
    }
  };
  const CSS_TEMPLATE = {
    begin: ".?css`",
    end: "",
    starts: {
      end: "`",
      returnEnd: false,
      contains: [
        hljs.BACKSLASH_ESCAPE,
        SUBST
      ],
      subLanguage: "css"
    }
  };
  const GRAPHQL_TEMPLATE = {
    begin: ".?gql`",
    end: "",
    starts: {
      end: "`",
      returnEnd: false,
      contains: [
        hljs.BACKSLASH_ESCAPE,
        SUBST
      ],
      subLanguage: "graphql"
    }
  };
  const TEMPLATE_STRING = {
    className: "string",
    begin: "`",
    end: "`",
    contains: [
      hljs.BACKSLASH_ESCAPE,
      SUBST
    ]
  };
  const JSDOC_COMMENT = hljs.COMMENT(
    /\/\*\*(?!\/)/,
    "\\*/",
    {
      relevance: 0,
      contains: [
        {
          begin: "(?=@[A-Za-z]+)",
          relevance: 0,
          contains: [
            {
              className: "doctag",
              begin: "@[A-Za-z]+"
            },
            {
              className: "type",
              begin: "\\{",
              end: "\\}",
              excludeEnd: true,
              excludeBegin: true,
              relevance: 0
            },
            {
              className: "variable",
              begin: IDENT_RE$1 + "(?=\\s*(-)|$)",
              endsParent: true,
              relevance: 0
            },
            // eat spaces (not newlines) so we can find
            // types or variables
            {
              begin: /(?=[^\n])\s/,
              relevance: 0
            }
          ]
        }
      ]
    }
  );
  const COMMENT = {
    className: "comment",
    variants: [
      JSDOC_COMMENT,
      hljs.C_BLOCK_COMMENT_MODE,
      hljs.C_LINE_COMMENT_MODE
    ]
  };
  const SUBST_INTERNALS = [
    hljs.APOS_STRING_MODE,
    hljs.QUOTE_STRING_MODE,
    HTML_TEMPLATE,
    CSS_TEMPLATE,
    GRAPHQL_TEMPLATE,
    TEMPLATE_STRING,
    // Skip numbers when they are part of a variable name
    { match: /\$\d+/ },
    NUMBER
    // This is intentional:
    // See https://github.com/highlightjs/highlight.js/issues/3288
    // hljs.REGEXP_MODE
  ];
  SUBST.contains = SUBST_INTERNALS.concat({
    // we need to pair up {} inside our subst to prevent
    // it from ending too early by matching another }
    begin: /\{/,
    end: /\}/,
    keywords: KEYWORDS$1,
    contains: [
      "self"
    ].concat(SUBST_INTERNALS)
  });
  const SUBST_AND_COMMENTS = [].concat(COMMENT, SUBST.contains);
  const PARAMS_CONTAINS = SUBST_AND_COMMENTS.concat([
    // eat recursive parens in sub expressions
    {
      begin: /(\s*)\(/,
      end: /\)/,
      keywords: KEYWORDS$1,
      contains: ["self"].concat(SUBST_AND_COMMENTS)
    }
  ]);
  const PARAMS = {
    className: "params",
    // convert this to negative lookbehind in v12
    begin: /(\s*)\(/,
    // to match the parms with
    end: /\)/,
    excludeBegin: true,
    excludeEnd: true,
    keywords: KEYWORDS$1,
    contains: PARAMS_CONTAINS
  };
  const CLASS_OR_EXTENDS = {
    variants: [
      // class Car extends vehicle
      {
        match: [
          /class/,
          /\s+/,
          IDENT_RE$1,
          /\s+/,
          /extends/,
          /\s+/,
          regex.concat(IDENT_RE$1, "(", regex.concat(/\./, IDENT_RE$1), ")*")
        ],
        scope: {
          1: "keyword",
          3: "title.class",
          5: "keyword",
          7: "title.class.inherited"
        }
      },
      // class Car
      {
        match: [
          /class/,
          /\s+/,
          IDENT_RE$1
        ],
        scope: {
          1: "keyword",
          3: "title.class"
        }
      }
    ]
  };
  const CLASS_REFERENCE = {
    relevance: 0,
    match: regex.either(
      // Hard coded exceptions
      /\bJSON/,
      // Float32Array, OutT
      /\b[A-Z][a-z]+([A-Z][a-z]*|\d)*/,
      // CSSFactory, CSSFactoryT
      /\b[A-Z]{2,}([A-Z][a-z]+|\d)+([A-Z][a-z]*)*/,
      // FPs, FPsT
      /\b[A-Z]{2,}[a-z]+([A-Z][a-z]+|\d)*([A-Z][a-z]*)*/
      // P
      // single letters are not highlighted
      // BLAH
      // this will be flagged as a UPPER_CASE_CONSTANT instead
    ),
    className: "title.class",
    keywords: {
      _: [
        // se we still get relevance credit for JS library classes
        ...TYPES,
        ...ERROR_TYPES
      ]
    }
  };
  const USE_STRICT = {
    label: "use_strict",
    className: "meta",
    relevance: 10,
    begin: /^\s*['"]use (strict|asm)['"]/
  };
  const FUNCTION_DEFINITION = {
    variants: [
      {
        match: [
          /function/,
          /\s+/,
          IDENT_RE$1,
          /(?=\s*\()/
        ]
      },
      // anonymous function
      {
        match: [
          /function/,
          /\s*(?=\()/
        ]
      }
    ],
    className: {
      1: "keyword",
      3: "title.function"
    },
    label: "func.def",
    contains: [PARAMS],
    illegal: /%/
  };
  const UPPER_CASE_CONSTANT = {
    relevance: 0,
    match: /\b[A-Z][A-Z_0-9]+\b/,
    className: "variable.constant"
  };
  function noneOf(list) {
    return regex.concat("(?!", list.join("|"), ")");
  }
  const FUNCTION_CALL = {
    match: regex.concat(
      /\b/,
      noneOf([
        ...BUILT_IN_GLOBALS,
        "super",
        "import",
        "await"
      ].map((x) => `${x}\\s*\\(`)),
      IDENT_RE$1,
      regex.lookahead(/\s*\(/)
    ),
    className: "title.function",
    relevance: 0
  };
  const PROPERTY_ACCESS = {
    begin: regex.concat(/\./, regex.lookahead(
      regex.concat(IDENT_RE$1, /(?![0-9A-Za-z$_(])/)
    )),
    end: IDENT_RE$1,
    excludeBegin: true,
    keywords: "prototype",
    className: "property",
    relevance: 0
  };
  const GETTER_OR_SETTER = {
    match: [
      /get|set/,
      /\s+/,
      IDENT_RE$1,
      /(?=\()/
    ],
    className: {
      1: "keyword",
      3: "title.function"
    },
    contains: [
      {
        // eat to avoid empty params
        begin: /\(\)/
      },
      PARAMS
    ]
  };
  const FUNC_LEAD_IN_RE = "(\\([^()]*(\\([^()]*(\\([^()]*\\)[^()]*)*\\)[^()]*)*\\)|" + hljs.UNDERSCORE_IDENT_RE + ")\\s*=>";
  const FUNCTION_VARIABLE = {
    match: [
      /const|var|let/,
      /\s+/,
      IDENT_RE$1,
      /\s*/,
      /=\s*/,
      /(async\s*)?/,
      // async is optional
      regex.lookahead(FUNC_LEAD_IN_RE)
    ],
    keywords: "async",
    className: {
      1: "keyword",
      3: "title.function"
    },
    contains: [
      PARAMS
    ]
  };
  return {
    name: "JavaScript",
    aliases: ["js", "jsx", "mjs", "cjs"],
    keywords: KEYWORDS$1,
    // this will be extended by TypeScript
    exports: { PARAMS_CONTAINS, CLASS_REFERENCE },
    illegal: /#(?![$_A-Za-z])/,
    contains: [
      hljs.SHEBANG({
        label: "shebang",
        binary: "node",
        relevance: 5
      }),
      USE_STRICT,
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE,
      HTML_TEMPLATE,
      CSS_TEMPLATE,
      GRAPHQL_TEMPLATE,
      TEMPLATE_STRING,
      COMMENT,
      // Skip numbers when they are part of a variable name
      { match: /\$\d+/ },
      NUMBER,
      CLASS_REFERENCE,
      {
        scope: "attr",
        match: IDENT_RE$1 + regex.lookahead(":"),
        relevance: 0
      },
      FUNCTION_VARIABLE,
      {
        // "value" container
        begin: "(" + hljs.RE_STARTERS_RE + "|\\b(case|return|throw)\\b)\\s*",
        keywords: "return throw case",
        relevance: 0,
        contains: [
          COMMENT,
          hljs.REGEXP_MODE,
          {
            className: "function",
            // we have to count the parens to make sure we actually have the
            // correct bounding ( ) before the =>.  There could be any number of
            // sub-expressions inside also surrounded by parens.
            begin: FUNC_LEAD_IN_RE,
            returnBegin: true,
            end: "\\s*=>",
            contains: [
              {
                className: "params",
                variants: [
                  {
                    begin: hljs.UNDERSCORE_IDENT_RE,
                    relevance: 0
                  },
                  {
                    className: null,
                    begin: /\(\s*\)/,
                    skip: true
                  },
                  {
                    begin: /(\s*)\(/,
                    end: /\)/,
                    excludeBegin: true,
                    excludeEnd: true,
                    keywords: KEYWORDS$1,
                    contains: PARAMS_CONTAINS
                  }
                ]
              }
            ]
          },
          {
            // could be a comma delimited list of params to a function call
            begin: /,/,
            relevance: 0
          },
          {
            match: /\s+/,
            relevance: 0
          },
          {
            // JSX
            variants: [
              { begin: FRAGMENT.begin, end: FRAGMENT.end },
              { match: XML_SELF_CLOSING },
              {
                begin: XML_TAG.begin,
                // we carefully check the opening tag to see if it truly
                // is a tag and not a false positive
                "on:begin": XML_TAG.isTrulyOpeningTag,
                end: XML_TAG.end
              }
            ],
            subLanguage: "xml",
            contains: [
              {
                begin: XML_TAG.begin,
                end: XML_TAG.end,
                skip: true,
                contains: ["self"]
              }
            ]
          }
        ]
      },
      FUNCTION_DEFINITION,
      {
        // prevent this from getting swallowed up by function
        // since they appear "function like"
        beginKeywords: "while if switch catch for"
      },
      {
        // we have to count the parens to make sure we actually have the correct
        // bounding ( ).  There could be any number of sub-expressions inside
        // also surrounded by parens.
        begin: "\\b(?!function)" + hljs.UNDERSCORE_IDENT_RE + "\\([^()]*(\\([^()]*(\\([^()]*\\)[^()]*)*\\)[^()]*)*\\)\\s*\\{",
        // end parens
        returnBegin: true,
        label: "func.def",
        contains: [
          PARAMS,
          hljs.inherit(hljs.TITLE_MODE, { begin: IDENT_RE$1, className: "title.function" })
        ]
      },
      // catch ... so it won't trigger the property rule below
      {
        match: /\.\.\./,
        relevance: 0
      },
      PROPERTY_ACCESS,
      // hack: prevents detection of keywords in some circumstances
      // .keyword()
      // $keyword = x
      {
        match: "\\$" + IDENT_RE$1,
        relevance: 0
      },
      {
        match: [/\bconstructor(?=\s*\()/],
        className: { 1: "title.function" },
        contains: [PARAMS]
      },
      FUNCTION_CALL,
      UPPER_CASE_CONSTANT,
      CLASS_OR_EXTENDS,
      GETTER_OR_SETTER,
      {
        match: /\$[(.]/
        // relevance booster for a pattern common to JS libs: `$(something)` and `$.something`
      }
    ]
  };
}

// node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/languages/typescript.js
var IDENT_RE2 = "[A-Za-z$_][0-9A-Za-z$_]*";
var KEYWORDS2 = [
  "as",
  // for exports
  "in",
  "of",
  "if",
  "for",
  "while",
  "finally",
  "var",
  "new",
  "function",
  "do",
  "return",
  "void",
  "else",
  "break",
  "catch",
  "instanceof",
  "with",
  "throw",
  "case",
  "default",
  "try",
  "switch",
  "continue",
  "typeof",
  "delete",
  "let",
  "yield",
  "const",
  "class",
  // JS handles these with a special rule
  // "get",
  // "set",
  "debugger",
  "async",
  "await",
  "static",
  "import",
  "from",
  "export",
  "extends",
  // It's reached stage 3, which is "recommended for implementation":
  "using"
];
var LITERALS2 = [
  "true",
  "false",
  "null",
  "undefined",
  "NaN",
  "Infinity"
];
var TYPES2 = [
  // Fundamental objects
  "Object",
  "Function",
  "Boolean",
  "Symbol",
  // numbers and dates
  "Math",
  "Date",
  "Number",
  "BigInt",
  // text
  "String",
  "RegExp",
  // Indexed collections
  "Array",
  "Float32Array",
  "Float64Array",
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Int32Array",
  "Uint16Array",
  "Uint32Array",
  "BigInt64Array",
  "BigUint64Array",
  // Keyed collections
  "Set",
  "Map",
  "WeakSet",
  "WeakMap",
  // Structured data
  "ArrayBuffer",
  "SharedArrayBuffer",
  "Atomics",
  "DataView",
  "JSON",
  // Control abstraction objects
  "Promise",
  "Generator",
  "GeneratorFunction",
  "AsyncFunction",
  // Reflection
  "Reflect",
  "Proxy",
  // Internationalization
  "Intl",
  // WebAssembly
  "WebAssembly"
];
var ERROR_TYPES2 = [
  "Error",
  "EvalError",
  "InternalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError"
];
var BUILT_IN_GLOBALS2 = [
  "setInterval",
  "setTimeout",
  "clearInterval",
  "clearTimeout",
  "require",
  "exports",
  "eval",
  "isFinite",
  "isNaN",
  "parseFloat",
  "parseInt",
  "decodeURI",
  "decodeURIComponent",
  "encodeURI",
  "encodeURIComponent",
  "escape",
  "unescape"
];
var BUILT_IN_VARIABLES2 = [
  "arguments",
  "this",
  "super",
  "console",
  "window",
  "document",
  "localStorage",
  "sessionStorage",
  "module",
  "self",
  "global"
  // Node.js
];
var BUILT_INS2 = [].concat(
  BUILT_IN_GLOBALS2,
  TYPES2,
  ERROR_TYPES2
);
function javascript2(hljs) {
  const regex = hljs.regex;
  const hasClosingTag = (match, { after }) => {
    const tag = "</" + match[0].slice(1);
    const pos = match.input.indexOf(tag, after);
    return pos !== -1;
  };
  const IDENT_RE$1 = IDENT_RE2;
  const FRAGMENT = {
    begin: "<>",
    end: "</>"
  };
  const XML_SELF_CLOSING = /<[A-Za-z0-9\\._:-]+\s*\/>/;
  const XML_TAG = {
    begin: /<[A-Za-z0-9\\._:-]+/,
    end: /\/[A-Za-z0-9\\._:-]+>|\/>/,
    /**
     * @param {RegExpMatchArray} match
     * @param {CallbackResponse} response
     */
    isTrulyOpeningTag: (match, response) => {
      const afterMatchIndex = match[0].length + match.index;
      const nextChar = match.input[afterMatchIndex];
      if (
        // HTML should not include another raw `<` inside a tag
        // nested type?
        // `<Array<Array<number>>`, etc.
        nextChar === "<" || // the , gives away that this is not HTML
        // `<T, A extends keyof T, V>`
        nextChar === ","
      ) {
        response.ignoreMatch();
        return;
      }
      if (nextChar === ">") {
        if (!hasClosingTag(match, { after: afterMatchIndex })) {
          response.ignoreMatch();
        }
      }
      let m;
      const afterMatch = match.input.substring(afterMatchIndex);
      if (m = afterMatch.match(/^\s*=/)) {
        response.ignoreMatch();
        return;
      }
      if (m = afterMatch.match(/^\s+extends\s+/)) {
        if (m.index === 0) {
          response.ignoreMatch();
          return;
        }
      }
    }
  };
  const KEYWORDS$1 = {
    $pattern: IDENT_RE2,
    keyword: KEYWORDS2,
    literal: LITERALS2,
    built_in: BUILT_INS2,
    "variable.language": BUILT_IN_VARIABLES2
  };
  const decimalDigits2 = "[0-9](_?[0-9])*";
  const frac2 = `\\.(${decimalDigits2})`;
  const decimalInteger = `0|[1-9](_?[0-9])*|0[0-7]*[89][0-9]*`;
  const NUMBER = {
    className: "number",
    variants: [
      // DecimalLiteral
      { begin: `(\\b(${decimalInteger})((${frac2})|\\.)?|(${frac2}))[eE][+-]?(${decimalDigits2})\\b` },
      { begin: `\\b(${decimalInteger})\\b((${frac2})\\b|\\.)?|(${frac2})\\b` },
      // DecimalBigIntegerLiteral
      { begin: `\\b(0|[1-9](_?[0-9])*)n\\b` },
      // NonDecimalIntegerLiteral
      { begin: "\\b0[xX][0-9a-fA-F](_?[0-9a-fA-F])*n?\\b" },
      { begin: "\\b0[bB][0-1](_?[0-1])*n?\\b" },
      { begin: "\\b0[oO][0-7](_?[0-7])*n?\\b" },
      // LegacyOctalIntegerLiteral (does not include underscore separators)
      // https://tc39.es/ecma262/#sec-additional-syntax-numeric-literals
      { begin: "\\b0[0-7]+n?\\b" }
    ],
    relevance: 0
  };
  const SUBST = {
    className: "subst",
    begin: "\\$\\{",
    end: "\\}",
    keywords: KEYWORDS$1,
    contains: []
    // defined later
  };
  const HTML_TEMPLATE = {
    begin: ".?html`",
    end: "",
    starts: {
      end: "`",
      returnEnd: false,
      contains: [
        hljs.BACKSLASH_ESCAPE,
        SUBST
      ],
      subLanguage: "xml"
    }
  };
  const CSS_TEMPLATE = {
    begin: ".?css`",
    end: "",
    starts: {
      end: "`",
      returnEnd: false,
      contains: [
        hljs.BACKSLASH_ESCAPE,
        SUBST
      ],
      subLanguage: "css"
    }
  };
  const GRAPHQL_TEMPLATE = {
    begin: ".?gql`",
    end: "",
    starts: {
      end: "`",
      returnEnd: false,
      contains: [
        hljs.BACKSLASH_ESCAPE,
        SUBST
      ],
      subLanguage: "graphql"
    }
  };
  const TEMPLATE_STRING = {
    className: "string",
    begin: "`",
    end: "`",
    contains: [
      hljs.BACKSLASH_ESCAPE,
      SUBST
    ]
  };
  const JSDOC_COMMENT = hljs.COMMENT(
    /\/\*\*(?!\/)/,
    "\\*/",
    {
      relevance: 0,
      contains: [
        {
          begin: "(?=@[A-Za-z]+)",
          relevance: 0,
          contains: [
            {
              className: "doctag",
              begin: "@[A-Za-z]+"
            },
            {
              className: "type",
              begin: "\\{",
              end: "\\}",
              excludeEnd: true,
              excludeBegin: true,
              relevance: 0
            },
            {
              className: "variable",
              begin: IDENT_RE$1 + "(?=\\s*(-)|$)",
              endsParent: true,
              relevance: 0
            },
            // eat spaces (not newlines) so we can find
            // types or variables
            {
              begin: /(?=[^\n])\s/,
              relevance: 0
            }
          ]
        }
      ]
    }
  );
  const COMMENT = {
    className: "comment",
    variants: [
      JSDOC_COMMENT,
      hljs.C_BLOCK_COMMENT_MODE,
      hljs.C_LINE_COMMENT_MODE
    ]
  };
  const SUBST_INTERNALS = [
    hljs.APOS_STRING_MODE,
    hljs.QUOTE_STRING_MODE,
    HTML_TEMPLATE,
    CSS_TEMPLATE,
    GRAPHQL_TEMPLATE,
    TEMPLATE_STRING,
    // Skip numbers when they are part of a variable name
    { match: /\$\d+/ },
    NUMBER
    // This is intentional:
    // See https://github.com/highlightjs/highlight.js/issues/3288
    // hljs.REGEXP_MODE
  ];
  SUBST.contains = SUBST_INTERNALS.concat({
    // we need to pair up {} inside our subst to prevent
    // it from ending too early by matching another }
    begin: /\{/,
    end: /\}/,
    keywords: KEYWORDS$1,
    contains: [
      "self"
    ].concat(SUBST_INTERNALS)
  });
  const SUBST_AND_COMMENTS = [].concat(COMMENT, SUBST.contains);
  const PARAMS_CONTAINS = SUBST_AND_COMMENTS.concat([
    // eat recursive parens in sub expressions
    {
      begin: /(\s*)\(/,
      end: /\)/,
      keywords: KEYWORDS$1,
      contains: ["self"].concat(SUBST_AND_COMMENTS)
    }
  ]);
  const PARAMS = {
    className: "params",
    // convert this to negative lookbehind in v12
    begin: /(\s*)\(/,
    // to match the parms with
    end: /\)/,
    excludeBegin: true,
    excludeEnd: true,
    keywords: KEYWORDS$1,
    contains: PARAMS_CONTAINS
  };
  const CLASS_OR_EXTENDS = {
    variants: [
      // class Car extends vehicle
      {
        match: [
          /class/,
          /\s+/,
          IDENT_RE$1,
          /\s+/,
          /extends/,
          /\s+/,
          regex.concat(IDENT_RE$1, "(", regex.concat(/\./, IDENT_RE$1), ")*")
        ],
        scope: {
          1: "keyword",
          3: "title.class",
          5: "keyword",
          7: "title.class.inherited"
        }
      },
      // class Car
      {
        match: [
          /class/,
          /\s+/,
          IDENT_RE$1
        ],
        scope: {
          1: "keyword",
          3: "title.class"
        }
      }
    ]
  };
  const CLASS_REFERENCE = {
    relevance: 0,
    match: regex.either(
      // Hard coded exceptions
      /\bJSON/,
      // Float32Array, OutT
      /\b[A-Z][a-z]+([A-Z][a-z]*|\d)*/,
      // CSSFactory, CSSFactoryT
      /\b[A-Z]{2,}([A-Z][a-z]+|\d)+([A-Z][a-z]*)*/,
      // FPs, FPsT
      /\b[A-Z]{2,}[a-z]+([A-Z][a-z]+|\d)*([A-Z][a-z]*)*/
      // P
      // single letters are not highlighted
      // BLAH
      // this will be flagged as a UPPER_CASE_CONSTANT instead
    ),
    className: "title.class",
    keywords: {
      _: [
        // se we still get relevance credit for JS library classes
        ...TYPES2,
        ...ERROR_TYPES2
      ]
    }
  };
  const USE_STRICT = {
    label: "use_strict",
    className: "meta",
    relevance: 10,
    begin: /^\s*['"]use (strict|asm)['"]/
  };
  const FUNCTION_DEFINITION = {
    variants: [
      {
        match: [
          /function/,
          /\s+/,
          IDENT_RE$1,
          /(?=\s*\()/
        ]
      },
      // anonymous function
      {
        match: [
          /function/,
          /\s*(?=\()/
        ]
      }
    ],
    className: {
      1: "keyword",
      3: "title.function"
    },
    label: "func.def",
    contains: [PARAMS],
    illegal: /%/
  };
  const UPPER_CASE_CONSTANT = {
    relevance: 0,
    match: /\b[A-Z][A-Z_0-9]+\b/,
    className: "variable.constant"
  };
  function noneOf(list) {
    return regex.concat("(?!", list.join("|"), ")");
  }
  const FUNCTION_CALL = {
    match: regex.concat(
      /\b/,
      noneOf([
        ...BUILT_IN_GLOBALS2,
        "super",
        "import",
        "await"
      ].map((x) => `${x}\\s*\\(`)),
      IDENT_RE$1,
      regex.lookahead(/\s*\(/)
    ),
    className: "title.function",
    relevance: 0
  };
  const PROPERTY_ACCESS = {
    begin: regex.concat(/\./, regex.lookahead(
      regex.concat(IDENT_RE$1, /(?![0-9A-Za-z$_(])/)
    )),
    end: IDENT_RE$1,
    excludeBegin: true,
    keywords: "prototype",
    className: "property",
    relevance: 0
  };
  const GETTER_OR_SETTER = {
    match: [
      /get|set/,
      /\s+/,
      IDENT_RE$1,
      /(?=\()/
    ],
    className: {
      1: "keyword",
      3: "title.function"
    },
    contains: [
      {
        // eat to avoid empty params
        begin: /\(\)/
      },
      PARAMS
    ]
  };
  const FUNC_LEAD_IN_RE = "(\\([^()]*(\\([^()]*(\\([^()]*\\)[^()]*)*\\)[^()]*)*\\)|" + hljs.UNDERSCORE_IDENT_RE + ")\\s*=>";
  const FUNCTION_VARIABLE = {
    match: [
      /const|var|let/,
      /\s+/,
      IDENT_RE$1,
      /\s*/,
      /=\s*/,
      /(async\s*)?/,
      // async is optional
      regex.lookahead(FUNC_LEAD_IN_RE)
    ],
    keywords: "async",
    className: {
      1: "keyword",
      3: "title.function"
    },
    contains: [
      PARAMS
    ]
  };
  return {
    name: "JavaScript",
    aliases: ["js", "jsx", "mjs", "cjs"],
    keywords: KEYWORDS$1,
    // this will be extended by TypeScript
    exports: { PARAMS_CONTAINS, CLASS_REFERENCE },
    illegal: /#(?![$_A-Za-z])/,
    contains: [
      hljs.SHEBANG({
        label: "shebang",
        binary: "node",
        relevance: 5
      }),
      USE_STRICT,
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE,
      HTML_TEMPLATE,
      CSS_TEMPLATE,
      GRAPHQL_TEMPLATE,
      TEMPLATE_STRING,
      COMMENT,
      // Skip numbers when they are part of a variable name
      { match: /\$\d+/ },
      NUMBER,
      CLASS_REFERENCE,
      {
        scope: "attr",
        match: IDENT_RE$1 + regex.lookahead(":"),
        relevance: 0
      },
      FUNCTION_VARIABLE,
      {
        // "value" container
        begin: "(" + hljs.RE_STARTERS_RE + "|\\b(case|return|throw)\\b)\\s*",
        keywords: "return throw case",
        relevance: 0,
        contains: [
          COMMENT,
          hljs.REGEXP_MODE,
          {
            className: "function",
            // we have to count the parens to make sure we actually have the
            // correct bounding ( ) before the =>.  There could be any number of
            // sub-expressions inside also surrounded by parens.
            begin: FUNC_LEAD_IN_RE,
            returnBegin: true,
            end: "\\s*=>",
            contains: [
              {
                className: "params",
                variants: [
                  {
                    begin: hljs.UNDERSCORE_IDENT_RE,
                    relevance: 0
                  },
                  {
                    className: null,
                    begin: /\(\s*\)/,
                    skip: true
                  },
                  {
                    begin: /(\s*)\(/,
                    end: /\)/,
                    excludeBegin: true,
                    excludeEnd: true,
                    keywords: KEYWORDS$1,
                    contains: PARAMS_CONTAINS
                  }
                ]
              }
            ]
          },
          {
            // could be a comma delimited list of params to a function call
            begin: /,/,
            relevance: 0
          },
          {
            match: /\s+/,
            relevance: 0
          },
          {
            // JSX
            variants: [
              { begin: FRAGMENT.begin, end: FRAGMENT.end },
              { match: XML_SELF_CLOSING },
              {
                begin: XML_TAG.begin,
                // we carefully check the opening tag to see if it truly
                // is a tag and not a false positive
                "on:begin": XML_TAG.isTrulyOpeningTag,
                end: XML_TAG.end
              }
            ],
            subLanguage: "xml",
            contains: [
              {
                begin: XML_TAG.begin,
                end: XML_TAG.end,
                skip: true,
                contains: ["self"]
              }
            ]
          }
        ]
      },
      FUNCTION_DEFINITION,
      {
        // prevent this from getting swallowed up by function
        // since they appear "function like"
        beginKeywords: "while if switch catch for"
      },
      {
        // we have to count the parens to make sure we actually have the correct
        // bounding ( ).  There could be any number of sub-expressions inside
        // also surrounded by parens.
        begin: "\\b(?!function)" + hljs.UNDERSCORE_IDENT_RE + "\\([^()]*(\\([^()]*(\\([^()]*\\)[^()]*)*\\)[^()]*)*\\)\\s*\\{",
        // end parens
        returnBegin: true,
        label: "func.def",
        contains: [
          PARAMS,
          hljs.inherit(hljs.TITLE_MODE, { begin: IDENT_RE$1, className: "title.function" })
        ]
      },
      // catch ... so it won't trigger the property rule below
      {
        match: /\.\.\./,
        relevance: 0
      },
      PROPERTY_ACCESS,
      // hack: prevents detection of keywords in some circumstances
      // .keyword()
      // $keyword = x
      {
        match: "\\$" + IDENT_RE$1,
        relevance: 0
      },
      {
        match: [/\bconstructor(?=\s*\()/],
        className: { 1: "title.function" },
        contains: [PARAMS]
      },
      FUNCTION_CALL,
      UPPER_CASE_CONSTANT,
      CLASS_OR_EXTENDS,
      GETTER_OR_SETTER,
      {
        match: /\$[(.]/
        // relevance booster for a pattern common to JS libs: `$(something)` and `$.something`
      }
    ]
  };
}
function typescript(hljs) {
  const regex = hljs.regex;
  const tsLanguage = javascript2(hljs);
  const IDENT_RE$1 = IDENT_RE2;
  const TYPES3 = [
    "any",
    "void",
    "number",
    "boolean",
    "string",
    "object",
    "never",
    "symbol",
    "bigint",
    "unknown"
  ];
  const NAMESPACE = {
    begin: [
      /namespace/,
      /\s+/,
      hljs.IDENT_RE
    ],
    beginScope: {
      1: "keyword",
      3: "title.class"
    }
  };
  const INTERFACE = {
    beginKeywords: "interface",
    end: /\{/,
    excludeEnd: true,
    keywords: {
      keyword: "interface extends",
      built_in: TYPES3
    },
    contains: [tsLanguage.exports.CLASS_REFERENCE]
  };
  const USE_STRICT = {
    className: "meta",
    relevance: 10,
    begin: /^\s*['"]use strict['"]/
  };
  const TS_SPECIFIC_KEYWORDS = [
    "type",
    // "namespace",
    "interface",
    "public",
    "private",
    "protected",
    "implements",
    "declare",
    "abstract",
    "readonly",
    "enum",
    "override",
    "satisfies"
  ];
  const KEYWORDS$1 = {
    $pattern: IDENT_RE2,
    keyword: KEYWORDS2.concat(TS_SPECIFIC_KEYWORDS),
    literal: LITERALS2,
    built_in: BUILT_INS2.concat(TYPES3),
    "variable.language": BUILT_IN_VARIABLES2
  };
  const DECORATOR = {
    className: "meta",
    begin: "@" + IDENT_RE$1
  };
  const swapMode = (mode, label, replacement) => {
    const indx = mode.contains.findIndex((m) => m.label === label);
    if (indx === -1) {
      throw new Error("can not find mode to replace");
    }
    mode.contains.splice(indx, 1, replacement);
  };
  Object.assign(tsLanguage.keywords, KEYWORDS$1);
  tsLanguage.exports.PARAMS_CONTAINS.push(DECORATOR);
  const ATTRIBUTE_HIGHLIGHT = tsLanguage.contains.find((c2) => c2.scope === "attr");
  const OPTIONAL_KEY_OR_ARGUMENT = Object.assign(
    {},
    ATTRIBUTE_HIGHLIGHT,
    { match: regex.concat(IDENT_RE$1, regex.lookahead(/\s*\?:/)) }
  );
  tsLanguage.exports.PARAMS_CONTAINS.push([
    tsLanguage.exports.CLASS_REFERENCE,
    // class reference for highlighting the params types
    ATTRIBUTE_HIGHLIGHT,
    // highlight the params key
    OPTIONAL_KEY_OR_ARGUMENT
    // Added for optional property assignment highlighting
  ]);
  tsLanguage.contains = tsLanguage.contains.concat([
    DECORATOR,
    NAMESPACE,
    INTERFACE,
    OPTIONAL_KEY_OR_ARGUMENT
    // Added for optional property assignment highlighting
  ]);
  swapMode(tsLanguage, "shebang", hljs.SHEBANG());
  swapMode(tsLanguage, "use_strict", USE_STRICT);
  const functionDeclaration = tsLanguage.contains.find((m) => m.label === "func.def");
  functionDeclaration.relevance = 0;
  Object.assign(tsLanguage, {
    name: "TypeScript",
    aliases: [
      "ts",
      "tsx",
      "mts",
      "cts"
    ]
  });
  return tsLanguage;
}

// node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/languages/json.js
var EXTENDED_NUMBER_RE = "([-+]?)(\\b0[xX][a-fA-F0-9]+|(\\b\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?)|NaN|[-+]?Infinity";
var EXTENDED_NUMBER_MODE = {
  scope: "number",
  match: EXTENDED_NUMBER_RE,
  relevance: 0
};
function json(hljs) {
  const ATTRIBUTE = {
    className: "attr",
    begin: /(("(\\.|[^\\"\r\n])*")|('(\\.|[^\\'\r\n])*'))(?=\s*:)/,
    relevance: 1.01
  };
  const PUNCTUATION = {
    match: /[{}[\],:]/,
    className: "punctuation",
    relevance: 0
  };
  const LITERALS3 = [
    "true",
    "false",
    "null"
  ];
  const LITERALS_MODE = {
    scope: "literal",
    beginKeywords: LITERALS3.join(" ")
  };
  return {
    name: "JSON",
    aliases: ["jsonc", "json5"],
    keywords: {
      literal: LITERALS3
    },
    contains: [
      ATTRIBUTE,
      PUNCTUATION,
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE,
      LITERALS_MODE,
      EXTENDED_NUMBER_MODE,
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE
    ],
    illegal: "\\S"
  };
}

// node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/languages/python.js
function python(hljs) {
  const regex = hljs.regex;
  const IDENT_RE3 = /[\p{XID_Start}_]\p{XID_Continue}*/u;
  const RESERVED_WORDS2 = [
    "and",
    "as",
    "assert",
    "async",
    "await",
    "break",
    "case",
    "class",
    "continue",
    "def",
    "del",
    "elif",
    "else",
    "except",
    "finally",
    "for",
    "from",
    "global",
    "if",
    "import",
    "in",
    "is",
    "lambda",
    "lazy",
    "match",
    "nonlocal|10",
    "not",
    "or",
    "pass",
    "raise",
    "return",
    "try",
    "while",
    "with",
    "yield"
  ];
  const BUILT_INS3 = [
    "__import__",
    "abs",
    "aiter",
    "all",
    "anext",
    "any",
    "ascii",
    "bin",
    "bool",
    "breakpoint",
    "bytearray",
    "bytes",
    "callable",
    "chr",
    "classmethod",
    "compile",
    "complex",
    "delattr",
    "dict",
    "dir",
    "divmod",
    "enumerate",
    "eval",
    "exec",
    "filter",
    "float",
    "format",
    "frozendict",
    "frozenset",
    "getattr",
    "globals",
    "hasattr",
    "hash",
    "help",
    "hex",
    "id",
    "input",
    "int",
    "isinstance",
    "issubclass",
    "iter",
    "len",
    "list",
    "locals",
    "map",
    "max",
    "memoryview",
    "min",
    "next",
    "object",
    "oct",
    "open",
    "ord",
    "pow",
    "print",
    "property",
    "range",
    "repr",
    "reversed",
    "round",
    "sentinel",
    "set",
    "setattr",
    "slice",
    "sorted",
    "staticmethod",
    "str",
    "sum",
    "super",
    "tuple",
    "type",
    "vars",
    "zip"
  ];
  const LITERALS3 = [
    "__debug__",
    "Ellipsis",
    "False",
    "None",
    "NotImplemented",
    "True"
  ];
  const TYPES3 = [
    "Any",
    "Callable",
    "Coroutine",
    "Dict",
    "List",
    "Literal",
    "Generic",
    "Optional",
    "Sequence",
    "Set",
    "Tuple",
    "Type",
    "Union"
  ];
  const KEYWORDS3 = {
    $pattern: /[A-Za-z]\w+|__\w+__/,
    keyword: RESERVED_WORDS2,
    built_in: BUILT_INS3,
    literal: LITERALS3,
    type: TYPES3
  };
  const PROMPT = {
    className: "meta",
    begin: /^(>>>|\.\.\.) /
  };
  const SUBST = {
    className: "subst",
    begin: /\{/,
    end: /\}/,
    keywords: KEYWORDS3,
    illegal: /#/
  };
  const LITERAL_BRACKET = {
    begin: /\{\{/,
    relevance: 0
  };
  const STRING = {
    className: "string",
    contains: [hljs.BACKSLASH_ESCAPE],
    variants: [
      {
        begin: /([uU]|[bB]|[rR]|[bB][rR]|[rR][bB])?'''/,
        end: /'''/,
        contains: [
          hljs.BACKSLASH_ESCAPE,
          PROMPT
        ],
        relevance: 10
      },
      {
        begin: /([uU]|[bB]|[rR]|[bB][rR]|[rR][bB])?"""/,
        end: /"""/,
        contains: [
          hljs.BACKSLASH_ESCAPE,
          PROMPT
        ],
        relevance: 10
      },
      {
        begin: /([fFtT][rR]|[rR][fFtT]|[fFtT])'''/,
        end: /'''/,
        contains: [
          hljs.BACKSLASH_ESCAPE,
          PROMPT,
          LITERAL_BRACKET,
          SUBST
        ]
      },
      {
        begin: /([fFtT][rR]|[rR][fFtT]|[fFtT])"""/,
        end: /"""/,
        contains: [
          hljs.BACKSLASH_ESCAPE,
          PROMPT,
          LITERAL_BRACKET,
          SUBST
        ]
      },
      {
        begin: /([uU]|[rR])'/,
        end: /'/,
        relevance: 10
      },
      {
        begin: /([uU]|[rR])"/,
        end: /"/,
        relevance: 10
      },
      {
        begin: /([bB]|[bB][rR]|[rR][bB])'/,
        end: /'/
      },
      {
        begin: /([bB]|[bB][rR]|[rR][bB])"/,
        end: /"/
      },
      {
        begin: /([fFtT][rR]|[rR][fFtT]|[fFtT])'/,
        end: /'/,
        contains: [
          hljs.BACKSLASH_ESCAPE,
          LITERAL_BRACKET,
          SUBST
        ]
      },
      {
        begin: /([fFtT][rR]|[rR][fFtT]|[fFtT])"/,
        end: /"/,
        contains: [
          hljs.BACKSLASH_ESCAPE,
          LITERAL_BRACKET,
          SUBST
        ]
      },
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE
    ]
  };
  const digitpart = "[0-9](_?[0-9])*";
  const pointfloat = `(\\b(${digitpart}))?\\.(${digitpart})|\\b(${digitpart})\\.`;
  const lookahead = `\\b|${RESERVED_WORDS2.join("|")}`;
  const NUMBER = {
    className: "number",
    relevance: 0,
    variants: [
      // exponentfloat, pointfloat
      // https://docs.python.org/3.9/reference/lexical_analysis.html#floating-point-literals
      // optionally imaginary
      // https://docs.python.org/3.9/reference/lexical_analysis.html#imaginary-literals
      // Note: no leading \b because floats can start with a decimal point
      // and we don't want to mishandle e.g. `fn(.5)`,
      // no trailing \b for pointfloat because it can end with a decimal point
      // and we don't want to mishandle e.g. `0..hex()`; this should be safe
      // because both MUST contain a decimal point and so cannot be confused with
      // the interior part of an identifier
      {
        begin: `(\\b(${digitpart})|(${pointfloat}))[eE][+-]?(${digitpart})[jJ]?(?=${lookahead})`
      },
      {
        begin: `(${pointfloat})[jJ]?`
      },
      // decinteger, bininteger, octinteger, hexinteger
      // https://docs.python.org/3.9/reference/lexical_analysis.html#integer-literals
      // optionally "long" in Python 2
      // https://docs.python.org/2.7/reference/lexical_analysis.html#integer-and-long-integer-literals
      // decinteger is optionally imaginary
      // https://docs.python.org/3.9/reference/lexical_analysis.html#imaginary-literals
      {
        begin: `\\b([1-9](_?[0-9])*|0+(_?0)*)[lLjJ]?(?=${lookahead})`
      },
      {
        begin: `\\b0[bB](_?[01])+[lL]?(?=${lookahead})`
      },
      {
        begin: `\\b0[oO](_?[0-7])+[lL]?(?=${lookahead})`
      },
      {
        begin: `\\b0[xX](_?[0-9a-fA-F])+[lL]?(?=${lookahead})`
      },
      // imagnumber (digitpart-based)
      // https://docs.python.org/3.9/reference/lexical_analysis.html#imaginary-literals
      {
        begin: `\\b(${digitpart})[jJ](?=${lookahead})`
      }
    ]
  };
  const COMMENT_TYPE = {
    className: "comment",
    begin: regex.lookahead(/# type:/),
    end: /$/,
    keywords: KEYWORDS3,
    contains: [
      {
        // prevent keywords from coloring `type`
        begin: /# type:/
      },
      // comment within a datatype comment includes no keywords
      {
        begin: /#/,
        end: /\b\B/,
        endsWithParent: true
      }
    ]
  };
  const PARAMS = {
    className: "params",
    variants: [
      // Exclude params in functions without params
      {
        className: "",
        begin: /\(\s*\)/,
        skip: true
      },
      {
        begin: /\(/,
        end: /\)/,
        excludeBegin: true,
        excludeEnd: true,
        keywords: KEYWORDS3,
        contains: [
          "self",
          PROMPT,
          NUMBER,
          STRING,
          hljs.HASH_COMMENT_MODE
        ]
      }
    ]
  };
  SUBST.contains = [
    STRING,
    NUMBER,
    PROMPT
  ];
  return {
    name: "Python",
    aliases: [
      "py",
      "gyp",
      "ipython"
    ],
    unicodeRegex: true,
    keywords: KEYWORDS3,
    illegal: /(<\/|\?)|=>/,
    contains: [
      PROMPT,
      NUMBER,
      {
        // very common convention
        scope: "variable.language",
        match: /\bself\b/
      },
      {
        // eat "if" prior to string so that it won't accidentally be
        // labeled as an f-string
        beginKeywords: "if",
        relevance: 0
      },
      { match: /\bor\b/, scope: "keyword" },
      STRING,
      COMMENT_TYPE,
      hljs.HASH_COMMENT_MODE,
      {
        match: [
          /\bdef/,
          /\s+/,
          IDENT_RE3
        ],
        scope: {
          1: "keyword",
          3: "title.function"
        },
        contains: [PARAMS]
      },
      {
        variants: [
          {
            match: [
              /\bclass/,
              /\s+/,
              IDENT_RE3,
              /\s*/,
              /\(\s*/,
              IDENT_RE3,
              /\s*\)/
            ]
          },
          {
            match: [
              /\bclass/,
              /\s+/,
              IDENT_RE3
            ]
          }
        ],
        scope: {
          1: "keyword",
          3: "title.class",
          6: "title.class.inherited"
        }
      },
      {
        className: "meta",
        begin: /^[\t ]*@/,
        end: /(?=#)|$/,
        contains: [
          NUMBER,
          PARAMS,
          STRING
        ]
      }
    ]
  };
}

// node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/languages/bash.js
function bash(hljs) {
  const regex = hljs.regex;
  const VAR = {};
  const BRACED_VAR = {
    begin: /\$\{/,
    end: /\}/,
    contains: [
      "self",
      {
        begin: /:-/,
        contains: [VAR]
      }
      // default values
    ]
  };
  Object.assign(VAR, {
    className: "variable",
    variants: [
      { begin: regex.concat(
        /\$[\w\d#@][\w\d_]*/,
        // negative look-ahead tries to avoid matching patterns that are not
        // Perl at all like $ident$, @ident@, etc.
        `(?![\\w\\d])(?![$])`
      ) },
      BRACED_VAR
    ]
  });
  const SUBST = {
    className: "subst",
    begin: /\$\(/,
    end: /\)/,
    contains: [hljs.BACKSLASH_ESCAPE]
  };
  const COMMENT = hljs.inherit(
    hljs.COMMENT(),
    {
      match: [
        /(^|\s)/,
        /#.*$/
      ],
      scope: {
        2: "comment"
      }
    }
  );
  const HERE_DOC = {
    begin: /<<-?\s*(?=\w+)/,
    starts: { contains: [
      hljs.END_SAME_AS_BEGIN({
        begin: /(\w+)/,
        end: /(\w+)/,
        className: "string"
      })
    ] }
  };
  const QUOTE_STRING = {
    className: "string",
    begin: /"/,
    end: /"/,
    contains: [
      hljs.BACKSLASH_ESCAPE,
      VAR,
      SUBST
    ]
  };
  SUBST.contains.push(QUOTE_STRING);
  const ESCAPED_QUOTE = {
    match: /\\"/
  };
  const APOS_STRING = {
    className: "string",
    begin: /'/,
    end: /'/
  };
  const ESCAPED_APOS = {
    match: /\\'/
  };
  const ARITHMETIC = {
    begin: /\$?\(\(/,
    end: /\)\)/,
    contains: [
      {
        begin: /\d+#[0-9a-f]+/,
        className: "number"
      },
      hljs.NUMBER_MODE,
      VAR
    ]
  };
  const SH_LIKE_SHELLS = [
    "fish",
    "bash",
    "zsh",
    "sh",
    "csh",
    "ksh",
    "tcsh",
    "dash",
    "scsh"
  ];
  const KNOWN_SHEBANG = hljs.SHEBANG({
    binary: `(${SH_LIKE_SHELLS.join("|")})`,
    relevance: 10
  });
  const FUNCTION = {
    className: "function",
    begin: /\w[\w\d_]*\s*\(\s*\)\s*\{/,
    returnBegin: true,
    contains: [hljs.inherit(hljs.TITLE_MODE, { begin: /\w[\w\d_]*/ })],
    relevance: 0
  };
  const KEYWORDS3 = [
    "if",
    "then",
    "else",
    "elif",
    "fi",
    "time",
    "for",
    "while",
    "until",
    "in",
    "do",
    "done",
    "case",
    "esac",
    "coproc",
    "function",
    "select"
  ];
  const LITERALS3 = [
    "true",
    "false"
  ];
  const PATH_MODE = { match: /(\/[a-z._-]+)+/ };
  const SHELL_BUILT_INS = [
    "break",
    "cd",
    "continue",
    "eval",
    "exec",
    "exit",
    "export",
    "getopts",
    "hash",
    "pwd",
    "readonly",
    "return",
    "shift",
    "test",
    "times",
    "trap",
    "umask",
    "unset"
  ];
  const BASH_BUILT_INS = [
    "alias",
    "bind",
    "builtin",
    "caller",
    "command",
    "declare",
    "echo",
    "enable",
    "help",
    "let",
    "local",
    "logout",
    "mapfile",
    "printf",
    "read",
    "readarray",
    "source",
    "sudo",
    "type",
    "typeset",
    "ulimit",
    "unalias"
  ];
  const ZSH_BUILT_INS = [
    "autoload",
    "bg",
    "bindkey",
    "bye",
    "cap",
    "chdir",
    "clone",
    "comparguments",
    "compcall",
    "compctl",
    "compdescribe",
    "compfiles",
    "compgroups",
    "compquote",
    "comptags",
    "comptry",
    "compvalues",
    "dirs",
    "disable",
    "disown",
    "echotc",
    "echoti",
    "emulate",
    "fc",
    "fg",
    "float",
    "functions",
    "getcap",
    "getln",
    "history",
    "integer",
    "jobs",
    "kill",
    "limit",
    "log",
    "noglob",
    "popd",
    "print",
    "pushd",
    "pushln",
    "rehash",
    "sched",
    "setcap",
    "setopt",
    "stat",
    "suspend",
    "ttyctl",
    "unfunction",
    "unhash",
    "unlimit",
    "unsetopt",
    "vared",
    "wait",
    "whence",
    "where",
    "which",
    "zcompile",
    "zformat",
    "zftp",
    "zle",
    "zmodload",
    "zparseopts",
    "zprof",
    "zpty",
    "zregexparse",
    "zsocket",
    "zstyle",
    "ztcp"
  ];
  const GNU_CORE_UTILS = [
    "chcon",
    "chgrp",
    "chown",
    "chmod",
    "cp",
    "dd",
    "df",
    "dir",
    "dircolors",
    "ln",
    "ls",
    "mkdir",
    "mkfifo",
    "mknod",
    "mktemp",
    "mv",
    "realpath",
    "rm",
    "rmdir",
    "shred",
    "sync",
    "touch",
    "truncate",
    "vdir",
    "b2sum",
    "base32",
    "base64",
    "cat",
    "cksum",
    "comm",
    "csplit",
    "cut",
    "expand",
    "fmt",
    "fold",
    "head",
    "join",
    "md5sum",
    "nl",
    "numfmt",
    "od",
    "paste",
    "ptx",
    "pr",
    "sha1sum",
    "sha224sum",
    "sha256sum",
    "sha384sum",
    "sha512sum",
    "shuf",
    "sort",
    "split",
    "sum",
    "tac",
    "tail",
    "tr",
    "tsort",
    "unexpand",
    "uniq",
    "wc",
    "arch",
    "basename",
    "chroot",
    "date",
    "dirname",
    "du",
    "echo",
    "env",
    "expr",
    "factor",
    // "false", // keyword literal already
    "groups",
    "hostid",
    "id",
    "link",
    "logname",
    "nice",
    "nohup",
    "nproc",
    "pathchk",
    "pinky",
    "printenv",
    "printf",
    "pwd",
    "readlink",
    "runcon",
    "seq",
    "sleep",
    "stat",
    "stdbuf",
    "stty",
    "tee",
    "test",
    "timeout",
    // "true", // keyword literal already
    "tty",
    "uname",
    "unlink",
    "uptime",
    "users",
    "who",
    "whoami",
    "yes"
  ];
  return {
    name: "Bash",
    aliases: [
      "sh",
      "zsh"
    ],
    keywords: {
      $pattern: /\b[a-z][a-z0-9._-]+\b/,
      keyword: KEYWORDS3,
      literal: LITERALS3,
      built_in: [
        ...SHELL_BUILT_INS,
        ...BASH_BUILT_INS,
        // Shell modifiers
        "set",
        "shopt",
        ...ZSH_BUILT_INS,
        ...GNU_CORE_UTILS
      ]
    },
    contains: [
      KNOWN_SHEBANG,
      // to catch known shells and boost relevancy
      hljs.SHEBANG(),
      // to catch unknown shells but still highlight the shebang
      FUNCTION,
      ARITHMETIC,
      COMMENT,
      HERE_DOC,
      PATH_MODE,
      QUOTE_STRING,
      ESCAPED_QUOTE,
      APOS_STRING,
      ESCAPED_APOS,
      VAR
    ]
  };
}

// node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/languages/yaml.js
function yaml(hljs) {
  const LITERALS3 = "true false yes no null";
  const URI_CHARACTERS = "[\\w#;/?:@&=+$,.~*'()[\\]]+";
  const KEY = {
    className: "attr",
    variants: [
      // added brackets support and special char support
      { begin: /[\w*@][\w*@ :()\./-]*:(?=[ \t]|$)/ },
      {
        // double quoted keys - with brackets and special char support
        begin: /"[\w*@][\w*@ :()\./-]*":(?=[ \t]|$)/
      },
      {
        // single quoted keys - with brackets and special char support
        begin: /'[\w*@][\w*@ :()\./-]*':(?=[ \t]|$)/
      }
    ]
  };
  const TEMPLATE_VARIABLES = {
    className: "template-variable",
    variants: [
      {
        // jinja templates Ansible
        begin: /\{\{/,
        end: /\}\}/
      },
      {
        // Ruby i18n
        begin: /%\{/,
        end: /\}/
      }
    ]
  };
  const SINGLE_QUOTE_STRING = {
    className: "string",
    relevance: 0,
    begin: /'/,
    end: /'/,
    contains: [
      {
        match: /''/,
        scope: "char.escape",
        relevance: 0
      }
    ]
  };
  const STRING = {
    className: "string",
    relevance: 0,
    variants: [
      {
        begin: /"/,
        end: /"/
      },
      { begin: /\S+/ }
    ],
    contains: [
      hljs.BACKSLASH_ESCAPE,
      TEMPLATE_VARIABLES
    ]
  };
  const CONTAINER_STRING = hljs.inherit(STRING, { variants: [
    {
      begin: /'/,
      end: /'/,
      contains: [
        {
          begin: /''/,
          relevance: 0
        }
      ]
    },
    {
      begin: /"/,
      end: /"/
    },
    { begin: /[^\s,{}[\]]+/ }
  ] });
  const DATE_RE = "[0-9]{4}(-[0-9][0-9]){0,2}";
  const TIME_RE = "([Tt \\t][0-9][0-9]?(:[0-9][0-9]){2})?";
  const FRACTION_RE = "(\\.[0-9]*)?";
  const ZONE_RE = "([ \\t])*(Z|[-+][0-9][0-9]?(:[0-9][0-9])?)?";
  const TIMESTAMP = {
    className: "number",
    begin: "\\b" + DATE_RE + TIME_RE + FRACTION_RE + ZONE_RE + "\\b"
  };
  const VALUE_CONTAINER = {
    end: ",",
    endsWithParent: true,
    excludeEnd: true,
    keywords: LITERALS3,
    relevance: 0
  };
  const OBJECT = {
    begin: /\{/,
    end: /\}/,
    contains: [VALUE_CONTAINER],
    illegal: "\\n",
    relevance: 0
  };
  const ARRAY = {
    begin: "\\[",
    end: "\\]",
    contains: [VALUE_CONTAINER],
    illegal: "\\n",
    relevance: 0
  };
  const MODES2 = [
    KEY,
    {
      className: "meta",
      begin: "^---\\s*$",
      relevance: 10
    },
    {
      // multi line string
      // Blocks start with a | or > followed by a newline
      //
      // Indentation of subsequent lines must be the same to
      // be considered part of the block
      className: "string",
      begin: "[\\|>]([1-9]?[+-])?[ ]*\\n( +)[^ ][^\\n]*\\n(\\2[^\\n]+\\n?)*"
    },
    {
      // Ruby/Rails erb
      begin: "<%[%=-]?",
      end: "[%-]?%>",
      subLanguage: "ruby",
      excludeBegin: true,
      excludeEnd: true,
      relevance: 0
    },
    {
      // named tags
      className: "type",
      begin: "!\\w+!" + URI_CHARACTERS
    },
    // https://yaml.org/spec/1.2/spec.html#id2784064
    {
      // verbatim tags
      className: "type",
      begin: "!<" + URI_CHARACTERS + ">"
    },
    {
      // primary tags
      className: "type",
      begin: "!" + URI_CHARACTERS
    },
    {
      // secondary tags
      className: "type",
      begin: "!!" + URI_CHARACTERS
    },
    {
      // fragment id &ref
      className: "meta",
      begin: "&" + hljs.UNDERSCORE_IDENT_RE + "$"
    },
    {
      // fragment reference *ref
      className: "meta",
      begin: "\\*" + hljs.UNDERSCORE_IDENT_RE + "$"
    },
    {
      // array listing
      className: "bullet",
      // TODO: remove |$ hack when we have proper look-ahead support
      begin: "-(?=[ ]|$)",
      relevance: 0
    },
    hljs.HASH_COMMENT_MODE,
    {
      beginKeywords: LITERALS3,
      keywords: { literal: LITERALS3 }
    },
    TIMESTAMP,
    // numbers are any valid C-style number that
    // sit isolated from other words
    {
      className: "number",
      begin: hljs.C_NUMBER_RE + "\\b",
      relevance: 0
    },
    OBJECT,
    ARRAY,
    SINGLE_QUOTE_STRING,
    STRING
  ];
  const VALUE_MODES = [...MODES2];
  VALUE_MODES.pop();
  VALUE_MODES.push(CONTAINER_STRING);
  VALUE_CONTAINER.contains = VALUE_MODES;
  return {
    name: "YAML",
    case_insensitive: true,
    aliases: ["yml"],
    contains: MODES2
  };
}

// node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/languages/markdown.js
function markdown(hljs) {
  const regex = hljs.regex;
  const INLINE_HTML = {
    begin: /<\/?[A-Za-z_]/,
    end: ">",
    subLanguage: "xml",
    relevance: 0
  };
  const HORIZONTAL_RULE = { match: /^ {0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/ };
  const CODE = {
    className: "code",
    variants: [
      // TODO: fix to allow these to work with sublanguage also
      { begin: "(`{3,})[^`](.|\\n)*?\\1`*[ ]*" },
      { begin: "(~{3,})[^~](.|\\n)*?\\1~*[ ]*" },
      // needed to allow markdown as a sublanguage to work
      {
        begin: "```",
        end: "```+[ ]*$"
      },
      {
        begin: "~~~",
        end: "~~~+[ ]*$"
      },
      { begin: "`.+?`" },
      {
        begin: "(?=^( {4}|\\t))",
        // use contains to gobble up multiple lines to allow the block to be whatever size
        // but only have a single open/close tag vs one per line
        contains: [
          {
            begin: "^( {4}|\\t)",
            end: "(\\n)$"
          }
        ],
        relevance: 0
      }
    ]
  };
  const LIST = {
    className: "bullet",
    begin: "^[ 	]*([*+-]|(\\d+\\.))(?=\\s+)",
    end: "\\s+",
    excludeEnd: true
  };
  const LINK_REFERENCE = {
    begin: /^\[[^\n]+\]:/,
    returnBegin: true,
    contains: [
      {
        className: "symbol",
        begin: /\[/,
        end: /\]/,
        excludeBegin: true,
        excludeEnd: true
      },
      {
        className: "link",
        begin: /:\s*/,
        end: /$/,
        excludeBegin: true
      }
    ]
  };
  const URL_SCHEME = /[A-Za-z][A-Za-z0-9+.-]*/;
  const LINK = {
    variants: [
      // too much like nested array access in so many languages
      // to have any real relevance
      {
        begin: /\[.+?\]\[.*?\]/,
        relevance: 0
      },
      // popular internet URLs
      {
        begin: /\[.+?\]\(((data|javascript|mailto):|(?:http|ftp)s?:\/\/).*?\)/,
        relevance: 2
      },
      {
        begin: regex.concat(/\[.+?\]\(/, URL_SCHEME, /:\/\/.*?\)/),
        relevance: 2
      },
      // relative urls
      {
        begin: /\[.+?\]\([./?&#].*?\)/,
        relevance: 1
      },
      // whatever else, lower relevance (might not be a link at all)
      {
        begin: /\[.*?\]\(.*?\)/,
        relevance: 0
      }
    ],
    returnBegin: true,
    contains: [
      {
        // empty strings for alt or link text
        match: /\[(?=\])/
      },
      {
        className: "string",
        relevance: 0,
        begin: "\\[",
        end: "\\]",
        excludeBegin: true,
        returnEnd: true
      },
      {
        className: "link",
        relevance: 0,
        begin: "\\]\\(",
        end: "\\)",
        excludeBegin: true,
        excludeEnd: true
      },
      {
        className: "symbol",
        relevance: 0,
        begin: "\\]\\[",
        end: "\\]",
        excludeBegin: true,
        excludeEnd: true
      }
    ]
  };
  const BOLD = {
    className: "strong",
    contains: [],
    // defined later
    variants: [
      {
        begin: /_{2}(?!\s)/,
        end: /_{2}/
      },
      {
        begin: /\*{2}(?!\s)/,
        end: /\*{2}/
      }
    ]
  };
  const ITALIC = {
    className: "emphasis",
    contains: [],
    // defined later
    variants: [
      {
        begin: /\*(?![*\s])/,
        end: /\*/
      },
      {
        begin: /_(?![_\s])/,
        end: /_/,
        relevance: 0
      }
    ]
  };
  const BOLD_WITHOUT_ITALIC = hljs.inherit(BOLD, { contains: [] });
  const ITALIC_WITHOUT_BOLD = hljs.inherit(ITALIC, { contains: [] });
  BOLD.contains.push(ITALIC_WITHOUT_BOLD);
  ITALIC.contains.push(BOLD_WITHOUT_ITALIC);
  let CONTAINABLE = [
    INLINE_HTML,
    LINK
  ];
  [
    BOLD,
    ITALIC,
    BOLD_WITHOUT_ITALIC,
    ITALIC_WITHOUT_BOLD
  ].forEach((m) => {
    m.contains = m.contains.concat(CONTAINABLE);
  });
  CONTAINABLE = CONTAINABLE.concat(BOLD, ITALIC);
  const HEADER = {
    className: "section",
    variants: [
      {
        begin: "^#{1,6}",
        end: "$",
        contains: CONTAINABLE
      },
      {
        begin: "(?=^.+?\\n[=-]{2,}$)",
        contains: [
          { begin: "^[=-]*$" },
          {
            begin: "^",
            end: "\\n",
            contains: CONTAINABLE
          }
        ]
      }
    ]
  };
  const BLOCKQUOTE = {
    className: "quote",
    begin: "^>\\s+",
    contains: CONTAINABLE,
    end: "$"
  };
  const ENTITY = {
    //https://spec.commonmark.org/0.31.2/#entity-references
    scope: "literal",
    match: /&([a-zA-Z0-9]+|#[0-9]{1,7}|#[Xx][0-9a-fA-F]{1,6});/
  };
  return {
    name: "Markdown",
    aliases: [
      "md",
      "mkdown",
      "mkd"
    ],
    contains: [
      HEADER,
      INLINE_HTML,
      LIST,
      // must come before BOLD/ITALIC so that a `***` or `___` thematic break
      // isn't mistaken for the start of bold text
      HORIZONTAL_RULE,
      BOLD,
      ITALIC,
      BLOCKQUOTE,
      CODE,
      LINK,
      LINK_REFERENCE,
      ENTITY
    ]
  };
}

// node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/languages/css.js
var MODES = (hljs) => {
  return {
    IMPORTANT: {
      scope: "meta",
      begin: "!important"
    },
    BLOCK_COMMENT: hljs.C_BLOCK_COMMENT_MODE,
    HEXCOLOR: {
      scope: "number",
      begin: /#(([0-9a-fA-F]{3,4})|(([0-9a-fA-F]{2}){3,4}))\b/
    },
    UNICODE_RANGE: {
      scope: "number",
      begin: /\b[Uu]\+[0-9A-Fa-f][0-9A-Fa-f?]{0,5}(-[0-9A-Fa-f][0-9A-Fa-f]{0,5})?/
    },
    FUNCTION_DISPATCH: {
      className: "built_in",
      begin: /[\w-]+(?=\()/
    },
    ATTRIBUTE_SELECTOR_MODE: {
      scope: "selector-attr",
      begin: /\[/,
      end: /\]/,
      illegal: "$",
      contains: [
        hljs.APOS_STRING_MODE,
        hljs.QUOTE_STRING_MODE
      ]
    },
    CSS_NUMBER_MODE: {
      scope: "number",
      begin: hljs.NUMBER_RE + "(%|em|ex|ch|rem|vw|vh|vmin|vmax|cm|mm|in|pt|pc|px|deg|grad|rad|turn|s|ms|Hz|kHz|dpi|dpcm|dppx)?",
      relevance: 0
    },
    CSS_VARIABLE: {
      className: "attr",
      begin: /--[A-Za-z_][A-Za-z0-9_-]*/
    }
  };
};
var HTML_TAGS = [
  "a",
  "abbr",
  "address",
  "article",
  "aside",
  "audio",
  "b",
  "blockquote",
  "body",
  "button",
  "canvas",
  "caption",
  "cite",
  "code",
  "dd",
  "del",
  "details",
  "dfn",
  "div",
  "dl",
  "dt",
  "em",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "html",
  "i",
  "iframe",
  "img",
  "input",
  "ins",
  "kbd",
  "label",
  "legend",
  "li",
  "main",
  "mark",
  "menu",
  "nav",
  "object",
  "ol",
  "optgroup",
  "option",
  "p",
  "picture",
  "q",
  "quote",
  "samp",
  "section",
  "select",
  "source",
  "span",
  "strong",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "ul",
  "var",
  "video"
];
var SVG_TAGS = [
  "defs",
  "g",
  "marker",
  "mask",
  "pattern",
  "svg",
  "switch",
  "symbol",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feComposite",
  "feConvolveMatrix",
  "feDiffuseLighting",
  "feDisplacementMap",
  "feFlood",
  "feGaussianBlur",
  "feImage",
  "feMerge",
  "feMorphology",
  "feOffset",
  "feSpecularLighting",
  "feTile",
  "feTurbulence",
  "linearGradient",
  "radialGradient",
  "stop",
  "circle",
  "ellipse",
  "image",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
  "text",
  "use",
  "textPath",
  "tspan",
  "foreignObject",
  "clipPath"
];
var TAGS = [
  ...HTML_TAGS,
  ...SVG_TAGS
];
var MEDIA_FEATURES = [
  "any-hover",
  "any-pointer",
  "aspect-ratio",
  "color",
  "color-gamut",
  "color-index",
  "device-aspect-ratio",
  "device-height",
  "device-width",
  "display-mode",
  "forced-colors",
  "grid",
  "height",
  "hover",
  "inverted-colors",
  "monochrome",
  "orientation",
  "overflow-block",
  "overflow-inline",
  "pointer",
  "prefers-color-scheme",
  "prefers-contrast",
  "prefers-reduced-motion",
  "prefers-reduced-transparency",
  "resolution",
  "scan",
  "scripting",
  "update",
  "width",
  // TODO: find a better solution?
  "min-width",
  "max-width",
  "min-height",
  "max-height"
].sort().reverse();
var PSEUDO_CLASSES = [
  "active",
  "any-link",
  "blank",
  "checked",
  "current",
  "default",
  "defined",
  "dir",
  // dir()
  "disabled",
  "drop",
  "empty",
  "enabled",
  "first",
  "first-child",
  "first-of-type",
  "fullscreen",
  "future",
  "focus",
  "focus-visible",
  "focus-within",
  "has",
  // has()
  "host",
  // host or host()
  "host-context",
  // host-context()
  "hover",
  "indeterminate",
  "in-range",
  "invalid",
  "is",
  // is()
  "lang",
  // lang()
  "last-child",
  "last-of-type",
  "left",
  "link",
  "local-link",
  "not",
  // not()
  "nth-child",
  // nth-child()
  "nth-col",
  // nth-col()
  "nth-last-child",
  // nth-last-child()
  "nth-last-col",
  // nth-last-col()
  "nth-last-of-type",
  //nth-last-of-type()
  "nth-of-type",
  //nth-of-type()
  "only-child",
  "only-of-type",
  "optional",
  "out-of-range",
  "past",
  "placeholder-shown",
  "read-only",
  "read-write",
  "required",
  "right",
  "root",
  "scope",
  "target",
  "target-within",
  "user-invalid",
  "valid",
  "visited",
  "where"
  // where()
].sort().reverse();
var PSEUDO_ELEMENTS = [
  "after",
  "backdrop",
  "before",
  "cue",
  "cue-region",
  "first-letter",
  "first-line",
  "grammar-error",
  "marker",
  "part",
  "placeholder",
  "selection",
  "slotted",
  "spelling-error"
].sort().reverse();
var ATTRIBUTES = [
  "accent-color",
  "align-content",
  "align-items",
  "align-self",
  "alignment-baseline",
  "all",
  "anchor-name",
  "animation",
  "animation-composition",
  "animation-delay",
  "animation-direction",
  "animation-duration",
  "animation-fill-mode",
  "animation-iteration-count",
  "animation-name",
  "animation-play-state",
  "animation-range",
  "animation-range-end",
  "animation-range-start",
  "animation-timeline",
  "animation-timing-function",
  "appearance",
  "aspect-ratio",
  "backdrop-filter",
  "backface-visibility",
  "background",
  "background-attachment",
  "background-blend-mode",
  "background-clip",
  "background-color",
  "background-image",
  "background-origin",
  "background-position",
  "background-position-x",
  "background-position-y",
  "background-repeat",
  "background-size",
  "baseline-shift",
  "block-size",
  "border",
  "border-block",
  "border-block-color",
  "border-block-end",
  "border-block-end-color",
  "border-block-end-style",
  "border-block-end-width",
  "border-block-start",
  "border-block-start-color",
  "border-block-start-style",
  "border-block-start-width",
  "border-block-style",
  "border-block-width",
  "border-bottom",
  "border-bottom-color",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "border-bottom-style",
  "border-bottom-width",
  "border-collapse",
  "border-color",
  "border-end-end-radius",
  "border-end-start-radius",
  "border-image",
  "border-image-outset",
  "border-image-repeat",
  "border-image-slice",
  "border-image-source",
  "border-image-width",
  "border-inline",
  "border-inline-color",
  "border-inline-end",
  "border-inline-end-color",
  "border-inline-end-style",
  "border-inline-end-width",
  "border-inline-start",
  "border-inline-start-color",
  "border-inline-start-style",
  "border-inline-start-width",
  "border-inline-style",
  "border-inline-width",
  "border-left",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-radius",
  "border-right",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-spacing",
  "border-start-end-radius",
  "border-start-start-radius",
  "border-style",
  "border-top",
  "border-top-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-top-style",
  "border-top-width",
  "border-width",
  "bottom",
  "box-align",
  "box-decoration-break",
  "box-direction",
  "box-flex",
  "box-flex-group",
  "box-lines",
  "box-ordinal-group",
  "box-orient",
  "box-pack",
  "box-shadow",
  "box-sizing",
  "break-after",
  "break-before",
  "break-inside",
  "caption-side",
  "caret-color",
  "clear",
  "clip",
  "clip-path",
  "clip-rule",
  "color",
  "color-interpolation",
  "color-interpolation-filters",
  "color-profile",
  "color-rendering",
  "color-scheme",
  "column-count",
  "column-fill",
  "column-gap",
  "column-rule",
  "column-rule-color",
  "column-rule-style",
  "column-rule-width",
  "column-span",
  "column-width",
  "columns",
  "contain",
  "contain-intrinsic-block-size",
  "contain-intrinsic-height",
  "contain-intrinsic-inline-size",
  "contain-intrinsic-size",
  "contain-intrinsic-width",
  "container",
  "container-name",
  "container-type",
  "content",
  "content-visibility",
  "corner-bottom-left-shape",
  "corner-bottom-right-shape",
  "corner-shape",
  "corner-top-left-shape",
  "corner-top-right-shape",
  "counter-increment",
  "counter-reset",
  "counter-set",
  "cue",
  "cue-after",
  "cue-before",
  "cursor",
  "cx",
  "cy",
  "direction",
  "display",
  "dominant-baseline",
  "empty-cells",
  "enable-background",
  "field-sizing",
  "fill",
  "fill-opacity",
  "fill-rule",
  "filter",
  "flex",
  "flex-basis",
  "flex-direction",
  "flex-flow",
  "flex-grow",
  "flex-shrink",
  "flex-wrap",
  "float",
  "flood-color",
  "flood-opacity",
  "flow",
  "font",
  "font-display",
  "font-family",
  "font-feature-settings",
  "font-kerning",
  "font-language-override",
  "font-optical-sizing",
  "font-palette",
  "font-size",
  "font-size-adjust",
  "font-smooth",
  "font-smoothing",
  "font-stretch",
  "font-style",
  "font-synthesis",
  "font-synthesis-position",
  "font-synthesis-small-caps",
  "font-synthesis-style",
  "font-synthesis-weight",
  "font-variant",
  "font-variant-alternates",
  "font-variant-caps",
  "font-variant-east-asian",
  "font-variant-emoji",
  "font-variant-ligatures",
  "font-variant-numeric",
  "font-variant-position",
  "font-variation-settings",
  "font-weight",
  "forced-color-adjust",
  "gap",
  "glyph-orientation-horizontal",
  "glyph-orientation-vertical",
  "grid",
  "grid-area",
  "grid-auto-columns",
  "grid-auto-flow",
  "grid-auto-rows",
  "grid-column",
  "grid-column-end",
  "grid-column-start",
  "grid-gap",
  "grid-row",
  "grid-row-end",
  "grid-row-start",
  "grid-template",
  "grid-template-areas",
  "grid-template-columns",
  "grid-template-rows",
  "hanging-punctuation",
  "height",
  "hyphenate-character",
  "hyphenate-limit-chars",
  "hyphens",
  "icon",
  "image-orientation",
  "image-rendering",
  "image-resolution",
  "ime-mode",
  "initial-letter",
  "initial-letter-align",
  "inline-size",
  "inset",
  "inset-area",
  "inset-block",
  "inset-block-end",
  "inset-block-start",
  "inset-inline",
  "inset-inline-end",
  "inset-inline-start",
  "isolation",
  "justify-content",
  "justify-items",
  "justify-self",
  "kerning",
  "left",
  "letter-spacing",
  "lighting-color",
  "line-break",
  "line-height",
  "line-height-step",
  "list-style",
  "list-style-image",
  "list-style-position",
  "list-style-type",
  "margin",
  "margin-block",
  "margin-block-end",
  "margin-block-start",
  "margin-bottom",
  "margin-inline",
  "margin-inline-end",
  "margin-inline-start",
  "margin-left",
  "margin-right",
  "margin-top",
  "margin-trim",
  "marker",
  "marker-end",
  "marker-mid",
  "marker-start",
  "marks",
  "mask",
  "mask-border",
  "mask-border-mode",
  "mask-border-outset",
  "mask-border-repeat",
  "mask-border-slice",
  "mask-border-source",
  "mask-border-width",
  "mask-clip",
  "mask-composite",
  "mask-image",
  "mask-mode",
  "mask-origin",
  "mask-position",
  "mask-repeat",
  "mask-size",
  "mask-type",
  "masonry-auto-flow",
  "math-depth",
  "math-shift",
  "math-style",
  "max-block-size",
  "max-height",
  "max-inline-size",
  "max-width",
  "min-block-size",
  "min-height",
  "min-inline-size",
  "min-width",
  "mix-blend-mode",
  "nav-down",
  "nav-index",
  "nav-left",
  "nav-right",
  "nav-up",
  "none",
  "normal",
  "object-fit",
  "object-position",
  "offset",
  "offset-anchor",
  "offset-distance",
  "offset-path",
  "offset-position",
  "offset-rotate",
  "opacity",
  "order",
  "orphans",
  "outline",
  "outline-color",
  "outline-offset",
  "outline-style",
  "outline-width",
  "overflow",
  "overflow-anchor",
  "overflow-block",
  "overflow-clip-margin",
  "overflow-inline",
  "overflow-wrap",
  "overflow-x",
  "overflow-y",
  "overlay",
  "overscroll-behavior",
  "overscroll-behavior-block",
  "overscroll-behavior-inline",
  "overscroll-behavior-x",
  "overscroll-behavior-y",
  "padding",
  "padding-block",
  "padding-block-end",
  "padding-block-start",
  "padding-bottom",
  "padding-inline",
  "padding-inline-end",
  "padding-inline-start",
  "padding-left",
  "padding-right",
  "padding-top",
  "page",
  "page-break-after",
  "page-break-before",
  "page-break-inside",
  "paint-order",
  "pause",
  "pause-after",
  "pause-before",
  "perspective",
  "perspective-origin",
  "place-content",
  "place-items",
  "place-self",
  "pointer-events",
  "position",
  "position-anchor",
  "position-visibility",
  "print-color-adjust",
  "quotes",
  "r",
  "resize",
  "rest",
  "rest-after",
  "rest-before",
  "right",
  "rotate",
  "row-gap",
  "ruby-align",
  "ruby-position",
  "scale",
  "scroll-behavior",
  "scroll-margin",
  "scroll-margin-block",
  "scroll-margin-block-end",
  "scroll-margin-block-start",
  "scroll-margin-bottom",
  "scroll-margin-inline",
  "scroll-margin-inline-end",
  "scroll-margin-inline-start",
  "scroll-margin-left",
  "scroll-margin-right",
  "scroll-margin-top",
  "scroll-padding",
  "scroll-padding-block",
  "scroll-padding-block-end",
  "scroll-padding-block-start",
  "scroll-padding-bottom",
  "scroll-padding-inline",
  "scroll-padding-inline-end",
  "scroll-padding-inline-start",
  "scroll-padding-left",
  "scroll-padding-right",
  "scroll-padding-top",
  "scroll-snap-align",
  "scroll-snap-stop",
  "scroll-snap-type",
  "scroll-timeline",
  "scroll-timeline-axis",
  "scroll-timeline-name",
  "scrollbar-color",
  "scrollbar-gutter",
  "scrollbar-width",
  "shape-image-threshold",
  "shape-margin",
  "shape-outside",
  "shape-rendering",
  "speak",
  "speak-as",
  "src",
  // @font-face
  "stop-color",
  "stop-opacity",
  "stroke",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-opacity",
  "stroke-width",
  "tab-size",
  "table-layout",
  "text-align",
  "text-align-all",
  "text-align-last",
  "text-anchor",
  "text-combine-upright",
  "text-decoration",
  "text-decoration-color",
  "text-decoration-line",
  "text-decoration-skip",
  "text-decoration-skip-ink",
  "text-decoration-style",
  "text-decoration-thickness",
  "text-emphasis",
  "text-emphasis-color",
  "text-emphasis-position",
  "text-emphasis-style",
  "text-indent",
  "text-justify",
  "text-orientation",
  "text-overflow",
  "text-rendering",
  "text-shadow",
  "text-size-adjust",
  "text-transform",
  "text-underline-offset",
  "text-underline-position",
  "text-wrap",
  "text-wrap-mode",
  "text-wrap-style",
  "timeline-scope",
  "top",
  "touch-action",
  "transform",
  "transform-box",
  "transform-origin",
  "transform-style",
  "transition",
  "transition-behavior",
  "transition-delay",
  "transition-duration",
  "transition-property",
  "transition-timing-function",
  "translate",
  "unicode-bidi",
  "unicode-range",
  "user-modify",
  "user-select",
  "vector-effect",
  "vertical-align",
  "view-timeline",
  "view-timeline-axis",
  "view-timeline-inset",
  "view-timeline-name",
  "view-transition-name",
  "visibility",
  "voice-balance",
  "voice-duration",
  "voice-family",
  "voice-pitch",
  "voice-range",
  "voice-rate",
  "voice-stress",
  "voice-volume",
  "white-space",
  "white-space-collapse",
  "widows",
  "width",
  "will-change",
  "word-break",
  "word-spacing",
  "word-wrap",
  "writing-mode",
  "x",
  "y",
  "z-index",
  "zoom"
].sort().reverse();
function css(hljs) {
  const regex = hljs.regex;
  const modes = MODES(hljs);
  const VENDOR_PREFIX = { begin: /-(webkit|moz|ms|o)-(?=[a-z])/ };
  const AT_MODIFIERS = "and or not only";
  const AT_PROPERTY_RE = /@-?\w[\w]*(-\w+)*/;
  const IDENT_RE3 = "[a-zA-Z-][a-zA-Z0-9_-]*";
  const STRINGS = [
    hljs.APOS_STRING_MODE,
    hljs.QUOTE_STRING_MODE
  ];
  return {
    name: "CSS",
    case_insensitive: true,
    illegal: /[=|'\$]/,
    keywords: { keyframePosition: "from to" },
    classNameAliases: {
      // for visual continuity with `tag {}` and because we
      // don't have a great class for this?
      keyframePosition: "selector-tag"
    },
    contains: [
      modes.BLOCK_COMMENT,
      VENDOR_PREFIX,
      // to recognize keyframe 40% etc which are outside the scope of our
      // attribute value mode
      modes.CSS_NUMBER_MODE,
      {
        className: "selector-id",
        begin: /#[A-Za-z0-9_-]+/,
        relevance: 0
      },
      {
        className: "selector-class",
        begin: "\\." + IDENT_RE3,
        relevance: 0
      },
      modes.ATTRIBUTE_SELECTOR_MODE,
      {
        className: "selector-pseudo",
        variants: [
          { begin: ":(" + PSEUDO_CLASSES.join("|") + ")" },
          { begin: ":(:)?(" + PSEUDO_ELEMENTS.join("|") + ")" }
        ]
      },
      // we may actually need this (12/2020)
      // { // pseudo-selector params
      //   begin: /\(/,
      //   end: /\)/,
      //   contains: [ hljs.CSS_NUMBER_MODE ]
      // },
      modes.CSS_VARIABLE,
      {
        className: "attribute",
        begin: "\\b(" + ATTRIBUTES.join("|") + ")\\b"
      },
      // attribute values
      {
        begin: /:/,
        end: /[;}{]/,
        contains: [
          modes.BLOCK_COMMENT,
          modes.HEXCOLOR,
          modes.IMPORTANT,
          modes.CSS_NUMBER_MODE,
          modes.UNICODE_RANGE,
          ...STRINGS,
          // needed to highlight these as strings and to avoid issues with
          // illegal characters that might be inside urls that would trigger the
          // languages illegal stack
          {
            begin: /(url|data-uri)\(/,
            end: /\)/,
            relevance: 0,
            // from keywords
            keywords: { built_in: "url data-uri" },
            contains: [
              ...STRINGS,
              {
                className: "string",
                // any character other than `)` as in `url()` will be the start
                // of a string, which ends with `)` (from the parent mode)
                begin: /[^)]/,
                endsWithParent: true,
                excludeEnd: true
              }
            ]
          },
          modes.FUNCTION_DISPATCH
        ]
      },
      {
        begin: regex.lookahead(/@/),
        end: "[{;]",
        relevance: 0,
        illegal: /:/,
        // break on Less variables @var: ...
        contains: [
          {
            className: "keyword",
            begin: AT_PROPERTY_RE
          },
          {
            begin: /\s/,
            endsWithParent: true,
            excludeEnd: true,
            relevance: 0,
            keywords: {
              $pattern: /[a-z-]+/,
              keyword: AT_MODIFIERS,
              attribute: MEDIA_FEATURES.join(" ")
            },
            contains: [
              {
                begin: /[a-z-]+(?=:)/,
                className: "attribute"
              },
              ...STRINGS,
              modes.CSS_NUMBER_MODE
            ]
          }
        ]
      },
      {
        className: "selector-tag",
        begin: "\\b(" + TAGS.join("|") + ")\\b"
      }
    ]
  };
}

// node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/languages/xml.js
function xml(hljs) {
  const regex = hljs.regex;
  const TAG_NAME_RE = regex.concat(/[\p{L}_]/u, regex.optional(/[\p{L}0-9_.-]*:/u), /[\p{L}0-9_.-]*/u);
  const XML_IDENT_RE = /[\p{L}0-9._:-]+/u;
  const XML_ENTITIES = {
    className: "symbol",
    begin: /&[a-z]+;|&#[0-9]+;|&#x[a-f0-9]+;/
  };
  const XML_META_KEYWORDS = {
    begin: /\s/,
    contains: [
      {
        className: "keyword",
        begin: /#?[a-z_][a-z1-9_-]+/,
        illegal: /\n/
      }
    ]
  };
  const XML_META_PAR_KEYWORDS = hljs.inherit(XML_META_KEYWORDS, {
    begin: /\(/,
    end: /\)/
  });
  const APOS_META_STRING_MODE = hljs.inherit(hljs.APOS_STRING_MODE, { className: "string" });
  const QUOTE_META_STRING_MODE = hljs.inherit(hljs.QUOTE_STRING_MODE, { className: "string" });
  const TAG_INTERNALS = {
    endsWithParent: true,
    illegal: /</,
    relevance: 0,
    contains: [
      {
        className: "attr",
        begin: XML_IDENT_RE,
        relevance: 0
      },
      {
        begin: /=\s*/,
        relevance: 0,
        contains: [
          {
            className: "string",
            endsParent: true,
            variants: [
              {
                begin: /"/,
                end: /"/,
                contains: [XML_ENTITIES]
              },
              {
                begin: /'/,
                end: /'/,
                contains: [XML_ENTITIES]
              },
              { begin: /[^\s"'=<>`]+/ }
            ]
          }
        ]
      }
    ]
  };
  return {
    name: "HTML, XML",
    aliases: [
      "html",
      "xhtml",
      "rss",
      "atom",
      "xjb",
      "xsd",
      "xsl",
      "plist",
      "wsf",
      "svg"
    ],
    case_insensitive: true,
    unicodeRegex: true,
    contains: [
      {
        className: "meta",
        begin: /<![a-z]/,
        end: />/,
        relevance: 10,
        contains: [
          XML_META_KEYWORDS,
          QUOTE_META_STRING_MODE,
          APOS_META_STRING_MODE,
          XML_META_PAR_KEYWORDS,
          {
            begin: /\[/,
            end: /\]/,
            contains: [
              {
                className: "meta",
                begin: /<![a-z]/,
                end: />/,
                contains: [
                  XML_META_KEYWORDS,
                  XML_META_PAR_KEYWORDS,
                  QUOTE_META_STRING_MODE,
                  APOS_META_STRING_MODE
                ]
              }
            ]
          }
        ]
      },
      hljs.COMMENT(
        /<!--/,
        /-->/,
        { relevance: 10 }
      ),
      {
        begin: /<!\[CDATA\[/,
        end: /\]\]>/,
        relevance: 10
      },
      XML_ENTITIES,
      // xml processing instructions
      {
        className: "meta",
        end: /\?>/,
        variants: [
          {
            begin: /<\?xml/,
            relevance: 10,
            contains: [
              QUOTE_META_STRING_MODE
            ]
          },
          {
            begin: /<\?[a-z][a-z0-9]+/
          }
        ]
      },
      {
        className: "tag",
        /*
        The lookahead pattern (?=...) ensures that 'begin' only matches
        '<style' as a single word, followed by a whitespace or an
        ending bracket.
        */
        begin: /<style(?=\s|>)/,
        end: />/,
        keywords: { name: "style" },
        contains: [TAG_INTERNALS],
        starts: {
          end: /<\/style>/,
          returnEnd: true,
          subLanguage: "css"
        }
      },
      {
        className: "tag",
        // See the comment in the <style tag about the lookahead pattern
        begin: /<script(?=\s|>)/,
        end: />/,
        keywords: { name: "script" },
        contains: [TAG_INTERNALS],
        starts: {
          end: /<\/script>/,
          returnEnd: true,
          subLanguage: "javascript"
        }
      },
      // we need this for now for jSX
      {
        className: "tag",
        begin: /<>|<\/>/
      },
      // open tag
      {
        className: "tag",
        begin: regex.concat(
          /</,
          regex.lookahead(regex.concat(
            TAG_NAME_RE,
            // <tag/>
            // <tag>
            // <tag ...
            regex.either(/\/>/, />/, /\s/)
          ))
        ),
        end: /\/?>/,
        contains: [
          {
            className: "name",
            begin: TAG_NAME_RE,
            relevance: 0,
            starts: TAG_INTERNALS
          }
        ]
      },
      // close tag
      {
        className: "tag",
        begin: regex.concat(
          /<\//,
          regex.lookahead(regex.concat(
            TAG_NAME_RE,
            />/
          ))
        ),
        contains: [
          {
            className: "name",
            begin: TAG_NAME_RE,
            relevance: 0
          },
          {
            begin: />/,
            relevance: 0,
            endsParent: true
          }
        ]
      }
    ]
  };
}

// node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/languages/sql.js
function sql(hljs) {
  const regex = hljs.regex;
  const COMMENT_MODE = hljs.COMMENT("--", "$");
  const STRING = {
    scope: "string",
    variants: [
      {
        begin: /'/,
        end: /'/,
        contains: [{ match: /''/ }]
      }
    ]
  };
  const QUOTED_IDENTIFIER = {
    begin: /"/,
    end: /"/,
    contains: [{ match: /""/ }]
  };
  const LITERALS3 = [
    "true",
    "false",
    // Not sure it's correct to call NULL literal, and clauses like IS [NOT] NULL look strange that way.
    // "null",
    "unknown"
  ];
  const MULTI_WORD_TYPES = [
    "double precision",
    "large object",
    "with timezone",
    "without timezone"
  ];
  const TYPES3 = [
    "bigint",
    "binary",
    "blob",
    "boolean",
    "char",
    "character",
    "clob",
    "date",
    "dec",
    "decfloat",
    "decimal",
    "float",
    "int",
    "integer",
    "interval",
    "nchar",
    "nclob",
    "national",
    "numeric",
    "real",
    "row",
    "smallint",
    "time",
    "timestamp",
    "varchar",
    "varying",
    // modifier (character varying)
    "varbinary"
  ];
  const NON_RESERVED_WORDS = [
    "add",
    "asc",
    "collation",
    "desc",
    "final",
    "first",
    "last",
    "view"
  ];
  const RESERVED_WORDS2 = [
    "abs",
    "acos",
    "all",
    "allocate",
    "alter",
    "and",
    "any",
    "are",
    "array",
    "array_agg",
    "array_max_cardinality",
    "as",
    "asensitive",
    "asin",
    "asymmetric",
    "at",
    "atan",
    "atomic",
    "authorization",
    "avg",
    "begin",
    "begin_frame",
    "begin_partition",
    "between",
    "bigint",
    "binary",
    "blob",
    "boolean",
    "both",
    "by",
    "call",
    "called",
    "cardinality",
    "cascaded",
    "case",
    "cast",
    "ceil",
    "ceiling",
    "char",
    "char_length",
    "character",
    "character_length",
    "check",
    "classifier",
    "clob",
    "close",
    "coalesce",
    "collate",
    "collect",
    "column",
    "commit",
    "condition",
    "connect",
    "constraint",
    "contains",
    "convert",
    "copy",
    "corr",
    "corresponding",
    "cos",
    "cosh",
    "count",
    "covar_pop",
    "covar_samp",
    "create",
    "cross",
    "cube",
    "cume_dist",
    "current",
    "current_catalog",
    "current_date",
    "current_default_transform_group",
    "current_path",
    "current_role",
    "current_row",
    "current_schema",
    "current_time",
    "current_timestamp",
    "current_path",
    "current_role",
    "current_transform_group_for_type",
    "current_user",
    "cursor",
    "cycle",
    "date",
    "day",
    "deallocate",
    "dec",
    "decimal",
    "decfloat",
    "declare",
    "default",
    "define",
    "delete",
    "dense_rank",
    "deref",
    "describe",
    "deterministic",
    "disconnect",
    "distinct",
    "double",
    "drop",
    "dynamic",
    "each",
    "element",
    "else",
    "empty",
    "end",
    "end_frame",
    "end_partition",
    "end-exec",
    "equals",
    "escape",
    "every",
    "except",
    "exec",
    "execute",
    "exists",
    "exp",
    "external",
    "extract",
    "false",
    "fetch",
    "filter",
    "first_value",
    "float",
    "floor",
    "for",
    "foreign",
    "frame_row",
    "free",
    "from",
    "full",
    "function",
    "fusion",
    "get",
    "global",
    "grant",
    "group",
    "grouping",
    "groups",
    "having",
    "hold",
    "hour",
    "identity",
    "in",
    "indicator",
    "initial",
    "inner",
    "inout",
    "insensitive",
    "insert",
    "int",
    "integer",
    "intersect",
    "intersection",
    "interval",
    "into",
    "is",
    "join",
    "json_array",
    "json_arrayagg",
    "json_exists",
    "json_object",
    "json_objectagg",
    "json_query",
    "json_table",
    "json_table_primitive",
    "json_value",
    "lag",
    "language",
    "large",
    "last_value",
    "lateral",
    "lead",
    "leading",
    "left",
    "like",
    "like_regex",
    "listagg",
    "ln",
    "local",
    "localtime",
    "localtimestamp",
    "log",
    "log10",
    "lower",
    "match",
    "match_number",
    "match_recognize",
    "matches",
    "max",
    "member",
    "merge",
    "method",
    "min",
    "minute",
    "mod",
    "modifies",
    "module",
    "month",
    "multiset",
    "national",
    "natural",
    "nchar",
    "nclob",
    "new",
    "no",
    "none",
    "normalize",
    "not",
    "nth_value",
    "ntile",
    "null",
    "nullif",
    "numeric",
    "octet_length",
    "occurrences_regex",
    "of",
    "offset",
    "old",
    "omit",
    "on",
    "one",
    "only",
    "open",
    "or",
    "order",
    "out",
    "outer",
    "over",
    "overlaps",
    "overlay",
    "parameter",
    "partition",
    "pattern",
    "per",
    "percent",
    "percent_rank",
    "percentile_cont",
    "percentile_disc",
    "period",
    "portion",
    "position",
    "position_regex",
    "power",
    "precedes",
    "precision",
    "prepare",
    "primary",
    "procedure",
    "ptf",
    "range",
    "rank",
    "reads",
    "real",
    "recursive",
    "ref",
    "references",
    "referencing",
    "regr_avgx",
    "regr_avgy",
    "regr_count",
    "regr_intercept",
    "regr_r2",
    "regr_slope",
    "regr_sxx",
    "regr_sxy",
    "regr_syy",
    "release",
    "result",
    "return",
    "returns",
    "revoke",
    "right",
    "rollback",
    "rollup",
    "row",
    "row_number",
    "rows",
    "running",
    "savepoint",
    "scope",
    "scroll",
    "search",
    "second",
    "seek",
    "select",
    "sensitive",
    "session_user",
    "set",
    "show",
    "similar",
    "sin",
    "sinh",
    "skip",
    "smallint",
    "some",
    "specific",
    "specifictype",
    "sql",
    "sqlexception",
    "sqlstate",
    "sqlwarning",
    "sqrt",
    "start",
    "static",
    "stddev_pop",
    "stddev_samp",
    "submultiset",
    "subset",
    "substring",
    "substring_regex",
    "succeeds",
    "sum",
    "symmetric",
    "system",
    "system_time",
    "system_user",
    "table",
    "tablesample",
    "tan",
    "tanh",
    "then",
    "time",
    "timestamp",
    "timezone_hour",
    "timezone_minute",
    "to",
    "trailing",
    "translate",
    "translate_regex",
    "translation",
    "treat",
    "trigger",
    "trim",
    "trim_array",
    "true",
    "truncate",
    "uescape",
    "union",
    "unique",
    "unknown",
    "unnest",
    "update",
    "upper",
    "user",
    "using",
    "value",
    "values",
    "value_of",
    "var_pop",
    "var_samp",
    "varbinary",
    "varchar",
    "varying",
    "versioning",
    "when",
    "whenever",
    "where",
    "width_bucket",
    "window",
    "with",
    "within",
    "without",
    "year"
  ];
  const RESERVED_FUNCTIONS = [
    "abs",
    "acos",
    "array_agg",
    "asin",
    "atan",
    "avg",
    "cast",
    "ceil",
    "ceiling",
    "coalesce",
    "corr",
    "cos",
    "cosh",
    "count",
    "covar_pop",
    "covar_samp",
    "cume_dist",
    "dense_rank",
    "deref",
    "element",
    "exp",
    "extract",
    "first_value",
    "floor",
    "json_array",
    "json_arrayagg",
    "json_exists",
    "json_object",
    "json_objectagg",
    "json_query",
    "json_table",
    "json_table_primitive",
    "json_value",
    "lag",
    "last_value",
    "lead",
    "listagg",
    "ln",
    "log",
    "log10",
    "lower",
    "max",
    "min",
    "mod",
    "nth_value",
    "ntile",
    "nullif",
    "percent_rank",
    "percentile_cont",
    "percentile_disc",
    "position",
    "position_regex",
    "power",
    "rank",
    "regr_avgx",
    "regr_avgy",
    "regr_count",
    "regr_intercept",
    "regr_r2",
    "regr_slope",
    "regr_sxx",
    "regr_sxy",
    "regr_syy",
    "row_number",
    "sin",
    "sinh",
    "sqrt",
    "stddev_pop",
    "stddev_samp",
    "substring",
    "substring_regex",
    "sum",
    "tan",
    "tanh",
    "translate",
    "translate_regex",
    "treat",
    "trim",
    "trim_array",
    "unnest",
    "upper",
    "value_of",
    "var_pop",
    "var_samp",
    "width_bucket"
  ];
  const POSSIBLE_WITHOUT_PARENS = [
    "current_catalog",
    "current_date",
    "current_default_transform_group",
    "current_path",
    "current_role",
    "current_schema",
    "current_transform_group_for_type",
    "current_user",
    "session_user",
    "system_time",
    "system_user",
    "current_time",
    "localtime",
    "current_timestamp",
    "localtimestamp"
  ];
  const COMBOS = [
    "create table",
    "insert into",
    "primary key",
    "foreign key",
    "not null",
    "alter table",
    "add constraint",
    "grouping sets",
    "on overflow",
    "character set",
    "respect nulls",
    "ignore nulls",
    "nulls first",
    "nulls last",
    "depth first",
    "breadth first"
  ];
  const FUNCTIONS = RESERVED_FUNCTIONS;
  const KEYWORDS3 = [
    ...RESERVED_WORDS2,
    ...NON_RESERVED_WORDS
  ].filter((keyword) => {
    return !RESERVED_FUNCTIONS.includes(keyword);
  });
  const VARIABLE = {
    scope: "variable",
    match: /@[a-z0-9][a-z0-9_]*/
  };
  const OPERATOR = {
    scope: "operator",
    match: /[-+*/=%^~]|&&?|\|\|?|!=?|<(?:=>?|<|>)?|>[>=]?/,
    relevance: 0
  };
  const FUNCTION_CALL = {
    match: regex.concat(/\b/, regex.either(...FUNCTIONS), /\s*\(/),
    relevance: 0,
    keywords: { built_in: FUNCTIONS }
  };
  function kws_to_regex(list) {
    return regex.concat(
      /\b/,
      regex.either(...list.map((kw) => {
        return kw.replace(/\s+/, "\\s+");
      })),
      /\b/
    );
  }
  const MULTI_WORD_KEYWORDS = {
    scope: "keyword",
    match: kws_to_regex(COMBOS),
    relevance: 0
  };
  function reduceRelevancy(list, {
    exceptions,
    when
  } = {}) {
    const qualifyFn = when;
    exceptions = exceptions || [];
    return list.map((item) => {
      if (item.match(/\|\d+$/) || exceptions.includes(item)) {
        return item;
      } else if (qualifyFn(item)) {
        return `${item}|0`;
      } else {
        return item;
      }
    });
  }
  return {
    name: "SQL",
    case_insensitive: true,
    // does not include {} or HTML tags `</`
    illegal: /[{}]|<\//,
    keywords: {
      $pattern: /\b[\w\.]+/,
      keyword: reduceRelevancy(KEYWORDS3, { when: (x) => x.length < 3 }),
      literal: LITERALS3,
      type: TYPES3,
      built_in: POSSIBLE_WITHOUT_PARENS
    },
    contains: [
      {
        scope: "type",
        match: kws_to_regex(MULTI_WORD_TYPES)
      },
      MULTI_WORD_KEYWORDS,
      FUNCTION_CALL,
      VARIABLE,
      STRING,
      QUOTED_IDENTIFIER,
      hljs.C_NUMBER_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      COMMENT_MODE,
      OPERATOR
    ]
  };
}

// node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/languages/go.js
function go(hljs) {
  const LITERALS3 = [
    "true",
    "false",
    "iota",
    "nil"
  ];
  const BUILT_INS3 = [
    "append",
    "cap",
    "close",
    "complex",
    "copy",
    "imag",
    "len",
    "make",
    "new",
    "panic",
    "print",
    "println",
    "real",
    "recover",
    "delete"
  ];
  const TYPES3 = [
    "bool",
    "byte",
    "complex64",
    "complex128",
    "error",
    "float32",
    "float64",
    "int8",
    "int16",
    "int32",
    "int64",
    "string",
    "uint8",
    "uint16",
    "uint32",
    "uint64",
    "int",
    "uint",
    "uintptr",
    "rune"
  ];
  const KWS = [
    "break",
    "case",
    "chan",
    "const",
    "continue",
    "default",
    "defer",
    "else",
    "fallthrough",
    "for",
    "func",
    "go",
    "goto",
    "if",
    "import",
    "interface",
    "map",
    "package",
    "range",
    "return",
    "select",
    "struct",
    "switch",
    "type",
    "var"
  ];
  const KEYWORDS3 = {
    keyword: KWS,
    type: TYPES3,
    literal: LITERALS3,
    built_in: BUILT_INS3
  };
  return {
    name: "Go",
    aliases: ["golang"],
    keywords: KEYWORDS3,
    illegal: "</",
    contains: [
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      {
        className: "string",
        variants: [
          hljs.QUOTE_STRING_MODE,
          hljs.APOS_STRING_MODE,
          {
            begin: "`",
            end: "`"
          }
        ]
      },
      {
        className: "number",
        variants: [
          {
            match: /-?\b0[xX]\.[a-fA-F0-9](_?[a-fA-F0-9])*[pP][+-]?\d(_?\d)*i?/,
            // hex without a present digit before . (making a digit afterwards required)
            relevance: 0
          },
          {
            match: /-?\b0[xX](_?[a-fA-F0-9])+((\.([a-fA-F0-9](_?[a-fA-F0-9])*)?)?[pP][+-]?\d(_?\d)*)?i?/,
            // hex with a present digit before . (making a digit afterwards optional)
            relevance: 0
          },
          {
            match: /-?\b0[oO](_?[0-7])*i?/,
            // leading 0o octal
            relevance: 0
          },
          {
            match: /-?\b0[bB](_?[01])*i?/,
            // leading 0b binary
            relevance: 0
          },
          {
            match: /-?\.\d(_?\d)*([eE][+-]?\d(_?\d)*)?i?/,
            // decimal without a present digit before . (making a digit afterwards required)
            relevance: 0
          },
          {
            match: /-?\b\d(_?\d)*(\.(\d(_?\d)*)?)?([eE][+-]?\d(_?\d)*)?i?/,
            // decimal with a present digit before . (making a digit afterwards optional)
            relevance: 0
          }
        ]
      },
      {
        begin: /:=/
        // relevance booster
      },
      {
        className: "function",
        beginKeywords: "func",
        end: "\\s*(\\{|$)",
        excludeEnd: true,
        contains: [
          hljs.TITLE_MODE,
          {
            className: "params",
            begin: /\(/,
            end: /\)/,
            endsParent: true,
            keywords: KEYWORDS3,
            illegal: /["']/
          }
        ]
      }
    ]
  };
}

// node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/languages/rust.js
function rust(hljs) {
  const regex = hljs.regex;
  const RAW_IDENTIFIER = /(r#)?/;
  const UNDERSCORE_IDENT_RE = regex.concat(RAW_IDENTIFIER, hljs.UNDERSCORE_IDENT_RE);
  const IDENT_RE3 = regex.concat(RAW_IDENTIFIER, hljs.IDENT_RE);
  const FUNCTION_INVOKE = {
    scope: "title.function.invoke",
    relevance: 0,
    begin: regex.concat(
      /\b/,
      /(?!(?:let|for|while|if|else|match)\b)/,
      IDENT_RE3,
      regex.lookahead(/\s*\(/)
    )
  };
  const NUMBER_SUFFIX = "([ui](8|16|32|64|128|size)|f(16|32|64|128))?";
  const KEYWORDS3 = [
    "abstract",
    "as",
    "async",
    "await",
    "become",
    "box",
    "break",
    "const",
    "continue",
    "crate",
    "do",
    "dyn",
    "else",
    "enum",
    "extern",
    "false",
    "final",
    "fn",
    "for",
    "if",
    "impl",
    "in",
    "let",
    "loop",
    "macro",
    "match",
    "mod",
    "move",
    "mut",
    "override",
    "priv",
    "pub",
    "raw",
    "ref",
    "return",
    "self",
    "Self",
    "static",
    "struct",
    "super",
    "trait",
    "true",
    "try",
    "type",
    "typeof",
    "union",
    "unsafe",
    "unsized",
    "use",
    "virtual",
    "where",
    "while",
    "yield"
  ];
  const LITERALS3 = [
    "true",
    "false",
    "Some",
    "None",
    "Ok",
    "Err"
  ];
  const BUILTINS = [
    // functions
    "drop ",
    // traits
    "Copy",
    "Send",
    "Sized",
    "Sync",
    "Drop",
    "Fn",
    "FnMut",
    "FnOnce",
    "ToOwned",
    "Clone",
    "Debug",
    "PartialEq",
    "PartialOrd",
    "Eq",
    "Ord",
    "AsRef",
    "AsMut",
    "Into",
    "From",
    "Default",
    "Iterator",
    "Extend",
    "IntoIterator",
    "DoubleEndedIterator",
    "ExactSizeIterator",
    "SliceConcatExt",
    "ToString",
    // macros
    "assert!",
    "assert_eq!",
    "bitflags!",
    "bytes!",
    "cfg!",
    "col!",
    "concat!",
    "concat_idents!",
    "debug_assert!",
    "debug_assert_eq!",
    "env!",
    "eprintln!",
    "panic!",
    "file!",
    "format!",
    "format_args!",
    "include_bytes!",
    "include_str!",
    "line!",
    "local_data_key!",
    "module_path!",
    "option_env!",
    "print!",
    "println!",
    "select!",
    "stringify!",
    "try!",
    "unimplemented!",
    "unreachable!",
    "vec!",
    "write!",
    "writeln!",
    "macro_rules!",
    "assert_ne!",
    "debug_assert_ne!"
  ];
  const TYPES3 = [
    "i8",
    "i16",
    "i32",
    "i64",
    "i128",
    "isize",
    "u8",
    "u16",
    "u32",
    "u64",
    "u128",
    "usize",
    "f16",
    "f32",
    "f64",
    "f128",
    "str",
    "char",
    "bool",
    "Box",
    "Option",
    "Result",
    "String",
    "Vec"
  ];
  return {
    name: "Rust",
    aliases: ["rs"],
    keywords: {
      $pattern: hljs.IDENT_RE + "!?",
      type: TYPES3,
      keyword: KEYWORDS3,
      literal: LITERALS3,
      built_in: BUILTINS
    },
    illegal: "</",
    contains: [
      hljs.C_LINE_COMMENT_MODE,
      hljs.COMMENT("/\\*", "\\*/", { contains: ["self"] }),
      hljs.inherit(hljs.QUOTE_STRING_MODE, {
        begin: /b?"/,
        illegal: null
      }),
      {
        scope: "symbol",
        // negative lookahead to avoid matching `'`
        begin: /'[a-zA-Z_][a-zA-Z0-9_]*(?!')/
      },
      {
        scope: "string",
        variants: [
          { begin: /b?r(#*)"(.|\n)*?"\1(?!#)/ },
          {
            begin: /b?'/,
            end: /'/,
            contains: [
              {
                scope: "char.escape",
                match: /\\('|"|\\|\w|x\w{2}|u\w{4}|U\w{8})/
              }
            ]
          }
        ]
      },
      {
        scope: "number",
        variants: [
          { begin: "\\b0b([01_]+)" + NUMBER_SUFFIX },
          { begin: "\\b0o([0-7_]+)" + NUMBER_SUFFIX },
          { begin: "\\b0x([A-Fa-f0-9_]+)" + NUMBER_SUFFIX },
          { begin: "\\b(\\d[\\d_]*(\\.[0-9_]+)?([eE][+-]?[0-9_]+)?)" + NUMBER_SUFFIX }
        ],
        relevance: 0
      },
      {
        begin: [
          /\bsafe/,
          /\s+/,
          /extern/
        ],
        scope: {
          1: "keyword",
          3: "keyword"
        }
      },
      {
        begin: [
          /fn/,
          /\s+/,
          UNDERSCORE_IDENT_RE
        ],
        scope: {
          1: "keyword",
          3: "title.function"
        }
      },
      {
        scope: "meta",
        begin: "#!?\\[",
        end: "\\]",
        contains: [
          {
            scope: "string",
            begin: /"/,
            end: /"/,
            contains: [
              hljs.BACKSLASH_ESCAPE
            ]
          }
        ]
      },
      {
        begin: [
          /let/,
          /\s+/,
          /(?:mut\s+)?/,
          UNDERSCORE_IDENT_RE
        ],
        scope: {
          1: "keyword",
          3: "keyword",
          4: "variable"
        }
      },
      // must come before impl/for rule later
      {
        begin: [
          /for/,
          /\s+/,
          UNDERSCORE_IDENT_RE,
          /\s+/,
          /in/
        ],
        scope: {
          1: "keyword",
          3: "variable",
          5: "keyword"
        }
      },
      {
        begin: [
          /type/,
          /\s+/,
          UNDERSCORE_IDENT_RE
        ],
        scope: {
          1: "keyword",
          3: "title.class"
        }
      },
      {
        begin: [
          /(?:trait|enum|struct|union|impl|for)/,
          /\s+/,
          UNDERSCORE_IDENT_RE
        ],
        scope: {
          1: "keyword",
          3: "title.class"
        }
      },
      {
        begin: hljs.IDENT_RE + "::",
        keywords: {
          keyword: "Self",
          built_in: BUILTINS,
          type: TYPES3
        }
      },
      {
        scope: "punctuation",
        begin: "->"
      },
      FUNCTION_INVOKE
    ]
  };
}

// node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/languages/java.js
var decimalDigits = "[0-9](_*[0-9])*";
var frac = `\\.(${decimalDigits})`;
var hexDigits = "[0-9a-fA-F](_*[0-9a-fA-F])*";
var NUMERIC = {
  className: "number",
  variants: [
    // DecimalFloatingPointLiteral
    // including ExponentPart
    { begin: `(\\b(${decimalDigits})((${frac})|\\.)?|(${frac}))[eE][+-]?(${decimalDigits})[fFdD]?\\b` },
    // excluding ExponentPart
    { begin: `\\b(${decimalDigits})((${frac})[fFdD]?\\b|\\.([fFdD]\\b)?)` },
    { begin: `(${frac})[fFdD]?\\b` },
    { begin: `\\b(${decimalDigits})[fFdD]\\b` },
    // HexadecimalFloatingPointLiteral
    { begin: `\\b0[xX]((${hexDigits})\\.?|(${hexDigits})?\\.(${hexDigits}))[pP][+-]?(${decimalDigits})[fFdD]?\\b` },
    // DecimalIntegerLiteral
    { begin: "\\b(0|[1-9](_*[0-9])*)[lL]?\\b" },
    // HexIntegerLiteral
    { begin: `\\b0[xX](${hexDigits})[lL]?\\b` },
    // OctalIntegerLiteral
    { begin: "\\b0(_*[0-7])*[lL]?\\b" },
    // BinaryIntegerLiteral
    { begin: "\\b0[bB][01](_*[01])*[lL]?\\b" }
  ],
  relevance: 0
};
function recurRegex(re, substitution, depth) {
  if (depth === -1) return "";
  return re.replace(substitution, (_) => {
    return recurRegex(re, substitution, depth - 1);
  });
}
function java(hljs) {
  const regex = hljs.regex;
  const JAVA_IDENT_RE = "[\xC0-\u02B8a-zA-Z_$][\xC0-\u02B8a-zA-Z_$0-9]*";
  const ARRAY_BRACKETS_OPTIONAL_RE = "(?:(?:\\s*\\[\\s*])+)?";
  const SIMPLE_TYPE_RE = JAVA_IDENT_RE + "<@@@>" + ARRAY_BRACKETS_OPTIONAL_RE;
  const WILDCARD_TYPE_RE = "\\?(?:\\s+(?:extends|super)\\s+" + SIMPLE_TYPE_RE + ")?";
  const TYPE_ARG_RE = "(?:" + WILDCARD_TYPE_RE + "|" + SIMPLE_TYPE_RE + ")";
  const TYPE_ARGS_OPTIONAL_RE = recurRegex(
    "(?:\\s*<\\s*" + TYPE_ARG_RE + "(?:\\s*,\\s*" + TYPE_ARG_RE + ")*\\s*>)?",
    /<@@@>/g,
    2
  );
  const MAIN_KEYWORDS = [
    "synchronized",
    "abstract",
    "private",
    "var",
    "static",
    "if",
    "const ",
    "for",
    "while",
    "strictfp",
    "finally",
    "protected",
    "import",
    "native",
    "final",
    "void",
    "enum",
    "else",
    "break",
    "transient",
    "catch",
    "instanceof",
    "volatile",
    "case",
    "assert",
    "package",
    "default",
    "public",
    "try",
    "switch",
    "continue",
    "throws",
    "protected",
    "public",
    "private",
    "module",
    "requires",
    "exports",
    "do",
    "sealed",
    "yield",
    "permits",
    "goto",
    "when"
  ];
  const BUILT_INS3 = [
    "super",
    "this"
  ];
  const LITERALS3 = [
    "false",
    "true",
    "null"
  ];
  const TYPES3 = [
    "char",
    "boolean",
    "long",
    "float",
    "int",
    "byte",
    "short",
    "double"
  ];
  const KEYWORDS3 = {
    keyword: MAIN_KEYWORDS,
    literal: LITERALS3,
    type: TYPES3,
    built_in: BUILT_INS3
  };
  const ANNOTATION = {
    className: "meta",
    begin: "@" + JAVA_IDENT_RE,
    contains: [
      {
        begin: /\(/,
        end: /\)/,
        contains: ["self"]
        // allow nested () inside our annotation
      }
    ]
  };
  const PARAMS = {
    className: "params",
    begin: /\(/,
    end: /\)/,
    keywords: KEYWORDS3,
    relevance: 0,
    contains: [hljs.C_BLOCK_COMMENT_MODE],
    endsParent: true
  };
  return {
    name: "Java",
    aliases: ["jsp"],
    keywords: KEYWORDS3,
    illegal: /<\/|#/,
    contains: [
      hljs.COMMENT(
        "/\\*\\*",
        "\\*/",
        {
          relevance: 0,
          contains: [
            {
              // eat up @'s in emails to prevent them to be recognized as doctags
              begin: /\w+@/,
              relevance: 0
            },
            {
              className: "doctag",
              begin: "@[A-Za-z]+"
            }
          ]
        }
      ),
      // relevance boost
      {
        begin: /import java\.[a-z]+\./,
        keywords: "import",
        relevance: 2
      },
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      {
        begin: /"""/,
        end: /"""/,
        className: "string",
        contains: [hljs.BACKSLASH_ESCAPE]
      },
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE,
      {
        match: [
          /\b(?:class|interface|enum|extends|implements|new)/,
          /\s+/,
          JAVA_IDENT_RE
        ],
        className: {
          1: "keyword",
          3: "title.class"
        }
      },
      {
        // Exceptions for hyphenated keywords
        match: /non-sealed/,
        scope: "keyword"
      },
      {
        // Expression keywords prevent keyword-led expressions from being
        // recognized as variable or method declarations.
        beginKeywords: "new throw return else yield assert",
        relevance: 0
      },
      {
        begin: [
          JAVA_IDENT_RE,
          regex.concat(TYPE_ARGS_OPTIONAL_RE, ARRAY_BRACKETS_OPTIONAL_RE, /\s+/),
          JAVA_IDENT_RE,
          ARRAY_BRACKETS_OPTIONAL_RE,
          /\s*/,
          /=(?!=)/
        ],
        className: {
          1: "type",
          3: "variable",
          6: "operator"
        }
      },
      {
        begin: [
          /record/,
          /\s+/,
          JAVA_IDENT_RE
        ],
        className: {
          1: "keyword",
          3: "title.class"
        },
        contains: [
          PARAMS,
          hljs.C_LINE_COMMENT_MODE,
          hljs.C_BLOCK_COMMENT_MODE
        ]
      },
      {
        begin: [
          JAVA_IDENT_RE,
          regex.concat(TYPE_ARGS_OPTIONAL_RE, ARRAY_BRACKETS_OPTIONAL_RE, /\s+/),
          JAVA_IDENT_RE,
          /\s*(?=\()/
        ],
        className: {
          1: "type",
          3: "title.function"
        },
        keywords: KEYWORDS3,
        contains: [
          {
            className: "params",
            begin: /\(/,
            end: /\)/,
            keywords: KEYWORDS3,
            relevance: 0,
            contains: [
              ANNOTATION,
              hljs.APOS_STRING_MODE,
              hljs.QUOTE_STRING_MODE,
              NUMERIC,
              hljs.C_BLOCK_COMMENT_MODE
            ]
          },
          hljs.C_LINE_COMMENT_MODE,
          hljs.C_BLOCK_COMMENT_MODE
        ]
      },
      NUMERIC,
      ANNOTATION
    ]
  };
}

// node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/languages/c.js
function c(hljs) {
  const regex = hljs.regex;
  const C_LINE_COMMENT_MODE = hljs.COMMENT("//", "$", { contains: [{ begin: /\\\n/ }] });
  const DECLTYPE_AUTO_RE = "decltype\\(auto\\)";
  const NAMESPACE_RE = "[a-zA-Z_]\\w*::";
  const TEMPLATE_ARGUMENT_RE = "<[^<>]+>";
  const FUNCTION_TYPE_RE = "(" + DECLTYPE_AUTO_RE + "|" + regex.optional(NAMESPACE_RE) + "[a-zA-Z_]\\w*" + regex.optional(TEMPLATE_ARGUMENT_RE) + ")";
  const ATOMIC_TYPES = regex.concat(/\batomic_/, regex.either(
    "bool",
    "char",
    "schar",
    "uchar",
    "short",
    "ushort",
    "int",
    "uint",
    "long",
    "ulong",
    "llong",
    "ullong",
    "char16_t",
    "char32_t",
    "wchar_t",
    "int_least8_t",
    "uint_least8_t",
    "int_least16_t",
    "uint_least16_t",
    "int_least32_t",
    "uint_least32_t",
    "int_least64_t",
    "uint_least64_t",
    "int_fast8_t",
    "uint_fast8_t",
    "int_fast16_t",
    "uint_fast16_t",
    "int_fast32_t",
    "uint_fast32_t",
    "int_fast64_t",
    "uint_fast64_t",
    "intptr_t",
    "uintptr_t",
    "size_t",
    "ptrdiff_t",
    "intmax_t",
    "uintmax_t"
  ), /\b/);
  const TYPES3 = {
    className: "type",
    variants: [
      { begin: "\\b[a-z\\d_]*_t\\b" },
      { match: ATOMIC_TYPES }
    ]
  };
  const CHARACTER_ESCAPES = "\\\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4,8}|[0-7]{3}|\\S)";
  const STRINGS = {
    className: "string",
    variants: [
      {
        begin: '(u8?|U|L)?"',
        end: '"',
        illegal: "\\n",
        contains: [hljs.BACKSLASH_ESCAPE]
      },
      {
        begin: "(u8?|U|L)?'(" + CHARACTER_ESCAPES + "|.)",
        end: "'",
        illegal: "."
      },
      // https://en.cppreference.com/w/cpp/language/string_literal
      // a d-char-sequence never contains parentheses, backslashes or whitespace;
      // quotes are excluded as well so the closing delimiter cannot swallow the
      // quote that actually terminates the literal
      hljs.END_SAME_AS_BEGIN({
        begin: /(?:u8?|U|L)?R"([^()\\\s"]{0,16})\(/,
        end: /\)([^()\\\s"]{0,16})"/
      })
    ]
  };
  const NUMBERS = {
    className: "number",
    variants: [
      { match: /\b(0b[01']+)/ },
      { match: /(-?)\b([\d']+(\.[\d']*)?|\.[\d']+)((ll|LL|l|L)(u|U)?|(u|U)(ll|LL|l|L)?|f|F|b|B)/ },
      { match: /(-?)\b(0[xX][a-fA-F0-9]+(?:'[a-fA-F0-9]+)*(?:\.[a-fA-F0-9]*(?:'[a-fA-F0-9]*)*)?(?:[pP][-+]?[0-9]+)?(l|L)?(u|U)?)/ },
      { match: /(-?)\b\d+(?:'\d+)*(?:\.\d*(?:'\d*)*)?(?:[eE][-+]?\d+)?/ }
    ],
    relevance: 0
  };
  const PREPROCESSOR_INCLUDE = {
    scope: "meta",
    begin: /#\s*include\b/,
    end: /$/,
    keywords: { keyword: "include" },
    contains: [
      {
        // the `\` at the end of a line signaling continuation
        begin: /\\\n/
      },
      STRINGS,
      {
        scope: "string",
        begin: /<.*?>/
      },
      C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE
    ]
  };
  const PREPROCESSOR = {
    className: "meta",
    begin: /#\s*[a-z]+\b/,
    end: /$/,
    keywords: { keyword: "if else elif endif define undef warning error line pragma _Pragma ifdef ifndef elifdef elifndef include" },
    contains: [
      {
        begin: /\\\n/,
        relevance: 0
      },
      hljs.inherit(STRINGS, { className: "string" }),
      C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE
    ]
  };
  const PREPROCESSORS = [
    PREPROCESSOR_INCLUDE,
    PREPROCESSOR
  ];
  const TITLE_MODE = {
    className: "title",
    begin: regex.optional(NAMESPACE_RE) + hljs.IDENT_RE,
    relevance: 0
  };
  const FUNCTION_TITLE = regex.optional(NAMESPACE_RE) + hljs.IDENT_RE + "\\s*\\(";
  const MAX_FUNCTION_TYPE_TOKENS = 12;
  const C_KEYWORDS = [
    "asm",
    "auto",
    "break",
    "case",
    "continue",
    "default",
    "do",
    "else",
    "enum",
    "extern",
    "for",
    "fortran",
    "goto",
    "if",
    "inline",
    "register",
    "restrict",
    "return",
    "sizeof",
    "typeof",
    "typeof_unqual",
    "struct",
    "switch",
    "typedef",
    "union",
    "volatile",
    "while",
    "_Alignas",
    "_Alignof",
    "_Atomic",
    "_Generic",
    "_Noreturn",
    "_Static_assert",
    "_Thread_local",
    // aliases
    "alignas",
    "alignof",
    "noreturn",
    "static_assert",
    "thread_local",
    // not a C keyword but is, for all intents and purposes, treated exactly like one.
    "_Pragma"
  ];
  const C_TYPES = [
    "float",
    "double",
    "signed",
    "unsigned",
    "int",
    "short",
    "long",
    "char",
    "void",
    "_Bool",
    "_BitInt",
    "_Complex",
    "_Imaginary",
    "_Decimal32",
    "_Decimal64",
    "_Decimal96",
    "_Decimal128",
    "_Decimal64x",
    "_Decimal128x",
    "_Float16",
    "_Float32",
    "_Float64",
    "_Float128",
    "_Float32x",
    "_Float64x",
    "_Float128x",
    // modifiers
    "const",
    "static",
    "constexpr",
    // aliases
    "complex",
    "bool",
    "imaginary"
  ];
  const KEYWORDS3 = {
    keyword: C_KEYWORDS,
    type: C_TYPES,
    literal: "true false NULL",
    // TODO: apply hinting work similar to what was done in cpp.js
    built_in: "std string wstring cin cout cerr clog stdin stdout stderr stringstream istringstream ostringstream auto_ptr deque list queue stack vector map set pair bitset multiset multimap unordered_set unordered_map unordered_multiset unordered_multimap priority_queue make_pair array shared_ptr abort terminate abs acos asin atan2 atan calloc ceil cosh cos exit exp fabs floor fmod fprintf fputs free frexp fscanf future isalnum isalpha iscntrl isdigit isgraph islower isprint ispunct isspace isupper isxdigit tolower toupper labs ldexp log10 log malloc realloc memchr memcmp memcpy memset modf pow printf putchar puts scanf sinh sin snprintf sprintf sqrt sscanf strcat strchr strcmp strcpy strcspn strlen strncat strncmp strncpy strpbrk strrchr strspn strstr tanh tan vfprintf vprintf vsprintf endl initializer_list unique_ptr"
  };
  const EXPRESSION_CONTAINS = [
    ...PREPROCESSORS,
    TYPES3,
    C_LINE_COMMENT_MODE,
    hljs.C_BLOCK_COMMENT_MODE,
    NUMBERS,
    STRINGS
  ];
  const EXPRESSION_CONTEXT = {
    // This mode covers expression context where we can't expect a function
    // definition and shouldn't highlight anything that looks like one:
    // `return some()`, `else if()`, `(x*sum(1, 2))`
    variants: [
      {
        begin: /=/,
        end: /;/
      },
      {
        begin: /\(/,
        end: /\)/
      },
      {
        beginKeywords: "new throw return else",
        end: /;/
      }
    ],
    keywords: KEYWORDS3,
    contains: EXPRESSION_CONTAINS.concat([
      {
        begin: /\(/,
        end: /\)/,
        keywords: KEYWORDS3,
        contains: EXPRESSION_CONTAINS.concat(["self"]),
        relevance: 0
      }
    ]),
    relevance: 0
  };
  const FUNCTION_DECLARATION = {
    begin: "(" + FUNCTION_TYPE_RE + "[\\*&\\s]+){1," + MAX_FUNCTION_TYPE_TOKENS + "}" + FUNCTION_TITLE,
    returnBegin: true,
    end: /[{;=]/,
    excludeEnd: true,
    keywords: KEYWORDS3,
    illegal: /[^\w\s\*&:<>.]/,
    contains: [
      {
        // to prevent it from being confused as the function title
        begin: DECLTYPE_AUTO_RE,
        keywords: KEYWORDS3,
        relevance: 0
      },
      {
        begin: FUNCTION_TITLE,
        returnBegin: true,
        contains: [hljs.inherit(TITLE_MODE, { className: "title.function" })],
        relevance: 0
      },
      // allow for multiple declarations, e.g.:
      // extern void f(int), g(char);
      {
        relevance: 0,
        match: /,/
      },
      {
        className: "params",
        begin: /\(/,
        end: /\)/,
        keywords: KEYWORDS3,
        relevance: 0,
        contains: [
          C_LINE_COMMENT_MODE,
          hljs.C_BLOCK_COMMENT_MODE,
          STRINGS,
          NUMBERS,
          TYPES3,
          // Count matching parentheses.
          {
            begin: /\(/,
            end: /\)/,
            keywords: KEYWORDS3,
            relevance: 0,
            contains: [
              "self",
              C_LINE_COMMENT_MODE,
              hljs.C_BLOCK_COMMENT_MODE,
              STRINGS,
              NUMBERS,
              TYPES3
            ]
          }
        ]
      },
      TYPES3,
      C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      ...PREPROCESSORS
    ]
  };
  return {
    name: "C",
    aliases: ["h"],
    keywords: KEYWORDS3,
    // Until differentiations are added between `c` and `cpp`, `c` will
    // not be auto-detected to avoid auto-detect conflicts between C and C++
    disableAutodetect: true,
    illegal: "</",
    contains: [].concat(
      EXPRESSION_CONTEXT,
      FUNCTION_DECLARATION,
      EXPRESSION_CONTAINS,
      [
        ...PREPROCESSORS,
        {
          begin: hljs.IDENT_RE + "::",
          keywords: KEYWORDS3
        },
        {
          className: "class",
          beginKeywords: "enum class struct union",
          end: /[{;:<>=]/,
          contains: [
            { beginKeywords: "final class struct" },
            hljs.TITLE_MODE
          ]
        }
      ]
    ),
    exports: {
      preprocessor: PREPROCESSOR,
      strings: STRINGS,
      keywords: KEYWORDS3
    }
  };
}

// node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/languages/cpp.js
function cpp(hljs) {
  const regex = hljs.regex;
  const C_LINE_COMMENT_MODE = hljs.COMMENT("//", "$", { contains: [{ begin: /\\\n/ }] });
  const DECLTYPE_AUTO_RE = "decltype\\(auto\\)";
  const NAMESPACE_RE = "[a-zA-Z_]\\w*::";
  const TEMPLATE_ARGUMENT_RE = "<[^<>]+>";
  const FUNCTION_TYPE_RE = "(?!struct)(" + DECLTYPE_AUTO_RE + "|" + regex.optional(NAMESPACE_RE) + "[a-zA-Z_]\\w*" + regex.optional(TEMPLATE_ARGUMENT_RE) + ")";
  const CPP_PRIMITIVE_TYPES = {
    className: "type",
    begin: "\\b[a-z\\d_]*_t\\b"
  };
  const CHARACTER_ESCAPES = "\\\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4,8}|[0-7]{3}|\\S)";
  const STRINGS = {
    className: "string",
    variants: [
      {
        begin: '(u8?|U|L)?"',
        end: '"',
        illegal: "\\n",
        contains: [hljs.BACKSLASH_ESCAPE]
      },
      {
        begin: "(u8?|U|L)?'(" + CHARACTER_ESCAPES + "|.)",
        end: "'",
        illegal: "."
      },
      // https://en.cppreference.com/w/cpp/language/string_literal
      // a d-char-sequence never contains parentheses, backslashes or whitespace;
      // quotes are excluded as well so the closing delimiter cannot swallow the
      // quote that actually terminates the literal
      hljs.END_SAME_AS_BEGIN({
        begin: /(?:u8?|U|L)?R"([^()\\\s"]{0,16})\(/,
        end: /\)([^()\\\s"]{0,16})"/
      })
    ]
  };
  const NUMBERS = {
    className: "number",
    variants: [
      // Floating-point literal.
      {
        begin: "[+-]?(?:(?:\\b[0-9](?:'?[0-9])*\\.(?:[0-9](?:'?[0-9])*)?|\\.[0-9](?:'?[0-9])*)(?:[Ee][+-]?[0-9](?:'?[0-9])*)?|\\b[0-9](?:'?[0-9])*[Ee][+-]?[0-9](?:'?[0-9])*|\\b0[Xx](?:[0-9A-Fa-f](?:'?[0-9A-Fa-f])*(?:\\.(?:[0-9A-Fa-f](?:'?[0-9A-Fa-f])*)?)?|\\.[0-9A-Fa-f](?:'?[0-9A-Fa-f])*)[Pp][+-]?[0-9](?:'?[0-9])*)(?:[Ff](?:16|32|64|128)?|(BF|bf)16|[Ll]|)"
      },
      // Integer literal.
      {
        begin: "[+-]?\\b(?:0[Bb][01](?:'?[01])*|0[Xx][0-9A-Fa-f](?:'?[0-9A-Fa-f])*|0(?:'?[0-7])*|[1-9](?:'?[0-9])*)(?:[Uu](?:LL?|ll?)|[Uu][Zz]?|(?:LL?|ll?)[Uu]?|[Zz][Uu]|)"
        // Note: there are user-defined literal suffixes too, but perhaps having the custom suffix not part of the
        // literal highlight actually makes it stand out more.
      }
    ],
    relevance: 0
  };
  const PREPROCESSOR_INCLUDE = {
    scope: "meta",
    begin: /#\s*include\b/,
    end: /$/,
    keywords: { keyword: "include" },
    contains: [
      {
        // the `\` at the end of a line signaling continuation
        begin: /\\\n/
      },
      STRINGS,
      {
        scope: "string",
        begin: /<.*?>/
      },
      C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE
    ]
  };
  const PREPROCESSOR = {
    className: "meta",
    begin: /#\s*[a-z]+\b/,
    end: /$/,
    keywords: { keyword: "if else elif endif define undef warning error line pragma _Pragma ifdef ifndef include" },
    contains: [
      {
        begin: /\\\n/,
        relevance: 0
      },
      hljs.inherit(STRINGS, { className: "string" }),
      C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE
    ]
  };
  const PREPROCESSORS = [
    PREPROCESSOR_INCLUDE,
    PREPROCESSOR
  ];
  const TITLE_MODE = {
    className: "title",
    begin: regex.optional(NAMESPACE_RE) + hljs.IDENT_RE,
    relevance: 0
  };
  const FUNCTION_TITLE = regex.optional(NAMESPACE_RE) + hljs.IDENT_RE + "\\s*\\(";
  const MAX_FUNCTION_TYPE_TOKENS = 12;
  const RESERVED_KEYWORDS = [
    "alignas",
    "alignof",
    "and",
    "and_eq",
    "asm",
    "atomic_cancel",
    "atomic_commit",
    "atomic_noexcept",
    "auto",
    "bitand",
    "bitor",
    "break",
    "case",
    "catch",
    "class",
    "co_await",
    "co_return",
    "co_yield",
    "compl",
    "concept",
    "const_cast|10",
    "consteval",
    "constexpr",
    "constinit",
    "continue",
    "decltype",
    "default",
    "delete",
    "do",
    "dynamic_cast|10",
    "else",
    "enum",
    "explicit",
    "export",
    "extern",
    "false",
    "final",
    "for",
    "friend",
    "goto",
    "if",
    "import",
    "inline",
    "module",
    "mutable",
    "namespace",
    "new",
    "noexcept",
    "not",
    "not_eq",
    "nullptr",
    "operator",
    "or",
    "or_eq",
    "override",
    "private",
    "protected",
    "public",
    "reflexpr",
    "register",
    "reinterpret_cast|10",
    "requires",
    "return",
    "sizeof",
    "static_assert",
    "static_cast|10",
    "struct",
    "switch",
    "synchronized",
    "template",
    "this",
    "thread_local",
    "throw",
    "transaction_safe",
    "transaction_safe_dynamic",
    "true",
    "try",
    "typedef",
    "typeid",
    "typename",
    "union",
    "using",
    "virtual",
    "volatile",
    "while",
    "xor",
    "xor_eq"
  ];
  const RESERVED_TYPES = [
    "bool",
    "char",
    "char16_t",
    "char32_t",
    "char8_t",
    "double",
    "float",
    "int",
    "long",
    "short",
    "void",
    "wchar_t",
    "unsigned",
    "signed",
    "const",
    "static"
  ];
  const TYPE_HINTS = [
    "any",
    "auto_ptr",
    "barrier",
    "binary_semaphore",
    "bitset",
    "complex",
    "condition_variable",
    "condition_variable_any",
    "counting_semaphore",
    "deque",
    "false_type",
    "flat_map",
    "flat_set",
    "future",
    "imaginary",
    "initializer_list",
    "istringstream",
    "jthread",
    "latch",
    "lock_guard",
    "multimap",
    "multiset",
    "mutex",
    "optional",
    "ostringstream",
    "packaged_task",
    "pair",
    "promise",
    "priority_queue",
    "queue",
    "recursive_mutex",
    "recursive_timed_mutex",
    "scoped_lock",
    "set",
    "shared_future",
    "shared_lock",
    "shared_mutex",
    "shared_timed_mutex",
    "shared_ptr",
    "stack",
    "string_view",
    "stringstream",
    "timed_mutex",
    "thread",
    "true_type",
    "tuple",
    "unique_lock",
    "unique_ptr",
    "unordered_map",
    "unordered_multimap",
    "unordered_multiset",
    "unordered_set",
    "variant",
    "vector",
    "weak_ptr",
    "wstring",
    "wstring_view"
  ];
  const FUNCTION_HINTS = [
    "abort",
    "abs",
    "acos",
    "apply",
    "as_const",
    "asin",
    "atan",
    "atan2",
    "calloc",
    "ceil",
    "cerr",
    "cin",
    "clog",
    "cos",
    "cosh",
    "cout",
    "declval",
    "endl",
    "exchange",
    "exit",
    "exp",
    "fabs",
    "floor",
    "fmod",
    "forward",
    "fprintf",
    "fputs",
    "free",
    "frexp",
    "fscanf",
    "future",
    "invoke",
    "isalnum",
    "isalpha",
    "iscntrl",
    "isdigit",
    "isgraph",
    "islower",
    "isprint",
    "ispunct",
    "isspace",
    "isupper",
    "isxdigit",
    "labs",
    "launder",
    "ldexp",
    "log",
    "log10",
    "make_pair",
    "make_shared",
    "make_shared_for_overwrite",
    "make_tuple",
    "make_unique",
    "malloc",
    "memchr",
    "memcmp",
    "memcpy",
    "memset",
    "modf",
    "move",
    "pow",
    "printf",
    "putchar",
    "puts",
    "realloc",
    "scanf",
    "sin",
    "sinh",
    "snprintf",
    "sprintf",
    "sqrt",
    "sscanf",
    "std",
    "stderr",
    "stdin",
    "stdout",
    "strcat",
    "strchr",
    "strcmp",
    "strcpy",
    "strcspn",
    "strlen",
    "strncat",
    "strncmp",
    "strncpy",
    "strpbrk",
    "strrchr",
    "strspn",
    "strstr",
    "swap",
    "tan",
    "tanh",
    "terminate",
    "to_underlying",
    "tolower",
    "toupper",
    "vfprintf",
    "visit",
    "vprintf",
    "vsprintf"
  ];
  const LITERALS3 = [
    "NULL",
    "false",
    "nullopt",
    "nullptr",
    "true"
  ];
  const BUILT_IN = ["_Pragma"];
  const CPP_KEYWORDS = {
    type: RESERVED_TYPES,
    keyword: RESERVED_KEYWORDS,
    literal: LITERALS3,
    built_in: BUILT_IN,
    _type_hints: TYPE_HINTS
  };
  const FUNCTION_DISPATCH = {
    className: "function.dispatch",
    relevance: 0,
    keywords: {
      // Only for relevance, not highlighting.
      _hint: FUNCTION_HINTS
    },
    begin: regex.concat(
      /\b/,
      `(?!${RESERVED_KEYWORDS.join("|")})`,
      hljs.IDENT_RE,
      regex.lookahead(/(<[^<>]+>|)\s*\(/)
    )
  };
  const EXPRESSION_CONTAINS = [
    FUNCTION_DISPATCH,
    ...PREPROCESSORS,
    CPP_PRIMITIVE_TYPES,
    C_LINE_COMMENT_MODE,
    hljs.C_BLOCK_COMMENT_MODE,
    NUMBERS,
    STRINGS
  ];
  const EXPRESSION_CONTEXT = {
    // This mode covers expression context where we can't expect a function
    // definition and shouldn't highlight anything that looks like one:
    // `return some()`, `else if()`, `(x*sum(1, 2))`
    variants: [
      {
        begin: /=/,
        end: /;/
      },
      {
        begin: /\(/,
        end: /\)/
      },
      {
        beginKeywords: "new throw return else",
        end: /;/
      }
    ],
    keywords: CPP_KEYWORDS,
    contains: EXPRESSION_CONTAINS.concat([
      {
        begin: /\(/,
        end: /\)/,
        keywords: CPP_KEYWORDS,
        contains: EXPRESSION_CONTAINS.concat(["self"]),
        relevance: 0
      }
    ]),
    relevance: 0
  };
  const FUNCTION_DECLARATION = {
    className: "function",
    begin: "(" + FUNCTION_TYPE_RE + "[\\*&\\s]+){1," + MAX_FUNCTION_TYPE_TOKENS + "}" + FUNCTION_TITLE,
    returnBegin: true,
    end: /[{;=]/,
    excludeEnd: true,
    keywords: CPP_KEYWORDS,
    illegal: /[^\w\s\*&:<>.]/,
    contains: [
      {
        // to prevent it from being confused as the function title
        begin: DECLTYPE_AUTO_RE,
        keywords: CPP_KEYWORDS,
        relevance: 0
      },
      {
        begin: FUNCTION_TITLE,
        returnBegin: true,
        contains: [TITLE_MODE],
        relevance: 0
      },
      // needed because we do not have look-behind on the below rule
      // to prevent it from grabbing the final : in a :: pair
      {
        begin: /::/,
        relevance: 0
      },
      // initializers
      {
        begin: /:/,
        endsWithParent: true,
        contains: [
          STRINGS,
          NUMBERS
        ]
      },
      // allow for multiple declarations, e.g.:
      // extern void f(int), g(char);
      {
        relevance: 0,
        match: /,/
      },
      {
        className: "params",
        begin: /\(/,
        end: /\)/,
        keywords: CPP_KEYWORDS,
        relevance: 0,
        contains: [
          C_LINE_COMMENT_MODE,
          hljs.C_BLOCK_COMMENT_MODE,
          STRINGS,
          NUMBERS,
          CPP_PRIMITIVE_TYPES,
          // Count matching parentheses.
          {
            begin: /\(/,
            end: /\)/,
            keywords: CPP_KEYWORDS,
            relevance: 0,
            contains: [
              "self",
              C_LINE_COMMENT_MODE,
              hljs.C_BLOCK_COMMENT_MODE,
              STRINGS,
              NUMBERS,
              CPP_PRIMITIVE_TYPES
            ]
          }
        ]
      },
      CPP_PRIMITIVE_TYPES,
      C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      ...PREPROCESSORS
    ]
  };
  return {
    name: "C++",
    aliases: [
      "cc",
      "c++",
      "h++",
      "hpp",
      "hh",
      "hxx",
      "cxx"
    ],
    keywords: CPP_KEYWORDS,
    illegal: "</",
    classNameAliases: { "function.dispatch": "built_in" },
    contains: [].concat(
      EXPRESSION_CONTEXT,
      FUNCTION_DECLARATION,
      FUNCTION_DISPATCH,
      EXPRESSION_CONTAINS,
      [
        ...PREPROCESSORS,
        {
          // containers: ie, `vector <int> rooms (9);`
          begin: "\\b(deque|list|queue|priority_queue|pair|stack|vector|map|set|bitset|multiset|multimap|unordered_map|unordered_set|unordered_multiset|unordered_multimap|array|tuple|optional|variant|function|flat_map|flat_set)\\s*<(?!<)",
          end: ">",
          keywords: CPP_KEYWORDS,
          contains: [
            "self",
            CPP_PRIMITIVE_TYPES
          ]
        },
        {
          begin: hljs.IDENT_RE + "::",
          keywords: CPP_KEYWORDS
        },
        {
          match: [
            // extra complexity to deal with `enum class` and `enum struct`
            /\b(?:enum(?:\s+(?:class|struct))?|class|struct|union)/,
            /\s+/,
            /\w+/
          ],
          className: {
            1: "keyword",
            3: "title.class"
          }
        }
      ]
    )
  };
}

// node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/languages/diff.js
function diff(hljs) {
  const regex = hljs.regex;
  return {
    name: "Diff",
    aliases: ["patch"],
    contains: [
      {
        className: "meta",
        relevance: 10,
        match: regex.either(
          /^@@ +-\d+,\d+ +\+\d+,\d+ +@@/,
          // @@ -1,2 +1,2 @@
          /^@@ +-\d+ +\+\d+,\d+ +@@/,
          // @@ -1 +1,2 @@
          /^@@ +-\d+,\d+ +\+\d+ +@@/,
          // @@ -1,2 +1 @@
          /^@@ +-\d+ +\+\d+ +@@/,
          // @@ -1 +1 @@
          /^\*\*\* +\d+,\d+ +\*\*\*\*$/,
          /^--- +\d+,\d+ +----$/
        )
      },
      {
        className: "comment",
        variants: [
          {
            begin: regex.either(
              /Index: /,
              /^index/,
              /={3,}/,
              /^-{3}/,
              /^\*{3} /,
              /^\+{3}/,
              /^diff --git/
            ),
            end: /$/
          },
          { match: /^\*{15}$/ }
        ]
      },
      {
        className: "addition",
        begin: /^\+/,
        end: /$/
      },
      {
        className: "deletion",
        begin: /^-/,
        end: /$/
      },
      {
        className: "addition",
        begin: /^!/,
        end: /$/
      }
    ]
  };
}

// plugins/tool-render/src/client.tsx
var import_react4 = __toESM(require("react"), 1);

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/nodes/identity.js
var ALIAS = /* @__PURE__ */ Symbol.for("yaml.alias");
var DOC = /* @__PURE__ */ Symbol.for("yaml.document");
var MAP = /* @__PURE__ */ Symbol.for("yaml.map");
var PAIR = /* @__PURE__ */ Symbol.for("yaml.pair");
var SCALAR = /* @__PURE__ */ Symbol.for("yaml.scalar");
var SEQ = /* @__PURE__ */ Symbol.for("yaml.seq");
var NODE_TYPE = /* @__PURE__ */ Symbol.for("yaml.node.type");
var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
function isCollection(node) {
  if (node && typeof node === "object")
    switch (node[NODE_TYPE]) {
      case MAP:
      case SEQ:
        return true;
    }
  return false;
}
function isNode(node) {
  if (node && typeof node === "object")
    switch (node[NODE_TYPE]) {
      case ALIAS:
      case MAP:
      case SCALAR:
      case SEQ:
        return true;
    }
  return false;
}
var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/visit.js
var BREAK = /* @__PURE__ */ Symbol("break visit");
var SKIP = /* @__PURE__ */ Symbol("skip children");
var REMOVE = /* @__PURE__ */ Symbol("remove node");
function visit(node, visitor) {
  const visitor_ = initVisitor(visitor);
  if (isDocument(node)) {
    const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
    if (cd === REMOVE)
      node.contents = null;
  } else
    visit_(null, node, visitor_, Object.freeze([]));
}
visit.BREAK = BREAK;
visit.SKIP = SKIP;
visit.REMOVE = REMOVE;
function visit_(key, node, visitor, path) {
  const ctrl = callVisitor(key, node, visitor, path);
  if (isNode(ctrl) || isPair(ctrl)) {
    replaceNode(key, path, ctrl);
    return visit_(key, ctrl, visitor, path);
  }
  if (typeof ctrl !== "symbol") {
    if (isCollection(node)) {
      path = Object.freeze(path.concat(node));
      for (let i = 0; i < node.items.length; ++i) {
        const ci = visit_(i, node.items[i], visitor, path);
        if (typeof ci === "number")
          i = ci - 1;
        else if (ci === BREAK)
          return BREAK;
        else if (ci === REMOVE) {
          node.items.splice(i, 1);
          i -= 1;
        }
      }
    } else if (isPair(node)) {
      path = Object.freeze(path.concat(node));
      const ck = visit_("key", node.key, visitor, path);
      if (ck === BREAK)
        return BREAK;
      else if (ck === REMOVE)
        node.key = null;
      const cv = visit_("value", node.value, visitor, path);
      if (cv === BREAK)
        return BREAK;
      else if (cv === REMOVE)
        node.value = null;
    }
  }
  return ctrl;
}
async function visitAsync(node, visitor) {
  const visitor_ = initVisitor(visitor);
  if (isDocument(node)) {
    const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
    if (cd === REMOVE)
      node.contents = null;
  } else
    await visitAsync_(null, node, visitor_, Object.freeze([]));
}
visitAsync.BREAK = BREAK;
visitAsync.SKIP = SKIP;
visitAsync.REMOVE = REMOVE;
async function visitAsync_(key, node, visitor, path) {
  const ctrl = await callVisitor(key, node, visitor, path);
  if (isNode(ctrl) || isPair(ctrl)) {
    replaceNode(key, path, ctrl);
    return visitAsync_(key, ctrl, visitor, path);
  }
  if (typeof ctrl !== "symbol") {
    if (isCollection(node)) {
      path = Object.freeze(path.concat(node));
      for (let i = 0; i < node.items.length; ++i) {
        const ci = await visitAsync_(i, node.items[i], visitor, path);
        if (typeof ci === "number")
          i = ci - 1;
        else if (ci === BREAK)
          return BREAK;
        else if (ci === REMOVE) {
          node.items.splice(i, 1);
          i -= 1;
        }
      }
    } else if (isPair(node)) {
      path = Object.freeze(path.concat(node));
      const ck = await visitAsync_("key", node.key, visitor, path);
      if (ck === BREAK)
        return BREAK;
      else if (ck === REMOVE)
        node.key = null;
      const cv = await visitAsync_("value", node.value, visitor, path);
      if (cv === BREAK)
        return BREAK;
      else if (cv === REMOVE)
        node.value = null;
    }
  }
  return ctrl;
}
function initVisitor(visitor) {
  if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
    return Object.assign({
      Alias: visitor.Node,
      Map: visitor.Node,
      Scalar: visitor.Node,
      Seq: visitor.Node
    }, visitor.Value && {
      Map: visitor.Value,
      Scalar: visitor.Value,
      Seq: visitor.Value
    }, visitor.Collection && {
      Map: visitor.Collection,
      Seq: visitor.Collection
    }, visitor);
  }
  return visitor;
}
function callVisitor(key, node, visitor, path) {
  if (typeof visitor === "function")
    return visitor(key, node, path);
  if (isMap(node))
    return visitor.Map?.(key, node, path);
  if (isSeq(node))
    return visitor.Seq?.(key, node, path);
  if (isPair(node))
    return visitor.Pair?.(key, node, path);
  if (isScalar(node))
    return visitor.Scalar?.(key, node, path);
  if (isAlias(node))
    return visitor.Alias?.(key, node, path);
  return void 0;
}
function replaceNode(key, path, node) {
  const parent = path[path.length - 1];
  if (isCollection(parent)) {
    parent.items[key] = node;
  } else if (isPair(parent)) {
    if (key === "key")
      parent.key = node;
    else
      parent.value = node;
  } else if (isDocument(parent)) {
    parent.contents = node;
  } else {
    const pt = isAlias(parent) ? "alias" : "scalar";
    throw new Error(`Cannot replace node with ${pt} parent`);
  }
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/doc/directives.js
var escapeChars = {
  "!": "%21",
  ",": "%2C",
  "[": "%5B",
  "]": "%5D",
  "{": "%7B",
  "}": "%7D"
};
var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
var Directives = class _Directives {
  constructor(yaml2, tags) {
    this.docStart = null;
    this.docEnd = false;
    this.yaml = Object.assign({}, _Directives.defaultYaml, yaml2);
    this.tags = Object.assign({}, _Directives.defaultTags, tags);
  }
  clone() {
    const copy = new _Directives(this.yaml, this.tags);
    copy.docStart = this.docStart;
    return copy;
  }
  /**
   * During parsing, get a Directives instance for the current document and
   * update the stream state according to the current version's spec.
   */
  atDocument() {
    const res = new _Directives(this.yaml, this.tags);
    switch (this.yaml.version) {
      case "1.1":
        this.atNextDocument = true;
        break;
      case "1.2":
        this.atNextDocument = false;
        this.yaml = {
          explicit: _Directives.defaultYaml.explicit,
          version: "1.2"
        };
        this.tags = Object.assign({}, _Directives.defaultTags);
        break;
    }
    return res;
  }
  /**
   * @param onError - May be called even if the action was successful
   * @returns `true` on success
   */
  add(line, onError) {
    if (this.atNextDocument) {
      this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
      this.tags = Object.assign({}, _Directives.defaultTags);
      this.atNextDocument = false;
    }
    const parts = line.trim().split(/[ \t]+/);
    const name2 = parts.shift();
    switch (name2) {
      case "%TAG": {
        if (parts.length !== 2) {
          onError(0, "%TAG directive should contain exactly two parts");
          if (parts.length < 2)
            return false;
        }
        const [handle, prefix] = parts;
        this.tags[handle] = prefix;
        return true;
      }
      case "%YAML": {
        this.yaml.explicit = true;
        if (parts.length !== 1) {
          onError(0, "%YAML directive should contain exactly one part");
          return false;
        }
        const [version] = parts;
        if (version === "1.1" || version === "1.2") {
          this.yaml.version = version;
          return true;
        } else {
          const isValid = /^\d+\.\d+$/.test(version);
          onError(6, `Unsupported YAML version ${version}`, isValid);
          return false;
        }
      }
      default:
        onError(0, `Unknown directive ${name2}`, true);
        return false;
    }
  }
  /**
   * Resolves a tag, matching handles to those defined in %TAG directives.
   *
   * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
   *   `'!local'` tag, or `null` if unresolvable.
   */
  tagName(source, onError) {
    if (source === "!")
      return "!";
    if (source[0] !== "!") {
      onError(`Not a valid tag: ${source}`);
      return null;
    }
    if (source[1] === "<") {
      const verbatim = source.slice(2, -1);
      if (verbatim === "!" || verbatim === "!!") {
        onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
        return null;
      }
      if (source[source.length - 1] !== ">")
        onError("Verbatim tags must end with a >");
      return verbatim;
    }
    const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
    if (!suffix)
      onError(`The ${source} tag has no suffix`);
    const prefix = this.tags[handle];
    if (prefix) {
      try {
        return prefix + decodeURIComponent(suffix);
      } catch (error) {
        onError(String(error));
        return null;
      }
    }
    if (handle === "!")
      return source;
    onError(`Could not resolve tag: ${source}`);
    return null;
  }
  /**
   * Given a fully resolved tag, returns its printable string form,
   * taking into account current tag prefixes and defaults.
   */
  tagString(tag) {
    for (const [handle, prefix] of Object.entries(this.tags)) {
      if (tag.startsWith(prefix))
        return handle + escapeTagName(tag.substring(prefix.length));
    }
    return tag[0] === "!" ? tag : `!<${tag}>`;
  }
  toString(doc) {
    const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
    const tagEntries = Object.entries(this.tags);
    let tagNames;
    if (doc && tagEntries.length > 0 && isNode(doc.contents)) {
      const tags = {};
      visit(doc.contents, (_key, node) => {
        if (isNode(node) && node.tag)
          tags[node.tag] = true;
      });
      tagNames = Object.keys(tags);
    } else
      tagNames = [];
    for (const [handle, prefix] of tagEntries) {
      if (handle === "!!" && prefix === "tag:yaml.org,2002:")
        continue;
      if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
        lines.push(`%TAG ${handle} ${prefix}`);
    }
    return lines.join("\n");
  }
};
Directives.defaultYaml = { explicit: false, version: "1.2" };
Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/doc/anchors.js
function anchorIsValid(anchor) {
  if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
    const sa = JSON.stringify(anchor);
    const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
    throw new Error(msg);
  }
  return true;
}
function anchorNames(root) {
  const anchors = /* @__PURE__ */ new Set();
  visit(root, {
    Value(_key, node) {
      if (node.anchor)
        anchors.add(node.anchor);
    }
  });
  return anchors;
}
function findNewAnchor(prefix, exclude) {
  for (let i = 1; true; ++i) {
    const name2 = `${prefix}${i}`;
    if (!exclude.has(name2))
      return name2;
  }
}
function createNodeAnchors(doc, prefix) {
  const aliasObjects = [];
  const sourceObjects = /* @__PURE__ */ new Map();
  let prevAnchors = null;
  return {
    onAnchor: (source) => {
      aliasObjects.push(source);
      prevAnchors ?? (prevAnchors = anchorNames(doc));
      const anchor = findNewAnchor(prefix, prevAnchors);
      prevAnchors.add(anchor);
      return anchor;
    },
    /**
     * With circular references, the source node is only resolved after all
     * of its child nodes are. This is why anchors are set only after all of
     * the nodes have been created.
     */
    setAnchors: () => {
      for (const source of aliasObjects) {
        const ref = sourceObjects.get(source);
        if (typeof ref === "object" && ref.anchor && (isScalar(ref.node) || isCollection(ref.node))) {
          ref.node.anchor = ref.anchor;
        } else {
          const error = new Error("Failed to resolve repeated object (this should not happen)");
          error.source = source;
          throw error;
        }
      }
    },
    sourceObjects
  };
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/doc/applyReviver.js
function applyReviver(reviver, obj, key, val) {
  if (val && typeof val === "object") {
    if (Array.isArray(val)) {
      for (let i = 0, len = val.length; i < len; ++i) {
        const v0 = val[i];
        const v1 = applyReviver(reviver, val, String(i), v0);
        if (v1 === void 0)
          delete val[i];
        else if (v1 !== v0)
          val[i] = v1;
      }
    } else if (val instanceof Map) {
      for (const k of Array.from(val.keys())) {
        const v0 = val.get(k);
        const v1 = applyReviver(reviver, val, k, v0);
        if (v1 === void 0)
          val.delete(k);
        else if (v1 !== v0)
          val.set(k, v1);
      }
    } else if (val instanceof Set) {
      for (const v0 of Array.from(val)) {
        const v1 = applyReviver(reviver, val, v0, v0);
        if (v1 === void 0)
          val.delete(v0);
        else if (v1 !== v0) {
          val.delete(v0);
          val.add(v1);
        }
      }
    } else {
      for (const [k, v0] of Object.entries(val)) {
        const v1 = applyReviver(reviver, val, k, v0);
        if (v1 === void 0)
          delete val[k];
        else if (v1 !== v0)
          val[k] = v1;
      }
    }
  }
  return reviver.call(obj, key, val);
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/nodes/toJS.js
function toJS(value, arg, ctx) {
  if (Array.isArray(value))
    return value.map((v, i) => toJS(v, String(i), ctx));
  if (value && typeof value.toJSON === "function") {
    if (!ctx || !hasAnchor(value))
      return value.toJSON(arg, ctx);
    const data = { aliasCount: 0, count: 1, res: void 0 };
    ctx.anchors.set(value, data);
    ctx.onCreate = (res2) => {
      data.res = res2;
      delete ctx.onCreate;
    };
    const res = value.toJSON(arg, ctx);
    if (ctx.onCreate)
      ctx.onCreate(res);
    return res;
  }
  if (typeof value === "bigint" && !ctx?.keep)
    return Number(value);
  return value;
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/nodes/Node.js
var NodeBase = class {
  constructor(type) {
    Object.defineProperty(this, NODE_TYPE, { value: type });
  }
  /** Create a copy of this node.  */
  clone() {
    const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
    if (this.range)
      copy.range = this.range.slice();
    return copy;
  }
  /** A plain JavaScript representation of this node. */
  toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
    if (!isDocument(doc))
      throw new TypeError("A document argument is required");
    const ctx = {
      anchors: /* @__PURE__ */ new Map(),
      doc,
      keep: true,
      mapAsMap: mapAsMap === true,
      mapKeyWarned: false,
      maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
    };
    const res = toJS(this, "", ctx);
    if (typeof onAnchor === "function")
      for (const { count, res: res2 } of ctx.anchors.values())
        onAnchor(res2, count);
    return typeof reviver === "function" ? applyReviver(reviver, { "": res }, "", res) : res;
  }
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/nodes/Alias.js
var Alias = class extends NodeBase {
  constructor(source) {
    super(ALIAS);
    this.source = source;
    Object.defineProperty(this, "tag", {
      set() {
        throw new Error("Alias nodes cannot have tags");
      }
    });
  }
  /**
   * Resolve the value of this alias within `doc`, finding the last
   * instance of the `source` anchor before this node.
   */
  resolve(doc, ctx) {
    if (ctx?.maxAliasCount === 0)
      throw new ReferenceError("Alias resolution is disabled");
    let nodes;
    if (ctx?.aliasResolveCache) {
      nodes = ctx.aliasResolveCache;
    } else {
      nodes = [];
      visit(doc, {
        Node: (_key, node) => {
          if (isAlias(node) || hasAnchor(node))
            nodes.push(node);
        }
      });
      if (ctx)
        ctx.aliasResolveCache = nodes;
    }
    let found = void 0;
    for (const node of nodes) {
      if (node === this)
        break;
      if (node.anchor === this.source)
        found = node;
    }
    return found;
  }
  toJSON(_arg, ctx) {
    if (!ctx)
      return { source: this.source };
    const { anchors, doc, maxAliasCount } = ctx;
    const source = this.resolve(doc, ctx);
    if (!source) {
      const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
      throw new ReferenceError(msg);
    }
    let data = anchors.get(source);
    if (!data) {
      toJS(source, null, ctx);
      data = anchors.get(source);
    }
    if (data?.res === void 0) {
      const msg = "This should not happen: Alias anchor was not resolved?";
      throw new ReferenceError(msg);
    }
    if (maxAliasCount >= 0) {
      data.count += 1;
      if (data.aliasCount === 0)
        data.aliasCount = getAliasCount(doc, source, anchors);
      if (data.count * data.aliasCount > maxAliasCount) {
        const msg = "Excessive alias count indicates a resource exhaustion attack";
        throw new ReferenceError(msg);
      }
    }
    return data.res;
  }
  toString(ctx, _onComment, _onChompKeep) {
    const src = `*${this.source}`;
    if (ctx) {
      anchorIsValid(this.source);
      if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
        const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
        throw new Error(msg);
      }
      if (ctx.implicitKey)
        return `${src} `;
    }
    return src;
  }
};
function getAliasCount(doc, node, anchors) {
  if (isAlias(node)) {
    const source = node.resolve(doc);
    const anchor = anchors && source && anchors.get(source);
    return anchor ? anchor.count * anchor.aliasCount : 0;
  } else if (isCollection(node)) {
    let count = 0;
    for (const item of node.items) {
      const c2 = getAliasCount(doc, item, anchors);
      if (c2 > count)
        count = c2;
    }
    return count;
  } else if (isPair(node)) {
    const kc = getAliasCount(doc, node.key, anchors);
    const vc = getAliasCount(doc, node.value, anchors);
    return Math.max(kc, vc);
  }
  return 1;
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/nodes/Scalar.js
var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
var Scalar = class extends NodeBase {
  constructor(value) {
    super(SCALAR);
    this.value = value;
  }
  toJSON(arg, ctx) {
    return ctx?.keep ? this.value : toJS(this.value, arg, ctx);
  }
  toString() {
    return String(this.value);
  }
};
Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
Scalar.PLAIN = "PLAIN";
Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/doc/createNode.js
var defaultTagPrefix = "tag:yaml.org,2002:";
function findTagObject(value, tagName, tags) {
  if (tagName) {
    const match = tags.filter((t) => t.tag === tagName);
    const tagObj = match.find((t) => !t.format) ?? match[0];
    if (!tagObj)
      throw new Error(`Tag ${tagName} not found`);
    return tagObj;
  }
  return tags.find((t) => t.identify?.(value) && !t.format);
}
function createNode(value, tagName, ctx) {
  if (isDocument(value))
    value = value.contents;
  if (isNode(value))
    return value;
  if (isPair(value)) {
    const map2 = ctx.schema[MAP].createNode?.(ctx.schema, null, ctx);
    map2.items.push(value);
    return map2;
  }
  if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
    value = value.valueOf();
  }
  const { aliasDuplicateObjects, onAnchor, onTagObj, schema: schema4, sourceObjects } = ctx;
  let ref = void 0;
  if (aliasDuplicateObjects && value && typeof value === "object") {
    ref = sourceObjects.get(value);
    if (ref) {
      ref.anchor ?? (ref.anchor = onAnchor(value));
      return new Alias(ref.anchor);
    } else {
      ref = { anchor: null, node: null };
      sourceObjects.set(value, ref);
    }
  }
  if (tagName?.startsWith("!!"))
    tagName = defaultTagPrefix + tagName.slice(2);
  let tagObj = findTagObject(value, tagName, schema4.tags);
  if (!tagObj) {
    if (value && typeof value.toJSON === "function") {
      value = value.toJSON();
    }
    if (!value || typeof value !== "object") {
      const node2 = new Scalar(value);
      if (ref)
        ref.node = node2;
      return node2;
    }
    tagObj = value instanceof Map ? schema4[MAP] : Symbol.iterator in Object(value) ? schema4[SEQ] : schema4[MAP];
  }
  if (onTagObj) {
    onTagObj(tagObj);
    delete ctx.onTagObj;
  }
  const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar(value);
  if (tagName)
    node.tag = tagName;
  else if (!tagObj.default)
    node.tag = tagObj.tag;
  if (ref)
    ref.node = node;
  return node;
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/nodes/Collection.js
function collectionFromPath(schema4, path, value) {
  let v = value;
  for (let i = path.length - 1; i >= 0; --i) {
    const k = path[i];
    if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
      const a = [];
      a[k] = v;
      v = a;
    } else {
      v = /* @__PURE__ */ new Map([[k, v]]);
    }
  }
  return createNode(v, void 0, {
    aliasDuplicateObjects: false,
    keepUndefined: false,
    onAnchor: () => {
      throw new Error("This should not happen, please report a bug.");
    },
    schema: schema4,
    sourceObjects: /* @__PURE__ */ new Map()
  });
}
var isEmptyPath = (path) => path == null || typeof path === "object" && !!path[Symbol.iterator]().next().done;
var Collection = class extends NodeBase {
  constructor(type, schema4) {
    super(type);
    Object.defineProperty(this, "schema", {
      value: schema4,
      configurable: true,
      enumerable: false,
      writable: true
    });
  }
  /**
   * Create a copy of this collection.
   *
   * @param schema - If defined, overwrites the original's schema
   */
  clone(schema4) {
    const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
    if (schema4)
      copy.schema = schema4;
    copy.items = copy.items.map((it) => isNode(it) || isPair(it) ? it.clone(schema4) : it);
    if (this.range)
      copy.range = this.range.slice();
    return copy;
  }
  /**
   * Adds a value to the collection. For `!!map` and `!!omap` the value must
   * be a Pair instance or a `{ key, value }` object, which may not have a key
   * that already exists in the map.
   */
  addIn(path, value) {
    if (isEmptyPath(path))
      this.add(value);
    else {
      const [key, ...rest] = path;
      const node = this.get(key, true);
      if (isCollection(node))
        node.addIn(rest, value);
      else if (node === void 0 && this.schema)
        this.set(key, collectionFromPath(this.schema, rest, value));
      else
        throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
    }
  }
  /**
   * Removes a value from the collection.
   * @returns `true` if the item was found and removed.
   */
  deleteIn(path) {
    const [key, ...rest] = path;
    if (rest.length === 0)
      return this.delete(key);
    const node = this.get(key, true);
    if (isCollection(node))
      return node.deleteIn(rest);
    else
      throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
  }
  /**
   * Returns item at `key`, or `undefined` if not found. By default unwraps
   * scalar values from their surrounding node; to disable set `keepScalar` to
   * `true` (collections are always returned intact).
   */
  getIn(path, keepScalar) {
    const [key, ...rest] = path;
    const node = this.get(key, true);
    if (rest.length === 0)
      return !keepScalar && isScalar(node) ? node.value : node;
    else
      return isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
  }
  hasAllNullValues(allowScalar) {
    return this.items.every((node) => {
      if (!isPair(node))
        return false;
      const n = node.value;
      return n == null || allowScalar && isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
    });
  }
  /**
   * Checks if the collection includes a value with the key `key`.
   */
  hasIn(path) {
    const [key, ...rest] = path;
    if (rest.length === 0)
      return this.has(key);
    const node = this.get(key, true);
    return isCollection(node) ? node.hasIn(rest) : false;
  }
  /**
   * Sets a value in this collection. For `!!set`, `value` needs to be a
   * boolean to add/remove the item from the set.
   */
  setIn(path, value) {
    const [key, ...rest] = path;
    if (rest.length === 0) {
      this.set(key, value);
    } else {
      const node = this.get(key, true);
      if (isCollection(node))
        node.setIn(rest, value);
      else if (node === void 0 && this.schema)
        this.set(key, collectionFromPath(this.schema, rest, value));
      else
        throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
    }
  }
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/stringify/stringifyComment.js
var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
function indentComment(comment, indent) {
  if (/^\n+$/.test(comment))
    return comment.substring(1);
  return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
}
var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/stringify/foldFlowLines.js
var FOLD_FLOW = "flow";
var FOLD_BLOCK = "block";
var FOLD_QUOTED = "quoted";
function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
  if (!lineWidth || lineWidth < 0)
    return text;
  if (lineWidth < minContentWidth)
    minContentWidth = 0;
  const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
  if (text.length <= endStep)
    return text;
  const folds = [];
  const escapedFolds = {};
  let end = lineWidth - indent.length;
  if (typeof indentAtStart === "number") {
    if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
      folds.push(0);
    else
      end = lineWidth - indentAtStart;
  }
  let split = void 0;
  let prev = void 0;
  let overflow = false;
  let i = -1;
  let escStart = -1;
  let escEnd = -1;
  if (mode === FOLD_BLOCK) {
    i = consumeMoreIndentedLines(text, i, indent.length);
    if (i !== -1)
      end = i + endStep;
  }
  for (let ch; ch = text[i += 1]; ) {
    if (mode === FOLD_QUOTED && ch === "\\") {
      escStart = i;
      switch (text[i + 1]) {
        case "x":
          i += 3;
          break;
        case "u":
          i += 5;
          break;
        case "U":
          i += 9;
          break;
        default:
          i += 1;
      }
      escEnd = i;
    }
    if (ch === "\n") {
      if (mode === FOLD_BLOCK)
        i = consumeMoreIndentedLines(text, i, indent.length);
      end = i + indent.length + endStep;
      split = void 0;
    } else {
      if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
        const next = text[i + 1];
        if (next && next !== " " && next !== "\n" && next !== "	")
          split = i;
      }
      if (i >= end) {
        if (split) {
          folds.push(split);
          end = split + endStep;
          split = void 0;
        } else if (mode === FOLD_QUOTED) {
          while (prev === " " || prev === "	") {
            prev = ch;
            ch = text[i += 1];
            overflow = true;
          }
          const j = i > escEnd + 1 ? i - 2 : escStart - 1;
          if (escapedFolds[j])
            return text;
          folds.push(j);
          escapedFolds[j] = true;
          end = j + endStep;
          split = void 0;
        } else {
          overflow = true;
        }
      }
    }
    prev = ch;
  }
  if (overflow && onOverflow)
    onOverflow();
  if (folds.length === 0)
    return text;
  if (onFold)
    onFold();
  let res = text.slice(0, folds[0]);
  for (let i2 = 0; i2 < folds.length; ++i2) {
    const fold = folds[i2];
    const end2 = folds[i2 + 1] || text.length;
    if (fold === 0)
      res = `
${indent}${text.slice(0, end2)}`;
    else {
      if (mode === FOLD_QUOTED && escapedFolds[fold])
        res += `${text[fold]}\\`;
      res += `
${indent}${text.slice(fold + 1, end2)}`;
    }
  }
  return res;
}
function consumeMoreIndentedLines(text, i, indent) {
  let end = i;
  let start = i + 1;
  let ch = text[start];
  while (ch === " " || ch === "	") {
    if (i < start + indent) {
      ch = text[++i];
    } else {
      do {
        ch = text[++i];
      } while (ch && ch !== "\n");
      end = i;
      start = i + 1;
      ch = text[start];
    }
  }
  return end;
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/stringify/stringifyString.js
var getFoldOptions = (ctx, isBlock2) => ({
  indentAtStart: isBlock2 ? ctx.indent.length : ctx.indentAtStart,
  lineWidth: ctx.options.lineWidth,
  minContentWidth: ctx.options.minContentWidth
});
var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
function lineLengthOverLimit(str, lineWidth, indentLength) {
  if (!lineWidth || lineWidth < 0)
    return false;
  const limit = lineWidth - indentLength;
  const strLen = str.length;
  if (strLen <= limit)
    return false;
  for (let i = 0, start = 0; i < strLen; ++i) {
    if (str[i] === "\n") {
      if (i - start > limit)
        return true;
      start = i + 1;
      if (strLen - start <= limit)
        return false;
    }
  }
  return true;
}
function doubleQuotedString(value, ctx) {
  const json2 = JSON.stringify(value);
  if (ctx.options.doubleQuotedAsJSON)
    return json2;
  const { implicitKey } = ctx;
  const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
  const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
  let str = "";
  let start = 0;
  for (let i = 0, ch = json2[i]; ch; ch = json2[++i]) {
    if (ch === " " && json2[i + 1] === "\\" && json2[i + 2] === "n") {
      str += json2.slice(start, i) + "\\ ";
      i += 1;
      start = i;
      ch = "\\";
    }
    if (ch === "\\")
      switch (json2[i + 1]) {
        case "u":
          {
            str += json2.slice(start, i);
            const code = json2.substr(i + 2, 4);
            switch (code) {
              case "0000":
                str += "\\0";
                break;
              case "0007":
                str += "\\a";
                break;
              case "000b":
                str += "\\v";
                break;
              case "001b":
                str += "\\e";
                break;
              case "0085":
                str += "\\N";
                break;
              case "00a0":
                str += "\\_";
                break;
              case "2028":
                str += "\\L";
                break;
              case "2029":
                str += "\\P";
                break;
              default:
                if (code.substr(0, 2) === "00")
                  str += "\\x" + code.substr(2);
                else
                  str += json2.substr(i, 6);
            }
            i += 5;
            start = i + 1;
          }
          break;
        case "n":
          if (implicitKey || json2[i + 2] === '"' || json2.length < minMultiLineLength) {
            i += 1;
          } else {
            str += json2.slice(start, i) + "\n\n";
            while (json2[i + 2] === "\\" && json2[i + 3] === "n" && json2[i + 4] !== '"') {
              str += "\n";
              i += 2;
            }
            str += indent;
            if (json2[i + 2] === " ")
              str += "\\";
            i += 1;
            start = i + 1;
          }
          break;
        default:
          i += 1;
      }
  }
  str = start ? str + json2.slice(start) : json2;
  return implicitKey ? str : foldFlowLines(str, indent, FOLD_QUOTED, getFoldOptions(ctx, false));
}
function singleQuotedString(value, ctx) {
  if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
    return doubleQuotedString(value, ctx);
  const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
  const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
  return ctx.implicitKey ? res : foldFlowLines(res, indent, FOLD_FLOW, getFoldOptions(ctx, false));
}
function quotedString(value, ctx) {
  const { singleQuote } = ctx.options;
  let qs;
  if (singleQuote === false)
    qs = doubleQuotedString;
  else {
    const hasDouble = value.includes('"');
    const hasSingle = value.includes("'");
    if (hasDouble && !hasSingle)
      qs = singleQuotedString;
    else if (hasSingle && !hasDouble)
      qs = doubleQuotedString;
    else
      qs = singleQuote ? singleQuotedString : doubleQuotedString;
  }
  return qs(value, ctx);
}
var blockEndNewlines;
try {
  blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
} catch {
  blockEndNewlines = /\n+(?!\n|$)/g;
}
function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
  const { blockQuote, commentString, lineWidth } = ctx.options;
  if (!blockQuote || /\n[\t ]+$/.test(value)) {
    return quotedString(value, ctx);
  }
  const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
  const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.BLOCK_FOLDED ? false : type === Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
  if (!value)
    return literal ? "|\n" : ">\n";
  let chomp;
  let endStart;
  for (endStart = value.length; endStart > 0; --endStart) {
    const ch = value[endStart - 1];
    if (ch !== "\n" && ch !== "	" && ch !== " ")
      break;
  }
  let end = value.substring(endStart);
  const endNlPos = end.indexOf("\n");
  if (endNlPos === -1) {
    chomp = "-";
  } else if (value === end || endNlPos !== end.length - 1) {
    chomp = "+";
    if (onChompKeep)
      onChompKeep();
  } else {
    chomp = "";
  }
  if (end) {
    value = value.slice(0, -end.length);
    if (end[end.length - 1] === "\n")
      end = end.slice(0, -1);
    end = end.replace(blockEndNewlines, `$&${indent}`);
  }
  let startWithSpace = false;
  let startEnd;
  let startNlPos = -1;
  for (startEnd = 0; startEnd < value.length; ++startEnd) {
    const ch = value[startEnd];
    if (ch === " ")
      startWithSpace = true;
    else if (ch === "\n")
      startNlPos = startEnd;
    else
      break;
  }
  let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
  if (start) {
    value = value.substring(start.length);
    start = start.replace(/\n+/g, `$&${indent}`);
  }
  const indentSize = indent ? "2" : "1";
  let header = (startWithSpace ? indentSize : "") + chomp;
  if (comment) {
    header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
    if (onComment)
      onComment();
  }
  if (!literal) {
    const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
    let literalFallback = false;
    const foldOptions = getFoldOptions(ctx, true);
    if (blockQuote !== "folded" && type !== Scalar.BLOCK_FOLDED) {
      foldOptions.onOverflow = () => {
        literalFallback = true;
      };
    }
    const body = foldFlowLines(`${start}${foldedValue}${end}`, indent, FOLD_BLOCK, foldOptions);
    if (!literalFallback)
      return `>${header}
${indent}${body}`;
  }
  value = value.replace(/\n+/g, `$&${indent}`);
  return `|${header}
${indent}${start}${value}${end}`;
}
function plainString(item, ctx, onComment, onChompKeep) {
  const { type, value } = item;
  const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
  if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
    return quotedString(value, ctx);
  }
  if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
    return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
  }
  if (!implicitKey && !inFlow && type !== Scalar.PLAIN && value.includes("\n")) {
    return blockString(item, ctx, onComment, onChompKeep);
  }
  if (containsDocumentMarker(value)) {
    if (indent === "") {
      ctx.forceBlockIndent = true;
      return blockString(item, ctx, onComment, onChompKeep);
    } else if (implicitKey && indent === indentStep) {
      return quotedString(value, ctx);
    }
  }
  const str = value.replace(/\n+/g, `$&
${indent}`);
  if (actualString) {
    const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
    const { compat, tags } = ctx.doc.schema;
    if (tags.some(test) || compat?.some(test))
      return quotedString(value, ctx);
  }
  return implicitKey ? str : foldFlowLines(str, indent, FOLD_FLOW, getFoldOptions(ctx, false));
}
function stringifyString(item, ctx, onComment, onChompKeep) {
  const { implicitKey, inFlow } = ctx;
  const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
  let { type } = item;
  if (type !== Scalar.QUOTE_DOUBLE) {
    if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
      type = Scalar.QUOTE_DOUBLE;
  }
  const _stringify = (_type) => {
    switch (_type) {
      case Scalar.BLOCK_FOLDED:
      case Scalar.BLOCK_LITERAL:
        return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
      case Scalar.QUOTE_DOUBLE:
        return doubleQuotedString(ss.value, ctx);
      case Scalar.QUOTE_SINGLE:
        return singleQuotedString(ss.value, ctx);
      case Scalar.PLAIN:
        return plainString(ss, ctx, onComment, onChompKeep);
      default:
        return null;
    }
  };
  let res = _stringify(type);
  if (res === null) {
    const { defaultKeyType, defaultStringType } = ctx.options;
    const t = implicitKey && defaultKeyType || defaultStringType;
    res = _stringify(t);
    if (res === null)
      throw new Error(`Unsupported default string type ${t}`);
  }
  return res;
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/stringify/stringify.js
function createStringifyContext(doc, options) {
  const opt = Object.assign({
    blockQuote: true,
    commentString: stringifyComment,
    defaultKeyType: null,
    defaultStringType: "PLAIN",
    directives: null,
    doubleQuotedAsJSON: false,
    doubleQuotedMinMultiLineLength: 40,
    falseStr: "false",
    flowCollectionPadding: true,
    indentSeq: true,
    lineWidth: 80,
    minContentWidth: 20,
    nullStr: "null",
    simpleKeys: false,
    singleQuote: null,
    trailingComma: false,
    trueStr: "true",
    verifyAliasOrder: true
  }, doc.schema.toStringOptions, options);
  let inFlow;
  switch (opt.collectionStyle) {
    case "block":
      inFlow = false;
      break;
    case "flow":
      inFlow = true;
      break;
    default:
      inFlow = null;
  }
  return {
    anchors: /* @__PURE__ */ new Set(),
    doc,
    flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
    indent: "",
    indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
    inFlow,
    options: opt
  };
}
function getTagObject(tags, item) {
  if (item.tag) {
    const match = tags.filter((t) => t.tag === item.tag);
    if (match.length > 0)
      return match.find((t) => t.format === item.format) ?? match[0];
  }
  let tagObj = void 0;
  let obj;
  if (isScalar(item)) {
    obj = item.value;
    let match = tags.filter((t) => t.identify?.(obj));
    if (match.length > 1) {
      const testMatch = match.filter((t) => t.test);
      if (testMatch.length > 0)
        match = testMatch;
    }
    tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
  } else {
    obj = item;
    tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
  }
  if (!tagObj) {
    const name2 = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
    throw new Error(`Tag not resolved for ${name2} value`);
  }
  return tagObj;
}
function stringifyProps(node, tagObj, { anchors, doc }) {
  if (!doc.directives)
    return "";
  const props = [];
  const anchor = (isScalar(node) || isCollection(node)) && node.anchor;
  if (anchor && anchorIsValid(anchor)) {
    anchors.add(anchor);
    props.push(`&${anchor}`);
  }
  const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
  if (tag)
    props.push(doc.directives.tagString(tag));
  return props.join(" ");
}
function stringify(item, ctx, onComment, onChompKeep) {
  if (isPair(item))
    return item.toString(ctx, onComment, onChompKeep);
  if (isAlias(item)) {
    if (ctx.doc.directives)
      return item.toString(ctx);
    if (ctx.resolvedAliases?.has(item)) {
      throw new TypeError(`Cannot stringify circular structure without alias nodes`);
    } else {
      if (ctx.resolvedAliases)
        ctx.resolvedAliases.add(item);
      else
        ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
      item = item.resolve(ctx.doc);
    }
  }
  let tagObj = void 0;
  const node = isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
  tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
  const props = stringifyProps(node, tagObj, ctx);
  if (props.length > 0)
    ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
  const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : isScalar(node) ? stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
  if (!props)
    return str;
  return isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/stringify/stringifyPair.js
function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
  const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
  let keyComment = isNode(key) && key.comment || null;
  if (simpleKeys) {
    if (keyComment) {
      throw new Error("With simple keys, key nodes cannot have comments");
    }
    if (isCollection(key) || !isNode(key) && typeof key === "object") {
      const msg = "With simple keys, collection cannot be used as a key value";
      throw new Error(msg);
    }
  }
  let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || isCollection(key) || (isScalar(key) ? key.type === Scalar.BLOCK_FOLDED || key.type === Scalar.BLOCK_LITERAL : typeof key === "object"));
  ctx = Object.assign({}, ctx, {
    allNullValues: false,
    implicitKey: !explicitKey && (simpleKeys || !allNullValues),
    indent: indent + indentStep
  });
  let keyCommentDone = false;
  let chompKeep = false;
  let str = stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
  if (!explicitKey && !ctx.inFlow && str.length > 1024) {
    if (simpleKeys)
      throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
    explicitKey = true;
  }
  if (ctx.inFlow) {
    if (allNullValues || value == null) {
      if (keyCommentDone && onComment)
        onComment();
      return str === "" ? "?" : explicitKey ? `? ${str}` : str;
    }
  } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
    str = `? ${str}`;
    if (keyComment && !keyCommentDone) {
      str += lineComment(str, ctx.indent, commentString(keyComment));
    } else if (chompKeep && onChompKeep)
      onChompKeep();
    return str;
  }
  if (keyCommentDone)
    keyComment = null;
  if (explicitKey) {
    if (keyComment)
      str += lineComment(str, ctx.indent, commentString(keyComment));
    str = `? ${str}
${indent}:`;
  } else {
    str = `${str}:`;
    if (keyComment)
      str += lineComment(str, ctx.indent, commentString(keyComment));
  }
  let vsb, vcb, valueComment;
  if (isNode(value)) {
    vsb = !!value.spaceBefore;
    vcb = value.commentBefore;
    valueComment = value.comment;
  } else {
    vsb = false;
    vcb = null;
    valueComment = null;
    if (value && typeof value === "object")
      value = doc.createNode(value);
  }
  ctx.implicitKey = false;
  if (!explicitKey && !keyComment && isScalar(value))
    ctx.indentAtStart = str.length + 1;
  chompKeep = false;
  if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && isSeq(value) && !value.flow && !value.tag && !value.anchor) {
    ctx.indent = ctx.indent.substring(2);
  }
  let valueCommentDone = false;
  const valueStr = stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
  let ws = " ";
  if (keyComment || vsb || vcb) {
    ws = vsb ? "\n" : "";
    if (vcb) {
      const cs = commentString(vcb);
      ws += `
${indentComment(cs, ctx.indent)}`;
    }
    if (valueStr === "" && !ctx.inFlow) {
      if (ws === "\n" && valueComment)
        ws = "\n\n";
    } else {
      ws += `
${ctx.indent}`;
    }
  } else if (!explicitKey && isCollection(value)) {
    const vs0 = valueStr[0];
    const nl0 = valueStr.indexOf("\n");
    const hasNewline = nl0 !== -1;
    const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
    if (hasNewline || !flow) {
      let hasPropsLine = false;
      if (hasNewline && (vs0 === "&" || vs0 === "!")) {
        let sp0 = valueStr.indexOf(" ");
        if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
          sp0 = valueStr.indexOf(" ", sp0 + 1);
        }
        if (sp0 === -1 || nl0 < sp0)
          hasPropsLine = true;
      }
      if (!hasPropsLine)
        ws = `
${ctx.indent}`;
    }
  } else if (valueStr === "" || valueStr[0] === "\n") {
    ws = "";
  }
  str += ws + valueStr;
  if (ctx.inFlow) {
    if (valueCommentDone && onComment)
      onComment();
  } else if (valueComment && !valueCommentDone) {
    str += lineComment(str, ctx.indent, commentString(valueComment));
  } else if (chompKeep && onChompKeep) {
    onChompKeep();
  }
  return str;
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/log.js
function warn(logLevel, warning) {
  if (logLevel === "debug" || logLevel === "warn") {
    console.warn(warning);
  }
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/schema/yaml-1.1/merge.js
var MERGE_KEY = "<<";
var merge = {
  identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
  default: "key",
  tag: "tag:yaml.org,2002:merge",
  test: /^<<$/,
  resolve: () => Object.assign(new Scalar(Symbol(MERGE_KEY)), {
    addToJSMap: addMergeToJSMap
  }),
  stringify: () => MERGE_KEY
};
var isMergeKey = (ctx, key) => (merge.identify(key) || isScalar(key) && (!key.type || key.type === Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
function addMergeToJSMap(ctx, map2, value) {
  const source = resolveAliasValue(ctx, value);
  if (isSeq(source))
    for (const it of source.items)
      mergeValue(ctx, map2, it);
  else if (Array.isArray(source))
    for (const it of source)
      mergeValue(ctx, map2, it);
  else
    mergeValue(ctx, map2, source);
}
function mergeValue(ctx, map2, value) {
  const source = resolveAliasValue(ctx, value);
  if (!isMap(source))
    throw new Error("Merge sources must be maps or map aliases");
  const srcMap = source.toJSON(null, ctx, Map);
  for (const [key, value2] of srcMap) {
    if (map2 instanceof Map) {
      if (!map2.has(key))
        map2.set(key, value2);
    } else if (map2 instanceof Set) {
      map2.add(key);
    } else if (!Object.prototype.hasOwnProperty.call(map2, key)) {
      Object.defineProperty(map2, key, {
        value: value2,
        writable: true,
        enumerable: true,
        configurable: true
      });
    }
  }
  return map2;
}
function resolveAliasValue(ctx, value) {
  return ctx && isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/nodes/addPairToJSMap.js
function addPairToJSMap(ctx, map2, { key, value }) {
  if (isNode(key) && key.addToJSMap)
    key.addToJSMap(ctx, map2, value);
  else if (isMergeKey(ctx, key))
    addMergeToJSMap(ctx, map2, value);
  else {
    const jsKey = toJS(key, "", ctx);
    if (map2 instanceof Map) {
      map2.set(jsKey, toJS(value, jsKey, ctx));
    } else if (map2 instanceof Set) {
      map2.add(jsKey);
    } else {
      const stringKey = stringifyKey(key, jsKey, ctx);
      const jsValue = toJS(value, stringKey, ctx);
      if (stringKey in map2)
        Object.defineProperty(map2, stringKey, {
          value: jsValue,
          writable: true,
          enumerable: true,
          configurable: true
        });
      else
        map2[stringKey] = jsValue;
    }
  }
  return map2;
}
function stringifyKey(key, jsKey, ctx) {
  if (jsKey === null)
    return "";
  if (typeof jsKey !== "object")
    return String(jsKey);
  if (isNode(key) && ctx?.doc) {
    const strCtx = createStringifyContext(ctx.doc, {});
    strCtx.anchors = /* @__PURE__ */ new Set();
    for (const node of ctx.anchors.keys())
      strCtx.anchors.add(node.anchor);
    strCtx.inFlow = true;
    strCtx.inStringifyKey = true;
    const strKey = key.toString(strCtx);
    if (!ctx.mapKeyWarned) {
      let jsonStr = JSON.stringify(strKey);
      if (jsonStr.length > 40)
        jsonStr = jsonStr.substring(0, 36) + '..."';
      warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
      ctx.mapKeyWarned = true;
    }
    return strKey;
  }
  return JSON.stringify(jsKey);
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/nodes/Pair.js
function createPair(key, value, ctx) {
  const k = createNode(key, void 0, ctx);
  const v = createNode(value, void 0, ctx);
  return new Pair(k, v);
}
var Pair = class _Pair {
  constructor(key, value = null) {
    Object.defineProperty(this, NODE_TYPE, { value: PAIR });
    this.key = key;
    this.value = value;
  }
  clone(schema4) {
    let { key, value } = this;
    if (isNode(key))
      key = key.clone(schema4);
    if (isNode(value))
      value = value.clone(schema4);
    return new _Pair(key, value);
  }
  toJSON(_, ctx) {
    const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
    return addPairToJSMap(ctx, pair, this);
  }
  toString(ctx, onComment, onChompKeep) {
    return ctx?.doc ? stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
  }
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/stringify/stringifyCollection.js
function stringifyCollection(collection, ctx, options) {
  const flow = ctx.inFlow ?? collection.flow;
  const stringify4 = flow ? stringifyFlowCollection : stringifyBlockCollection;
  return stringify4(collection, ctx, options);
}
function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
  const { indent, options: { commentString } } = ctx;
  const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
  let chompKeep = false;
  const lines = [];
  for (let i = 0; i < items.length; ++i) {
    const item = items[i];
    let comment2 = null;
    if (isNode(item)) {
      if (!chompKeep && item.spaceBefore)
        lines.push("");
      addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
      if (item.comment)
        comment2 = item.comment;
    } else if (isPair(item)) {
      const ik = isNode(item.key) ? item.key : null;
      if (ik) {
        if (!chompKeep && ik.spaceBefore)
          lines.push("");
        addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
      }
    }
    chompKeep = false;
    let str2 = stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
    if (comment2)
      str2 += lineComment(str2, itemIndent, commentString(comment2));
    if (chompKeep && comment2)
      chompKeep = false;
    lines.push(blockItemPrefix + str2);
  }
  let str;
  if (lines.length === 0) {
    str = flowChars.start + flowChars.end;
  } else {
    str = lines[0];
    for (let i = 1; i < lines.length; ++i) {
      const line = lines[i];
      str += line ? `
${indent}${line}` : "\n";
    }
  }
  if (comment) {
    str += "\n" + indentComment(commentString(comment), indent);
    if (onComment)
      onComment();
  } else if (chompKeep && onChompKeep)
    onChompKeep();
  return str;
}
function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
  const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
  itemIndent += indentStep;
  const itemCtx = Object.assign({}, ctx, {
    indent: itemIndent,
    inFlow: true,
    type: null
  });
  let reqNewline = false;
  let linesAtValue = 0;
  const lines = [];
  for (let i = 0; i < items.length; ++i) {
    const item = items[i];
    let comment = null;
    if (isNode(item)) {
      if (item.spaceBefore)
        lines.push("");
      addCommentBefore(ctx, lines, item.commentBefore, false);
      if (item.comment)
        comment = item.comment;
    } else if (isPair(item)) {
      const ik = isNode(item.key) ? item.key : null;
      if (ik) {
        if (ik.spaceBefore)
          lines.push("");
        addCommentBefore(ctx, lines, ik.commentBefore, false);
        if (ik.comment)
          reqNewline = true;
      }
      const iv = isNode(item.value) ? item.value : null;
      if (iv) {
        if (iv.comment)
          comment = iv.comment;
        if (iv.commentBefore)
          reqNewline = true;
      } else if (item.value == null && ik?.comment) {
        comment = ik.comment;
      }
    }
    if (comment)
      reqNewline = true;
    let str = stringify(item, itemCtx, () => comment = null);
    reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
    if (i < items.length - 1) {
      str += ",";
    } else if (ctx.options.trailingComma) {
      if (ctx.options.lineWidth > 0) {
        reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
      }
      if (reqNewline) {
        str += ",";
      }
    }
    if (comment)
      str += lineComment(str, itemIndent, commentString(comment));
    lines.push(str);
    linesAtValue = lines.length;
  }
  const { start, end } = flowChars;
  if (lines.length === 0) {
    return start + end;
  } else {
    if (!reqNewline) {
      const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
      reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
    }
    if (reqNewline) {
      let str = start;
      for (const line of lines)
        str += line ? `
${indentStep}${indent}${line}` : "\n";
      return `${str}
${indent}${end}`;
    } else {
      return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
    }
  }
}
function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
  if (comment && chompKeep)
    comment = comment.replace(/^\n+/, "");
  if (comment) {
    const ic = indentComment(commentString(comment), indent);
    lines.push(ic.trimStart());
  }
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/nodes/YAMLMap.js
function findPair(items, key) {
  const k = isScalar(key) ? key.value : key;
  for (const it of items) {
    if (isPair(it)) {
      if (it.key === key || it.key === k)
        return it;
      if (isScalar(it.key) && it.key.value === k)
        return it;
    }
  }
  return void 0;
}
var YAMLMap = class extends Collection {
  static get tagName() {
    return "tag:yaml.org,2002:map";
  }
  constructor(schema4) {
    super(MAP, schema4);
    this.items = [];
  }
  /**
   * A generic collection parsing method that can be extended
   * to other node classes that inherit from YAMLMap
   */
  static from(schema4, obj, ctx) {
    const { keepUndefined, replacer } = ctx;
    const map2 = new this(schema4);
    const add = (key, value) => {
      if (typeof replacer === "function")
        value = replacer.call(obj, key, value);
      else if (Array.isArray(replacer) && !replacer.includes(key))
        return;
      if (value !== void 0 || keepUndefined)
        map2.items.push(createPair(key, value, ctx));
    };
    if (obj instanceof Map) {
      for (const [key, value] of obj)
        add(key, value);
    } else if (obj && typeof obj === "object") {
      for (const key of Object.keys(obj))
        add(key, obj[key]);
    }
    if (typeof schema4.sortMapEntries === "function") {
      map2.items.sort(schema4.sortMapEntries);
    }
    return map2;
  }
  /**
   * Adds a value to the collection.
   *
   * @param overwrite - If not set `true`, using a key that is already in the
   *   collection will throw. Otherwise, overwrites the previous value.
   */
  add(pair, overwrite) {
    let _pair;
    if (isPair(pair))
      _pair = pair;
    else if (!pair || typeof pair !== "object" || !("key" in pair)) {
      _pair = new Pair(pair, pair?.value);
    } else
      _pair = new Pair(pair.key, pair.value);
    const prev = findPair(this.items, _pair.key);
    const sortEntries = this.schema?.sortMapEntries;
    if (prev) {
      if (!overwrite)
        throw new Error(`Key ${_pair.key} already set`);
      if (isScalar(prev.value) && isScalarValue(_pair.value))
        prev.value.value = _pair.value;
      else
        prev.value = _pair.value;
    } else if (sortEntries) {
      const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
      if (i === -1)
        this.items.push(_pair);
      else
        this.items.splice(i, 0, _pair);
    } else {
      this.items.push(_pair);
    }
  }
  delete(key) {
    const it = findPair(this.items, key);
    if (!it)
      return false;
    const del = this.items.splice(this.items.indexOf(it), 1);
    return del.length > 0;
  }
  get(key, keepScalar) {
    const it = findPair(this.items, key);
    const node = it?.value;
    return (!keepScalar && isScalar(node) ? node.value : node) ?? void 0;
  }
  has(key) {
    return !!findPair(this.items, key);
  }
  set(key, value) {
    this.add(new Pair(key, value), true);
  }
  /**
   * @param ctx - Conversion context, originally set in Document#toJS()
   * @param {Class} Type - If set, forces the returned collection type
   * @returns Instance of Type, Map, or Object
   */
  toJSON(_, ctx, Type) {
    const map2 = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
    if (ctx?.onCreate)
      ctx.onCreate(map2);
    for (const item of this.items)
      addPairToJSMap(ctx, map2, item);
    return map2;
  }
  toString(ctx, onComment, onChompKeep) {
    if (!ctx)
      return JSON.stringify(this);
    for (const item of this.items) {
      if (!isPair(item))
        throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
    }
    if (!ctx.allNullValues && this.hasAllNullValues(false))
      ctx = Object.assign({}, ctx, { allNullValues: true });
    return stringifyCollection(this, ctx, {
      blockItemPrefix: "",
      flowChars: { start: "{", end: "}" },
      itemIndent: ctx.indent || "",
      onChompKeep,
      onComment
    });
  }
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/schema/common/map.js
var map = {
  collection: "map",
  default: true,
  nodeClass: YAMLMap,
  tag: "tag:yaml.org,2002:map",
  resolve(map2, onError) {
    if (!isMap(map2))
      onError("Expected a mapping for this tag");
    return map2;
  },
  createNode: (schema4, obj, ctx) => YAMLMap.from(schema4, obj, ctx)
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/nodes/YAMLSeq.js
var YAMLSeq = class extends Collection {
  static get tagName() {
    return "tag:yaml.org,2002:seq";
  }
  constructor(schema4) {
    super(SEQ, schema4);
    this.items = [];
  }
  add(value) {
    this.items.push(value);
  }
  /**
   * Removes a value from the collection.
   *
   * `key` must contain a representation of an integer for this to succeed.
   * It may be wrapped in a `Scalar`.
   *
   * @returns `true` if the item was found and removed.
   */
  delete(key) {
    const idx = asItemIndex(key);
    if (typeof idx !== "number")
      return false;
    const del = this.items.splice(idx, 1);
    return del.length > 0;
  }
  get(key, keepScalar) {
    const idx = asItemIndex(key);
    if (typeof idx !== "number")
      return void 0;
    const it = this.items[idx];
    return !keepScalar && isScalar(it) ? it.value : it;
  }
  /**
   * Checks if the collection includes a value with the key `key`.
   *
   * `key` must contain a representation of an integer for this to succeed.
   * It may be wrapped in a `Scalar`.
   */
  has(key) {
    const idx = asItemIndex(key);
    return typeof idx === "number" && idx < this.items.length;
  }
  /**
   * Sets a value in this collection. For `!!set`, `value` needs to be a
   * boolean to add/remove the item from the set.
   *
   * If `key` does not contain a representation of an integer, this will throw.
   * It may be wrapped in a `Scalar`.
   */
  set(key, value) {
    const idx = asItemIndex(key);
    if (typeof idx !== "number")
      throw new Error(`Expected a valid index, not ${key}.`);
    const prev = this.items[idx];
    if (isScalar(prev) && isScalarValue(value))
      prev.value = value;
    else
      this.items[idx] = value;
  }
  toJSON(_, ctx) {
    const seq2 = [];
    if (ctx?.onCreate)
      ctx.onCreate(seq2);
    let i = 0;
    for (const item of this.items)
      seq2.push(toJS(item, String(i++), ctx));
    return seq2;
  }
  toString(ctx, onComment, onChompKeep) {
    if (!ctx)
      return JSON.stringify(this);
    return stringifyCollection(this, ctx, {
      blockItemPrefix: "- ",
      flowChars: { start: "[", end: "]" },
      itemIndent: (ctx.indent || "") + "  ",
      onChompKeep,
      onComment
    });
  }
  static from(schema4, obj, ctx) {
    const { replacer } = ctx;
    const seq2 = new this(schema4);
    if (obj && Symbol.iterator in Object(obj)) {
      let i = 0;
      for (let it of obj) {
        if (typeof replacer === "function") {
          const key = obj instanceof Set ? it : String(i++);
          it = replacer.call(obj, key, it);
        }
        seq2.items.push(createNode(it, void 0, ctx));
      }
    }
    return seq2;
  }
};
function asItemIndex(key) {
  let idx = isScalar(key) ? key.value : key;
  if (idx && typeof idx === "string")
    idx = Number(idx);
  return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/schema/common/seq.js
var seq = {
  collection: "seq",
  default: true,
  nodeClass: YAMLSeq,
  tag: "tag:yaml.org,2002:seq",
  resolve(seq2, onError) {
    if (!isSeq(seq2))
      onError("Expected a sequence for this tag");
    return seq2;
  },
  createNode: (schema4, obj, ctx) => YAMLSeq.from(schema4, obj, ctx)
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/schema/common/string.js
var string = {
  identify: (value) => typeof value === "string",
  default: true,
  tag: "tag:yaml.org,2002:str",
  resolve: (str) => str,
  stringify(item, ctx, onComment, onChompKeep) {
    ctx = Object.assign({ actualString: true }, ctx);
    return stringifyString(item, ctx, onComment, onChompKeep);
  }
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/schema/common/null.js
var nullTag = {
  identify: (value) => value == null,
  createNode: () => new Scalar(null),
  default: true,
  tag: "tag:yaml.org,2002:null",
  test: /^(?:~|[Nn]ull|NULL)?$/,
  resolve: () => new Scalar(null),
  stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/schema/core/bool.js
var boolTag = {
  identify: (value) => typeof value === "boolean",
  default: true,
  tag: "tag:yaml.org,2002:bool",
  test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
  resolve: (str) => new Scalar(str[0] === "t" || str[0] === "T"),
  stringify({ source, value }, ctx) {
    if (source && boolTag.test.test(source)) {
      const sv = source[0] === "t" || source[0] === "T";
      if (value === sv)
        return source;
    }
    return value ? ctx.options.trueStr : ctx.options.falseStr;
  }
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/stringify/stringifyNumber.js
function stringifyNumber({ format, minFractionDigits, tag, value }) {
  if (typeof value === "bigint")
    return String(value);
  const num = typeof value === "number" ? value : Number(value);
  if (!isFinite(num))
    return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
  let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
  if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
    let i = n.indexOf(".");
    if (i < 0) {
      i = n.length;
      n += ".";
    }
    let d = minFractionDigits - (n.length - i - 1);
    while (d-- > 0)
      n += "0";
  }
  return n;
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/schema/core/float.js
var floatNaN = {
  identify: (value) => typeof value === "number",
  default: true,
  tag: "tag:yaml.org,2002:float",
  test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
  resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
  stringify: stringifyNumber
};
var floatExp = {
  identify: (value) => typeof value === "number",
  default: true,
  tag: "tag:yaml.org,2002:float",
  format: "EXP",
  test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
  resolve: (str) => parseFloat(str),
  stringify(node) {
    const num = Number(node.value);
    return isFinite(num) ? num.toExponential() : stringifyNumber(node);
  }
};
var float = {
  identify: (value) => typeof value === "number",
  default: true,
  tag: "tag:yaml.org,2002:float",
  test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
  resolve(str) {
    const node = new Scalar(parseFloat(str));
    const dot = str.indexOf(".");
    if (dot !== -1 && str[str.length - 1] === "0")
      node.minFractionDigits = str.length - dot - 1;
    return node;
  },
  stringify: stringifyNumber
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/schema/core/int.js
var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
function intStringify(node, radix, prefix) {
  const { value } = node;
  if (intIdentify(value) && value >= 0)
    return prefix + value.toString(radix);
  return stringifyNumber(node);
}
var intOct = {
  identify: (value) => intIdentify(value) && value >= 0,
  default: true,
  tag: "tag:yaml.org,2002:int",
  format: "OCT",
  test: /^0o[0-7]+$/,
  resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
  stringify: (node) => intStringify(node, 8, "0o")
};
var int = {
  identify: intIdentify,
  default: true,
  tag: "tag:yaml.org,2002:int",
  test: /^[-+]?[0-9]+$/,
  resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
  stringify: stringifyNumber
};
var intHex = {
  identify: (value) => intIdentify(value) && value >= 0,
  default: true,
  tag: "tag:yaml.org,2002:int",
  format: "HEX",
  test: /^0x[0-9a-fA-F]+$/,
  resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
  stringify: (node) => intStringify(node, 16, "0x")
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/schema/core/schema.js
var schema = [
  map,
  seq,
  string,
  nullTag,
  boolTag,
  intOct,
  int,
  intHex,
  floatNaN,
  floatExp,
  float
];

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/schema/json/schema.js
function intIdentify2(value) {
  return typeof value === "bigint" || Number.isInteger(value);
}
var stringifyJSON = ({ value }) => JSON.stringify(value);
var jsonScalars = [
  {
    identify: (value) => typeof value === "string",
    default: true,
    tag: "tag:yaml.org,2002:str",
    resolve: (str) => str,
    stringify: stringifyJSON
  },
  {
    identify: (value) => value == null,
    createNode: () => new Scalar(null),
    default: true,
    tag: "tag:yaml.org,2002:null",
    test: /^null$/,
    resolve: () => null,
    stringify: stringifyJSON
  },
  {
    identify: (value) => typeof value === "boolean",
    default: true,
    tag: "tag:yaml.org,2002:bool",
    test: /^true$|^false$/,
    resolve: (str) => str === "true",
    stringify: stringifyJSON
  },
  {
    identify: intIdentify2,
    default: true,
    tag: "tag:yaml.org,2002:int",
    test: /^-?(?:0|[1-9][0-9]*)$/,
    resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
    stringify: ({ value }) => intIdentify2(value) ? value.toString() : JSON.stringify(value)
  },
  {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
    resolve: (str) => parseFloat(str),
    stringify: stringifyJSON
  }
];
var jsonError = {
  default: true,
  tag: "",
  test: /^/,
  resolve(str, onError) {
    onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
    return str;
  }
};
var schema2 = [map, seq].concat(jsonScalars, jsonError);

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/schema/yaml-1.1/binary.js
var binary = {
  identify: (value) => value instanceof Uint8Array,
  // Buffer inherits from Uint8Array
  default: false,
  tag: "tag:yaml.org,2002:binary",
  /**
   * Returns a Buffer in node and an Uint8Array in browsers
   *
   * To use the resulting buffer as an image, you'll want to do something like:
   *
   *   const blob = new Blob([buffer], { type: 'image/jpeg' })
   *   document.querySelector('#photo').src = URL.createObjectURL(blob)
   */
  resolve(src, onError) {
    if (typeof atob === "function") {
      const str = atob(src.replace(/[\n\r]/g, ""));
      const buffer = new Uint8Array(str.length);
      for (let i = 0; i < str.length; ++i)
        buffer[i] = str.charCodeAt(i);
      return buffer;
    } else {
      onError("This environment does not support reading binary tags; either Buffer or atob is required");
      return src;
    }
  },
  stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
    if (!value)
      return "";
    const buf = value;
    let str;
    if (typeof btoa === "function") {
      let s = "";
      for (let i = 0; i < buf.length; ++i)
        s += String.fromCharCode(buf[i]);
      str = btoa(s);
    } else {
      throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
    }
    type ?? (type = Scalar.BLOCK_LITERAL);
    if (type !== Scalar.QUOTE_DOUBLE) {
      const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
      const n = Math.ceil(str.length / lineWidth);
      const lines = new Array(n);
      for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
        lines[i] = str.substr(o, lineWidth);
      }
      str = lines.join(type === Scalar.BLOCK_LITERAL ? "\n" : " ");
    }
    return stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
  }
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/schema/yaml-1.1/pairs.js
function resolvePairs(seq2, onError) {
  if (isSeq(seq2)) {
    for (let i = 0; i < seq2.items.length; ++i) {
      let item = seq2.items[i];
      if (isPair(item))
        continue;
      else if (isMap(item)) {
        if (item.items.length > 1)
          onError("Each pair must have its own sequence indicator");
        const pair = item.items[0] || new Pair(new Scalar(null));
        if (item.commentBefore)
          pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
        if (item.comment) {
          const cn = pair.value ?? pair.key;
          cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
        }
        item = pair;
      }
      seq2.items[i] = isPair(item) ? item : new Pair(item);
    }
  } else
    onError("Expected a sequence for this tag");
  return seq2;
}
function createPairs(schema4, iterable, ctx) {
  const { replacer } = ctx;
  const pairs2 = new YAMLSeq(schema4);
  pairs2.tag = "tag:yaml.org,2002:pairs";
  let i = 0;
  if (iterable && Symbol.iterator in Object(iterable))
    for (let it of iterable) {
      if (typeof replacer === "function")
        it = replacer.call(iterable, String(i++), it);
      let key, value;
      if (Array.isArray(it)) {
        if (it.length === 2) {
          key = it[0];
          value = it[1];
        } else
          throw new TypeError(`Expected [key, value] tuple: ${it}`);
      } else if (it && it instanceof Object) {
        const keys = Object.keys(it);
        if (keys.length === 1) {
          key = keys[0];
          value = it[key];
        } else {
          throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
        }
      } else {
        key = it;
      }
      pairs2.items.push(createPair(key, value, ctx));
    }
  return pairs2;
}
var pairs = {
  collection: "seq",
  default: false,
  tag: "tag:yaml.org,2002:pairs",
  resolve: resolvePairs,
  createNode: createPairs
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/schema/yaml-1.1/omap.js
var YAMLOMap = class _YAMLOMap extends YAMLSeq {
  constructor() {
    super();
    this.add = YAMLMap.prototype.add.bind(this);
    this.delete = YAMLMap.prototype.delete.bind(this);
    this.get = YAMLMap.prototype.get.bind(this);
    this.has = YAMLMap.prototype.has.bind(this);
    this.set = YAMLMap.prototype.set.bind(this);
    this.tag = _YAMLOMap.tag;
  }
  /**
   * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
   * but TypeScript won't allow widening the signature of a child method.
   */
  toJSON(_, ctx) {
    if (!ctx)
      return super.toJSON(_);
    const map2 = /* @__PURE__ */ new Map();
    if (ctx?.onCreate)
      ctx.onCreate(map2);
    for (const pair of this.items) {
      let key, value;
      if (isPair(pair)) {
        key = toJS(pair.key, "", ctx);
        value = toJS(pair.value, key, ctx);
      } else {
        key = toJS(pair, "", ctx);
      }
      if (map2.has(key))
        throw new Error("Ordered maps must not include duplicate keys");
      map2.set(key, value);
    }
    return map2;
  }
  static from(schema4, iterable, ctx) {
    const pairs2 = createPairs(schema4, iterable, ctx);
    const omap2 = new this();
    omap2.items = pairs2.items;
    return omap2;
  }
};
YAMLOMap.tag = "tag:yaml.org,2002:omap";
var omap = {
  collection: "seq",
  identify: (value) => value instanceof Map,
  nodeClass: YAMLOMap,
  default: false,
  tag: "tag:yaml.org,2002:omap",
  resolve(seq2, onError) {
    const pairs2 = resolvePairs(seq2, onError);
    const seenKeys = [];
    for (const { key } of pairs2.items) {
      if (isScalar(key)) {
        if (seenKeys.includes(key.value)) {
          onError(`Ordered maps must not include duplicate keys: ${key.value}`);
        } else {
          seenKeys.push(key.value);
        }
      }
    }
    return Object.assign(new YAMLOMap(), pairs2);
  },
  createNode: (schema4, iterable, ctx) => YAMLOMap.from(schema4, iterable, ctx)
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/schema/yaml-1.1/bool.js
function boolStringify({ value, source }, ctx) {
  const boolObj = value ? trueTag : falseTag;
  if (source && boolObj.test.test(source))
    return source;
  return value ? ctx.options.trueStr : ctx.options.falseStr;
}
var trueTag = {
  identify: (value) => value === true,
  default: true,
  tag: "tag:yaml.org,2002:bool",
  test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
  resolve: () => new Scalar(true),
  stringify: boolStringify
};
var falseTag = {
  identify: (value) => value === false,
  default: true,
  tag: "tag:yaml.org,2002:bool",
  test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
  resolve: () => new Scalar(false),
  stringify: boolStringify
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/schema/yaml-1.1/float.js
var floatNaN2 = {
  identify: (value) => typeof value === "number",
  default: true,
  tag: "tag:yaml.org,2002:float",
  test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
  resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
  stringify: stringifyNumber
};
var floatExp2 = {
  identify: (value) => typeof value === "number",
  default: true,
  tag: "tag:yaml.org,2002:float",
  format: "EXP",
  test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
  resolve: (str) => parseFloat(str.replace(/_/g, "")),
  stringify(node) {
    const num = Number(node.value);
    return isFinite(num) ? num.toExponential() : stringifyNumber(node);
  }
};
var float2 = {
  identify: (value) => typeof value === "number",
  default: true,
  tag: "tag:yaml.org,2002:float",
  test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
  resolve(str) {
    const node = new Scalar(parseFloat(str.replace(/_/g, "")));
    const dot = str.indexOf(".");
    if (dot !== -1) {
      const f = str.substring(dot + 1).replace(/_/g, "");
      if (f[f.length - 1] === "0")
        node.minFractionDigits = f.length;
    }
    return node;
  },
  stringify: stringifyNumber
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/schema/yaml-1.1/int.js
var intIdentify3 = (value) => typeof value === "bigint" || Number.isInteger(value);
function intResolve2(str, offset, radix, { intAsBigInt }) {
  const sign = str[0];
  if (sign === "-" || sign === "+")
    offset += 1;
  str = str.substring(offset).replace(/_/g, "");
  if (intAsBigInt) {
    switch (radix) {
      case 2:
        str = `0b${str}`;
        break;
      case 8:
        str = `0o${str}`;
        break;
      case 16:
        str = `0x${str}`;
        break;
    }
    const n2 = BigInt(str);
    return sign === "-" ? BigInt(-1) * n2 : n2;
  }
  const n = parseInt(str, radix);
  return sign === "-" ? -1 * n : n;
}
function intStringify2(node, radix, prefix) {
  const { value } = node;
  if (intIdentify3(value)) {
    const str = value.toString(radix);
    return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
  }
  return stringifyNumber(node);
}
var intBin = {
  identify: intIdentify3,
  default: true,
  tag: "tag:yaml.org,2002:int",
  format: "BIN",
  test: /^[-+]?0b[0-1_]+$/,
  resolve: (str, _onError, opt) => intResolve2(str, 2, 2, opt),
  stringify: (node) => intStringify2(node, 2, "0b")
};
var intOct2 = {
  identify: intIdentify3,
  default: true,
  tag: "tag:yaml.org,2002:int",
  format: "OCT",
  test: /^[-+]?0[0-7_]+$/,
  resolve: (str, _onError, opt) => intResolve2(str, 1, 8, opt),
  stringify: (node) => intStringify2(node, 8, "0")
};
var int2 = {
  identify: intIdentify3,
  default: true,
  tag: "tag:yaml.org,2002:int",
  test: /^[-+]?[0-9][0-9_]*$/,
  resolve: (str, _onError, opt) => intResolve2(str, 0, 10, opt),
  stringify: stringifyNumber
};
var intHex2 = {
  identify: intIdentify3,
  default: true,
  tag: "tag:yaml.org,2002:int",
  format: "HEX",
  test: /^[-+]?0x[0-9a-fA-F_]+$/,
  resolve: (str, _onError, opt) => intResolve2(str, 2, 16, opt),
  stringify: (node) => intStringify2(node, 16, "0x")
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/schema/yaml-1.1/set.js
var YAMLSet = class _YAMLSet extends YAMLMap {
  constructor(schema4) {
    super(schema4);
    this.tag = _YAMLSet.tag;
  }
  add(key) {
    let pair;
    if (isPair(key))
      pair = key;
    else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
      pair = new Pair(key.key, null);
    else
      pair = new Pair(key, null);
    const prev = findPair(this.items, pair.key);
    if (!prev)
      this.items.push(pair);
  }
  /**
   * If `keepPair` is `true`, returns the Pair matching `key`.
   * Otherwise, returns the value of that Pair's key.
   */
  get(key, keepPair) {
    const pair = findPair(this.items, key);
    return !keepPair && isPair(pair) ? isScalar(pair.key) ? pair.key.value : pair.key : pair;
  }
  set(key, value) {
    if (typeof value !== "boolean")
      throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
    const prev = findPair(this.items, key);
    if (prev && !value) {
      this.items.splice(this.items.indexOf(prev), 1);
    } else if (!prev && value) {
      this.items.push(new Pair(key));
    }
  }
  toJSON(_, ctx) {
    return super.toJSON(_, ctx, Set);
  }
  toString(ctx, onComment, onChompKeep) {
    if (!ctx)
      return JSON.stringify(this);
    if (this.hasAllNullValues(true))
      return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
    else
      throw new Error("Set items must all have null values");
  }
  static from(schema4, iterable, ctx) {
    const { replacer } = ctx;
    const set2 = new this(schema4);
    if (iterable && Symbol.iterator in Object(iterable))
      for (let value of iterable) {
        if (typeof replacer === "function")
          value = replacer.call(iterable, value, value);
        set2.items.push(createPair(value, null, ctx));
      }
    return set2;
  }
};
YAMLSet.tag = "tag:yaml.org,2002:set";
var set = {
  collection: "map",
  identify: (value) => value instanceof Set,
  nodeClass: YAMLSet,
  default: false,
  tag: "tag:yaml.org,2002:set",
  createNode: (schema4, iterable, ctx) => YAMLSet.from(schema4, iterable, ctx),
  resolve(map2, onError) {
    if (isMap(map2)) {
      if (map2.hasAllNullValues(true))
        return Object.assign(new YAMLSet(), map2);
      else
        onError("Set items must all have null values");
    } else
      onError("Expected a mapping for this tag");
    return map2;
  }
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/schema/yaml-1.1/timestamp.js
function parseSexagesimal(str, asBigInt) {
  const sign = str[0];
  const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
  const num = (n) => asBigInt ? BigInt(n) : Number(n);
  const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
  return sign === "-" ? num(-1) * res : res;
}
function stringifySexagesimal(node) {
  let { value } = node;
  let num = (n) => n;
  if (typeof value === "bigint")
    num = (n) => BigInt(n);
  else if (isNaN(value) || !isFinite(value))
    return stringifyNumber(node);
  let sign = "";
  if (value < 0) {
    sign = "-";
    value *= num(-1);
  }
  const _60 = num(60);
  const parts = [value % _60];
  if (value < 60) {
    parts.unshift(0);
  } else {
    value = (value - parts[0]) / _60;
    parts.unshift(value % _60);
    if (value >= 60) {
      value = (value - parts[0]) / _60;
      parts.unshift(value);
    }
  }
  return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
}
var intTime = {
  identify: (value) => typeof value === "bigint" || Number.isInteger(value),
  default: true,
  tag: "tag:yaml.org,2002:int",
  format: "TIME",
  test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
  resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
  stringify: stringifySexagesimal
};
var floatTime = {
  identify: (value) => typeof value === "number",
  default: true,
  tag: "tag:yaml.org,2002:float",
  format: "TIME",
  test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
  resolve: (str) => parseSexagesimal(str, false),
  stringify: stringifySexagesimal
};
var timestamp = {
  identify: (value) => value instanceof Date,
  default: true,
  tag: "tag:yaml.org,2002:timestamp",
  // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
  // may be omitted altogether, resulting in a date format. In such a case, the time part is
  // assumed to be 00:00:00Z (start of day, UTC).
  test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
  resolve(str) {
    const match = str.match(timestamp.test);
    if (!match)
      throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
    const [, year, month, day, hour, minute, second] = match.map(Number);
    const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
    let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
    const tz = match[8];
    if (tz && tz !== "Z") {
      let d = parseSexagesimal(tz, false);
      if (Math.abs(d) < 30)
        d *= 60;
      date -= 6e4 * d;
    }
    return new Date(date);
  },
  stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/schema/yaml-1.1/schema.js
var schema3 = [
  map,
  seq,
  string,
  nullTag,
  trueTag,
  falseTag,
  intBin,
  intOct2,
  int2,
  intHex2,
  floatNaN2,
  floatExp2,
  float2,
  binary,
  merge,
  omap,
  pairs,
  set,
  intTime,
  floatTime,
  timestamp
];

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/schema/tags.js
var schemas = /* @__PURE__ */ new Map([
  ["core", schema],
  ["failsafe", [map, seq, string]],
  ["json", schema2],
  ["yaml11", schema3],
  ["yaml-1.1", schema3]
]);
var tagsByName = {
  binary,
  bool: boolTag,
  float,
  floatExp,
  floatNaN,
  floatTime,
  int,
  intHex,
  intOct,
  intTime,
  map,
  merge,
  null: nullTag,
  omap,
  pairs,
  seq,
  set,
  timestamp
};
var coreKnownTags = {
  "tag:yaml.org,2002:binary": binary,
  "tag:yaml.org,2002:merge": merge,
  "tag:yaml.org,2002:omap": omap,
  "tag:yaml.org,2002:pairs": pairs,
  "tag:yaml.org,2002:set": set,
  "tag:yaml.org,2002:timestamp": timestamp
};
function getTags(customTags, schemaName, addMergeTag) {
  const schemaTags = schemas.get(schemaName);
  if (schemaTags && !customTags) {
    return addMergeTag && !schemaTags.includes(merge) ? schemaTags.concat(merge) : schemaTags.slice();
  }
  let tags = schemaTags;
  if (!tags) {
    if (Array.isArray(customTags))
      tags = [];
    else {
      const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
      throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
    }
  }
  if (Array.isArray(customTags)) {
    for (const tag of customTags)
      tags = tags.concat(tag);
  } else if (typeof customTags === "function") {
    tags = customTags(tags.slice());
  }
  if (addMergeTag)
    tags = tags.concat(merge);
  return tags.reduce((tags2, tag) => {
    const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
    if (!tagObj) {
      const tagName = JSON.stringify(tag);
      const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
      throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
    }
    if (!tags2.includes(tagObj))
      tags2.push(tagObj);
    return tags2;
  }, []);
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/schema/Schema.js
var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
var Schema = class _Schema {
  constructor({ compat, customTags, merge: merge2, resolveKnownTags, schema: schema4, sortMapEntries, toStringDefaults }) {
    this.compat = Array.isArray(compat) ? getTags(compat, "compat") : compat ? getTags(null, compat) : null;
    this.name = typeof schema4 === "string" && schema4 || "core";
    this.knownTags = resolveKnownTags ? coreKnownTags : {};
    this.tags = getTags(customTags, this.name, merge2);
    this.toStringOptions = toStringDefaults ?? null;
    Object.defineProperty(this, MAP, { value: map });
    Object.defineProperty(this, SCALAR, { value: string });
    Object.defineProperty(this, SEQ, { value: seq });
    this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
  }
  clone() {
    const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
    copy.tags = this.tags.slice();
    return copy;
  }
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/stringify/stringifyDocument.js
function stringifyDocument(doc, options) {
  const lines = [];
  let hasDirectives = options.directives === true;
  if (options.directives !== false && doc.directives) {
    const dir = doc.directives.toString(doc);
    if (dir) {
      lines.push(dir);
      hasDirectives = true;
    } else if (doc.directives.docStart)
      hasDirectives = true;
  }
  if (hasDirectives)
    lines.push("---");
  const ctx = createStringifyContext(doc, options);
  const { commentString } = ctx.options;
  if (doc.commentBefore) {
    if (lines.length !== 1)
      lines.unshift("");
    const cs = commentString(doc.commentBefore);
    lines.unshift(indentComment(cs, ""));
  }
  let chompKeep = false;
  let contentComment = null;
  if (doc.contents) {
    if (isNode(doc.contents)) {
      if (doc.contents.spaceBefore && hasDirectives)
        lines.push("");
      if (doc.contents.commentBefore) {
        const cs = commentString(doc.contents.commentBefore);
        lines.push(indentComment(cs, ""));
      }
      ctx.forceBlockIndent = !!doc.comment;
      contentComment = doc.contents.comment;
    }
    const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
    let body = stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
    if (contentComment)
      body += lineComment(body, "", commentString(contentComment));
    if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
      lines[lines.length - 1] = `--- ${body}`;
    } else
      lines.push(body);
  } else {
    lines.push(stringify(doc.contents, ctx));
  }
  if (doc.directives?.docEnd) {
    if (doc.comment) {
      const cs = commentString(doc.comment);
      if (cs.includes("\n")) {
        lines.push("...");
        lines.push(indentComment(cs, ""));
      } else {
        lines.push(`... ${cs}`);
      }
    } else {
      lines.push("...");
    }
  } else {
    let dc = doc.comment;
    if (dc && chompKeep)
      dc = dc.replace(/^\n+/, "");
    if (dc) {
      if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
        lines.push("");
      lines.push(indentComment(commentString(dc), ""));
    }
  }
  return lines.join("\n") + "\n";
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/doc/Document.js
var Document = class _Document {
  constructor(value, replacer, options) {
    this.commentBefore = null;
    this.comment = null;
    this.errors = [];
    this.warnings = [];
    Object.defineProperty(this, NODE_TYPE, { value: DOC });
    let _replacer = null;
    if (typeof replacer === "function" || Array.isArray(replacer)) {
      _replacer = replacer;
    } else if (options === void 0 && replacer) {
      options = replacer;
      replacer = void 0;
    }
    const opt = Object.assign({
      intAsBigInt: false,
      keepSourceTokens: false,
      logLevel: "warn",
      prettyErrors: true,
      strict: true,
      stringKeys: false,
      uniqueKeys: true,
      version: "1.2"
    }, options);
    this.options = opt;
    let { version } = opt;
    if (options?._directives) {
      this.directives = options._directives.atDocument();
      if (this.directives.yaml.explicit)
        version = this.directives.yaml.version;
    } else
      this.directives = new Directives({ version });
    this.setSchema(version, options);
    this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
  }
  /**
   * Create a deep copy of this Document and its contents.
   *
   * Custom Node values that inherit from `Object` still refer to their original instances.
   */
  clone() {
    const copy = Object.create(_Document.prototype, {
      [NODE_TYPE]: { value: DOC }
    });
    copy.commentBefore = this.commentBefore;
    copy.comment = this.comment;
    copy.errors = this.errors.slice();
    copy.warnings = this.warnings.slice();
    copy.options = Object.assign({}, this.options);
    if (this.directives)
      copy.directives = this.directives.clone();
    copy.schema = this.schema.clone();
    copy.contents = isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
    if (this.range)
      copy.range = this.range.slice();
    return copy;
  }
  /** Adds a value to the document. */
  add(value) {
    if (assertCollection(this.contents))
      this.contents.add(value);
  }
  /** Adds a value to the document. */
  addIn(path, value) {
    if (assertCollection(this.contents))
      this.contents.addIn(path, value);
  }
  /**
   * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
   *
   * If `node` already has an anchor, `name` is ignored.
   * Otherwise, the `node.anchor` value will be set to `name`,
   * or if an anchor with that name is already present in the document,
   * `name` will be used as a prefix for a new unique anchor.
   * If `name` is undefined, the generated anchor will use 'a' as a prefix.
   */
  createAlias(node, name2) {
    if (!node.anchor) {
      const prev = anchorNames(this);
      node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      !name2 || prev.has(name2) ? findNewAnchor(name2 || "a", prev) : name2;
    }
    return new Alias(node.anchor);
  }
  createNode(value, replacer, options) {
    let _replacer = void 0;
    if (typeof replacer === "function") {
      value = replacer.call({ "": value }, "", value);
      _replacer = replacer;
    } else if (Array.isArray(replacer)) {
      const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
      const asStr = replacer.filter(keyToStr).map(String);
      if (asStr.length > 0)
        replacer = replacer.concat(asStr);
      _replacer = replacer;
    } else if (options === void 0 && replacer) {
      options = replacer;
      replacer = void 0;
    }
    const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
    const { onAnchor, setAnchors, sourceObjects } = createNodeAnchors(
      this,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      anchorPrefix || "a"
    );
    const ctx = {
      aliasDuplicateObjects: aliasDuplicateObjects ?? true,
      keepUndefined: keepUndefined ?? false,
      onAnchor,
      onTagObj,
      replacer: _replacer,
      schema: this.schema,
      sourceObjects
    };
    const node = createNode(value, tag, ctx);
    if (flow && isCollection(node))
      node.flow = true;
    setAnchors();
    return node;
  }
  /**
   * Convert a key and a value into a `Pair` using the current schema,
   * recursively wrapping all values as `Scalar` or `Collection` nodes.
   */
  createPair(key, value, options = {}) {
    const k = this.createNode(key, null, options);
    const v = this.createNode(value, null, options);
    return new Pair(k, v);
  }
  /**
   * Removes a value from the document.
   * @returns `true` if the item was found and removed.
   */
  delete(key) {
    return assertCollection(this.contents) ? this.contents.delete(key) : false;
  }
  /**
   * Removes a value from the document.
   * @returns `true` if the item was found and removed.
   */
  deleteIn(path) {
    if (isEmptyPath(path)) {
      if (this.contents == null)
        return false;
      this.contents = null;
      return true;
    }
    return assertCollection(this.contents) ? this.contents.deleteIn(path) : false;
  }
  /**
   * Returns item at `key`, or `undefined` if not found. By default unwraps
   * scalar values from their surrounding node; to disable set `keepScalar` to
   * `true` (collections are always returned intact).
   */
  get(key, keepScalar) {
    return isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
  }
  /**
   * Returns item at `path`, or `undefined` if not found. By default unwraps
   * scalar values from their surrounding node; to disable set `keepScalar` to
   * `true` (collections are always returned intact).
   */
  getIn(path, keepScalar) {
    if (isEmptyPath(path))
      return !keepScalar && isScalar(this.contents) ? this.contents.value : this.contents;
    return isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : void 0;
  }
  /**
   * Checks if the document includes a value with the key `key`.
   */
  has(key) {
    return isCollection(this.contents) ? this.contents.has(key) : false;
  }
  /**
   * Checks if the document includes a value at `path`.
   */
  hasIn(path) {
    if (isEmptyPath(path))
      return this.contents !== void 0;
    return isCollection(this.contents) ? this.contents.hasIn(path) : false;
  }
  /**
   * Sets a value in this document. For `!!set`, `value` needs to be a
   * boolean to add/remove the item from the set.
   */
  set(key, value) {
    if (this.contents == null) {
      this.contents = collectionFromPath(this.schema, [key], value);
    } else if (assertCollection(this.contents)) {
      this.contents.set(key, value);
    }
  }
  /**
   * Sets a value in this document. For `!!set`, `value` needs to be a
   * boolean to add/remove the item from the set.
   */
  setIn(path, value) {
    if (isEmptyPath(path)) {
      this.contents = value;
    } else if (this.contents == null) {
      this.contents = collectionFromPath(this.schema, Array.from(path), value);
    } else if (assertCollection(this.contents)) {
      this.contents.setIn(path, value);
    }
  }
  /**
   * Change the YAML version and schema used by the document.
   * A `null` version disables support for directives, explicit tags, anchors, and aliases.
   * It also requires the `schema` option to be given as a `Schema` instance value.
   *
   * Overrides all previously set schema options.
   */
  setSchema(version, options = {}) {
    if (typeof version === "number")
      version = String(version);
    let opt;
    switch (version) {
      case "1.1":
        if (this.directives)
          this.directives.yaml.version = "1.1";
        else
          this.directives = new Directives({ version: "1.1" });
        opt = { resolveKnownTags: false, schema: "yaml-1.1" };
        break;
      case "1.2":
      case "next":
        if (this.directives)
          this.directives.yaml.version = version;
        else
          this.directives = new Directives({ version });
        opt = { resolveKnownTags: true, schema: "core" };
        break;
      case null:
        if (this.directives)
          delete this.directives;
        opt = null;
        break;
      default: {
        const sv = JSON.stringify(version);
        throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
      }
    }
    if (options.schema instanceof Object)
      this.schema = options.schema;
    else if (opt)
      this.schema = new Schema(Object.assign(opt, options));
    else
      throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
  }
  // json & jsonArg are only used from toJSON()
  toJS({ json: json2, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
    const ctx = {
      anchors: /* @__PURE__ */ new Map(),
      doc: this,
      keep: !json2,
      mapAsMap: mapAsMap === true,
      mapKeyWarned: false,
      maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
    };
    const res = toJS(this.contents, jsonArg ?? "", ctx);
    if (typeof onAnchor === "function")
      for (const { count, res: res2 } of ctx.anchors.values())
        onAnchor(res2, count);
    return typeof reviver === "function" ? applyReviver(reviver, { "": res }, "", res) : res;
  }
  /**
   * A JSON representation of the document `contents`.
   *
   * @param jsonArg Used by `JSON.stringify` to indicate the array index or
   *   property name.
   */
  toJSON(jsonArg, onAnchor) {
    return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
  }
  /** A YAML representation of the document. */
  toString(options = {}) {
    if (this.errors.length > 0)
      throw new Error("Document with errors cannot be stringified");
    if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
      const s = JSON.stringify(options.indent);
      throw new Error(`"indent" option must be a positive integer, not ${s}`);
    }
    return stringifyDocument(this, options);
  }
};
function assertCollection(contents) {
  if (isCollection(contents))
    return true;
  throw new Error("Expected a YAML collection as document contents");
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/errors.js
var YAMLError = class extends Error {
  constructor(name2, pos, code, message) {
    super();
    this.name = name2;
    this.code = code;
    this.message = message;
    this.pos = pos;
  }
};
var YAMLParseError = class extends YAMLError {
  constructor(pos, code, message) {
    super("YAMLParseError", pos, code, message);
  }
};
var YAMLWarning = class extends YAMLError {
  constructor(pos, code, message) {
    super("YAMLWarning", pos, code, message);
  }
};
var prettifyError = (src, lc) => (error) => {
  if (error.pos[0] === -1)
    return;
  error.linePos = error.pos.map((pos) => lc.linePos(pos));
  const { line, col } = error.linePos[0];
  error.message += ` at line ${line}, column ${col}`;
  let ci = col - 1;
  let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
  if (ci >= 60 && lineStr.length > 80) {
    const trimStart = Math.min(ci - 39, lineStr.length - 79);
    lineStr = "\u2026" + lineStr.substring(trimStart);
    ci -= trimStart - 1;
  }
  if (lineStr.length > 80)
    lineStr = lineStr.substring(0, 79) + "\u2026";
  if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
    let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
    if (prev.length > 80)
      prev = prev.substring(0, 79) + "\u2026\n";
    lineStr = prev + lineStr;
  }
  if (/[^ ]/.test(lineStr)) {
    let count = 1;
    const end = error.linePos[1];
    if (end?.line === line && end.col > col) {
      count = Math.max(1, Math.min(end.col - col, 80 - ci));
    }
    const pointer = " ".repeat(ci) + "^".repeat(count);
    error.message += `:

${lineStr}
${pointer}
`;
  }
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/compose/resolve-props.js
function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
  let spaceBefore = false;
  let atNewline = startOnNewline;
  let hasSpace = startOnNewline;
  let comment = "";
  let commentSep = "";
  let hasNewline = false;
  let reqSpace = false;
  let tab = null;
  let anchor = null;
  let tag = null;
  let newlineAfterProp = null;
  let comma = null;
  let found = null;
  let start = null;
  for (const token of tokens) {
    if (reqSpace) {
      if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
        onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      reqSpace = false;
    }
    if (tab) {
      if (atNewline && token.type !== "comment" && token.type !== "newline") {
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      }
      tab = null;
    }
    switch (token.type) {
      case "space":
        if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
          tab = token;
        }
        hasSpace = true;
        break;
      case "comment": {
        if (!hasSpace)
          onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
        const cb = token.source.substring(1) || " ";
        if (!comment)
          comment = cb;
        else
          comment += commentSep + cb;
        commentSep = "";
        atNewline = false;
        break;
      }
      case "newline":
        if (atNewline) {
          if (comment)
            comment += token.source;
          else if (!found || indicator !== "seq-item-ind")
            spaceBefore = true;
        } else
          commentSep += token.source;
        atNewline = true;
        hasNewline = true;
        if (anchor || tag)
          newlineAfterProp = token;
        hasSpace = true;
        break;
      case "anchor":
        if (anchor)
          onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
        if (token.source.endsWith(":"))
          onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
        anchor = token;
        start ?? (start = token.offset);
        atNewline = false;
        hasSpace = false;
        reqSpace = true;
        break;
      case "tag": {
        if (tag)
          onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
        tag = token;
        start ?? (start = token.offset);
        atNewline = false;
        hasSpace = false;
        reqSpace = true;
        break;
      }
      case indicator:
        if (anchor || tag)
          onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
        if (found)
          onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
        found = token;
        atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
        hasSpace = false;
        break;
      case "comma":
        if (flow) {
          if (comma)
            onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
          comma = token;
          atNewline = false;
          hasSpace = false;
          break;
        }
      // else fallthrough
      default:
        onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
        atNewline = false;
        hasSpace = false;
    }
  }
  const last = tokens[tokens.length - 1];
  const end = last ? last.offset + last.source.length : offset;
  if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
    onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
  }
  if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
    onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
  return {
    comma,
    found,
    spaceBefore,
    comment,
    hasNewline,
    anchor,
    tag,
    newlineAfterProp,
    end,
    start: start ?? end
  };
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/compose/util-contains-newline.js
function containsNewline(key) {
  if (!key)
    return null;
  switch (key.type) {
    case "alias":
    case "scalar":
    case "double-quoted-scalar":
    case "single-quoted-scalar":
      if (key.source.includes("\n"))
        return true;
      if (key.end) {
        for (const st of key.end)
          if (st.type === "newline")
            return true;
      }
      return false;
    case "flow-collection":
      for (const it of key.items) {
        for (const st of it.start)
          if (st.type === "newline")
            return true;
        if (it.sep) {
          for (const st of it.sep)
            if (st.type === "newline")
              return true;
        }
        if (containsNewline(it.key) || containsNewline(it.value))
          return true;
      }
      return false;
    default:
      return true;
  }
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/compose/util-flow-indent-check.js
function flowIndentCheck(indent, fc, onError) {
  if (fc?.type === "flow-collection") {
    const end = fc.end[0];
    if (end.indent === indent && (end.source === "]" || end.source === "}") && containsNewline(fc)) {
      const msg = "Flow end indicator should be more indented than parent";
      onError(end, "BAD_INDENT", msg, true);
    }
  }
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/compose/util-map-includes.js
function mapIncludes(ctx, items, search) {
  const { uniqueKeys } = ctx.options;
  if (uniqueKeys === false)
    return false;
  const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || isScalar(a) && isScalar(b) && a.value === b.value;
  return items.some((pair) => isEqual(pair.key, search));
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/compose/resolve-block-map.js
var startColMsg = "All mapping items must start at the same column";
function resolveBlockMap({ composeNode: composeNode2, composeEmptyNode: composeEmptyNode2 }, ctx, bm, onError, tag) {
  const NodeClass = tag?.nodeClass ?? YAMLMap;
  const map2 = new NodeClass(ctx.schema);
  if (ctx.atRoot)
    ctx.atRoot = false;
  let offset = bm.offset;
  let commentEnd = null;
  for (const collItem of bm.items) {
    const { start, key, sep, value } = collItem;
    const keyProps = resolveProps(start, {
      indicator: "explicit-key-ind",
      next: key ?? sep?.[0],
      offset,
      onError,
      parentIndent: bm.indent,
      startOnNewline: true
    });
    const implicitKey = !keyProps.found;
    if (implicitKey) {
      if (key) {
        if (key.type === "block-seq")
          onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
        else if ("indent" in key && key.indent !== bm.indent)
          onError(offset, "BAD_INDENT", startColMsg);
      }
      if (!keyProps.anchor && !keyProps.tag && !sep) {
        commentEnd = keyProps.end;
        if (keyProps.comment) {
          if (map2.comment)
            map2.comment += "\n" + keyProps.comment;
          else
            map2.comment = keyProps.comment;
        }
        continue;
      }
      if (keyProps.newlineAfterProp || containsNewline(key)) {
        onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
      }
    } else if (keyProps.found?.indent !== bm.indent) {
      onError(offset, "BAD_INDENT", startColMsg);
    }
    ctx.atKey = true;
    const keyStart = keyProps.end;
    const keyNode = key ? composeNode2(ctx, key, keyProps, onError) : composeEmptyNode2(ctx, keyStart, start, null, keyProps, onError);
    if (ctx.schema.compat)
      flowIndentCheck(bm.indent, key, onError);
    ctx.atKey = false;
    if (mapIncludes(ctx, map2.items, keyNode))
      onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
    const valueProps = resolveProps(sep ?? [], {
      indicator: "map-value-ind",
      next: value,
      offset: keyNode.range[2],
      onError,
      parentIndent: bm.indent,
      startOnNewline: !key || key.type === "block-scalar"
    });
    offset = valueProps.end;
    if (valueProps.found) {
      if (implicitKey) {
        if (value?.type === "block-map" && !valueProps.hasNewline)
          onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
        if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
          onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
      }
      const valueNode = value ? composeNode2(ctx, value, valueProps, onError) : composeEmptyNode2(ctx, offset, sep, null, valueProps, onError);
      if (ctx.schema.compat)
        flowIndentCheck(bm.indent, value, onError);
      offset = valueNode.range[2];
      const pair = new Pair(keyNode, valueNode);
      if (ctx.options.keepSourceTokens)
        pair.srcToken = collItem;
      map2.items.push(pair);
    } else {
      if (implicitKey)
        onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
      if (valueProps.comment) {
        if (keyNode.comment)
          keyNode.comment += "\n" + valueProps.comment;
        else
          keyNode.comment = valueProps.comment;
      }
      const pair = new Pair(keyNode);
      if (ctx.options.keepSourceTokens)
        pair.srcToken = collItem;
      map2.items.push(pair);
    }
  }
  if (commentEnd && commentEnd < offset)
    onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
  map2.range = [bm.offset, offset, commentEnd ?? offset];
  return map2;
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/compose/resolve-block-seq.js
function resolveBlockSeq({ composeNode: composeNode2, composeEmptyNode: composeEmptyNode2 }, ctx, bs, onError, tag) {
  const NodeClass = tag?.nodeClass ?? YAMLSeq;
  const seq2 = new NodeClass(ctx.schema);
  if (ctx.atRoot)
    ctx.atRoot = false;
  if (ctx.atKey)
    ctx.atKey = false;
  let offset = bs.offset;
  let commentEnd = null;
  for (const { start, value } of bs.items) {
    const props = resolveProps(start, {
      indicator: "seq-item-ind",
      next: value,
      offset,
      onError,
      parentIndent: bs.indent,
      startOnNewline: true
    });
    if (!props.found) {
      if (props.anchor || props.tag || value) {
        if (value?.type === "block-seq")
          onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
        else
          onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
      } else {
        commentEnd = props.end;
        if (props.comment)
          seq2.comment = props.comment;
        continue;
      }
    }
    const node = value ? composeNode2(ctx, value, props, onError) : composeEmptyNode2(ctx, props.end, start, null, props, onError);
    if (ctx.schema.compat)
      flowIndentCheck(bs.indent, value, onError);
    offset = node.range[2];
    seq2.items.push(node);
  }
  seq2.range = [bs.offset, offset, commentEnd ?? offset];
  return seq2;
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/compose/resolve-end.js
function resolveEnd(end, offset, reqSpace, onError) {
  let comment = "";
  if (end) {
    let hasSpace = false;
    let sep = "";
    for (const token of end) {
      const { source, type } = token;
      switch (type) {
        case "space":
          hasSpace = true;
          break;
        case "comment": {
          if (reqSpace && !hasSpace)
            onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
          const cb = source.substring(1) || " ";
          if (!comment)
            comment = cb;
          else
            comment += sep + cb;
          sep = "";
          break;
        }
        case "newline":
          if (comment)
            sep += source;
          hasSpace = true;
          break;
        default:
          onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
      }
      offset += source.length;
    }
  }
  return { comment, offset };
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/compose/resolve-flow-collection.js
var blockMsg = "Block collections are not allowed within flow collections";
var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
function resolveFlowCollection({ composeNode: composeNode2, composeEmptyNode: composeEmptyNode2 }, ctx, fc, onError, tag) {
  const isMap2 = fc.start.source === "{";
  const fcName = isMap2 ? "flow map" : "flow sequence";
  const NodeClass = tag?.nodeClass ?? (isMap2 ? YAMLMap : YAMLSeq);
  const coll = new NodeClass(ctx.schema);
  coll.flow = true;
  const atRoot = ctx.atRoot;
  if (atRoot)
    ctx.atRoot = false;
  if (ctx.atKey)
    ctx.atKey = false;
  let offset = fc.offset + fc.start.source.length;
  for (let i = 0; i < fc.items.length; ++i) {
    const collItem = fc.items[i];
    const { start, key, sep, value } = collItem;
    const props = resolveProps(start, {
      flow: fcName,
      indicator: "explicit-key-ind",
      next: key ?? sep?.[0],
      offset,
      onError,
      parentIndent: fc.indent,
      startOnNewline: false
    });
    if (!props.found) {
      if (!props.anchor && !props.tag && !sep && !value) {
        if (i === 0 && props.comma)
          onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        else if (i < fc.items.length - 1)
          onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
        if (props.comment) {
          if (coll.comment)
            coll.comment += "\n" + props.comment;
          else
            coll.comment = props.comment;
        }
        offset = props.end;
        continue;
      }
      if (!isMap2 && ctx.options.strict && containsNewline(key))
        onError(
          key,
          // checked by containsNewline()
          "MULTILINE_IMPLICIT_KEY",
          "Implicit keys of flow sequence pairs need to be on a single line"
        );
    }
    if (i === 0) {
      if (props.comma)
        onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
    } else {
      if (!props.comma)
        onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
      if (props.comment) {
        let prevItemComment = "";
        loop: for (const st of start) {
          switch (st.type) {
            case "comma":
            case "space":
              break;
            case "comment":
              prevItemComment = st.source.substring(1);
              break loop;
            default:
              break loop;
          }
        }
        if (prevItemComment) {
          let prev = coll.items[coll.items.length - 1];
          if (isPair(prev))
            prev = prev.value ?? prev.key;
          if (prev.comment)
            prev.comment += "\n" + prevItemComment;
          else
            prev.comment = prevItemComment;
          props.comment = props.comment.substring(prevItemComment.length + 1);
        }
      }
    }
    if (!isMap2 && !sep && !props.found) {
      const valueNode = value ? composeNode2(ctx, value, props, onError) : composeEmptyNode2(ctx, props.end, sep, null, props, onError);
      coll.items.push(valueNode);
      offset = valueNode.range[2];
      if (isBlock(value))
        onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
    } else {
      ctx.atKey = true;
      const keyStart = props.end;
      const keyNode = key ? composeNode2(ctx, key, props, onError) : composeEmptyNode2(ctx, keyStart, start, null, props, onError);
      if (isBlock(key))
        onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
      ctx.atKey = false;
      const valueProps = resolveProps(sep ?? [], {
        flow: fcName,
        indicator: "map-value-ind",
        next: value,
        offset: keyNode.range[2],
        onError,
        parentIndent: fc.indent,
        startOnNewline: false
      });
      if (valueProps.found) {
        if (!isMap2 && !props.found && ctx.options.strict) {
          if (sep)
            for (const st of sep) {
              if (st === valueProps.found)
                break;
              if (st.type === "newline") {
                onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                break;
              }
            }
          if (props.start < valueProps.found.offset - 1024)
            onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
        }
      } else if (value) {
        if ("source" in value && value.source?.[0] === ":")
          onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
        else
          onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
      }
      const valueNode = value ? composeNode2(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode2(ctx, valueProps.end, sep, null, valueProps, onError) : null;
      if (valueNode) {
        if (isBlock(value))
          onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
      } else if (valueProps.comment) {
        if (keyNode.comment)
          keyNode.comment += "\n" + valueProps.comment;
        else
          keyNode.comment = valueProps.comment;
      }
      const pair = new Pair(keyNode, valueNode);
      if (ctx.options.keepSourceTokens)
        pair.srcToken = collItem;
      if (isMap2) {
        const map2 = coll;
        if (mapIncludes(ctx, map2.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        map2.items.push(pair);
      } else {
        const map2 = new YAMLMap(ctx.schema);
        map2.flow = true;
        map2.items.push(pair);
        const endRange = (valueNode ?? keyNode).range;
        map2.range = [keyNode.range[0], endRange[1], endRange[2]];
        coll.items.push(map2);
      }
      offset = valueNode ? valueNode.range[2] : valueProps.end;
    }
  }
  const expectedEnd = isMap2 ? "}" : "]";
  const [ce, ...ee] = fc.end;
  let cePos = offset;
  if (ce?.source === expectedEnd)
    cePos = ce.offset + ce.source.length;
  else {
    const name2 = fcName[0].toUpperCase() + fcName.substring(1);
    const msg = atRoot ? `${name2} must end with a ${expectedEnd}` : `${name2} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
    onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
    if (ce && ce.source.length !== 1)
      ee.unshift(ce);
  }
  if (ee.length > 0) {
    const end = resolveEnd(ee, cePos, ctx.options.strict, onError);
    if (end.comment) {
      if (coll.comment)
        coll.comment += "\n" + end.comment;
      else
        coll.comment = end.comment;
    }
    coll.range = [fc.offset, cePos, end.offset];
  } else {
    coll.range = [fc.offset, cePos, cePos];
  }
  return coll;
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/compose/compose-collection.js
function resolveCollection(CN2, ctx, token, onError, tagName, tag) {
  const coll = token.type === "block-map" ? resolveBlockMap(CN2, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq(CN2, ctx, token, onError, tag) : resolveFlowCollection(CN2, ctx, token, onError, tag);
  const Coll = coll.constructor;
  if (tagName === "!" || tagName === Coll.tagName) {
    coll.tag = Coll.tagName;
    return coll;
  }
  if (tagName)
    coll.tag = tagName;
  return coll;
}
function composeCollection(CN2, ctx, token, props, onError) {
  const tagToken = props.tag;
  const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
  if (token.type === "block-seq") {
    const { anchor, newlineAfterProp: nl } = props;
    const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
    if (lastProp && (!nl || nl.offset < lastProp.offset)) {
      const message = "Missing newline after block sequence props";
      onError(lastProp, "MISSING_CHAR", message);
    }
  }
  const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
  if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.tagName && expType === "seq") {
    return resolveCollection(CN2, ctx, token, onError, tagName);
  }
  let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
  if (!tag) {
    const kt = ctx.schema.knownTags[tagName];
    if (kt?.collection === expType) {
      ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
      tag = kt;
    } else {
      if (kt) {
        onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
      } else {
        onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
      }
      return resolveCollection(CN2, ctx, token, onError, tagName);
    }
  }
  const coll = resolveCollection(CN2, ctx, token, onError, tagName, tag);
  const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
  const node = isNode(res) ? res : new Scalar(res);
  node.range = coll.range;
  node.tag = tagName;
  if (tag?.format)
    node.format = tag.format;
  return node;
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/compose/resolve-block-scalar.js
function resolveBlockScalar(ctx, scalar, onError) {
  const start = scalar.offset;
  const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
  if (!header)
    return { value: "", type: null, comment: "", range: [start, start, start] };
  const type = header.mode === ">" ? Scalar.BLOCK_FOLDED : Scalar.BLOCK_LITERAL;
  const lines = scalar.source ? splitLines(scalar.source) : [];
  let chompStart = lines.length;
  for (let i = lines.length - 1; i >= 0; --i) {
    const content = lines[i][1];
    if (content === "" || content === "\r")
      chompStart = i;
    else
      break;
  }
  if (chompStart === 0) {
    const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
    let end2 = start + header.length;
    if (scalar.source)
      end2 += scalar.source.length;
    return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
  }
  let trimIndent = scalar.indent + header.indent;
  let offset = scalar.offset + header.length;
  let contentStart = 0;
  for (let i = 0; i < chompStart; ++i) {
    const [indent, content] = lines[i];
    if (content === "" || content === "\r") {
      if (header.indent === 0 && indent.length > trimIndent)
        trimIndent = indent.length;
    } else {
      if (indent.length < trimIndent) {
        const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
        onError(offset + indent.length, "MISSING_CHAR", message);
      }
      if (header.indent === 0)
        trimIndent = indent.length;
      contentStart = i;
      if (trimIndent === 0 && !ctx.atRoot) {
        const message = "Block scalar values in collections must be indented";
        onError(offset, "BAD_INDENT", message);
      }
      break;
    }
    offset += indent.length + content.length + 1;
  }
  for (let i = lines.length - 1; i >= chompStart; --i) {
    if (lines[i][0].length > trimIndent)
      chompStart = i + 1;
  }
  let value = "";
  let sep = "";
  let prevMoreIndented = false;
  for (let i = 0; i < contentStart; ++i)
    value += lines[i][0].slice(trimIndent) + "\n";
  for (let i = contentStart; i < chompStart; ++i) {
    let [indent, content] = lines[i];
    offset += indent.length + content.length + 1;
    const crlf = content[content.length - 1] === "\r";
    if (crlf)
      content = content.slice(0, -1);
    if (content && indent.length < trimIndent) {
      const src = header.indent ? "explicit indentation indicator" : "first line";
      const message = `Block scalar lines must not be less indented than their ${src}`;
      onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
      indent = "";
    }
    if (type === Scalar.BLOCK_LITERAL) {
      value += sep + indent.slice(trimIndent) + content;
      sep = "\n";
    } else if (indent.length > trimIndent || content[0] === "	") {
      if (sep === " ")
        sep = "\n";
      else if (!prevMoreIndented && sep === "\n")
        sep = "\n\n";
      value += sep + indent.slice(trimIndent) + content;
      sep = "\n";
      prevMoreIndented = true;
    } else if (content === "") {
      if (sep === "\n")
        value += "\n";
      else
        sep = "\n";
    } else {
      value += sep + content;
      sep = " ";
      prevMoreIndented = false;
    }
  }
  switch (header.chomp) {
    case "-":
      break;
    case "+":
      for (let i = chompStart; i < lines.length; ++i)
        value += "\n" + lines[i][0].slice(trimIndent);
      if (value[value.length - 1] !== "\n")
        value += "\n";
      break;
    default:
      value += "\n";
  }
  const end = start + header.length + scalar.source.length;
  return { value, type, comment: header.comment, range: [start, end, end] };
}
function parseBlockScalarHeader({ offset, props }, strict, onError) {
  if (props[0].type !== "block-scalar-header") {
    onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
    return null;
  }
  const { source } = props[0];
  const mode = source[0];
  let indent = 0;
  let chomp = "";
  let error = -1;
  for (let i = 1; i < source.length; ++i) {
    const ch = source[i];
    if (!chomp && (ch === "-" || ch === "+"))
      chomp = ch;
    else {
      const n = Number(ch);
      if (!indent && n)
        indent = n;
      else if (error === -1)
        error = offset + i;
    }
  }
  if (error !== -1)
    onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
  let hasSpace = false;
  let comment = "";
  let length = source.length;
  for (let i = 1; i < props.length; ++i) {
    const token = props[i];
    switch (token.type) {
      case "space":
        hasSpace = true;
      // fallthrough
      case "newline":
        length += token.source.length;
        break;
      case "comment":
        if (strict && !hasSpace) {
          const message = "Comments must be separated from other tokens by white space characters";
          onError(token, "MISSING_CHAR", message);
        }
        length += token.source.length;
        comment = token.source.substring(1);
        break;
      case "error":
        onError(token, "UNEXPECTED_TOKEN", token.message);
        length += token.source.length;
        break;
      /* istanbul ignore next should not happen */
      default: {
        const message = `Unexpected token in block scalar header: ${token.type}`;
        onError(token, "UNEXPECTED_TOKEN", message);
        const ts = token.source;
        if (ts && typeof ts === "string")
          length += ts.length;
      }
    }
  }
  return { mode, indent, chomp, comment, length };
}
function splitLines(source) {
  const split = source.split(/\n( *)/);
  const first = split[0];
  const m = first.match(/^( *)/);
  const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
  const lines = [line0];
  for (let i = 1; i < split.length; i += 2)
    lines.push([split[i], split[i + 1]]);
  return lines;
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/compose/resolve-flow-scalar.js
function resolveFlowScalar(scalar, strict, onError) {
  const { offset, type, source, end } = scalar;
  let _type;
  let value;
  const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
  switch (type) {
    case "scalar":
      _type = Scalar.PLAIN;
      value = plainValue(source, _onError);
      break;
    case "single-quoted-scalar":
      _type = Scalar.QUOTE_SINGLE;
      value = singleQuotedValue(source, _onError);
      break;
    case "double-quoted-scalar":
      _type = Scalar.QUOTE_DOUBLE;
      value = doubleQuotedValue(source, _onError);
      break;
    /* istanbul ignore next should not happen */
    default:
      onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
      return {
        value: "",
        type: null,
        comment: "",
        range: [offset, offset + source.length, offset + source.length]
      };
  }
  const valueEnd = offset + source.length;
  const re = resolveEnd(end, valueEnd, strict, onError);
  return {
    value,
    type: _type,
    comment: re.comment,
    range: [offset, valueEnd, re.offset]
  };
}
function plainValue(source, onError) {
  let badChar = "";
  switch (source[0]) {
    /* istanbul ignore next should not happen */
    case "	":
      badChar = "a tab character";
      break;
    case ",":
      badChar = "flow indicator character ,";
      break;
    case "%":
      badChar = "directive indicator character %";
      break;
    case "|":
    case ">": {
      badChar = `block scalar indicator ${source[0]}`;
      break;
    }
    case "@":
    case "`": {
      badChar = `reserved character ${source[0]}`;
      break;
    }
  }
  if (badChar)
    onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
  return foldLines(source);
}
function singleQuotedValue(source, onError) {
  if (source[source.length - 1] !== "'" || source.length === 1)
    onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
  return foldLines(source.slice(1, -1)).replace(/''/g, "'");
}
function foldLines(source) {
  let first, line;
  try {
    first = new RegExp("(.*?)(?<![ 	])[ 	]*\r?\n", "sy");
    line = new RegExp("[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?\n", "sy");
  } catch {
    first = /(.*?)[ \t]*\r?\n/sy;
    line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
  }
  let match = first.exec(source);
  if (!match)
    return source;
  let res = match[1];
  let sep = " ";
  let pos = first.lastIndex;
  line.lastIndex = pos;
  while (match = line.exec(source)) {
    if (match[1] === "") {
      if (sep === "\n")
        res += sep;
      else
        sep = "\n";
    } else {
      res += sep + match[1];
      sep = " ";
    }
    pos = line.lastIndex;
  }
  const last = /[ \t]*(.*)/sy;
  last.lastIndex = pos;
  match = last.exec(source);
  return res + sep + (match?.[1] ?? "");
}
function doubleQuotedValue(source, onError) {
  let res = "";
  for (let i = 1; i < source.length - 1; ++i) {
    const ch = source[i];
    if (ch === "\r" && source[i + 1] === "\n")
      continue;
    if (ch === "\n") {
      const { fold, offset } = foldNewline(source, i);
      res += fold;
      i = offset;
    } else if (ch === "\\") {
      let next = source[++i];
      const cc = escapeCodes[next];
      if (cc)
        res += cc;
      else if (next === "\n") {
        next = source[i + 1];
        while (next === " " || next === "	")
          next = source[++i + 1];
      } else if (next === "\r" && source[i + 1] === "\n") {
        next = source[++i + 1];
        while (next === " " || next === "	")
          next = source[++i + 1];
      } else if (next === "x" || next === "u" || next === "U") {
        const length = next === "x" ? 2 : next === "u" ? 4 : 8;
        res += parseCharCode(source, i + 1, length, onError);
        i += length;
      } else {
        const raw = source.substr(i - 1, 2);
        onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        res += raw;
      }
    } else if (ch === " " || ch === "	") {
      const wsStart = i;
      let next = source[i + 1];
      while (next === " " || next === "	")
        next = source[++i + 1];
      if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
        res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
    } else {
      res += ch;
    }
  }
  if (source[source.length - 1] !== '"' || source.length === 1)
    onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
  return res;
}
function foldNewline(source, offset) {
  let fold = "";
  let ch = source[offset + 1];
  while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
    if (ch === "\r" && source[offset + 2] !== "\n")
      break;
    if (ch === "\n")
      fold += "\n";
    offset += 1;
    ch = source[offset + 1];
  }
  if (!fold)
    fold = " ";
  return { fold, offset };
}
var escapeCodes = {
  "0": "\0",
  // null character
  a: "\x07",
  // bell character
  b: "\b",
  // backspace
  e: "\x1B",
  // escape character
  f: "\f",
  // form feed
  n: "\n",
  // line feed
  r: "\r",
  // carriage return
  t: "	",
  // horizontal tab
  v: "\v",
  // vertical tab
  N: "\x85",
  // Unicode next line
  _: "\xA0",
  // Unicode non-breaking space
  L: "\u2028",
  // Unicode line separator
  P: "\u2029",
  // Unicode paragraph separator
  " ": " ",
  '"': '"',
  "/": "/",
  "\\": "\\",
  "	": "	"
};
function parseCharCode(source, offset, length, onError) {
  const cc = source.substr(offset, length);
  const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
  const code = ok ? parseInt(cc, 16) : NaN;
  try {
    return String.fromCodePoint(code);
  } catch {
    const raw = source.substr(offset - 2, length + 2);
    onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
    return raw;
  }
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/compose/compose-scalar.js
function composeScalar(ctx, token, tagToken, onError) {
  const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar(ctx, token, onError) : resolveFlowScalar(token, ctx.options.strict, onError);
  const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
  let tag;
  if (ctx.options.stringKeys && ctx.atKey) {
    tag = ctx.schema[SCALAR];
  } else if (tagName)
    tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
  else if (token.type === "scalar")
    tag = findScalarTagByTest(ctx, value, token, onError);
  else
    tag = ctx.schema[SCALAR];
  let scalar;
  try {
    const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
    scalar = isScalar(res) ? res : new Scalar(res);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
    scalar = new Scalar(value);
  }
  scalar.range = range;
  scalar.source = value;
  if (type)
    scalar.type = type;
  if (tagName)
    scalar.tag = tagName;
  if (tag.format)
    scalar.format = tag.format;
  if (comment)
    scalar.comment = comment;
  return scalar;
}
function findScalarTagByName(schema4, value, tagName, tagToken, onError) {
  if (tagName === "!")
    return schema4[SCALAR];
  const matchWithTest = [];
  for (const tag of schema4.tags) {
    if (!tag.collection && tag.tag === tagName) {
      if (tag.default && tag.test)
        matchWithTest.push(tag);
      else
        return tag;
    }
  }
  for (const tag of matchWithTest)
    if (tag.test?.test(value))
      return tag;
  const kt = schema4.knownTags[tagName];
  if (kt && !kt.collection) {
    schema4.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
    return kt;
  }
  onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
  return schema4[SCALAR];
}
function findScalarTagByTest({ atKey, directives, schema: schema4 }, value, token, onError) {
  const tag = schema4.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema4[SCALAR];
  if (schema4.compat) {
    const compat = schema4.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema4[SCALAR];
    if (tag.tag !== compat.tag) {
      const ts = directives.tagString(tag.tag);
      const cs = directives.tagString(compat.tag);
      const msg = `Value may be parsed as either ${ts} or ${cs}`;
      onError(token, "TAG_RESOLVE_FAILED", msg, true);
    }
  }
  return tag;
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/compose/util-empty-scalar-position.js
function emptyScalarPosition(offset, before, pos) {
  if (before) {
    pos ?? (pos = before.length);
    for (let i = pos - 1; i >= 0; --i) {
      let st = before[i];
      switch (st.type) {
        case "space":
        case "comment":
        case "newline":
          offset -= st.source.length;
          continue;
      }
      st = before[++i];
      while (st?.type === "space") {
        offset += st.source.length;
        st = before[++i];
      }
      break;
    }
  }
  return offset;
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/compose/compose-node.js
var CN = { composeNode, composeEmptyNode };
function composeNode(ctx, token, props, onError) {
  const atKey = ctx.atKey;
  const { spaceBefore, comment, anchor, tag } = props;
  let node;
  let isSrcToken = true;
  switch (token.type) {
    case "alias":
      node = composeAlias(ctx, token, onError);
      if (anchor || tag)
        onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
      break;
    case "scalar":
    case "single-quoted-scalar":
    case "double-quoted-scalar":
    case "block-scalar":
      node = composeScalar(ctx, token, tag, onError);
      if (anchor)
        node.anchor = anchor.source.substring(1);
      break;
    case "block-map":
    case "block-seq":
    case "flow-collection":
      try {
        node = composeCollection(CN, ctx, token, props, onError);
        if (anchor)
          node.anchor = anchor.source.substring(1);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        onError(token, "RESOURCE_EXHAUSTION", message);
      }
      break;
    default: {
      const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
      onError(token, "UNEXPECTED_TOKEN", message);
      isSrcToken = false;
    }
  }
  node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
  if (anchor && node.anchor === "")
    onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
  if (atKey && ctx.options.stringKeys && (!isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
    const msg = "With stringKeys, all keys must be strings";
    onError(tag ?? token, "NON_STRING_KEY", msg);
  }
  if (spaceBefore)
    node.spaceBefore = true;
  if (comment) {
    if (token.type === "scalar" && token.source === "")
      node.comment = comment;
    else
      node.commentBefore = comment;
  }
  if (ctx.options.keepSourceTokens && isSrcToken)
    node.srcToken = token;
  return node;
}
function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
  const token = {
    type: "scalar",
    offset: emptyScalarPosition(offset, before, pos),
    indent: -1,
    source: ""
  };
  const node = composeScalar(ctx, token, tag, onError);
  if (anchor) {
    node.anchor = anchor.source.substring(1);
    if (node.anchor === "")
      onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
  }
  if (spaceBefore)
    node.spaceBefore = true;
  if (comment) {
    node.comment = comment;
    node.range[2] = end;
  }
  return node;
}
function composeAlias({ options }, { offset, source, end }, onError) {
  const alias = new Alias(source.substring(1));
  if (alias.source === "")
    onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
  if (alias.source.endsWith(":"))
    onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
  const valueEnd = offset + source.length;
  const re = resolveEnd(end, valueEnd, options.strict, onError);
  alias.range = [offset, valueEnd, re.offset];
  if (re.comment)
    alias.comment = re.comment;
  return alias;
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/compose/compose-doc.js
function composeDoc(options, directives, { offset, start, value, end }, onError) {
  const opts = Object.assign({ _directives: directives }, options);
  const doc = new Document(void 0, opts);
  const ctx = {
    atKey: false,
    atRoot: true,
    directives: doc.directives,
    options: doc.options,
    schema: doc.schema
  };
  const props = resolveProps(start, {
    indicator: "doc-start",
    next: value ?? end?.[0],
    offset,
    onError,
    parentIndent: 0,
    startOnNewline: true
  });
  if (props.found) {
    doc.directives.docStart = true;
    if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
      onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
  }
  doc.contents = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
  const contentEnd = doc.contents.range[2];
  const re = resolveEnd(end, contentEnd, false, onError);
  if (re.comment)
    doc.comment = re.comment;
  doc.range = [offset, contentEnd, re.offset];
  return doc;
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/compose/composer.js
function getErrorPos(src) {
  if (typeof src === "number")
    return [src, src + 1];
  if (Array.isArray(src))
    return src.length === 2 ? src : [src[0], src[1]];
  const { offset, source } = src;
  return [offset, offset + (typeof source === "string" ? source.length : 1)];
}
function parsePrelude(prelude) {
  let comment = "";
  let atComment = false;
  let afterEmptyLine = false;
  for (let i = 0; i < prelude.length; ++i) {
    const source = prelude[i];
    switch (source[0]) {
      case "#":
        comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
        atComment = true;
        afterEmptyLine = false;
        break;
      case "%":
        if (prelude[i + 1]?.[0] !== "#")
          i += 1;
        atComment = false;
        break;
      default:
        if (!atComment)
          afterEmptyLine = true;
        atComment = false;
    }
  }
  return { comment, afterEmptyLine };
}
var Composer = class {
  constructor(options = {}) {
    this.doc = null;
    this.atDirectives = false;
    this.prelude = [];
    this.errors = [];
    this.warnings = [];
    this.onError = (source, code, message, warning) => {
      const pos = getErrorPos(source);
      if (warning)
        this.warnings.push(new YAMLWarning(pos, code, message));
      else
        this.errors.push(new YAMLParseError(pos, code, message));
    };
    this.directives = new Directives({ version: options.version || "1.2" });
    this.options = options;
  }
  decorate(doc, afterDoc) {
    const { comment, afterEmptyLine } = parsePrelude(this.prelude);
    if (comment) {
      const dc = doc.contents;
      if (afterDoc) {
        doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
      } else if (afterEmptyLine || doc.directives.docStart || !dc) {
        doc.commentBefore = comment;
      } else if (isCollection(dc) && !dc.flow && dc.items.length > 0) {
        let it = dc.items[0];
        if (isPair(it))
          it = it.key;
        const cb = it.commentBefore;
        it.commentBefore = cb ? `${comment}
${cb}` : comment;
      } else {
        const cb = dc.commentBefore;
        dc.commentBefore = cb ? `${comment}
${cb}` : comment;
      }
    }
    if (afterDoc) {
      for (let i = 0; i < this.errors.length; ++i)
        doc.errors.push(this.errors[i]);
      for (let i = 0; i < this.warnings.length; ++i)
        doc.warnings.push(this.warnings[i]);
    } else {
      doc.errors = this.errors;
      doc.warnings = this.warnings;
    }
    this.prelude = [];
    this.errors = [];
    this.warnings = [];
  }
  /**
   * Current stream status information.
   *
   * Mostly useful at the end of input for an empty stream.
   */
  streamInfo() {
    return {
      comment: parsePrelude(this.prelude).comment,
      directives: this.directives,
      errors: this.errors,
      warnings: this.warnings
    };
  }
  /**
   * Compose tokens into documents.
   *
   * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
   * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
   */
  *compose(tokens, forceDoc = false, endOffset = -1) {
    for (const token of tokens)
      yield* this.next(token);
    yield* this.end(forceDoc, endOffset);
  }
  /** Advance the composer by one CST token. */
  *next(token) {
    switch (token.type) {
      case "directive":
        this.directives.add(token.source, (offset, message, warning) => {
          const pos = getErrorPos(token);
          pos[0] += offset;
          this.onError(pos, "BAD_DIRECTIVE", message, warning);
        });
        this.prelude.push(token.source);
        this.atDirectives = true;
        break;
      case "document": {
        const doc = composeDoc(this.options, this.directives, token, this.onError);
        if (this.atDirectives && !doc.directives.docStart)
          this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
        this.decorate(doc, false);
        if (this.doc)
          yield this.doc;
        this.doc = doc;
        this.atDirectives = false;
        break;
      }
      case "byte-order-mark":
      case "space":
        break;
      case "comment":
      case "newline":
        this.prelude.push(token.source);
        break;
      case "error": {
        const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
        const error = new YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
        if (this.atDirectives || !this.doc)
          this.errors.push(error);
        else
          this.doc.errors.push(error);
        break;
      }
      case "doc-end": {
        if (!this.doc) {
          const msg = "Unexpected doc-end without preceding document";
          this.errors.push(new YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
          break;
        }
        this.doc.directives.docEnd = true;
        const end = resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
        this.decorate(this.doc, true);
        if (end.comment) {
          const dc = this.doc.comment;
          this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
        }
        this.doc.range[2] = end.offset;
        break;
      }
      default:
        this.errors.push(new YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
    }
  }
  /**
   * Call at end of input to yield any remaining document.
   *
   * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
   * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
   */
  *end(forceDoc = false, endOffset = -1) {
    if (this.doc) {
      this.decorate(this.doc, true);
      yield this.doc;
      this.doc = null;
    } else if (forceDoc) {
      const opts = Object.assign({ _directives: this.directives }, this.options);
      const doc = new Document(void 0, opts);
      if (this.atDirectives)
        this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
      doc.range = [0, endOffset, endOffset];
      this.decorate(doc, false);
      yield doc;
    }
  }
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/parse/cst-visit.js
var BREAK2 = /* @__PURE__ */ Symbol("break visit");
var SKIP2 = /* @__PURE__ */ Symbol("skip children");
var REMOVE2 = /* @__PURE__ */ Symbol("remove item");
function visit2(cst, visitor) {
  if ("type" in cst && cst.type === "document")
    cst = { start: cst.start, value: cst.value };
  _visit(Object.freeze([]), cst, visitor);
}
visit2.BREAK = BREAK2;
visit2.SKIP = SKIP2;
visit2.REMOVE = REMOVE2;
visit2.itemAtPath = (cst, path) => {
  let item = cst;
  for (const [field, index] of path) {
    const tok = item?.[field];
    if (tok && "items" in tok) {
      item = tok.items[index];
    } else
      return void 0;
  }
  return item;
};
visit2.parentCollection = (cst, path) => {
  const parent = visit2.itemAtPath(cst, path.slice(0, -1));
  const field = path[path.length - 1][0];
  const coll = parent?.[field];
  if (coll && "items" in coll)
    return coll;
  throw new Error("Parent collection not found");
};
function _visit(path, item, visitor) {
  let ctrl = visitor(item, path);
  if (typeof ctrl === "symbol")
    return ctrl;
  for (const field of ["key", "value"]) {
    const token = item[field];
    if (token && "items" in token) {
      for (let i = 0; i < token.items.length; ++i) {
        const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
        if (typeof ci === "number")
          i = ci - 1;
        else if (ci === BREAK2)
          return BREAK2;
        else if (ci === REMOVE2) {
          token.items.splice(i, 1);
          i -= 1;
        }
      }
      if (typeof ctrl === "function" && field === "key")
        ctrl = ctrl(item, path);
    }
  }
  return typeof ctrl === "function" ? ctrl(item, path) : ctrl;
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/parse/cst.js
var BOM = "\uFEFF";
var DOCUMENT = "";
var FLOW_END = "";
var SCALAR2 = "";
function tokenType(source) {
  switch (source) {
    case BOM:
      return "byte-order-mark";
    case DOCUMENT:
      return "doc-mode";
    case FLOW_END:
      return "flow-error-end";
    case SCALAR2:
      return "scalar";
    case "---":
      return "doc-start";
    case "...":
      return "doc-end";
    case "":
    case "\n":
    case "\r\n":
      return "newline";
    case "-":
      return "seq-item-ind";
    case "?":
      return "explicit-key-ind";
    case ":":
      return "map-value-ind";
    case "{":
      return "flow-map-start";
    case "}":
      return "flow-map-end";
    case "[":
      return "flow-seq-start";
    case "]":
      return "flow-seq-end";
    case ",":
      return "comma";
  }
  switch (source[0]) {
    case " ":
    case "	":
      return "space";
    case "#":
      return "comment";
    case "%":
      return "directive-line";
    case "*":
      return "alias";
    case "&":
      return "anchor";
    case "!":
      return "tag";
    case "'":
      return "single-quoted-scalar";
    case '"':
      return "double-quoted-scalar";
    case "|":
    case ">":
      return "block-scalar-header";
  }
  return null;
}

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/parse/lexer.js
function isEmpty(ch) {
  switch (ch) {
    case void 0:
    case " ":
    case "\n":
    case "\r":
    case "	":
      return true;
    default:
      return false;
  }
}
var hexDigits2 = new Set("0123456789ABCDEFabcdef");
var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
var flowIndicatorChars = new Set(",[]{}");
var invalidAnchorChars = new Set(" ,[]{}\n\r	");
var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
var Lexer = class {
  constructor() {
    this.atEnd = false;
    this.blockScalarIndent = -1;
    this.blockScalarKeep = false;
    this.buffer = "";
    this.flowKey = false;
    this.flowLevel = 0;
    this.indentNext = 0;
    this.indentValue = 0;
    this.lineEndPos = null;
    this.next = null;
    this.pos = 0;
  }
  /**
   * Generate YAML tokens from the `source` string. If `incomplete`,
   * a part of the last line may be left as a buffer for the next call.
   *
   * @returns A generator of lexical tokens
   */
  *lex(source, incomplete = false) {
    if (source) {
      if (typeof source !== "string")
        throw TypeError("source is not a string");
      this.buffer = this.buffer ? this.buffer + source : source;
      this.lineEndPos = null;
    }
    this.atEnd = !incomplete;
    let next = this.next ?? "stream";
    while (next && (incomplete || this.hasChars(1)))
      next = yield* this.parseNext(next);
  }
  atLineEnd() {
    let i = this.pos;
    let ch = this.buffer[i];
    while (ch === " " || ch === "	")
      ch = this.buffer[++i];
    if (!ch || ch === "#" || ch === "\n")
      return true;
    if (ch === "\r")
      return this.buffer[i + 1] === "\n";
    return false;
  }
  charAt(n) {
    return this.buffer[this.pos + n];
  }
  continueScalar(offset) {
    let ch = this.buffer[offset];
    if (this.indentNext > 0) {
      let indent = 0;
      while (ch === " ")
        ch = this.buffer[++indent + offset];
      if (ch === "\r") {
        const next = this.buffer[indent + offset + 1];
        if (next === "\n" || !next && !this.atEnd)
          return offset + indent + 1;
      }
      return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
    }
    if (ch === "-" || ch === ".") {
      const dt = this.buffer.substr(offset, 3);
      if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
        return -1;
    }
    return offset;
  }
  getLine() {
    let end = this.lineEndPos;
    if (typeof end !== "number" || end !== -1 && end < this.pos) {
      end = this.buffer.indexOf("\n", this.pos);
      this.lineEndPos = end;
    }
    if (end === -1)
      return this.atEnd ? this.buffer.substring(this.pos) : null;
    if (this.buffer[end - 1] === "\r")
      end -= 1;
    return this.buffer.substring(this.pos, end);
  }
  hasChars(n) {
    return this.pos + n <= this.buffer.length;
  }
  setNext(state) {
    this.buffer = this.buffer.substring(this.pos);
    this.pos = 0;
    this.lineEndPos = null;
    this.next = state;
    return null;
  }
  peek(n) {
    return this.buffer.substr(this.pos, n);
  }
  *parseNext(next) {
    switch (next) {
      case "stream":
        return yield* this.parseStream();
      case "line-start":
        return yield* this.parseLineStart();
      case "block-start":
        return yield* this.parseBlockStart();
      case "doc":
        return yield* this.parseDocument();
      case "flow":
        return yield* this.parseFlowCollection();
      case "quoted-scalar":
        return yield* this.parseQuotedScalar();
      case "block-scalar":
        return yield* this.parseBlockScalar();
      case "plain-scalar":
        return yield* this.parsePlainScalar();
    }
  }
  *parseStream() {
    let line = this.getLine();
    if (line === null)
      return this.setNext("stream");
    if (line[0] === BOM) {
      yield* this.pushCount(1);
      line = line.substring(1);
    }
    if (line[0] === "%") {
      let dirEnd = line.length;
      let cs = line.indexOf("#");
      while (cs !== -1) {
        const ch = line[cs - 1];
        if (ch === " " || ch === "	") {
          dirEnd = cs - 1;
          break;
        } else {
          cs = line.indexOf("#", cs + 1);
        }
      }
      while (true) {
        const ch = line[dirEnd - 1];
        if (ch === " " || ch === "	")
          dirEnd -= 1;
        else
          break;
      }
      const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
      yield* this.pushCount(line.length - n);
      this.pushNewline();
      return "stream";
    }
    if (this.atLineEnd()) {
      const sp = yield* this.pushSpaces(true);
      yield* this.pushCount(line.length - sp);
      yield* this.pushNewline();
      return "stream";
    }
    yield DOCUMENT;
    return yield* this.parseLineStart();
  }
  *parseLineStart() {
    const ch = this.charAt(0);
    if (!ch && !this.atEnd)
      return this.setNext("line-start");
    if (ch === "-" || ch === ".") {
      if (!this.atEnd && !this.hasChars(4))
        return this.setNext("line-start");
      const s = this.peek(3);
      if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
        yield* this.pushCount(3);
        this.indentValue = 0;
        this.indentNext = 0;
        return s === "---" ? "doc" : "stream";
      }
    }
    this.indentValue = yield* this.pushSpaces(false);
    if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
      this.indentNext = this.indentValue;
    return yield* this.parseBlockStart();
  }
  *parseBlockStart() {
    const [ch0, ch1] = this.peek(2);
    if (!ch1 && !this.atEnd)
      return this.setNext("block-start");
    if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
      const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
      this.indentNext = this.indentValue + 1;
      this.indentValue += n;
      return "block-start";
    }
    return "doc";
  }
  *parseDocument() {
    yield* this.pushSpaces(true);
    const line = this.getLine();
    if (line === null)
      return this.setNext("doc");
    let n = yield* this.pushIndicators();
    switch (line[n]) {
      case "#":
        yield* this.pushCount(line.length - n);
      // fallthrough
      case void 0:
        yield* this.pushNewline();
        return yield* this.parseLineStart();
      case "{":
      case "[":
        yield* this.pushCount(1);
        this.flowKey = false;
        this.flowLevel = 1;
        return "flow";
      case "}":
      case "]":
        yield* this.pushCount(1);
        return "doc";
      case "*":
        yield* this.pushUntil(isNotAnchorChar);
        return "doc";
      case '"':
      case "'":
        return yield* this.parseQuotedScalar();
      case "|":
      case ">":
        n += yield* this.parseBlockScalarHeader();
        n += yield* this.pushSpaces(true);
        yield* this.pushCount(line.length - n);
        yield* this.pushNewline();
        return yield* this.parseBlockScalar();
      default:
        return yield* this.parsePlainScalar();
    }
  }
  *parseFlowCollection() {
    let nl, sp;
    let indent = -1;
    do {
      nl = yield* this.pushNewline();
      if (nl > 0) {
        sp = yield* this.pushSpaces(false);
        this.indentValue = indent = sp;
      } else {
        sp = 0;
      }
      sp += yield* this.pushSpaces(true);
    } while (nl + sp > 0);
    const line = this.getLine();
    if (line === null)
      return this.setNext("flow");
    if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
      const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
      if (!atFlowEndMarker) {
        this.flowLevel = 0;
        yield FLOW_END;
        return yield* this.parseLineStart();
      }
    }
    let n = 0;
    while (line[n] === ",") {
      n += yield* this.pushCount(1);
      n += yield* this.pushSpaces(true);
      this.flowKey = false;
    }
    n += yield* this.pushIndicators();
    switch (line[n]) {
      case void 0:
        return "flow";
      case "#":
        yield* this.pushCount(line.length - n);
        return "flow";
      case "{":
      case "[":
        yield* this.pushCount(1);
        this.flowKey = false;
        this.flowLevel += 1;
        return "flow";
      case "}":
      case "]":
        yield* this.pushCount(1);
        this.flowKey = true;
        this.flowLevel -= 1;
        return this.flowLevel ? "flow" : "doc";
      case "*":
        yield* this.pushUntil(isNotAnchorChar);
        return "flow";
      case '"':
      case "'":
        this.flowKey = true;
        return yield* this.parseQuotedScalar();
      case ":": {
        const next = this.charAt(1);
        if (this.flowKey || isEmpty(next) || next === ",") {
          this.flowKey = false;
          yield* this.pushCount(1);
          yield* this.pushSpaces(true);
          return "flow";
        }
      }
      // fallthrough
      default:
        this.flowKey = false;
        return yield* this.parsePlainScalar();
    }
  }
  *parseQuotedScalar() {
    const quote = this.charAt(0);
    let end = this.buffer.indexOf(quote, this.pos + 1);
    if (quote === "'") {
      while (end !== -1 && this.buffer[end + 1] === "'")
        end = this.buffer.indexOf("'", end + 2);
    } else {
      while (end !== -1) {
        let n = 0;
        while (this.buffer[end - 1 - n] === "\\")
          n += 1;
        if (n % 2 === 0)
          break;
        end = this.buffer.indexOf('"', end + 1);
      }
    }
    const qb = this.buffer.substring(0, end);
    let nl = qb.indexOf("\n", this.pos);
    if (nl !== -1) {
      while (nl !== -1) {
        const cs = this.continueScalar(nl + 1);
        if (cs === -1)
          break;
        nl = qb.indexOf("\n", cs);
      }
      if (nl !== -1) {
        end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
      }
    }
    if (end === -1) {
      if (!this.atEnd)
        return this.setNext("quoted-scalar");
      end = this.buffer.length;
    }
    yield* this.pushToIndex(end + 1, false);
    return this.flowLevel ? "flow" : "doc";
  }
  *parseBlockScalarHeader() {
    this.blockScalarIndent = -1;
    this.blockScalarKeep = false;
    let i = this.pos;
    while (true) {
      const ch = this.buffer[++i];
      if (ch === "+")
        this.blockScalarKeep = true;
      else if (ch > "0" && ch <= "9")
        this.blockScalarIndent = Number(ch) - 1;
      else if (ch !== "-")
        break;
    }
    return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
  }
  *parseBlockScalar() {
    let nl = this.pos - 1;
    let indent = 0;
    let ch;
    loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
      switch (ch) {
        case " ":
          indent += 1;
          break;
        case "\n":
          nl = i2;
          indent = 0;
          break;
        case "\r": {
          const next = this.buffer[i2 + 1];
          if (!next && !this.atEnd)
            return this.setNext("block-scalar");
          if (next === "\n")
            break;
        }
        // fallthrough
        default:
          break loop;
      }
    }
    if (!ch && !this.atEnd)
      return this.setNext("block-scalar");
    if (indent >= this.indentNext) {
      if (this.blockScalarIndent === -1)
        this.indentNext = indent;
      else {
        this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
      }
      do {
        const cs = this.continueScalar(nl + 1);
        if (cs === -1)
          break;
        nl = this.buffer.indexOf("\n", cs);
      } while (nl !== -1);
      if (nl === -1) {
        if (!this.atEnd)
          return this.setNext("block-scalar");
        nl = this.buffer.length;
      }
    }
    let i = nl + 1;
    ch = this.buffer[i];
    while (ch === " ")
      ch = this.buffer[++i];
    if (ch === "	") {
      while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
        ch = this.buffer[++i];
      nl = i - 1;
    } else if (!this.blockScalarKeep) {
      do {
        let i2 = nl - 1;
        let ch2 = this.buffer[i2];
        if (ch2 === "\r")
          ch2 = this.buffer[--i2];
        const lastChar = i2;
        while (ch2 === " ")
          ch2 = this.buffer[--i2];
        if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
          nl = i2;
        else
          break;
      } while (true);
    }
    yield SCALAR2;
    yield* this.pushToIndex(nl + 1, true);
    return yield* this.parseLineStart();
  }
  *parsePlainScalar() {
    const inFlow = this.flowLevel > 0;
    let end = this.pos - 1;
    let i = this.pos - 1;
    let ch;
    while (ch = this.buffer[++i]) {
      if (ch === ":") {
        const next = this.buffer[i + 1];
        if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
          break;
        end = i;
      } else if (isEmpty(ch)) {
        let next = this.buffer[i + 1];
        if (ch === "\r") {
          if (next === "\n") {
            i += 1;
            ch = "\n";
            next = this.buffer[i + 1];
          } else
            end = i;
        }
        if (next === "#" || inFlow && flowIndicatorChars.has(next))
          break;
        if (ch === "\n") {
          const cs = this.continueScalar(i + 1);
          if (cs === -1)
            break;
          i = Math.max(i, cs - 2);
        }
      } else {
        if (inFlow && flowIndicatorChars.has(ch))
          break;
        end = i;
      }
    }
    if (!ch && !this.atEnd)
      return this.setNext("plain-scalar");
    yield SCALAR2;
    yield* this.pushToIndex(end + 1, true);
    return inFlow ? "flow" : "doc";
  }
  *pushCount(n) {
    if (n > 0) {
      yield this.buffer.substr(this.pos, n);
      this.pos += n;
      return n;
    }
    return 0;
  }
  *pushToIndex(i, allowEmpty) {
    const s = this.buffer.slice(this.pos, i);
    if (s) {
      yield s;
      this.pos += s.length;
      return s.length;
    } else if (allowEmpty)
      yield "";
    return 0;
  }
  *pushIndicators() {
    let n = 0;
    loop: while (true) {
      switch (this.charAt(0)) {
        case "!":
          n += yield* this.pushTag();
          n += yield* this.pushSpaces(true);
          continue loop;
        case "&":
          n += yield* this.pushUntil(isNotAnchorChar);
          n += yield* this.pushSpaces(true);
          continue loop;
        case "-":
        // this is an error
        case "?":
        // this is an error outside flow collections
        case ":": {
          const inFlow = this.flowLevel > 0;
          const ch1 = this.charAt(1);
          if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
            if (!inFlow)
              this.indentNext = this.indentValue + 1;
            else if (this.flowKey)
              this.flowKey = false;
            n += yield* this.pushCount(1);
            n += yield* this.pushSpaces(true);
            continue loop;
          }
        }
      }
      break loop;
    }
    return n;
  }
  *pushTag() {
    if (this.charAt(1) === "<") {
      let i = this.pos + 2;
      let ch = this.buffer[i];
      while (!isEmpty(ch) && ch !== ">")
        ch = this.buffer[++i];
      return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
    } else {
      let i = this.pos + 1;
      let ch = this.buffer[i];
      while (ch) {
        if (tagChars.has(ch))
          ch = this.buffer[++i];
        else if (ch === "%" && hexDigits2.has(this.buffer[i + 1]) && hexDigits2.has(this.buffer[i + 2])) {
          ch = this.buffer[i += 3];
        } else
          break;
      }
      return yield* this.pushToIndex(i, false);
    }
  }
  *pushNewline() {
    const ch = this.buffer[this.pos];
    if (ch === "\n")
      return yield* this.pushCount(1);
    else if (ch === "\r" && this.charAt(1) === "\n")
      return yield* this.pushCount(2);
    else
      return 0;
  }
  *pushSpaces(allowTabs) {
    let i = this.pos - 1;
    let ch;
    do {
      ch = this.buffer[++i];
    } while (ch === " " || allowTabs && ch === "	");
    const n = i - this.pos;
    if (n > 0) {
      yield this.buffer.substr(this.pos, n);
      this.pos = i;
    }
    return n;
  }
  *pushUntil(test) {
    let i = this.pos;
    let ch = this.buffer[i];
    while (!test(ch))
      ch = this.buffer[++i];
    return yield* this.pushToIndex(i, false);
  }
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/parse/line-counter.js
var LineCounter = class {
  constructor() {
    this.lineStarts = [];
    this.addNewLine = (offset) => this.lineStarts.push(offset);
    this.linePos = (offset) => {
      let low = 0;
      let high = this.lineStarts.length;
      while (low < high) {
        const mid = low + high >> 1;
        if (this.lineStarts[mid] < offset)
          low = mid + 1;
        else
          high = mid;
      }
      if (this.lineStarts[low] === offset)
        return { line: low + 1, col: 1 };
      if (low === 0)
        return { line: 0, col: offset };
      const start = this.lineStarts[low - 1];
      return { line: low, col: offset - start + 1 };
    };
  }
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/parse/parser.js
function includesToken(list, type) {
  for (let i = 0; i < list.length; ++i)
    if (list[i].type === type)
      return true;
  return false;
}
function findNonEmptyIndex(list) {
  for (let i = 0; i < list.length; ++i) {
    switch (list[i].type) {
      case "space":
      case "comment":
      case "newline":
        break;
      default:
        return i;
    }
  }
  return -1;
}
function isFlowToken(token) {
  switch (token?.type) {
    case "alias":
    case "scalar":
    case "single-quoted-scalar":
    case "double-quoted-scalar":
    case "flow-collection":
      return true;
    default:
      return false;
  }
}
function getPrevProps(parent) {
  switch (parent.type) {
    case "document":
      return parent.start;
    case "block-map": {
      const it = parent.items[parent.items.length - 1];
      return it.sep ?? it.start;
    }
    case "block-seq":
      return parent.items[parent.items.length - 1].start;
    /* istanbul ignore next should not happen */
    default:
      return [];
  }
}
function getFirstKeyStartProps(prev) {
  if (prev.length === 0)
    return [];
  let i = prev.length;
  loop: while (--i >= 0) {
    switch (prev[i].type) {
      case "doc-start":
      case "explicit-key-ind":
      case "map-value-ind":
      case "seq-item-ind":
      case "newline":
        break loop;
    }
  }
  while (prev[++i]?.type === "space") {
  }
  return prev.splice(i, prev.length);
}
function arrayPushArray(target, source) {
  if (source.length < 1e5)
    Array.prototype.push.apply(target, source);
  else
    for (let i = 0; i < source.length; ++i)
      target.push(source[i]);
}
function fixFlowSeqItems(fc) {
  if (fc.start.type === "flow-seq-start") {
    for (const it of fc.items) {
      if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
        if (it.key)
          it.value = it.key;
        delete it.key;
        if (isFlowToken(it.value)) {
          if (it.value.end)
            arrayPushArray(it.value.end, it.sep);
          else
            it.value.end = it.sep;
        } else
          arrayPushArray(it.start, it.sep);
        delete it.sep;
      }
    }
  }
}
var Parser = class {
  /**
   * @param onNewLine - If defined, called separately with the start position of
   *   each new line (in `parse()`, including the start of input).
   */
  constructor(onNewLine) {
    this.atNewLine = true;
    this.atScalar = false;
    this.indent = 0;
    this.offset = 0;
    this.onKeyLine = false;
    this.stack = [];
    this.source = "";
    this.type = "";
    this.lexer = new Lexer();
    this.onNewLine = onNewLine;
  }
  /**
   * Parse `source` as a YAML stream.
   * If `incomplete`, a part of the last line may be left as a buffer for the next call.
   *
   * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
   *
   * @returns A generator of tokens representing each directive, document, and other structure.
   */
  *parse(source, incomplete = false) {
    if (this.onNewLine && this.offset === 0)
      this.onNewLine(0);
    for (const lexeme of this.lexer.lex(source, incomplete))
      yield* this.next(lexeme);
    if (!incomplete)
      yield* this.end();
  }
  /**
   * Advance the parser by the `source` of one lexical token.
   */
  *next(source) {
    this.source = source;
    if (this.atScalar) {
      this.atScalar = false;
      yield* this.step();
      this.offset += source.length;
      return;
    }
    const type = tokenType(source);
    if (!type) {
      const message = `Not a YAML token: ${source}`;
      yield* this.pop({ type: "error", offset: this.offset, message, source });
      this.offset += source.length;
    } else if (type === "scalar") {
      this.atNewLine = false;
      this.atScalar = true;
      this.type = "scalar";
    } else {
      this.type = type;
      yield* this.step();
      switch (type) {
        case "newline":
          this.atNewLine = true;
          this.indent = 0;
          if (this.onNewLine)
            this.onNewLine(this.offset + source.length);
          break;
        case "space":
          if (this.atNewLine && source[0] === " ")
            this.indent += source.length;
          break;
        case "explicit-key-ind":
        case "map-value-ind":
        case "seq-item-ind":
          if (this.atNewLine)
            this.indent += source.length;
          break;
        case "doc-mode":
        case "flow-error-end":
          return;
        default:
          this.atNewLine = false;
      }
      this.offset += source.length;
    }
  }
  /** Call at end of input to push out any remaining constructions */
  *end() {
    while (this.stack.length > 0)
      yield* this.pop();
  }
  get sourceToken() {
    const st = {
      type: this.type,
      offset: this.offset,
      indent: this.indent,
      source: this.source
    };
    return st;
  }
  *step() {
    const top = this.peek(1);
    if (this.type === "doc-end" && top?.type !== "doc-end") {
      while (this.stack.length > 0)
        yield* this.pop();
      this.stack.push({
        type: "doc-end",
        offset: this.offset,
        source: this.source
      });
      return;
    }
    if (!top)
      return yield* this.stream();
    switch (top.type) {
      case "document":
        return yield* this.document(top);
      case "alias":
      case "scalar":
      case "single-quoted-scalar":
      case "double-quoted-scalar":
        return yield* this.scalar(top);
      case "block-scalar":
        return yield* this.blockScalar(top);
      case "block-map":
        return yield* this.blockMap(top);
      case "block-seq":
        return yield* this.blockSequence(top);
      case "flow-collection":
        return yield* this.flowCollection(top);
      case "doc-end":
        return yield* this.documentEnd(top);
    }
    yield* this.pop();
  }
  peek(n) {
    return this.stack[this.stack.length - n];
  }
  *pop(error) {
    const token = error ?? this.stack.pop();
    if (!token) {
      const message = "Tried to pop an empty stack";
      yield { type: "error", offset: this.offset, source: "", message };
    } else if (this.stack.length === 0) {
      yield token;
    } else {
      const top = this.peek(1);
      if (token.type === "block-scalar") {
        token.indent = "indent" in top ? top.indent : 0;
      } else if (token.type === "flow-collection" && top.type === "document") {
        token.indent = 0;
      }
      if (token.type === "flow-collection")
        fixFlowSeqItems(token);
      switch (top.type) {
        case "document":
          top.value = token;
          break;
        case "block-scalar":
          top.props.push(token);
          break;
        case "block-map": {
          const it = top.items[top.items.length - 1];
          if (it.value) {
            top.items.push({ start: [], key: token, sep: [] });
            this.onKeyLine = true;
            return;
          } else if (it.sep) {
            it.value = token;
          } else {
            Object.assign(it, { key: token, sep: [] });
            this.onKeyLine = !it.explicitKey;
            return;
          }
          break;
        }
        case "block-seq": {
          const it = top.items[top.items.length - 1];
          if (it.value)
            top.items.push({ start: [], value: token });
          else
            it.value = token;
          break;
        }
        case "flow-collection": {
          const it = top.items[top.items.length - 1];
          if (!it || it.value)
            top.items.push({ start: [], key: token, sep: [] });
          else if (it.sep)
            it.value = token;
          else
            Object.assign(it, { key: token, sep: [] });
          return;
        }
        /* istanbul ignore next should not happen */
        default:
          yield* this.pop();
          yield* this.pop(token);
      }
      if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
        const last = token.items[token.items.length - 1];
        if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
          if (top.type === "document")
            top.end = last.start;
          else
            top.items.push({ start: last.start });
          token.items.splice(-1, 1);
        }
      }
    }
  }
  *stream() {
    switch (this.type) {
      case "directive-line":
        yield { type: "directive", offset: this.offset, source: this.source };
        return;
      case "byte-order-mark":
      case "space":
      case "comment":
      case "newline":
        yield this.sourceToken;
        return;
      case "doc-mode":
      case "doc-start": {
        const doc = {
          type: "document",
          offset: this.offset,
          start: []
        };
        if (this.type === "doc-start")
          doc.start.push(this.sourceToken);
        this.stack.push(doc);
        return;
      }
    }
    yield {
      type: "error",
      offset: this.offset,
      message: `Unexpected ${this.type} token in YAML stream`,
      source: this.source
    };
  }
  *document(doc) {
    if (doc.value)
      return yield* this.lineEnd(doc);
    switch (this.type) {
      case "doc-start": {
        if (findNonEmptyIndex(doc.start) !== -1) {
          yield* this.pop();
          yield* this.step();
        } else
          doc.start.push(this.sourceToken);
        return;
      }
      case "anchor":
      case "tag":
      case "space":
      case "comment":
      case "newline":
        doc.start.push(this.sourceToken);
        return;
    }
    const bv = this.startBlockValue(doc);
    if (bv)
      this.stack.push(bv);
    else {
      yield {
        type: "error",
        offset: this.offset,
        message: `Unexpected ${this.type} token in YAML document`,
        source: this.source
      };
    }
  }
  *scalar(scalar) {
    if (this.type === "map-value-ind") {
      const prev = getPrevProps(this.peek(2));
      const start = getFirstKeyStartProps(prev);
      let sep;
      if (scalar.end) {
        sep = scalar.end;
        sep.push(this.sourceToken);
        delete scalar.end;
      } else
        sep = [this.sourceToken];
      const map2 = {
        type: "block-map",
        offset: scalar.offset,
        indent: scalar.indent,
        items: [{ start, key: scalar, sep }]
      };
      this.onKeyLine = true;
      this.stack[this.stack.length - 1] = map2;
    } else
      yield* this.lineEnd(scalar);
  }
  *blockScalar(scalar) {
    switch (this.type) {
      case "space":
      case "comment":
      case "newline":
        scalar.props.push(this.sourceToken);
        return;
      case "scalar":
        scalar.source = this.source;
        this.atNewLine = true;
        this.indent = 0;
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        yield* this.pop();
        break;
      /* istanbul ignore next should not happen */
      default:
        yield* this.pop();
        yield* this.step();
    }
  }
  *blockMap(map2) {
    const it = map2.items[map2.items.length - 1];
    switch (this.type) {
      case "newline":
        this.onKeyLine = false;
        if (it.value) {
          const end = "end" in it.value ? it.value.end : void 0;
          const last = Array.isArray(end) ? end[end.length - 1] : void 0;
          if (last?.type === "comment")
            end?.push(this.sourceToken);
          else
            map2.items.push({ start: [this.sourceToken] });
        } else if (it.sep) {
          it.sep.push(this.sourceToken);
        } else {
          it.start.push(this.sourceToken);
        }
        return;
      case "space":
      case "comment":
        if (it.value) {
          map2.items.push({ start: [this.sourceToken] });
        } else if (it.sep) {
          it.sep.push(this.sourceToken);
        } else {
          if (this.atIndentedComment(it.start, map2.indent)) {
            const prev = map2.items[map2.items.length - 2];
            const end = prev?.value?.end;
            if (Array.isArray(end)) {
              arrayPushArray(end, it.start);
              end.push(this.sourceToken);
              map2.items.pop();
              return;
            }
          }
          it.start.push(this.sourceToken);
        }
        return;
    }
    if (this.indent >= map2.indent) {
      const atMapIndent = !this.onKeyLine && this.indent === map2.indent;
      const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
      let start = [];
      if (atNextItem && it.sep && !it.value) {
        const nl = [];
        for (let i = 0; i < it.sep.length; ++i) {
          const st = it.sep[i];
          switch (st.type) {
            case "newline":
              nl.push(i);
              break;
            case "space":
              break;
            case "comment":
              if (st.indent > map2.indent)
                nl.length = 0;
              break;
            default:
              nl.length = 0;
          }
        }
        if (nl.length >= 2)
          start = it.sep.splice(nl[1]);
      }
      switch (this.type) {
        case "anchor":
        case "tag":
          if (atNextItem || it.value) {
            start.push(this.sourceToken);
            map2.items.push({ start });
            this.onKeyLine = true;
          } else if (it.sep) {
            it.sep.push(this.sourceToken);
          } else {
            it.start.push(this.sourceToken);
          }
          return;
        case "explicit-key-ind":
          if (!it.sep && !it.explicitKey) {
            it.start.push(this.sourceToken);
            it.explicitKey = true;
          } else if (atNextItem || it.value) {
            start.push(this.sourceToken);
            map2.items.push({ start, explicitKey: true });
          } else {
            this.stack.push({
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken], explicitKey: true }]
            });
          }
          this.onKeyLine = true;
          return;
        case "map-value-ind":
          if (it.explicitKey) {
            if (!it.sep) {
              if (includesToken(it.start, "newline")) {
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              } else {
                const start2 = getFirstKeyStartProps(it.start);
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                });
              }
            } else if (it.value) {
              map2.items.push({ start: [], key: null, sep: [this.sourceToken] });
            } else if (includesToken(it.sep, "map-value-ind")) {
              this.stack.push({
                type: "block-map",
                offset: this.offset,
                indent: this.indent,
                items: [{ start, key: null, sep: [this.sourceToken] }]
              });
            } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
              const start2 = getFirstKeyStartProps(it.start);
              const key = it.key;
              const sep = it.sep;
              sep.push(this.sourceToken);
              delete it.key;
              delete it.sep;
              this.stack.push({
                type: "block-map",
                offset: this.offset,
                indent: this.indent,
                items: [{ start: start2, key, sep }]
              });
            } else if (start.length > 0) {
              it.sep = it.sep.concat(start, this.sourceToken);
            } else {
              it.sep.push(this.sourceToken);
            }
          } else {
            if (!it.sep) {
              Object.assign(it, { key: null, sep: [this.sourceToken] });
            } else if (it.value || atNextItem) {
              map2.items.push({ start, key: null, sep: [this.sourceToken] });
            } else if (includesToken(it.sep, "map-value-ind")) {
              this.stack.push({
                type: "block-map",
                offset: this.offset,
                indent: this.indent,
                items: [{ start: [], key: null, sep: [this.sourceToken] }]
              });
            } else {
              it.sep.push(this.sourceToken);
            }
          }
          this.onKeyLine = true;
          return;
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar": {
          const fs = this.flowScalar(this.type);
          if (atNextItem || it.value) {
            map2.items.push({ start, key: fs, sep: [] });
            this.onKeyLine = true;
          } else if (it.sep) {
            this.stack.push(fs);
          } else {
            Object.assign(it, { key: fs, sep: [] });
            this.onKeyLine = true;
          }
          return;
        }
        default: {
          const bv = this.startBlockValue(map2);
          if (bv) {
            if (bv.type === "block-seq") {
              if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                yield* this.pop({
                  type: "error",
                  offset: this.offset,
                  message: "Unexpected block-seq-ind on same line with key",
                  source: this.source
                });
                return;
              }
            } else if (atMapIndent) {
              map2.items.push({ start });
            }
            this.stack.push(bv);
            return;
          }
        }
      }
    }
    yield* this.pop();
    yield* this.step();
  }
  *blockSequence(seq2) {
    const it = seq2.items[seq2.items.length - 1];
    switch (this.type) {
      case "newline":
        if (it.value) {
          const end = "end" in it.value ? it.value.end : void 0;
          const last = Array.isArray(end) ? end[end.length - 1] : void 0;
          if (last?.type === "comment")
            end?.push(this.sourceToken);
          else
            seq2.items.push({ start: [this.sourceToken] });
        } else
          it.start.push(this.sourceToken);
        return;
      case "space":
      case "comment":
        if (it.value)
          seq2.items.push({ start: [this.sourceToken] });
        else {
          if (this.atIndentedComment(it.start, seq2.indent)) {
            const prev = seq2.items[seq2.items.length - 2];
            const end = prev?.value?.end;
            if (Array.isArray(end)) {
              arrayPushArray(end, it.start);
              end.push(this.sourceToken);
              seq2.items.pop();
              return;
            }
          }
          it.start.push(this.sourceToken);
        }
        return;
      case "anchor":
      case "tag":
        if (it.value || this.indent <= seq2.indent)
          break;
        it.start.push(this.sourceToken);
        return;
      case "seq-item-ind":
        if (this.indent !== seq2.indent)
          break;
        if (it.value || includesToken(it.start, "seq-item-ind"))
          seq2.items.push({ start: [this.sourceToken] });
        else
          it.start.push(this.sourceToken);
        return;
    }
    if (this.indent > seq2.indent) {
      const bv = this.startBlockValue(seq2);
      if (bv) {
        this.stack.push(bv);
        return;
      }
    }
    yield* this.pop();
    yield* this.step();
  }
  *flowCollection(fc) {
    const it = fc.items[fc.items.length - 1];
    if (this.type === "flow-error-end") {
      let top;
      do {
        yield* this.pop();
        top = this.peek(1);
      } while (top?.type === "flow-collection");
    } else if (fc.end.length === 0) {
      switch (this.type) {
        case "comma":
        case "explicit-key-ind":
          if (!it || it.sep)
            fc.items.push({ start: [this.sourceToken] });
          else
            it.start.push(this.sourceToken);
          return;
        case "map-value-ind":
          if (!it || it.value)
            fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
          else if (it.sep)
            it.sep.push(this.sourceToken);
          else
            Object.assign(it, { key: null, sep: [this.sourceToken] });
          return;
        case "space":
        case "comment":
        case "newline":
        case "anchor":
        case "tag":
          if (!it || it.value)
            fc.items.push({ start: [this.sourceToken] });
          else if (it.sep)
            it.sep.push(this.sourceToken);
          else
            it.start.push(this.sourceToken);
          return;
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar": {
          const fs = this.flowScalar(this.type);
          if (!it || it.value)
            fc.items.push({ start: [], key: fs, sep: [] });
          else if (it.sep)
            this.stack.push(fs);
          else
            Object.assign(it, { key: fs, sep: [] });
          return;
        }
        case "flow-map-end":
        case "flow-seq-end":
          fc.end.push(this.sourceToken);
          return;
      }
      const bv = this.startBlockValue(fc);
      if (bv)
        this.stack.push(bv);
      else {
        yield* this.pop();
        yield* this.step();
      }
    } else {
      const parent = this.peek(2);
      if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
        yield* this.pop();
        yield* this.step();
      } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
        const prev = getPrevProps(parent);
        const start = getFirstKeyStartProps(prev);
        fixFlowSeqItems(fc);
        const sep = fc.end.splice(1, fc.end.length);
        sep.push(this.sourceToken);
        const map2 = {
          type: "block-map",
          offset: fc.offset,
          indent: fc.indent,
          items: [{ start, key: fc, sep }]
        };
        this.onKeyLine = true;
        this.stack[this.stack.length - 1] = map2;
      } else {
        yield* this.lineEnd(fc);
      }
    }
  }
  flowScalar(type) {
    if (this.onNewLine) {
      let nl = this.source.indexOf("\n") + 1;
      while (nl !== 0) {
        this.onNewLine(this.offset + nl);
        nl = this.source.indexOf("\n", nl) + 1;
      }
    }
    return {
      type,
      offset: this.offset,
      indent: this.indent,
      source: this.source
    };
  }
  startBlockValue(parent) {
    switch (this.type) {
      case "alias":
      case "scalar":
      case "single-quoted-scalar":
      case "double-quoted-scalar":
        return this.flowScalar(this.type);
      case "block-scalar-header":
        return {
          type: "block-scalar",
          offset: this.offset,
          indent: this.indent,
          props: [this.sourceToken],
          source: ""
        };
      case "flow-map-start":
      case "flow-seq-start":
        return {
          type: "flow-collection",
          offset: this.offset,
          indent: this.indent,
          start: this.sourceToken,
          items: [],
          end: []
        };
      case "seq-item-ind":
        return {
          type: "block-seq",
          offset: this.offset,
          indent: this.indent,
          items: [{ start: [this.sourceToken] }]
        };
      case "explicit-key-ind": {
        this.onKeyLine = true;
        const prev = getPrevProps(parent);
        const start = getFirstKeyStartProps(prev);
        start.push(this.sourceToken);
        return {
          type: "block-map",
          offset: this.offset,
          indent: this.indent,
          items: [{ start, explicitKey: true }]
        };
      }
      case "map-value-ind": {
        this.onKeyLine = true;
        const prev = getPrevProps(parent);
        const start = getFirstKeyStartProps(prev);
        return {
          type: "block-map",
          offset: this.offset,
          indent: this.indent,
          items: [{ start, key: null, sep: [this.sourceToken] }]
        };
      }
    }
    return null;
  }
  atIndentedComment(start, indent) {
    if (this.type !== "comment")
      return false;
    if (this.indent <= indent)
      return false;
    return start.every((st) => st.type === "newline" || st.type === "space");
  }
  *documentEnd(docEnd) {
    if (this.type !== "doc-mode") {
      if (docEnd.end)
        docEnd.end.push(this.sourceToken);
      else
        docEnd.end = [this.sourceToken];
      if (this.type === "newline")
        yield* this.pop();
    }
  }
  *lineEnd(token) {
    switch (this.type) {
      case "comma":
      case "doc-start":
      case "doc-end":
      case "flow-seq-end":
      case "flow-map-end":
      case "map-value-ind":
        yield* this.pop();
        yield* this.step();
        break;
      case "newline":
        this.onKeyLine = false;
      // fallthrough
      case "space":
      case "comment":
      default:
        if (token.end)
          token.end.push(this.sourceToken);
        else
          token.end = [this.sourceToken];
        if (this.type === "newline")
          yield* this.pop();
    }
  }
};

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/browser/dist/public-api.js
function parseOptions(options) {
  const prettyErrors = options.prettyErrors !== false;
  const lineCounter = options.lineCounter || prettyErrors && new LineCounter() || null;
  return { lineCounter, prettyErrors };
}
function parseDocument(source, options = {}) {
  const { lineCounter, prettyErrors } = parseOptions(options);
  const parser = new Parser(lineCounter?.addNewLine);
  const composer = new Composer(options);
  let doc = null;
  for (const _doc of composer.compose(parser.parse(source), true, source.length)) {
    if (!doc)
      doc = _doc;
    else if (doc.options.logLevel !== "silent") {
      doc.errors.push(new YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
      break;
    }
  }
  if (prettyErrors && lineCounter) {
    doc.errors.forEach(prettifyError(source, lineCounter));
    doc.warnings.forEach(prettifyError(source, lineCounter));
  }
  return doc;
}
function parse(src, reviver, options) {
  let _reviver = void 0;
  if (typeof reviver === "function") {
    _reviver = reviver;
  } else if (options === void 0 && reviver && typeof reviver === "object") {
    options = reviver;
  }
  const doc = parseDocument(src, options);
  if (!doc)
    return null;
  doc.warnings.forEach((warning) => warn(doc.options.logLevel, warning));
  if (doc.errors.length > 0) {
    if (doc.options.logLevel !== "silent")
      throw doc.errors[0];
    else
      doc.errors = [];
  }
  return doc.toJS(Object.assign({ reviver: _reviver }, options));
}

// plugins/shared/guard-reason.ts
var GUARD_APPROVAL_KIND = "bash-guard";
var HOST_ESCALATION_PREFIX = "escalate sandbox to ";
function isHostEscalationReason(reason) {
  return typeof reason === "string" && reason.startsWith(HOST_ESCALATION_PREFIX);
}
function isRetiredEscalationPrompt(reason) {
  return typeof reason === "string" && reason.startsWith("bash-guard: escalate this bash command from ");
}
var LEGACY_ESCALATION_SUMMARY_PREFIX = 'bash-guard: escalate from "';
function isLegacyGuardReasonRecord(record) {
  if ("kind" in record) return false;
  if (typeof record.summary !== "string") return false;
  if (typeof record.runs !== "string") return false;
  if ("justification" in record) return false;
  return !record.summary.startsWith(LEGACY_ESCALATION_SUMMARY_PREFIX);
}
function isBashGuardReason(reason) {
  if (typeof reason !== "string") return false;
  if (isHostEscalationReason(reason)) return false;
  if (isRetiredEscalationPrompt(reason)) return false;
  if (reason.startsWith("bash-guard:")) return true;
  var result;
  try {
    result = parse(reason);
  } catch (error) {
    return false;
  }
  if (result === null || typeof result !== "object" || Array.isArray(result)) return false;
  const record = result;
  if (record.kind === GUARD_APPROVAL_KIND) return true;
  return isLegacyGuardReasonRecord(record);
}

// node_modules/.pnpm/unbash@4.0.10/node_modules/unbash/dist/ansi-c.js
function isOctal(code) {
  return code >= 48 && code <= 55;
}
function isHex(code) {
  return code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102;
}
function codePoint(value, fallback) {
  try {
    return String.fromCodePoint(value);
  } catch {
    return fallback;
  }
}
function decodeAnsiCQuoted(source, start, limit) {
  let pos = start;
  let value = "";
  while (pos < limit && source.charCodeAt(pos) !== 39) {
    if (source.charCodeAt(pos) !== 92 || pos + 1 >= limit) {
      const runStart = pos;
      while (pos < limit) {
        const code = source.charCodeAt(pos);
        if (code === 39 || code === 92 && pos + 1 < limit)
          break;
        pos++;
      }
      value += source.slice(runStart, pos);
      continue;
    }
    const escapeStart = pos++;
    const escaped = source[pos++];
    switch (escaped) {
      case "a":
        value += "\x07";
        break;
      case "b":
        value += "\b";
        break;
      case "e":
      case "E":
        value += "\x1B";
        break;
      case "f":
        value += "\f";
        break;
      case "n":
        value += "\n";
        break;
      case "r":
        value += "\r";
        break;
      case "t":
        value += "	";
        break;
      case "v":
        value += "\v";
        break;
      case "\\":
        value += "\\";
        break;
      case "'":
        value += "'";
        break;
      case '"':
        value += '"';
        break;
      case "?":
        value += "?";
        break;
      case "\n":
        break;
      case "c": {
        const code = pos < limit ? source.charCodeAt(pos) : 39;
        if (code === 39) {
          value += source.slice(escapeStart, pos);
          break;
        }
        pos++;
        if (code === 92) {
          const pair = pos < limit && source.charCodeAt(pos) === 92;
          if (pair)
            pos++;
          value += "";
          if (!pair && pos < limit) {
            value += source[pos];
            pos++;
          }
          break;
        }
        value += String.fromCharCode(code === 63 ? 127 : code & 31);
        break;
      }
      case "x":
      case "u":
      case "U": {
        const digitsStart = pos;
        const maxDigits = escaped === "x" ? 2 : escaped === "u" ? 4 : 8;
        while (pos < limit && pos - digitsStart < maxDigits && isHex(source.charCodeAt(pos)))
          pos++;
        if (pos === digitsStart) {
          value += `\\${escaped}`;
          break;
        }
        const raw = source.slice(escapeStart, pos);
        value += codePoint(Number.parseInt(source.slice(digitsStart, pos), 16), raw);
        break;
      }
      default: {
        const escapedCode = escaped.charCodeAt(0);
        if (!isOctal(escapedCode)) {
          value += `\\${escaped}`;
          break;
        }
        while (pos < limit && pos - escapeStart - 1 < 3 && isOctal(source.charCodeAt(pos)))
          pos++;
        value += String.fromCharCode(Number.parseInt(source.slice(escapeStart + 1, pos), 8) & 255);
        break;
      }
    }
  }
  const closed = pos < limit;
  if (closed)
    pos++;
  return { value, end: pos, closed };
}

// node_modules/.pnpm/unbash@4.0.10/node_modules/unbash/dist/chars.js
var CH_TAB = 9;
var CH_NL = 10;
var CH_SPACE = 32;
var CH_BANG = 33;
var CH_DQUOTE = 34;
var CH_HASH = 35;
var CH_DOLLAR = 36;
var CH_PERCENT = 37;
var CH_AMP = 38;
var CH_SQUOTE = 39;
var CH_LPAREN = 40;
var CH_RPAREN = 41;
var CH_STAR = 42;
var CH_PLUS = 43;
var CH_COMMA = 44;
var CH_DASH = 45;
var CH_SLASH = 47;
var CH_0 = 48;
var CH_9 = 57;
var CH_COLON = 58;
var CH_SEMI = 59;
var CH_LT = 60;
var CH_EQ = 61;
var CH_GT = 62;
var CH_QUESTION = 63;
var CH_AT = 64;
var CH_A = 65;
var CH_Z = 90;
var CH_LBRACKET = 91;
var CH_BACKSLASH = 92;
var CH_RBRACKET = 93;
var CH_CARET = 94;
var CH_UNDERSCORE = 95;
var CH_BACKTICK = 96;
var CH_a = 97;
var CH_z = 122;
var CH_LBRACE = 123;
var CH_PIPE = 124;
var CH_RBRACE = 125;
var CH_TILDE = 126;

// node_modules/.pnpm/unbash@4.0.10/node_modules/unbash/dist/arithmetic.js
function opPrec(op) {
  switch (op) {
    case ",":
      return 1;
    case "=":
    case "+=":
    case "-=":
    case "*=":
    case "/=":
    case "%=":
    case "<<=":
    case ">>=":
    case "&=":
    case "|=":
    case "^=":
      return 2;
    case "||":
      return 4;
    case "&&":
      return 5;
    case "|":
      return 6;
    case "^":
      return 7;
    case "&":
      return 8;
    case "==":
    case "!=":
      return 9;
    case "<":
    case "<=":
    case ">":
    case ">=":
      return 10;
    case "<<":
    case ">>":
      return 11;
    case "+":
    case "-":
      return 12;
    case "*":
    case "/":
    case "%":
      return 13;
    case "**":
      return 14;
    default:
      return -1;
  }
}
function opRightAssoc(op) {
  switch (op) {
    case "=":
    case "+=":
    case "-=":
    case "*=":
    case "/=":
    case "%=":
    case "<<=":
    case ">>=":
    case "&=":
    case "|=":
    case "^=":
    case "**":
      return true;
    default:
      return false;
  }
}
function parseArithmeticExpression(src, offset = 0, collector) {
  let pos = 0;
  const len = src.length;
  const initialCommandCount = collector?.commandExpansions.length ?? 0;
  const initialWordCount = collector?.embeddedWords.length ?? 0;
  function makeWord(start, end, embedded = false) {
    const node = {
      type: "ArithmeticWord",
      pos: start + offset,
      end: end + offset,
      value: src.slice(start, end),
      parts: void 0
    };
    if (embedded)
      collector?.embeddedWords.push(node);
    return node;
  }
  function skipWS() {
    while (pos < len) {
      const c2 = src.charCodeAt(pos);
      if (c2 === CH_SPACE || c2 === CH_TAB || c2 === CH_NL)
        pos++;
      else
        break;
    }
  }
  function tryReadBinOp() {
    if (pos >= len)
      return null;
    const c2 = src.charCodeAt(pos);
    const nc = pos + 1 < len ? src.charCodeAt(pos + 1) : 0;
    const nnc = pos + 2 < len ? src.charCodeAt(pos + 2) : 0;
    switch (c2) {
      case CH_COMMA:
        pos++;
        return ",";
      case CH_EQ:
        if (nc === CH_EQ) {
          pos += 2;
          return "==";
        }
        pos++;
        return "=";
      case CH_BANG:
        if (nc === CH_EQ) {
          pos += 2;
          return "!=";
        }
        return null;
      // unary
      case CH_LT:
        if (nc === CH_LT) {
          if (nnc === CH_EQ) {
            pos += 3;
            return "<<=";
          }
          pos += 2;
          return "<<";
        }
        if (nc === CH_EQ) {
          pos += 2;
          return "<=";
        }
        pos++;
        return "<";
      case CH_GT:
        if (nc === CH_GT) {
          if (nnc === CH_EQ) {
            pos += 3;
            return ">>=";
          }
          pos += 2;
          return ">>";
        }
        if (nc === CH_EQ) {
          pos += 2;
          return ">=";
        }
        pos++;
        return ">";
      case CH_PLUS:
        if (nc === CH_EQ) {
          pos += 2;
          return "+=";
        }
        if (nc === CH_PLUS)
          return null;
        pos++;
        return "+";
      case CH_DASH:
        if (nc === CH_EQ) {
          pos += 2;
          return "-=";
        }
        if (nc === CH_DASH)
          return null;
        pos++;
        return "-";
      case CH_STAR:
        if (nc === CH_STAR) {
          pos += 2;
          return "**";
        }
        if (nc === CH_EQ) {
          pos += 2;
          return "*=";
        }
        pos++;
        return "*";
      case CH_SLASH:
        if (nc === CH_EQ) {
          pos += 2;
          return "/=";
        }
        pos++;
        return "/";
      case CH_PERCENT:
        if (nc === CH_EQ) {
          pos += 2;
          return "%=";
        }
        pos++;
        return "%";
      case CH_PIPE:
        if (nc === CH_PIPE) {
          pos += 2;
          return "||";
        }
        if (nc === CH_EQ) {
          pos += 2;
          return "|=";
        }
        pos++;
        return "|";
      case CH_AMP:
        if (nc === CH_AMP) {
          pos += 2;
          return "&&";
        }
        if (nc === CH_EQ) {
          pos += 2;
          return "&=";
        }
        pos++;
        return "&";
      case CH_CARET:
        if (nc === CH_EQ) {
          pos += 2;
          return "^=";
        }
        pos++;
        return "^";
      case CH_QUESTION:
        pos++;
        return "?";
      default:
        return null;
    }
  }
  function parseBinExpr(minPrec) {
    let left = parseUnaryExpr();
    while (true) {
      skipWS();
      if (pos >= len)
        break;
      const saved = pos;
      const op = tryReadBinOp();
      if (!op)
        break;
      if (op === "?") {
        if (3 < minPrec) {
          pos = saved;
          break;
        }
        const consequent = parseBinExpr(1);
        skipWS();
        if (pos < len && src.charCodeAt(pos) === CH_COLON)
          pos++;
        const alternate = parseBinExpr(3);
        left = { type: "ArithmeticTernary", pos: left.pos, end: alternate.end, test: left, consequent, alternate };
        continue;
      }
      const prec = opPrec(op);
      if (prec < minPrec) {
        pos = saved;
        break;
      }
      const nextPrec = opRightAssoc(op) ? prec : prec + 1;
      const right = parseBinExpr(nextPrec);
      left = { type: "ArithmeticBinary", pos: left.pos, end: right.end, operator: op, left, right };
    }
    return left;
  }
  function parseUnaryExpr() {
    skipWS();
    if (pos >= len)
      return makeWord(pos, pos);
    const start = pos;
    const c2 = src.charCodeAt(pos);
    const nc = pos + 1 < len ? src.charCodeAt(pos + 1) : 0;
    if (c2 === CH_PLUS && nc === CH_PLUS) {
      pos += 2;
      const operand = parseUnaryExpr();
      return { type: "ArithmeticUnary", pos: start + offset, end: operand.end, operator: "++", operand, prefix: true };
    }
    if (c2 === CH_DASH && nc === CH_DASH) {
      pos += 2;
      const operand = parseUnaryExpr();
      return { type: "ArithmeticUnary", pos: start + offset, end: operand.end, operator: "--", operand, prefix: true };
    }
    if (c2 === CH_BANG) {
      pos++;
      const operand = parseUnaryExpr();
      return { type: "ArithmeticUnary", pos: start + offset, end: operand.end, operator: "!", operand, prefix: true };
    }
    if (c2 === CH_TILDE) {
      pos++;
      const operand = parseUnaryExpr();
      return { type: "ArithmeticUnary", pos: start + offset, end: operand.end, operator: "~", operand, prefix: true };
    }
    if (c2 === CH_PLUS && nc !== CH_PLUS && nc !== CH_EQ) {
      pos++;
      const operand = parseUnaryExpr();
      return { type: "ArithmeticUnary", pos: start + offset, end: operand.end, operator: "+", operand, prefix: true };
    }
    if (c2 === CH_DASH && nc !== CH_DASH && nc !== CH_EQ) {
      pos++;
      const operand = parseUnaryExpr();
      return { type: "ArithmeticUnary", pos: start + offset, end: operand.end, operator: "-", operand, prefix: true };
    }
    return parsePostfixExpr();
  }
  function parsePostfixExpr() {
    const operand = parseAtom();
    skipWS();
    if (pos + 1 < len) {
      const c2 = src.charCodeAt(pos);
      const nc = src.charCodeAt(pos + 1);
      if (c2 === CH_PLUS && nc === CH_PLUS) {
        pos += 2;
        return { type: "ArithmeticUnary", pos: operand.pos, end: pos + offset, operator: "++", operand, prefix: false };
      }
      if (c2 === CH_DASH && nc === CH_DASH) {
        pos += 2;
        return { type: "ArithmeticUnary", pos: operand.pos, end: pos + offset, operator: "--", operand, prefix: false };
      }
    }
    return operand;
  }
  function parseAtom() {
    skipWS();
    if (pos >= len)
      return makeWord(pos, pos);
    const c2 = src.charCodeAt(pos);
    if (c2 === CH_LPAREN) {
      const start2 = pos;
      pos++;
      const expr = parseBinExpr(0);
      skipWS();
      if (pos < len && src.charCodeAt(pos) === CH_RPAREN)
        pos++;
      return { type: "ArithmeticGroup", pos: start2 + offset, end: pos + offset, expression: expr };
    }
    if (c2 === CH_DOLLAR) {
      const start2 = pos;
      const commandCount = collector?.commandExpansions.length ?? 0;
      const wordCount2 = collector?.embeddedWords.length ?? 0;
      const atom2 = readDollarAtom();
      const wordEnd2 = collector?.findArithmeticWordEnd?.(start2 + offset, offset + len) ?? pos + offset;
      if (wordEnd2 > pos + offset) {
        if (collector) {
          collector.commandExpansions.length = commandCount;
          collector.embeddedWords.length = wordCount2;
        }
        pos = wordEnd2 - offset;
        return makeWord(start2, pos, true);
      }
      return atom2;
    }
    if (c2 === 96 || c2 === 34 || c2 === 39) {
      const start2 = pos;
      pos = (collector?.findArithmeticWordEnd?.(start2 + offset, offset + len) ?? start2 + offset + 1) - offset;
      return makeWord(start2, pos, true);
    }
    const start = pos;
    const wordCount = collector?.embeddedWords.length ?? 0;
    const atom = readWordAtom();
    const wordEnd = collector?.findArithmeticWordEnd?.(start + offset, offset + len) ?? pos + offset;
    if (wordEnd > pos + offset) {
      if (collector)
        collector.embeddedWords.length = wordCount;
      pos = wordEnd - offset;
      return makeWord(start, pos, true);
    }
    return atom;
  }
  function readDollarAtom() {
    const start = pos;
    pos++;
    if (pos >= len)
      return makeWord(start, pos);
    const c2 = src.charCodeAt(pos);
    if (c2 === CH_LPAREN) {
      if (pos + 1 < len && src.charCodeAt(pos + 1) === CH_LPAREN) {
        const expansionEnd = collector?.findArithmeticExpansionEnd(start + offset, offset + len) ?? -1;
        if (expansionEnd !== -1) {
          pos = expansionEnd - offset;
        } else {
          pos += 2;
          let depth = 1;
          while (pos < len && depth > 0) {
            if (src.charCodeAt(pos) === CH_LPAREN && src.charCodeAt(pos + 1) === CH_LPAREN) {
              depth++;
              pos += 2;
            } else if (src.charCodeAt(pos) === CH_RPAREN && src.charCodeAt(pos + 1) === CH_RPAREN) {
              depth--;
              pos += 2;
            } else {
              pos++;
            }
          }
        }
      } else {
        pos++;
        const close = collector?.findClosingParenthesis(pos + offset, offset + len) ?? -1;
        if (close !== -1) {
          pos = close - offset + 1;
        } else {
          let depth = 1;
          while (pos < len && depth > 0) {
            const ch = src.charCodeAt(pos++);
            if (ch === CH_LPAREN)
              depth++;
            else if (ch === CH_RPAREN)
              depth--;
          }
        }
        const text = src.slice(start, pos);
        const inner = text.slice(2, -1);
        const node = {
          type: "ArithmeticCommandExpansion",
          pos: start + offset,
          end: pos + offset,
          text,
          inner,
          script: void 0
        };
        collector?.commandExpansions.push(node);
        return node;
      }
    } else if (c2 === CH_LBRACE) {
      const close = collector?.findClosingBrace(pos + offset + 1, offset + len) ?? -1;
      if (close !== -1) {
        pos = close - offset + 1;
      } else {
        pos++;
        let depth = 1;
        while (pos < len && depth > 0) {
          const ch = src.charCodeAt(pos++);
          if (ch === CH_LBRACE)
            depth++;
          else if (ch === CH_RBRACE)
            depth--;
        }
      }
    } else {
      while (pos < len) {
        const ch = src.charCodeAt(pos);
        if (ch >= CH_a && ch <= CH_z || ch >= CH_A && ch <= CH_Z || ch >= CH_0 && ch <= CH_9 || ch === CH_UNDERSCORE)
          pos++;
        else
          break;
      }
    }
    return makeWord(start, pos, c2 === CH_LPAREN || c2 === CH_LBRACE);
  }
  function readWordAtom() {
    const start = pos;
    while (pos < len) {
      const c2 = src.charCodeAt(pos);
      if (c2 >= CH_0 && c2 <= CH_9 || c2 >= CH_A && c2 <= CH_Z || c2 >= CH_a && c2 <= CH_z || c2 === CH_UNDERSCORE || c2 === 35) {
        pos++;
      } else
        break;
    }
    if (pos > start && pos < len && src.charCodeAt(pos) === CH_LBRACKET) {
      const close = collector?.findClosingBracket?.(pos + offset + 1, offset + len) ?? -1;
      if (close !== -1) {
        pos = close - offset + 1;
      } else {
        pos++;
        let depth = 1;
        while (pos < len && depth > 0) {
          const c2 = src.charCodeAt(pos);
          if (c2 === CH_LBRACKET)
            depth++;
          else if (c2 === CH_RBRACKET)
            depth--;
          pos++;
        }
      }
      return makeWord(start, pos, true);
    }
    if (pos === start) {
      pos++;
      return makeWord(start, pos);
    }
    return makeWord(start, pos);
  }
  skipWS();
  if (pos >= len)
    return null;
  const result = parseBinExpr(0);
  skipWS();
  if (pos < len && collector) {
    collector.commandExpansions.length = initialCommandCount;
    collector.embeddedWords.length = initialWordCount;
    return makeWord(0, len, true);
  }
  return result;
}

// node_modules/.pnpm/unbash@4.0.10/node_modules/unbash/dist/word.js
function dequoteValue(parts) {
  let s = "";
  for (const c2 of parts)
    s += c2.type === "Literal" ? c2.value : c2.text;
  return s;
}
function unescapeBareValue(text) {
  const first = text.indexOf("\\");
  if (first === -1)
    return text;
  let s = "";
  let start = 0;
  for (let i = first; i < text.length; i++) {
    if (text.charCodeAt(i) !== 92)
      continue;
    s += text.slice(start, i);
    i++;
    if (i >= text.length) {
      s += "\\";
      start = i;
      break;
    }
    if (text.charCodeAt(i) !== 10)
      s += text[i];
    start = i + 1;
  }
  return s + text.slice(start);
}
var WordImpl = class _WordImpl {
  static _resolveWord;
  static _resolveHeredocBody;
  text;
  pos;
  end;
  #source;
  #resolver;
  #depth;
  #parts;
  #value = null;
  constructor(text, pos, end, source, resolver, depth = 0) {
    this.text = text;
    this.pos = pos;
    this.end = end;
    this.#source = source;
    this.#resolver = resolver ?? _WordImpl._resolveWord;
    this.#depth = depth;
    this.#parts = source !== void 0 ? null : void 0;
  }
  get value() {
    if (this.#value === null) {
      const parts = this.parts;
      if (!parts) {
        this.#value = unescapeBareValue(this.text);
      } else {
        let s = "";
        for (const p of parts) {
          switch (p.type) {
            case "Literal":
            case "SingleQuoted":
            case "AnsiCQuoted":
              s += p.value;
              break;
            case "DoubleQuoted":
            case "LocaleString":
              s += dequoteValue(p.parts);
              break;
            default:
              s += p.text;
              break;
          }
        }
        this.#value = s;
      }
    }
    return this.#value;
  }
  get parts() {
    if (this.#parts === null) {
      this.#parts = this.#resolver(this.#source ?? "", this, this.#depth) ?? void 0;
    }
    return this.#parts;
  }
  set parts(v) {
    this.#parts = v ?? void 0;
  }
  sourceText() {
    return this.#source?.slice(this.pos, this.end);
  }
  toJSON() {
    return { text: this.text, pos: this.pos, end: this.end, parts: this.parts, value: this.value };
  }
};

// node_modules/.pnpm/unbash@4.0.10/node_modules/unbash/dist/lexer.js
var MAX_SYNTAX_NESTING = 256;
var Token = {
  Word: 0,
  Assignment: 1,
  Semi: 2,
  Newline: 3,
  Pipe: 4,
  And: 5,
  Or: 6,
  Amp: 7,
  LParen: 8,
  RParen: 9,
  LBrace: 10,
  RBrace: 11,
  Bang: 12,
  If: 13,
  Then: 14,
  Else: 15,
  Elif: 16,
  Fi: 17,
  Do: 18,
  Done: 19,
  For: 20,
  While: 21,
  Until: 22,
  In: 23,
  Case: 24,
  Esac: 25,
  Function: 26,
  DoubleSemi: 27,
  SemiAmp: 28,
  DoubleSemiAmp: 29,
  Select: 30,
  DblLBracket: 31,
  DblRBracket: 32,
  EOF: 33,
  ArithCmd: 34,
  Coproc: 35,
  Redirect: 36
};
var TokenValue = class {
  token = Token.EOF;
  // Materialized token value, or null for word tokens whose value has not been
  // requested yet (computed from [pos, end) on demand via the owning lexer).
  _value = "";
  _owner;
  pos = 0;
  end = 0;
  fileDescriptor = void 0;
  variableName = void 0;
  content = void 0;
  targetPos = 0;
  targetEnd = 0;
  assignmentOperatorPos = -1;
  // True when `value` is exactly the raw source span [pos, end) — lets consumers
  // reuse the string instead of slicing the source again.
  raw = false;
  // True when a word contains no quoting, escaped characters, or expansions.
  // Backslash-newline continuations preserve keyword eligibility.
  keywordEligible = false;
  constructor(owner = null) {
    this._owner = owner;
  }
  get value() {
    return this._value ?? (this._value = this._owner === null ? "" : this._owner._tokenValue(this.pos, this.end, this.raw));
  }
  set value(v) {
    this._value = v;
  }
  reset() {
    this.token = Token.EOF;
    this._value = "";
    this.pos = 0;
    this.end = 0;
    this.fileDescriptor = void 0;
    this.variableName = void 0;
    this.content = void 0;
    this.targetPos = 0;
    this.targetEnd = 0;
    this.assignmentOperatorPos = -1;
    this.raw = false;
    this.keywordEligible = false;
  }
  copyFrom(other) {
    this.token = other.token;
    this._value = other._value;
    this.pos = other.pos;
    this.end = other.end;
    this.fileDescriptor = other.fileDescriptor;
    this.variableName = other.variableName;
    this.content = other.content;
    this.targetPos = other.targetPos;
    this.targetEnd = other.targetEnd;
    this.assignmentOperatorPos = other.assignmentOperatorPos;
    this.raw = other.raw;
    this.keywordEligible = other.keywordEligible;
  }
};
var RESERVED_WORDS = /* @__PURE__ */ new Map([
  ["if", Token.If],
  ["then", Token.Then],
  ["else", Token.Else],
  ["elif", Token.Elif],
  ["fi", Token.Fi],
  ["do", Token.Do],
  ["done", Token.Done],
  ["for", Token.For],
  ["while", Token.While],
  ["until", Token.Until],
  ["in", Token.In],
  ["case", Token.Case],
  ["esac", Token.Esac],
  ["function", Token.Function],
  ["select", Token.Select],
  ["coproc", Token.Coproc],
  ["!", Token.Bang],
  ["{", Token.LBrace],
  ["}", Token.RBrace]
]);
var charType = new Uint8Array(128);
charType[CH_PIPE] = 1;
charType[CH_AMP] = 1;
charType[CH_SEMI] = 1;
charType[CH_LPAREN] = 1;
charType[CH_RPAREN] = 1;
charType[CH_LT] = 1;
charType[CH_GT] = 1;
charType[CH_SPACE] = 1;
charType[CH_TAB] = 1;
charType[CH_NL] = 1;
charType[CH_BACKSLASH] = 2;
charType[CH_SQUOTE] = 2;
charType[CH_DQUOTE] = 2;
charType[CH_DOLLAR] = 2;
charType[CH_BACKTICK] = 2;
charType[CH_LBRACE] = 2;
function opensComment(src, pos, start) {
  if (pos === start)
    return true;
  const prev = src.charCodeAt(pos - 1);
  return prev < 128 && (charType[prev] & 1) !== 0;
}
var arithmeticWordDelimiter = new Uint8Array(128);
for (const ch of [
  CH_TAB,
  CH_NL,
  CH_SPACE,
  CH_BANG,
  CH_PERCENT,
  CH_AMP,
  CH_LPAREN,
  CH_RPAREN,
  CH_STAR,
  CH_PLUS,
  CH_COMMA,
  CH_DASH,
  CH_SLASH,
  CH_COLON,
  CH_LT,
  CH_EQ,
  CH_GT,
  CH_QUESTION,
  CH_CARET,
  CH_PIPE
]) {
  arithmeticWordDelimiter[ch] = 1;
}
function hasEmbeddedWordStructure(source, start, end) {
  for (let pos = start; pos < end; pos++) {
    const ch = source.charCodeAt(pos);
    if (ch === CH_BACKSLASH || ch === CH_SQUOTE || ch === CH_DQUOTE || ch === CH_DOLLAR || ch === CH_BACKTICK || (ch === CH_LT || ch === CH_GT) && pos + 1 < end && source.charCodeAt(pos + 1) === CH_LPAREN) {
      return true;
    }
  }
  return false;
}
function findUnnested(s, target) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c2 = s.charCodeAt(i);
    if (c2 === CH_BACKSLASH) {
      i++;
      continue;
    }
    if (c2 === CH_LBRACE) {
      depth++;
      continue;
    }
    if (c2 === CH_RBRACE) {
      if (depth > 0)
        depth--;
      continue;
    }
    if (c2 === CH_SQUOTE) {
      i++;
      while (i < s.length && s.charCodeAt(i) !== CH_SQUOTE)
        i++;
      continue;
    }
    if (c2 === CH_DQUOTE) {
      i++;
      while (i < s.length && s.charCodeAt(i) !== CH_DQUOTE) {
        if (s.charCodeAt(i) === CH_BACKSLASH)
          i++;
        i++;
      }
      continue;
    }
    if (c2 === target && depth === 0)
      return i;
  }
  return -1;
}
var isIdChar = new Uint8Array(128);
for (let i = CH_a; i <= CH_z; i++)
  isIdChar[i] = 3;
for (let i = CH_A; i <= CH_Z; i++)
  isIdChar[i] = 3;
for (let i = CH_0; i <= CH_9; i++)
  isIdChar[i] = 2;
isIdChar[CH_UNDERSCORE] = 3;
var extglobPrefix = new Uint8Array(128);
extglobPrefix[CH_QUESTION] = 1;
extglobPrefix[CH_AT] = 1;
extglobPrefix[CH_STAR] = 1;
extglobPrefix[CH_PLUS] = 1;
extglobPrefix[CH_BANG] = 1;
extglobPrefix[CH_EQ] = 1;
var extglobOp = {
  [CH_QUESTION]: "?",
  [CH_AT]: "@",
  [CH_STAR]: "*",
  [CH_PLUS]: "+",
  [CH_BANG]: "!"
};
function isDQChild(p) {
  const t = p.type;
  return t === "Literal" || t === "SimpleExpansion" || t === "ParameterExpansion" || t === "CommandExpansion" || t === "ArithmeticExpansion";
}
function isAllDigits(text) {
  for (let i = 0; i < text.length; i++) {
    const c2 = text.charCodeAt(i);
    if (c2 < CH_0 || c2 > CH_9)
      return false;
  }
  return text.length > 0;
}
function isAllDigitsRange(src, start, end) {
  for (let i = start; i < end; i++) {
    const c2 = src.charCodeAt(i);
    if (c2 < CH_0 || c2 > CH_9)
      return false;
  }
  return end > start;
}
var ASSIGNMENT_INVALID = -1;
var ASSIGNMENT_NAME_START = 0;
var ASSIGNMENT_NAME = 1;
var ASSIGNMENT_AFTER_INDEX = 2;
var ASSIGNMENT_AFTER_PLUS = 3;
var ASSIGNMENT_INDEX_BASE = 4;
function isMatchedAssignment(state) {
  return state < ASSIGNMENT_INVALID;
}
function assignmentOperatorPos(state) {
  return -state - 2;
}
function scanAssignmentPrefix(src, start, end, initialState) {
  let state = initialState;
  for (let i = start; i < end && state >= 0; i++) {
    const c2 = src.charCodeAt(i);
    if (state >= ASSIGNMENT_INDEX_BASE) {
      if (c2 === CH_LBRACKET)
        state++;
      else if (c2 === CH_RBRACKET && --state === ASSIGNMENT_INDEX_BASE)
        state = ASSIGNMENT_AFTER_INDEX;
    } else if (state === ASSIGNMENT_NAME_START) {
      state = c2 < 128 && isIdChar[c2] & 1 ? ASSIGNMENT_NAME : ASSIGNMENT_INVALID;
    } else if (state === ASSIGNMENT_NAME) {
      if (c2 < 128 && isIdChar[c2] & 2)
        continue;
      if (c2 === CH_LBRACKET)
        state = ASSIGNMENT_INDEX_BASE + 1;
      else if (c2 === CH_PLUS)
        state = ASSIGNMENT_AFTER_PLUS;
      else
        state = c2 === CH_EQ ? -i - 2 : ASSIGNMENT_INVALID;
    } else if (state === ASSIGNMENT_AFTER_INDEX) {
      if (c2 === CH_PLUS)
        state = ASSIGNMENT_AFTER_PLUS;
      else
        state = c2 === CH_EQ ? -i - 2 : ASSIGNMENT_INVALID;
    } else {
      state = c2 === CH_EQ ? -i - 2 : ASSIGNMENT_INVALID;
    }
  }
  return state;
}
var NO_EXPANSIONS = [];
function setToken(out, token, value, pos = 0, end = 0) {
  out.token = token;
  out._value = value;
  out.pos = pos;
  out.end = end;
  out.fileDescriptor = void 0;
  out.variableName = void 0;
  out.content = void 0;
  out.assignmentOperatorPos = -1;
  out.raw = false;
  out.keywordEligible = false;
}
function setSpanToken(out, token, pos, end, raw) {
  out.token = token;
  out._value = null;
  out.pos = pos;
  out.end = end;
  out.fileDescriptor = void 0;
  out.variableName = void 0;
  out.content = void 0;
  out.assignmentOperatorPos = -1;
  out.raw = raw;
  out.keywordEligible = false;
}
function matchReservedWord(src, start, len) {
  switch (src.charCodeAt(start)) {
    case CH_BANG:
      return len === 1 ? Token.Bang : void 0;
    case CH_LBRACE:
      return len === 1 ? Token.LBrace : void 0;
    case CH_RBRACE:
      return len === 1 ? Token.RBrace : void 0;
    case 105: {
      if (len !== 2)
        return void 0;
      const c2 = src.charCodeAt(start + 1);
      return c2 === 102 ? Token.If : c2 === 110 ? Token.In : void 0;
    }
    case 102:
      if (len === 2)
        return src.charCodeAt(start + 1) === 105 ? Token.Fi : void 0;
      if (len === 3)
        return src.startsWith("for", start) ? Token.For : void 0;
      if (len === 8)
        return src.startsWith("function", start) ? Token.Function : void 0;
      return void 0;
    case 116:
      return len === 4 && src.startsWith("then", start) ? Token.Then : void 0;
    case 101:
      if (len !== 4)
        return void 0;
      if (src.startsWith("else", start))
        return Token.Else;
      if (src.startsWith("elif", start))
        return Token.Elif;
      if (src.startsWith("esac", start))
        return Token.Esac;
      return void 0;
    case 100:
      if (len === 2)
        return src.charCodeAt(start + 1) === 111 ? Token.Do : void 0;
      if (len === 4)
        return src.startsWith("done", start) ? Token.Done : void 0;
      return void 0;
    case 99:
      if (len === 4)
        return src.startsWith("case", start) ? Token.Case : void 0;
      if (len === 6)
        return src.startsWith("coproc", start) ? Token.Coproc : void 0;
      return void 0;
    case 119:
      return len === 5 && src.startsWith("while", start) ? Token.While : void 0;
    case 117:
      return len === 5 && src.startsWith("until", start) ? Token.Until : void 0;
    case 115:
      return len === 6 && src.startsWith("select", start) ? Token.Select : void 0;
    default:
      return void 0;
  }
}
var LexContext = {
  Normal: 0,
  CommandStart: 1,
  TestMode: 2,
  // After a prefix element: assignments still recognized, reserved words not.
  CommandPrefix: 3
};
function scanBraceExpansion(src, pos, len) {
  const nextCh = pos + 1 < len ? src.charCodeAt(pos + 1) : 0;
  if (nextCh <= CH_SPACE || nextCh === CH_RBRACE)
    return -1;
  let depth = 1;
  let hasSep = false;
  let scanPos = pos + 1;
  while (scanPos < len && depth > 0) {
    const bc = src.charCodeAt(scanPos);
    if (bc === CH_LBRACE)
      depth++;
    else if (bc === CH_RBRACE) {
      if (--depth === 0)
        break;
    } else if (bc <= CH_SPACE || bc === CH_SEMI || bc === CH_PIPE || bc === CH_AMP)
      return -1;
    else if (depth === 1 && (bc === 44 || bc === 46 && scanPos + 1 < len && src.charCodeAt(scanPos + 1) === 46))
      hasSep = true;
    if (bc === CH_BACKSLASH)
      scanPos++;
    scanPos++;
  }
  if (depth === 0 && hasSep)
    return scanPos + 1;
  return -1;
}
var Lexer2 = class _Lexer {
  src;
  srcEnd;
  pos;
  current;
  nextState;
  hasPeek;
  pendingHereDocs;
  collectedExpansions;
  _errors = null;
  _buildParts = false;
  // Build processed text while scanning. Off on the normal token path (values
  // materialize lazily); on for redirect targets, heredoc delimiters, arithmetic
  // command bodies, and bounded value re-lexes. _buildParts implies it.
  _buildValue = false;
  // Nesting depth of the window being lexed (enclosing sub-fields plus substitution
  // scripts), sharing the MAX_SYNTAX_NESTING budget across lazily created lexers.
  _nestingDepth = 0;
  // `start`/`end` bound the lexer to a window of `src` so substitution scripts can be
  // parsed in place against the original source — every position is then absolute, with
  // no slicing or re-basing. Defaults cover the whole string (the common top-level parse).
  constructor(src, start = 0, end = src.length) {
    this.src = src;
    this.srcEnd = end;
    this.pos = start;
    this.current = new TokenValue(this);
    this.nextState = new TokenValue(this);
    this.hasPeek = false;
    this.pendingHereDocs = null;
    this.collectedExpansions = null;
    if (start === 0 && src.charCodeAt(0) === CH_HASH && src.charCodeAt(1) === CH_BANG) {
      const nl = src.indexOf("\n");
      this.pos = nl === -1 ? this.srcEnd : nl + 1;
    }
  }
  getSource() {
    return this.src;
  }
  get errors() {
    return this._errors ?? (this._errors = []);
  }
  getCollectedExpansions() {
    return this.collectedExpansions ?? NO_EXPANSIONS;
  }
  // Collected expansions resolve after the enclosing scan unwinds, so each records the
  // depth it was found at; resolveCollected charges that depth against the shared budget.
  collect(part) {
    (this.collectedExpansions ??= []).push([part, this._nestingDepth]);
  }
  getPos() {
    return this.pos;
  }
  /** Materialize a word token's value: raw spans slice directly, others re-lex the span. */
  _tokenValue(pos, end, raw) {
    return raw ? this.src.slice(pos, end) : this.wordValueOf(pos, end);
  }
  // Re-lex [start, end) in value mode to produce the processed word text. Bounded
  // to the span, so every expansion the original scan consumed closes within it.
  // Errors were already reported by the original scan; suppress duplicates.
  wordValueOf(start, end) {
    const savedPos = this.pos;
    const savedEnd = this.srcEnd;
    const savedBuildValue = this._buildValue;
    const savedUnbalanced = this._unbalanced;
    const errorCount = this._errors === null ? 0 : this._errors.length;
    this.pos = start;
    this.srcEnd = end;
    this._buildValue = true;
    this.readWordText();
    const value = this._wordText;
    this.pos = savedPos;
    this.srcEnd = savedEnd;
    this._buildValue = savedBuildValue;
    this._unbalanced = savedUnbalanced;
    if (this._errors !== null)
      this._errors.length = errorCount;
    return value;
  }
  /** Find the closing bracket for a shell subscript, ignoring brackets inside nested shell syntax. */
  findClosingBracket(start, end = this.srcEnd) {
    return this.findClosingShellDelimiter(start, end, CH_RBRACKET);
  }
  /** Find the closing bracket of `$[ … ]`, which unlike a subscript does not recurse into `${ }`. */
  findClosingArithmeticBracket(start, end = this.srcEnd) {
    return this.findClosingShellDelimiter(start, end, CH_RBRACKET, false, false);
  }
  /** Find the closing brace for a parameter expansion, ignoring braces inside nested shell syntax. */
  findClosingBrace(start, end = this.srcEnd) {
    return this.findClosingShellDelimiter(start, end, CH_RBRACE);
  }
  /** Find the closing parenthesis for a shell substitution using the command-aware scanner. */
  findClosingParenthesis(start, end = this.srcEnd) {
    const savedPos = this.pos;
    const savedEnd = this.srcEnd;
    const savedUnbalanced = this._unbalanced;
    this.pos = start;
    this.srcEnd = Math.min(end, this.srcEnd);
    this.extractBalanced();
    const close = this._unbalanced ? -1 : this.pos - 1;
    this.pos = savedPos;
    this.srcEnd = savedEnd;
    this._unbalanced = savedUnbalanced;
    return close;
  }
  /** Find the end of one arithmetic expansion using the canonical lexer scanner. */
  findArithmeticExpansionEnd(start, end = this.srcEnd) {
    const scanner = new _Lexer(this.src, start, end);
    scanner.pos = start + 1;
    scanner.scanArithmeticBody();
    return scanner.pos;
  }
  /** Find the end of one shell-expanded arithmetic word using the canonical lexer scanners. */
  findArithmeticWordEnd(start, end = this.srcEnd) {
    const scanner = new _Lexer(this.src, start, end);
    scanner.pos = start;
    return scanner.scanArithmeticWordEnd();
  }
  scanArithmeticWordEnd() {
    while (this.pos < this.srcEnd) {
      const ch = this.src.charCodeAt(this.pos);
      if (ch === CH_DOLLAR) {
        this.readDollar();
        continue;
      }
      if (ch === CH_BACKTICK) {
        this.readBacktickExpansion();
        continue;
      }
      if (ch === CH_SQUOTE) {
        this.pos++;
        this.skipSQ();
        continue;
      }
      if (ch === CH_DQUOTE) {
        this.pos++;
        this.skipDQ();
        continue;
      }
      if (ch === CH_BACKSLASH) {
        this.pos += 2;
        continue;
      }
      if (ch === CH_LBRACKET) {
        const close = this.findClosingBracket(this.pos + 1);
        if (close !== -1) {
          this.pos = close + 1;
          continue;
        }
      }
      if ((ch === CH_LT || ch === CH_GT) && this.src.charCodeAt(this.pos + 1) === CH_LPAREN) {
        this.pos += 2;
        this.extractBalanced();
        continue;
      }
      if (ch < 128 && arithmeticWordDelimiter[ch])
        break;
      this.pos++;
    }
    return this.pos;
  }
  // Only array assignment bodies take comments; extglob shares this scanner, and `#` is
  // pattern data there.
  findClosingShellDelimiter(start, end, closing, comments = false, braces = true) {
    const savedPos = this.pos;
    const savedEnd = this.srcEnd;
    const savedUnbalanced = this._unbalanced;
    this.srcEnd = Math.min(end, this.srcEnd);
    const delimiters = [closing];
    let pos = start;
    while (pos < this.srcEnd) {
      const ch = this.src.charCodeAt(pos);
      if (ch === CH_BACKSLASH) {
        pos += 2;
        continue;
      }
      if (ch === CH_HASH && comments && opensComment(this.src, pos, start)) {
        while (pos < this.srcEnd && this.src.charCodeAt(pos) !== CH_NL)
          pos++;
        continue;
      }
      if (ch === CH_SQUOTE) {
        this.pos = pos + 1;
        this.skipSQ();
        pos = this.pos;
        continue;
      }
      if (ch === CH_DQUOTE) {
        this.pos = pos + 1;
        this.skipDQ();
        pos = this.pos;
        continue;
      }
      if (ch === CH_BACKTICK) {
        pos++;
        while (pos < this.srcEnd && this.src.charCodeAt(pos) !== CH_BACKTICK) {
          if (this.src.charCodeAt(pos) === CH_BACKSLASH)
            pos++;
          pos++;
        }
        if (pos < this.srcEnd)
          pos++;
        continue;
      }
      if (ch === CH_DOLLAR && pos + 1 < this.srcEnd && this.src.charCodeAt(pos + 1) === CH_LPAREN || (ch === CH_LT || ch === CH_GT) && pos + 1 < this.srcEnd && this.src.charCodeAt(pos + 1) === CH_LPAREN) {
        this.pos = pos + 2;
        this.extractBalanced();
        pos = this.pos;
        continue;
      }
      const expected = delimiters[delimiters.length - 1];
      if (ch === CH_DOLLAR && pos + 1 < this.srcEnd) {
        const after = this.src.charCodeAt(pos + 1);
        if (after === CH_DOLLAR) {
          pos += 2;
          continue;
        }
        if (after === CH_LBRACE && braces) {
          delimiters.push(CH_RBRACE);
          pos += 2;
          continue;
        }
      }
      if (expected === CH_RBRACKET && ch === CH_LBRACKET) {
        delimiters.push(CH_RBRACKET);
      } else if (expected === CH_RPAREN && ch === CH_LPAREN) {
        delimiters.push(CH_RPAREN);
      } else if (ch === expected) {
        delimiters.pop();
        if (delimiters.length === 0) {
          this.pos = savedPos;
          this.srcEnd = savedEnd;
          this._unbalanced = savedUnbalanced;
          return pos;
        }
      }
      pos++;
    }
    this.pos = savedPos;
    this.srcEnd = savedEnd;
    this._unbalanced = savedUnbalanced;
    return -1;
  }
  skipSubshellBody() {
    this.extractBalanced();
    return this._unbalanced ? -1 : this.pos;
  }
  skipCompoundBody(closeToken) {
    const frames = [
      { close: closeToken, phase: closeToken === Token.Esac ? "case-pattern" : "commands" }
    ];
    let commandStart = true;
    for (; ; ) {
      const value = this.next(commandStart ? LexContext.CommandStart : LexContext.Normal);
      const token = value.token;
      if (token === Token.EOF)
        return -1;
      const last = frames.length - 1;
      const frame = frames[last];
      if (frame.phase === "function-name") {
        if (token === Token.Newline)
          continue;
        frame.phase = "function-body";
        commandStart = true;
        continue;
      } else if (frame.phase === "function-body") {
        if (token === Token.Newline)
          continue;
        frame.phase = "commands";
        commandStart = true;
        if (token === Token.LParen && this.peek(LexContext.Normal).token === Token.RParen) {
          this.next(LexContext.Normal);
          frame.phase = "function-body";
          continue;
        }
      } else if (frame.phase === "coproc-command") {
        if (token === Token.Newline)
          continue;
        if (token === Token.Word) {
          frame.phase = "coproc-body";
          commandStart = true;
          continue;
        }
        frame.phase = "commands";
        commandStart = true;
      } else if (frame.phase === "coproc-body") {
        if (token === Token.Newline)
          continue;
        frame.phase = token === Token.Word && value.keywordEligible && value.value === "time" ? "time-command" : "commands";
        commandStart = true;
        if (frame.phase === "time-command")
          continue;
      } else if (frame.phase === "time-command") {
        if (token === Token.Word && value.keywordEligible && value.value === "-p") {
          frame.phase = "time-command-after-p";
          continue;
        }
        if (token === Token.Word && value.keywordEligible && value.value === "--") {
          frame.phase = "commands";
          continue;
        }
        frame.phase = "commands";
        commandStart = true;
      } else if (frame.phase === "time-command-after-p") {
        if (token === Token.Word && value.keywordEligible && value.value === "--") {
          frame.phase = "commands";
          continue;
        }
        frame.phase = "commands";
        commandStart = true;
      } else if (frame.phase === "for-header") {
        if (token === Token.ArithCmd || token === Token.Semi || token === Token.Newline) {
          commandStart = true;
          continue;
        }
        if (token === Token.Do || token === Token.LBrace) {
          frame.close = token === Token.Do ? Token.Done : Token.RBrace;
          frame.phase = "commands";
          commandStart = true;
          continue;
        }
      } else if (frame.phase === "case-word") {
        if (token === Token.Newline)
          continue;
        frame.phase = "case-in";
        commandStart = false;
        continue;
      } else if (frame.phase === "case-in") {
        if (token === Token.Newline) {
          commandStart = true;
          continue;
        }
        frame.phase = "case-pattern";
        commandStart = true;
        continue;
      } else if (frame.phase === "case-pattern") {
        if (token === Token.Esac && commandStart) {
          frames.pop();
          if (frames.length === 0)
            return value.end;
          commandStart = false;
          continue;
        }
        if (token === Token.RParen) {
          frame.phase = "commands";
          commandStart = true;
        } else {
          commandStart = token === Token.Newline;
        }
        continue;
      }
      if (token === frame.close) {
        frames.pop();
        if (frames.length === 0)
          return value.end;
        commandStart = false;
        continue;
      }
      if (commandStart) {
        switch (token) {
          case Token.LParen:
            frames.push({ close: Token.RParen, phase: "commands" });
            break;
          case Token.LBrace:
            frames.push({ close: Token.RBrace, phase: "commands" });
            break;
          case Token.If:
            frames.push({ close: Token.Fi, phase: "commands" });
            break;
          case Token.For:
            frames.push({ close: Token.Done, phase: "for-header" });
            break;
          case Token.While:
          case Token.Until:
          case Token.Select:
            frames.push({ close: Token.Done, phase: "commands" });
            break;
          case Token.Case:
            frames.push({ close: Token.Esac, phase: "case-word" });
            break;
          case Token.DblLBracket:
            if (!this.skipTestCommandBody())
              return -1;
            commandStart = false;
            continue;
          case Token.Assignment:
          case Token.Redirect:
          case Token.Bang:
          case Token.Then:
          case Token.Else:
          case Token.Elif:
          case Token.Do:
          case Token.In:
            break;
          case Token.Semi:
          case Token.Newline:
          case Token.Pipe:
          case Token.And:
          case Token.Or:
          case Token.Amp:
          case Token.DoubleSemi:
          case Token.SemiAmp:
          case Token.DoubleSemiAmp:
            break;
          case Token.Function:
            frame.phase = "function-name";
            break;
          case Token.Coproc:
            frame.phase = "coproc-command";
            break;
          default:
            if (token === Token.Word && value.keywordEligible && value.value === "time") {
              frame.phase = "time-command";
              commandStart = true;
            } else {
              commandStart = false;
            }
            continue;
        }
      }
      switch (token) {
        case Token.Semi:
        case Token.Newline:
        case Token.Pipe:
        case Token.And:
        case Token.Or:
        case Token.Amp:
          commandStart = true;
          break;
        case Token.DoubleSemi:
        case Token.SemiAmp:
        case Token.DoubleSemiAmp:
          if (frame.close === Token.Esac)
            frame.phase = "case-pattern";
          commandStart = true;
          break;
        case Token.RParen:
          commandStart = true;
          break;
      }
    }
  }
  skipTestGroup() {
    let depth = 1;
    for (; ; ) {
      const value = this.next(LexContext.TestMode);
      if (value.token === Token.EOF)
        return -1;
      if (value.token === Token.DblRBracket) {
        this.unshift(value);
        return -1;
      }
      if (value.token === Token.LParen)
        depth++;
      else if (value.token === Token.RParen && --depth === 0)
        return value.end;
    }
  }
  skipTestCommandBody() {
    for (; ; ) {
      const token = this.next(LexContext.TestMode).token;
      if (token === Token.DblRBracket)
        return true;
      if (token === Token.EOF)
        return false;
    }
  }
  /** Set position and scan a word, building parts. Used by computeWordParts. */
  buildWordParts(startPos) {
    this._buildParts = true;
    this.pos = startPos;
    const ch = this.src.charCodeAt(startPos);
    if ((ch === 60 || ch === 62) && startPos + 1 < this.srcEnd && this.src.charCodeAt(startPos + 1) === 40) {
      this.pos = startPos + 2;
      const inner = this.extractBalanced();
      if (this._unbalanced)
        this.errors.push({ message: "unterminated process substitution", pos: startPos });
      const text = this.src.slice(startPos, this.pos);
      const part = {
        type: "ProcessSubstitution",
        text,
        operator: ch === 60 ? "<" : ">",
        script: void 0,
        inner: inner ?? void 0,
        innerStart: startPos + 2
      };
      this.collect(part);
      if (this.pos < this.srcEnd) {
        this.readWordText();
        if (this._wordParts) {
          this._wordParts.unshift(part);
        } else {
          this._wordParts = [part];
        }
      } else {
        this._wordParts = [part];
      }
    } else {
      this.readWordText();
    }
    return this._wordParts;
  }
  /** Scan a bounded word-like span without treating shell operators or whitespace as terminators. */
  buildEmbeddedWordParts(startPos) {
    this._buildParts = true;
    this.pos = startPos;
    this.readInnerWordText();
    return this._wordParts;
  }
  /** Scan a heredoc body for expansions, building parts. Spaces/newlines are literal. */
  buildHereDocParts(bodyPos, bodyEnd) {
    this._buildParts = true;
    const src = this.src;
    const parts = [];
    let litBuf = "";
    let litStart = bodyPos;
    let i = bodyPos;
    const flushLit = () => {
      if (litBuf) {
        parts.push({ type: "Literal", value: litBuf, text: src.slice(litStart, i) });
        litBuf = "";
      }
    };
    while (i < bodyEnd) {
      const ch = src.charCodeAt(i);
      if (ch === 92) {
        if (i + 1 < bodyEnd) {
          const nc = src.charCodeAt(i + 1);
          if (nc === 36 || nc === 96 || nc === 92) {
            litBuf += String.fromCharCode(nc);
            i += 2;
            continue;
          }
        }
        litBuf += "\\";
        i++;
        continue;
      }
      if (ch === 36) {
        flushLit();
        litStart = i;
        this.pos = i;
        this.readDollar();
        if (this._resultPart) {
          parts.push(this._resultPart);
          litStart = this.pos;
        } else {
          litBuf += src.slice(i, this.pos);
        }
        i = this.pos;
        continue;
      }
      if (ch === 96) {
        flushLit();
        litStart = i;
        this.pos = i;
        this.readBacktickExpansion();
        if (this._resultPart) {
          parts.push(this._resultPart);
          litStart = this.pos;
        } else {
          litBuf += src.slice(i, this.pos);
        }
        i = this.pos;
        continue;
      }
      litBuf += src[i];
      i++;
    }
    flushLit();
    return parts.length > 1 || parts.length === 1 && parts[0].type !== "Literal" ? parts : null;
  }
  registerHereDocTarget(target) {
    if (this.pendingHereDocs === null)
      return;
    for (const hd of this.pendingHereDocs) {
      if (!hd.target) {
        hd.target = target;
        return;
      }
    }
  }
  // Read the right-hand operand of =~ in [[ ]]. Bash ends the operand at
  // depth-zero whitespace, `)`, `;`, `&`, `<`, or `>` (but `<(`/`>(` open a
  // process substitution and `|` never delimits). An unquoted `(` opens a
  // group that consumes everything — `]]`, newlines, and metacharacters
  // included — until its matching `)`; inside a group only quotes stay opaque
  // and expansion parens count naively, matching bash. Quotes and expansions
  // at depth zero skip via the same readers normal words use, so their errors
  // and spans stay identical. The token is the raw source span; value and
  // parts resolve lazily like every other word.
  readTestRegexWord() {
    this.hasPeek = false;
    this.skipSpacesAndTabs();
    const src = this.src;
    const len = this.srcEnd;
    const start = this.pos;
    let depth = 0;
    while (this.pos < len) {
      const ch = src.charCodeAt(this.pos);
      if (ch === CH_LPAREN) {
        depth++;
        this.pos++;
        continue;
      }
      if (ch === CH_BACKSLASH) {
        this.pos += this.pos + 1 < len ? 2 : 1;
        continue;
      }
      if (ch === CH_SQUOTE) {
        const quotePos = this.pos++;
        const ansiC = quotePos > start && src.charCodeAt(quotePos - 1) === CH_DOLLAR;
        while (this.pos < len && src.charCodeAt(this.pos) !== CH_SQUOTE) {
          if (ansiC && src.charCodeAt(this.pos) === CH_BACKSLASH && this.pos + 1 < len)
            this.pos++;
          this.pos++;
        }
        if (this.pos < len)
          this.pos++;
        else
          this.errors.push({
            message: ansiC ? "unterminated ANSI-C quote" : "unterminated single quote",
            pos: quotePos
          });
        continue;
      }
      if (ch === CH_DQUOTE) {
        this.pos++;
        this.readDoubleQuoted();
        continue;
      }
      if (ch === CH_BACKTICK) {
        this.readBacktickExpansion();
        continue;
      }
      if (depth > 0) {
        if (ch === CH_RPAREN)
          depth--;
        this.pos++;
        continue;
      }
      if (ch === CH_DOLLAR) {
        this.readDollar();
        continue;
      }
      if ((ch === CH_LT || ch === CH_GT) && this.pos + 1 < len && src.charCodeAt(this.pos + 1) === CH_LPAREN) {
        const subPos = this.pos;
        this.pos += 2;
        this.extractBalanced();
        if (this._unbalanced)
          this.errors.push({ message: "unterminated process substitution", pos: subPos });
        continue;
      }
      if (ch < 128 && charType[ch] & 1 && ch !== CH_PIPE)
        break;
      this.pos++;
    }
    setToken(this.current, Token.Word, src.slice(start, this.pos), start, this.pos);
    return this.current;
  }
  // Read C-style for expressions: called after first '(' consumed by parser.
  // Expects pos at second '('. Returns [init, test, update] raw text.
  readCStyleForExprs() {
    this.hasPeek = false;
    const src = this.src;
    const len = this.srcEnd;
    while (this.pos < len && (src.charCodeAt(this.pos) === CH_SPACE || src.charCodeAt(this.pos) === CH_TAB))
      this.pos++;
    if (this.pos < len && src.charCodeAt(this.pos) === CH_LPAREN)
      this.pos++;
    const starts = [this.pos, 0, 0];
    const parts = ["", "", "", 0, 0, 0];
    let partIdx = 0;
    let depth = 1;
    let partStart = this.pos;
    while (this.pos < len && depth > 0) {
      const c2 = src.charCodeAt(this.pos);
      if (c2 === CH_LPAREN) {
        depth++;
        this.pos++;
      } else if (c2 === CH_RPAREN) {
        depth--;
        if (depth === 0) {
          const raw = src.slice(partStart, this.pos);
          parts[partIdx] = raw.trim();
          parts[3 + partIdx] = starts[partIdx] + raw.length - raw.trimStart().length;
          this.pos++;
          while (this.pos < len && (src.charCodeAt(this.pos) === CH_SPACE || src.charCodeAt(this.pos) === CH_TAB))
            this.pos++;
          if (this.pos < len && src.charCodeAt(this.pos) === CH_RPAREN)
            this.pos++;
          break;
        }
        this.pos++;
      } else if (c2 === CH_SEMI && depth === 1) {
        const raw = src.slice(partStart, this.pos);
        parts[partIdx] = raw.trim();
        parts[3 + partIdx] = starts[partIdx] + raw.length - raw.trimStart().length;
        if (partIdx < 2)
          partIdx++;
        this.pos++;
        partStart = this.pos;
        starts[partIdx] = partStart;
      } else if (c2 === CH_SQUOTE) {
        this.pos++;
        this.skipSQ();
      } else if (c2 === CH_DQUOTE) {
        this.pos++;
        this.skipDQ();
      } else {
        this.pos++;
      }
    }
    return parts;
  }
  peek(ctx = LexContext.Normal) {
    if (!this.hasPeek) {
      this.readNext(this.nextState, ctx);
      this.hasPeek = true;
    }
    return this.nextState;
  }
  // Peek where the context depends on the token just consumed. peek() ignores its ctx once a
  // token is cached, so the caller's context must only be derived when a read actually happens.
  peekFollow(closers) {
    if (!this.hasPeek) {
      const ctx = closers[this.current.token] ? LexContext.CommandStart : LexContext.Normal;
      this.readNext(this.nextState, ctx);
      this.hasPeek = true;
    }
    return this.nextState;
  }
  next(ctx = LexContext.Normal) {
    if (this.hasPeek) {
      this.hasPeek = false;
      const temp = this.current;
      this.current = this.nextState;
      this.nextState = temp;
      return this.current;
    }
    this.readNext(this.current, ctx);
    return this.current;
  }
  unshift(tok) {
    this.nextState.copyFrom(tok);
    this.hasPeek = true;
  }
  readNext(out, ctx) {
    const src = this.src;
    const len = this.srcEnd;
    let pos = this.pos;
    while (pos < len) {
      const ch2 = src.charCodeAt(pos);
      if (ch2 === CH_SPACE || ch2 === CH_TAB) {
        pos++;
        continue;
      }
      if (ch2 === CH_BACKSLASH && pos + 1 < len && src.charCodeAt(pos + 1) === CH_NL) {
        pos += 2;
        continue;
      }
      if (ch2 === CH_NL && ctx === LexContext.TestMode) {
        pos++;
        continue;
      }
      break;
    }
    this.pos = pos;
    if (pos >= len) {
      this.consumePendingHereDocs();
      setToken(out, Token.EOF, "", pos, pos);
      return;
    }
    const tokenStart = pos;
    const ch = src.charCodeAt(pos);
    if (ch === CH_HASH) {
      while (this.pos < len && src.charCodeAt(this.pos) !== CH_NL)
        this.pos++;
      this.readNext(out, ctx);
      return;
    }
    if (ch === CH_NL) {
      this.pos++;
      this.consumePendingHereDocs();
      setToken(out, Token.Newline, "\n", tokenStart, this.pos);
      return;
    }
    if (ctx === LexContext.TestMode && (ch === CH_LT || ch === CH_GT) && !(this.pos + 1 < this.srcEnd && src.charCodeAt(this.pos + 1) === CH_LPAREN)) {
      this.pos++;
      setToken(out, Token.Word, ch === CH_LT ? "<" : ">", tokenStart, this.pos);
      out.keywordEligible = true;
      return;
    }
    if (ch < 128 && charType[ch] & 1 && this.tryReadOperator(out, ch, ctx, tokenStart))
      return;
    this.readWord(out, ctx, tokenStart);
  }
  tryReadOperator(out, ch, ctx, tokenStart) {
    const src = this.src;
    const pos = this.pos;
    const next = pos + 1 < this.srcEnd ? src.charCodeAt(pos + 1) : 0;
    switch (ch) {
      case CH_SEMI:
        if (next === CH_SEMI) {
          if (pos + 2 < this.srcEnd && src.charCodeAt(pos + 2) === CH_AMP) {
            this.pos += 3;
            setToken(out, Token.DoubleSemiAmp, ";;&", tokenStart, this.pos);
            return true;
          }
          this.pos += 2;
          setToken(out, Token.DoubleSemi, ";;", tokenStart, this.pos);
          return true;
        }
        if (next === CH_AMP) {
          this.pos += 2;
          setToken(out, Token.SemiAmp, ";&", tokenStart, this.pos);
          return true;
        }
        this.pos++;
        setToken(out, Token.Semi, ";", tokenStart, this.pos);
        return true;
      case CH_PIPE:
        if (next === CH_PIPE) {
          this.pos += 2;
          setToken(out, Token.Or, "||", tokenStart, this.pos);
          return true;
        }
        if (next === CH_AMP) {
          this.pos += 2;
          setToken(out, Token.Pipe, "|&", tokenStart, this.pos);
          return true;
        }
        this.pos++;
        setToken(out, Token.Pipe, "|", tokenStart, this.pos);
        return true;
      case CH_AMP:
        if (next === CH_AMP) {
          this.pos += 2;
          setToken(out, Token.And, "&&", tokenStart, this.pos);
          return true;
        }
        if (next === CH_GT) {
          this.pos += 2;
          const append = this.pos < this.srcEnd && src.charCodeAt(this.pos) === CH_GT;
          if (append)
            this.pos++;
          this.skipSpacesAndTabs();
          const targetPos = this.pos;
          if (this.pos < this.srcEnd && src.charCodeAt(this.pos) !== CH_NL && src.charCodeAt(this.pos) !== CH_HASH) {
            this.readRedirectTargetText();
          }
          this.redirectToken(out, append ? "&>>" : "&>", tokenStart, targetPos);
          return true;
        }
        this.pos++;
        setToken(out, Token.Amp, "&", tokenStart, this.pos);
        return true;
      case CH_LPAREN:
        if (ctx === LexContext.CommandStart && next === CH_LPAREN) {
          const savedErrors = this.errors.length;
          this.readArithmeticCommand(out, tokenStart);
          if (!this._notArithmetic)
            return true;
          this.errors.length = savedErrors;
          this.pos = tokenStart;
        }
        this.pos++;
        setToken(out, Token.LParen, "(", tokenStart, this.pos);
        return true;
      case CH_RPAREN:
        this.pos++;
        setToken(out, Token.RParen, ")", tokenStart, this.pos);
        return true;
      case CH_LT:
      case CH_GT:
        return this.readRedirection(out, tokenStart);
      default:
        return false;
    }
  }
  readRedirection(out, tokenStart) {
    const src = this.src;
    const ch = src.charCodeAt(this.pos);
    let op = "";
    if (ch === CH_LT) {
      this.pos++;
      const next = this.pos < this.srcEnd ? src.charCodeAt(this.pos) : 0;
      if (next === CH_LT) {
        this.pos++;
        const third = this.pos < this.srcEnd ? src.charCodeAt(this.pos) : 0;
        if (third === CH_LT) {
          this.pos++;
          this.skipSpacesAndTabs();
          const targetPos2 = this.pos;
          if (this.pos < this.srcEnd && src.charCodeAt(this.pos) !== CH_NL && src.charCodeAt(this.pos) !== CH_HASH) {
            this.readRedirectTargetText();
          }
          this.redirectToken(out, "<<<", tokenStart, targetPos2);
          return true;
        }
        const dash = third === CH_DASH;
        if (dash)
          this.pos++;
        this.skipSpacesAndTabs();
        const targetPos = this.pos;
        if (this.pos >= this.srcEnd || src.charCodeAt(this.pos) !== CH_HASH)
          this.readHereDocDelimiter();
        const hasTarget = this.pos > targetPos;
        if (hasTarget) {
          (this.pendingHereDocs ??= []).push({ delimiter: this._hereDelim, strip: dash, quoted: this._hereQuoted });
        }
        setToken(out, Token.Redirect, dash ? "<<-" : "<<", tokenStart, this.pos);
        out.content = hasTarget ? this._hereDelim : void 0;
        out.targetPos = targetPos;
        out.targetEnd = hasTarget ? this.pos : targetPos;
        return true;
      }
      if (next === CH_LPAREN) {
        this.readProcessSubstitution(out, "<", tokenStart);
        return true;
      }
      if (next === CH_GT) {
        op = "<>";
        this.pos++;
      } else if (next === CH_AMP) {
        op = "<&";
        this.pos++;
      } else {
        op = "<";
      }
    } else if (ch === CH_GT) {
      this.pos++;
      const next = this.pos < this.srcEnd ? src.charCodeAt(this.pos) : 0;
      if (next === CH_LPAREN) {
        this.readProcessSubstitution(out, ">", tokenStart);
        return true;
      }
      if (next === CH_GT) {
        op = ">>";
        this.pos++;
      } else if (next === CH_AMP) {
        op = ">&";
        this.pos++;
      } else if (next === CH_PIPE) {
        op = ">|";
        this.pos++;
      } else {
        op = ">";
      }
    }
    this.skipSpacesAndTabs();
    if (this.pos < this.srcEnd) {
      const nc = src.charCodeAt(this.pos);
      if ((nc === CH_LT || nc === CH_GT) && this.pos + 1 < this.srcEnd && src.charCodeAt(this.pos + 1) === CH_LPAREN) {
        const psStart = this.pos;
        this.pos += 2;
        this.extractBalanced();
        if (this._unbalanced)
          this.errors.push({ message: "unterminated process substitution", pos: psStart });
        const psText = src.slice(psStart, this.pos);
        setToken(out, Token.Redirect, op, tokenStart, this.pos);
        out.content = psText;
        out.targetPos = psStart;
        out.targetEnd = this.pos;
        return true;
      }
      const targetPos = this.pos;
      if (nc !== CH_NL && nc !== CH_HASH)
        this.readRedirectTargetText();
      this.redirectToken(out, op, tokenStart, targetPos);
      return true;
    }
    this.redirectToken(out, op, tokenStart, this.pos);
    return true;
  }
  // Redirect targets keep their processed text eagerly (it becomes the target
  // word's content), so scan them in value mode.
  readRedirectTargetText() {
    const savedBuildValue = this._buildValue;
    this._buildValue = true;
    this.readWordText();
    this._buildValue = savedBuildValue;
  }
  redirectToken(out, operator, tokenStart, targetPos) {
    const hasTarget = this.pos > targetPos && (this._wordText.length > 0 || this._wordQuoted);
    setToken(out, Token.Redirect, operator, tokenStart, this.pos);
    out.content = hasTarget ? this._wordText : void 0;
    out.targetPos = targetPos;
    out.targetEnd = hasTarget ? this.pos : targetPos;
  }
  readProcessSubstitution(out, operator, tokenStart) {
    this.pos++;
    this.extractBalanced();
    if (this._unbalanced)
      this.errors.push({ message: "unterminated process substitution", pos: tokenStart });
    const text = this.src.slice(tokenStart, this.pos);
    setToken(out, Token.Word, text, tokenStart, this.pos);
  }
  // The delimiter is the word after quote removal: quote and escape segments may
  // appear anywhere in the word, any of them makes the heredoc quoted, and inside
  // double quotes a backslash is removed only before $ ` " \.
  readHereDocDelimiter() {
    const src = this.src;
    const len = this.srcEnd;
    const savedBuildValue = this._buildValue;
    this._buildValue = true;
    let delimiter = "";
    let quoted = false;
    while (this.pos < len) {
      const c2 = src.charCodeAt(this.pos);
      if (c2 === CH_SQUOTE) {
        quoted = true;
        this.pos++;
        while (this.pos < len && src.charCodeAt(this.pos) !== CH_SQUOTE) {
          delimiter += src[this.pos];
          this.pos++;
        }
        if (this.pos < len)
          this.pos++;
      } else if (c2 === CH_DQUOTE) {
        quoted = true;
        this.pos++;
        while (this.pos < len && src.charCodeAt(this.pos) !== CH_DQUOTE) {
          if (src.charCodeAt(this.pos) === CH_BACKSLASH && this.pos + 1 < len) {
            const next = src.charCodeAt(this.pos + 1);
            if (next === CH_NL) {
              this.pos += 2;
              continue;
            }
            if (next === CH_DOLLAR || next === CH_BACKTICK || next === CH_DQUOTE || next === CH_BACKSLASH)
              this.pos++;
          }
          delimiter += src[this.pos];
          this.pos++;
        }
        if (this.pos < len)
          this.pos++;
      } else if (c2 === CH_BACKSLASH) {
        if (this.pos + 1 < len && src.charCodeAt(this.pos + 1) === CH_NL) {
          this.pos += 2;
          continue;
        }
        quoted = true;
        this.pos++;
        if (this.pos < len) {
          delimiter += src[this.pos];
          this.pos++;
        } else {
          delimiter += "\\";
        }
      } else if (c2 === CH_BACKTICK) {
        const btStart = this.pos;
        this.pos++;
        while (this.pos < len && src.charCodeAt(this.pos) !== CH_BACKTICK) {
          if (src.charCodeAt(this.pos) === CH_BACKSLASH)
            this.pos++;
          this.pos++;
        }
        if (this.pos < len)
          this.pos++;
        delimiter += src.slice(btStart, this.pos);
      } else if (c2 === CH_DOLLAR) {
        const next = this.pos + 1 < len ? src.charCodeAt(this.pos + 1) : 0;
        if (next === CH_SQUOTE || next === CH_DQUOTE)
          quoted = true;
        this.readDollar();
        delimiter += this._resultText;
      } else if (c2 < 128 && charType[c2] & 1) {
        break;
      } else {
        delimiter += src[this.pos];
        this.pos++;
      }
    }
    this._buildValue = savedBuildValue;
    this._hereDelim = delimiter;
    this._hereQuoted = quoted;
  }
  consumePendingHereDocs() {
    const pending = this.pendingHereDocs;
    if (pending === null || pending.length === 0)
      return;
    for (const hd of pending) {
      const bodyPos = this.pos;
      const body = this.readHereDocBody(hd.delimiter, hd.strip);
      if (hd.target) {
        hd.target.content = body;
        if (hd.quoted) {
          hd.target.heredocQuoted = true;
        } else if (body) {
          const parsed = this.parseHereDocBody(body, bodyPos);
          if (parsed)
            hd.target.body = parsed;
        }
      }
    }
    pending.length = 0;
  }
  readHereDocBody(delimiter, strip) {
    const bodyStart = this.pos;
    const bodyEnd = this.skipHereDocBody(delimiter, strip);
    return this.src.slice(bodyStart, bodyEnd);
  }
  // Advance past the heredoc body and its delimiter line; return the body end
  // (start of the delimiter line, or srcEnd when delimited by end-of-input).
  // With parenEnds (inside $(...)), a line starting with the delimiter directly
  // followed by ")" also terminates the body, resuming at the ")" — bash treats
  // the substitution's closing paren as end-of-file for its heredocs.
  // `join` crosses `\`+newline pairs, which an unquoted delimiter may straddle.
  matchHereDocDelimiter(delimiter, lineStart, end, join) {
    const src = this.src;
    let pos = lineStart;
    for (let i = 0; i < delimiter.length; ) {
      if (join && src.charCodeAt(pos) === CH_BACKSLASH && pos + 1 < end && src.charCodeAt(pos + 1) === CH_NL) {
        pos += 2;
        continue;
      }
      if (pos >= end || src.charCodeAt(pos) !== delimiter.charCodeAt(i))
        return -1;
      pos++;
      i++;
    }
    return pos;
  }
  // A `\` consumes the next character, so `\`+newline continues the line and `\\` does not.
  logicalLineEnd(from, end, join) {
    const src = this.src;
    let pos = from;
    while (pos < end) {
      const c2 = src.charCodeAt(pos);
      if (c2 === CH_NL)
        return pos;
      pos += join && c2 === CH_BACKSLASH ? 2 : 1;
    }
    return end;
  }
  skipHereDocBody(delimiter, strip, parenEnds = false, quoted = false) {
    const src = this.src;
    const len = this.srcEnd;
    const dLen = delimiter.length;
    while (this.pos < len) {
      let lineStart = this.pos;
      let lineEnd = src.indexOf("\n", this.pos);
      if (lineEnd === -1 || lineEnd > len)
        lineEnd = len;
      if (strip) {
        while (lineStart < lineEnd && src.charCodeAt(lineStart) === CH_TAB)
          lineStart++;
      }
      if (lineEnd - lineStart === dLen && src.startsWith(delimiter, lineStart)) {
        const bodyEnd = this.pos;
        this.pos = lineEnd < len ? lineEnd + 1 : lineEnd;
        return bodyEnd;
      }
      if (parenEnds) {
        const afterDelim = this.matchHereDocDelimiter(delimiter, lineStart, len, !quoted);
        if (afterDelim !== -1) {
          const paren = src.indexOf(")", afterDelim);
          if (paren !== -1 && paren < this.logicalLineEnd(lineStart, len, !quoted)) {
            const bodyEnd = this.pos;
            this.pos = afterDelim;
            return bodyEnd;
          }
        }
      }
      this.pos = lineEnd < len ? lineEnd + 1 : lineEnd;
    }
    return this.pos;
  }
  // Scan an unquoted heredoc body for expansions ($var, ${...}, $(...), `...`).
  // Returns a Word (without parts — use computeWordParts for those) if expansions exist.
  parseHereDocBody(body, bodyPos) {
    let hasExpansion = false;
    for (let i = 0; i < body.length; i++) {
      const c2 = body.charCodeAt(i);
      if (c2 === CH_BACKTICK) {
        hasExpansion = true;
        break;
      }
      if (c2 === CH_DOLLAR) {
        const next = i + 1 < body.length ? body.charCodeAt(i + 1) : 0;
        if (next === CH_LBRACE || next === CH_LPAREN || next === CH_DOLLAR || next >= CH_a && next <= CH_z || next >= CH_A && next <= CH_Z || next === CH_UNDERSCORE || next === CH_BANG || next === CH_HASH || next === CH_AT || next === CH_STAR || next === CH_QUESTION || next === CH_DASH || next >= CH_0 && next <= CH_9) {
          hasExpansion = true;
          break;
        }
      }
      if (c2 === CH_BACKSLASH)
        i++;
    }
    if (!hasExpansion)
      return null;
    return new WordImpl(body, bodyPos, bodyPos + body.length, this.src, WordImpl._resolveHeredocBody, this._nestingDepth);
  }
  _wordText = "";
  _wordRaw = false;
  _wordQuoted = false;
  _wordHasExpansions = false;
  _wordKeywordEligible = false;
  _wordIsAssignment;
  _wordAssignmentOperatorPos;
  _wordParts = null;
  _resultText = "";
  // True when the last $-construct's value is exactly its raw source span.
  _resultIsRaw = true;
  _resultHasExpansion = false;
  _resultPart;
  // Set by extractBalanced when the input ended before the closing paren, so
  // callers can report the construct they were scanning.
  _unbalanced = false;
  // Set by scanArithmeticBody when the construct turns out not to be arithmetic, so the
  // caller can re-read it as a subshell or command substitution instead.
  _notArithmetic = false;
  _dqText = "";
  _dqHasExpansions = false;
  _dqParts = null;
  // Content end (before the closing quote, or end of input when unterminated).
  _dqEnd = 0;
  _hereDelim = "";
  _hereQuoted = false;
  readWord(out, ctx, tokenStart = 0) {
    this.readWordText();
    this.classifyWord(out, ctx, tokenStart);
  }
  classifyWord(out, ctx, tokenStart) {
    const src = this.src;
    const raw = this._wordRaw;
    const hasExpansions = this._wordHasExpansions;
    const quoted = this._wordQuoted;
    const keywordEligible = this._wordKeywordEligible;
    const isAssignment = this._wordIsAssignment;
    let assignmentOpPos = this._wordAssignmentOperatorPos;
    const wordEnd = this.pos;
    const wordLen = wordEnd - tokenStart;
    let value = null;
    if (!raw && !hasExpansions) {
      const nextCh = wordEnd < this.srcEnd ? src.charCodeAt(wordEnd) : 0;
      if (!quoted && wordLen <= 16 || nextCh === CH_LT || nextCh === CH_GT) {
        value = this.wordValueOf(tokenStart, wordEnd);
      }
    }
    if (ctx === LexContext.CommandStart && keywordEligible) {
      if (raw) {
        if (wordLen <= 8) {
          const reserved = matchReservedWord(src, tokenStart, wordLen);
          if (reserved !== void 0) {
            setSpanToken(out, reserved, tokenStart, wordEnd, true);
            return;
          }
        }
        if (wordLen === 2 && src.charCodeAt(tokenStart) === CH_LBRACKET && src.charCodeAt(tokenStart + 1) === CH_LBRACKET) {
          setSpanToken(out, Token.DblLBracket, tokenStart, wordEnd, true);
          return;
        }
      } else if (value !== null && value.length > 0) {
        const fc = value.charCodeAt(0);
        if (fc >= CH_a && fc <= CH_z && value.length <= 8 || fc === CH_BANG || fc === CH_LBRACE || fc === CH_RBRACE) {
          const reserved = RESERVED_WORDS.get(value);
          if (reserved !== void 0) {
            setToken(out, reserved, value, tokenStart, wordEnd);
            return;
          }
        }
        if (fc === CH_LBRACKET && value === "[[") {
          setToken(out, Token.DblLBracket, value, tokenStart, wordEnd);
          return;
        }
      }
    }
    if (ctx === LexContext.CommandStart || ctx === LexContext.CommandPrefix) {
      if (isAssignment === void 0) {
        let eq = -1;
        let bracket = false;
        for (let i = tokenStart + 1; i < wordEnd; i++) {
          const c2 = src.charCodeAt(i);
          if (c2 === CH_EQ) {
            eq = i;
            break;
          }
          if (c2 === CH_LBRACKET)
            bracket = true;
        }
        if (eq !== -1) {
          const state = scanAssignmentPrefix(src, tokenStart, wordEnd, ASSIGNMENT_NAME_START);
          if (isMatchedAssignment(state))
            assignmentOpPos = assignmentOperatorPos(state);
        } else if (bracket && wordEnd < this.srcEnd && scanAssignmentPrefix(src, tokenStart, wordEnd, ASSIGNMENT_NAME_START) >= ASSIGNMENT_INDEX_BASE) {
          this.pos = tokenStart;
          this.readWordText(true);
          this.classifyWord(out, ctx, tokenStart);
          return;
        }
      }
      if (assignmentOpPos !== void 0) {
        setSpanToken(out, Token.Assignment, tokenStart, wordEnd, raw);
        if (value !== null)
          out._value = value;
        out.assignmentOperatorPos = assignmentOpPos;
        return;
      }
    }
    if ((ctx === LexContext.CommandStart || ctx === LexContext.TestMode) && keywordEligible) {
      if (raw) {
        if (wordLen === 2 && src.charCodeAt(tokenStart) === CH_RBRACKET && src.charCodeAt(tokenStart + 1) === CH_RBRACKET) {
          setSpanToken(out, Token.DblRBracket, tokenStart, wordEnd, true);
          return;
        }
      } else if (value === "]]") {
        setToken(out, Token.DblRBracket, value, tokenStart, wordEnd);
        return;
      }
    }
    if (!hasExpansions && this.pos < this.srcEnd) {
      const nc = src.charCodeAt(this.pos);
      if (nc === CH_LT || nc === CH_GT) {
        if (raw) {
          const fc = src.charCodeAt(tokenStart);
          if (fc >= CH_0 && fc <= CH_9 && isAllDigitsRange(src, tokenStart, wordEnd)) {
            const fd = Number.parseInt(src.slice(tokenStart, wordEnd), 10);
            if (this.readRedirection(out, tokenStart)) {
              out.fileDescriptor = fd;
              return;
            }
          }
          if (fc === CH_LBRACE && wordLen > 2 && src.charCodeAt(wordEnd - 1) === CH_RBRACE) {
            const varname = src.slice(tokenStart + 1, wordEnd - 1);
            if (this.readRedirection(out, tokenStart)) {
              out.variableName = varname;
              return;
            }
          }
        } else if (value !== null && value.length > 0) {
          if (value.charCodeAt(0) >= CH_0 && value.charCodeAt(0) <= CH_9 && isAllDigits(value)) {
            const fd = Number.parseInt(value, 10);
            if (this.readRedirection(out, tokenStart)) {
              out.fileDescriptor = fd;
              return;
            }
          }
          if (value.charCodeAt(0) === CH_LBRACE && value.charCodeAt(value.length - 1) === CH_RBRACE && value.length > 2) {
            const varname = value.slice(1, -1);
            if (this.readRedirection(out, tokenStart)) {
              out.variableName = varname;
              return;
            }
          }
        }
      }
    }
    setSpanToken(out, Token.Word, tokenStart, wordEnd, raw);
    if (value !== null)
      out._value = value;
    out.keywordEligible = keywordEligible;
  }
  // `subscripts` re-reads a word known to stop inside an array subscript, where
  // metacharacters are ordinary text.
  readWordText(subscripts = false) {
    const src = this.src;
    const len = this.srcEnd;
    let pos = this.pos;
    const fastStart = pos;
    let exitCh = 0;
    while (pos < len) {
      const c2 = src.charCodeAt(pos);
      if (c2 < 128 && charType[c2]) {
        exitCh = c2;
        break;
      }
      pos++;
    }
    if (pos >= len || charType[exitCh] & 1 && !(exitCh === CH_LPAREN && pos > fastStart && extglobPrefix[src.charCodeAt(pos - 1)]) && !subscripts) {
      this.pos = pos;
      this._wordText = (this._buildParts || this._buildValue) && pos > fastStart ? src.slice(fastStart, pos) : "";
      this._wordRaw = true;
      this._wordQuoted = false;
      this._wordHasExpansions = false;
      this._wordKeywordEligible = true;
      this._wordIsAssignment = void 0;
      this._wordAssignmentOperatorPos = void 0;
      if (this._buildParts)
        this._wordParts = null;
      return;
    }
    const bp = this._buildParts;
    const bt = bp || this._buildValue;
    let text = bt && pos > fastStart ? src.slice(fastStart, pos) : "";
    let quoted = false;
    let hasExpansions = false;
    let keywordEligible = true;
    let valueIsRaw = true;
    let lastValueChar = pos > fastStart ? src.charCodeAt(pos - 1) : 0;
    let assignmentState = scanAssignmentPrefix(src, fastStart, pos, ASSIGNMENT_NAME_START);
    let parts;
    let litBuf = "";
    let litStart = 0;
    if (bp) {
      parts = [];
      litBuf = text;
      litStart = fastStart;
    }
    while (pos < len) {
      const ch = src.charCodeAt(pos);
      if (ch >= 128 || !charType[ch]) {
        const runStart = pos;
        pos++;
        while (pos < len) {
          const c2 = src.charCodeAt(pos);
          if (c2 < 128 && charType[c2])
            break;
          pos++;
        }
        lastValueChar = src.charCodeAt(pos - 1);
        assignmentState = scanAssignmentPrefix(src, runStart, pos, assignmentState);
        if (bt) {
          const chunk = src.slice(runStart, pos);
          text += chunk;
          if (bp)
            litBuf += chunk;
        }
        continue;
      }
      if (charType[ch] & 1) {
        if (ch === CH_LPAREN && lastValueChar < 128 && extglobPrefix[lastValueChar]) {
          keywordEligible = false;
          const prefixChar = lastValueChar;
          pos++;
          const innerStart = pos;
          const close = this.findClosingShellDelimiter(innerStart, len, CH_RPAREN, prefixChar === CH_EQ);
          const patternEnd = close === -1 ? len : close;
          pos = close === -1 ? len : close + 1;
          if (close === -1)
            this.errors.push({ message: "unterminated extended glob", pos: innerStart - 2 });
          lastValueChar = src.charCodeAt(pos - 1);
          if (bt) {
            const eg = "(" + src.slice(innerStart, pos);
            text += eg;
            if (bp && prefixChar !== CH_EQ) {
              if (litBuf.length > 0) {
                const trimmed = litBuf.slice(0, -1);
                if (trimmed)
                  parts.push({ type: "Literal", value: trimmed, text: src.slice(litStart, innerStart - 2) });
                litBuf = "";
              }
              const op = extglobOp[prefixChar];
              parts.push({
                type: "ExtendedGlob",
                text: op + eg,
                operator: op,
                pattern: src.slice(innerStart, patternEnd),
                parts: hasEmbeddedWordStructure(src, innerStart, patternEnd) ? this.parseSubFieldWord(innerStart, patternEnd).parts : void 0
              });
              litStart = pos;
            } else if (bp) {
              litBuf += eg;
            }
          }
          continue;
        }
        if (subscripts && assignmentState >= ASSIGNMENT_INDEX_BASE) {
          const close = this.findClosingBracket(pos);
          if (close !== -1) {
            const spanEnd = close + 1;
            assignmentState = scanAssignmentPrefix(src, pos, spanEnd, assignmentState);
            lastValueChar = src.charCodeAt(close);
            if (bt) {
              const chunk = src.slice(pos, spanEnd);
              text += chunk;
              if (bp)
                litBuf += chunk;
            }
            pos = spanEnd;
            continue;
          }
        }
        break;
      }
      if (ch === CH_BACKSLASH) {
        pos++;
        if (pos < len) {
          if (src.charCodeAt(pos) === CH_NL) {
            pos++;
            valueIsRaw = false;
          } else {
            if (assignmentState >= 0 && assignmentState < ASSIGNMENT_INDEX_BASE)
              assignmentState = ASSIGNMENT_INVALID;
            quoted = true;
            keywordEligible = false;
            valueIsRaw = false;
            lastValueChar = src.charCodeAt(pos);
            if (bt) {
              text += src[pos];
              if (bp)
                litBuf += src[pos];
            }
            pos++;
          }
        } else {
          if (assignmentState >= 0 && assignmentState < ASSIGNMENT_INDEX_BASE)
            assignmentState = ASSIGNMENT_INVALID;
          quoted = true;
          keywordEligible = false;
          lastValueChar = CH_BACKSLASH;
          if (bt) {
            text += "\\";
            if (bp)
              litBuf += "\\";
          }
        }
        continue;
      }
      if (ch === CH_SQUOTE) {
        const sqStart = pos;
        if (assignmentState >= 0 && assignmentState < ASSIGNMENT_INDEX_BASE)
          assignmentState = ASSIGNMENT_INVALID;
        quoted = true;
        keywordEligible = false;
        valueIsRaw = false;
        pos++;
        const start = pos;
        while (pos < len && src.charCodeAt(pos) !== CH_SQUOTE)
          pos++;
        if (pos > start)
          lastValueChar = src.charCodeAt(pos - 1);
        const value = bt ? src.slice(start, pos) : "";
        if (bt)
          text += value;
        if (pos < len)
          pos++;
        else
          this.errors.push({ message: "unterminated single quote", pos: start - 1 });
        if (bp) {
          if (litBuf) {
            parts.push({ type: "Literal", value: litBuf, text: src.slice(litStart, sqStart) });
            litBuf = "";
          }
          parts.push({ type: "SingleQuoted", value, text: src.slice(sqStart, pos) });
          litStart = pos;
        }
        continue;
      }
      if (ch === CH_DQUOTE) {
        const dqStart = pos;
        if (assignmentState >= 0 && assignmentState < ASSIGNMENT_INDEX_BASE)
          assignmentState = ASSIGNMENT_INVALID;
        quoted = true;
        keywordEligible = false;
        valueIsRaw = false;
        pos++;
        this.pos = pos;
        this.readDoubleQuoted();
        pos = this.pos;
        if (this._dqEnd > dqStart + 1)
          lastValueChar = src.charCodeAt(this._dqEnd - 1);
        if (this._dqHasExpansions)
          hasExpansions = true;
        if (bt)
          text += this._dqText;
        if (bp) {
          if (litBuf) {
            parts.push({ type: "Literal", value: litBuf, text: src.slice(litStart, dqStart) });
            litBuf = "";
          }
          const dqText = src.slice(dqStart, pos);
          parts.push({
            type: "DoubleQuoted",
            text: dqText,
            parts: this._dqParts ?? [
              { type: "Literal", value: this._dqText, text: src.slice(dqStart + 1, this._dqEnd) }
            ]
          });
          litStart = pos;
        }
        continue;
      }
      if (ch === CH_DOLLAR) {
        keywordEligible = false;
        const dollarStart = pos;
        if (assignmentState >= 0 && assignmentState < ASSIGNMENT_INDEX_BASE)
          assignmentState = ASSIGNMENT_INVALID;
        this.pos = pos;
        this.readDollar();
        pos = this.pos;
        if (!this._resultIsRaw)
          valueIsRaw = false;
        if (pos > dollarStart)
          lastValueChar = src.charCodeAt(pos - 1);
        if (this._resultHasExpansion)
          hasExpansions = true;
        if (bt)
          text += this._resultText;
        if (bp) {
          if (this._resultPart) {
            if (litBuf) {
              parts.push({ type: "Literal", value: litBuf, text: src.slice(litStart, dollarStart) });
              litBuf = "";
            }
            parts.push(this._resultPart);
            litStart = pos;
          } else {
            litBuf += this._resultText;
          }
        }
        continue;
      }
      if (ch === CH_BACKTICK) {
        keywordEligible = false;
        const btStart = pos;
        if (assignmentState >= 0 && assignmentState < ASSIGNMENT_INDEX_BASE)
          assignmentState = ASSIGNMENT_INVALID;
        this.pos = pos;
        this.readBacktickExpansion();
        pos = this.pos;
        valueIsRaw = false;
        lastValueChar = src.charCodeAt(pos - 1);
        hasExpansions = true;
        if (bt)
          text += this._resultText;
        if (bp) {
          if (litBuf) {
            parts.push({ type: "Literal", value: litBuf, text: src.slice(litStart, btStart) });
            litBuf = "";
          }
          parts.push(this._resultPart);
          litStart = pos;
        }
        continue;
      }
      if (ch === CH_LBRACE) {
        if (assignmentState >= 0 && assignmentState < ASSIGNMENT_INDEX_BASE)
          assignmentState = ASSIGNMENT_INVALID;
        const braceEnd = scanBraceExpansion(src, pos, len);
        if (braceEnd > 0) {
          keywordEligible = false;
          lastValueChar = src.charCodeAt(braceEnd - 1);
          if (bt) {
            const braceText = src.slice(pos, braceEnd);
            text += braceText;
            if (bp) {
              if (litBuf) {
                parts.push({ type: "Literal", value: litBuf, text: src.slice(litStart, pos) });
                litBuf = "";
              }
              parts.push({
                type: "BraceExpansion",
                text: braceText,
                parts: hasEmbeddedWordStructure(src, pos + 1, braceEnd - 1) ? this.parseSubFieldWord(pos + 1, braceEnd - 1).parts : void 0
              });
              litStart = braceEnd;
            }
          }
          pos = braceEnd;
          continue;
        }
        lastValueChar = CH_LBRACE;
        if (bt) {
          text += "{";
          if (bp)
            litBuf += "{";
        }
        pos++;
        continue;
      }
      pos++;
    }
    if (bp && litBuf)
      parts.push({ type: "Literal", value: litBuf, text: src.slice(litStart, pos) });
    this.pos = pos;
    this._wordText = text;
    this._wordRaw = valueIsRaw;
    this._wordQuoted = quoted;
    this._wordHasExpansions = hasExpansions;
    this._wordKeywordEligible = keywordEligible;
    this._wordIsAssignment = isMatchedAssignment(assignmentState);
    this._wordAssignmentOperatorPos = this._wordIsAssignment ? assignmentOperatorPos(assignmentState) : void 0;
    if (bp) {
      this._wordParts = parts.length > 1 || parts.length === 1 && parts[0].type !== "Literal" ? parts : null;
    }
  }
  readInnerWordText() {
    const src = this.src;
    const len = this.srcEnd;
    let pos = this.pos;
    let text = "";
    const bp = this._buildParts;
    let parts;
    let litBuf = "";
    let litStart = 0;
    if (bp) {
      parts = [];
      litStart = pos;
    }
    while (pos < len) {
      const ch = src.charCodeAt(pos);
      if (ch === CH_BACKSLASH) {
        pos++;
        if (pos < len) {
          if (src.charCodeAt(pos) === CH_NL) {
            pos++;
          } else {
            const escaped = src[pos++];
            text += escaped;
            if (bp)
              litBuf += escaped;
          }
        }
        continue;
      }
      if (ch === CH_SQUOTE) {
        const sqStart = pos;
        pos++;
        const start = pos;
        while (pos < len && src.charCodeAt(pos) !== CH_SQUOTE)
          pos++;
        const value = src.slice(start, pos);
        text += value;
        if (pos < len)
          pos++;
        if (bp) {
          if (litBuf) {
            parts.push({ type: "Literal", value: litBuf, text: src.slice(litStart, sqStart) });
            litBuf = "";
          }
          parts.push({ type: "SingleQuoted", value, text: src.slice(sqStart, pos) });
          litStart = pos;
        }
        continue;
      }
      if (ch === CH_DQUOTE) {
        const dqStart = pos;
        pos++;
        this.pos = pos;
        this.readDoubleQuoted();
        pos = this.pos;
        text += this._dqText;
        if (bp) {
          if (litBuf) {
            parts.push({ type: "Literal", value: litBuf, text: src.slice(litStart, dqStart) });
            litBuf = "";
          }
          const dqText = src.slice(dqStart, pos);
          parts.push({
            type: "DoubleQuoted",
            text: dqText,
            parts: this._dqParts ?? [
              { type: "Literal", value: this._dqText, text: src.slice(dqStart + 1, this._dqEnd) }
            ]
          });
          litStart = pos;
        }
        continue;
      }
      if (ch === CH_DOLLAR) {
        const dollarStart = pos;
        this.pos = pos;
        this.readDollar();
        pos = this.pos;
        text += this._resultText;
        if (bp) {
          if (this._resultPart) {
            if (litBuf) {
              parts.push({ type: "Literal", value: litBuf, text: src.slice(litStart, dollarStart) });
              litBuf = "";
            }
            parts.push(this._resultPart);
            litStart = pos;
          } else {
            litBuf += this._resultText;
          }
        }
        continue;
      }
      if (ch === CH_BACKTICK) {
        const btStart = pos;
        this.pos = pos;
        this.readBacktickExpansion();
        pos = this.pos;
        text += this._resultText;
        if (bp) {
          if (litBuf) {
            parts.push({ type: "Literal", value: litBuf, text: src.slice(litStart, btStart) });
            litBuf = "";
          }
          parts.push(this._resultPart);
          litStart = pos;
        }
        continue;
      }
      if ((ch === CH_LT || ch === CH_GT) && pos + 1 < len && src.charCodeAt(pos + 1) === CH_LPAREN) {
        const psStart = pos;
        this.pos = pos + 2;
        const inner = this.extractBalanced();
        pos = this.pos;
        const raw = src.slice(psStart, pos);
        text += raw;
        if (bp) {
          if (litBuf) {
            parts.push({ type: "Literal", value: litBuf, text: src.slice(litStart, psStart) });
            litBuf = "";
          }
          const part = {
            type: "ProcessSubstitution",
            text: raw,
            operator: ch === CH_LT ? "<" : ">",
            script: void 0,
            inner,
            innerStart: psStart + 2
          };
          parts.push(part);
          this.collect(part);
          litStart = pos;
        }
        continue;
      }
      text += src[pos];
      if (bp)
        litBuf += src[pos];
      pos++;
    }
    if (bp && litBuf)
      parts.push({ type: "Literal", value: litBuf, text: src.slice(litStart, pos) });
    this.pos = pos;
    this._wordText = text;
    this._wordRaw = false;
    this._wordQuoted = false;
    this._wordHasExpansions = false;
    this._wordKeywordEligible = false;
    if (bp) {
      this._wordParts = parts.length > 1 || parts.length === 1 && parts[0].type !== "Literal" ? parts : null;
    }
  }
  // Parse a parameter-expansion sub-field (operand, slice bound, replacement pattern) over
  // the window [start, end) of the original source. Parsing in place — rather than against a
  // detached slice — gives the word and any nested substitutions absolute offsets, and
  // composes through nested ${...}. The `${...}` inner is a verbatim substring of the
  // source, so every sub-field offset maps straight back.
  parseSubFieldWord(start, end) {
    if (start >= end)
      return new WordImpl("", start, start);
    if (this._nestingDepth >= MAX_SYNTAX_NESTING)
      return new WordImpl(this.src.slice(start, end), start, end);
    this._nestingDepth++;
    const savedEnd = this.srcEnd;
    const savedPos = this.pos;
    const savedText = this._wordText;
    const savedParts = this._wordParts;
    const savedQuoted = this._wordQuoted;
    const savedKeywordEligible = this._wordKeywordEligible;
    this.srcEnd = end;
    this.pos = start;
    this.readInnerWordText();
    const word = new WordImpl(this.src.slice(start, end), start, end);
    if (this._buildParts && this._wordParts) {
      word.parts = this._wordParts;
    }
    this.srcEnd = savedEnd;
    this.pos = savedPos;
    this._wordText = savedText;
    this._wordParts = savedParts;
    this._wordQuoted = savedQuoted;
    this._wordKeywordEligible = savedKeywordEligible;
    this._nestingDepth--;
    return word;
  }
  skipSQ() {
    while (this.pos < this.srcEnd && this.src.charCodeAt(this.pos) !== CH_SQUOTE)
      this.pos++;
    if (this.pos < this.srcEnd)
      this.pos++;
  }
  skipAnsiCQuoted() {
    const quotePos = this.pos - 1;
    const result = decodeAnsiCQuoted(this.src, this.pos, this.srcEnd);
    this.pos = result.end;
    if (!result.closed)
      this.errors.push({ message: "unterminated ANSI-C quote", pos: quotePos });
  }
  skipDQ() {
    const src = this.src;
    const len = this.srcEnd;
    while (this.pos < len) {
      const ch = src.charCodeAt(this.pos);
      if (ch === CH_DQUOTE) {
        this.pos++;
        return;
      }
      if (ch === CH_BACKSLASH) {
        this.pos += 2;
        continue;
      }
      if (ch === CH_DOLLAR && this.pos + 1 < len) {
        const next = src.charCodeAt(this.pos + 1);
        if (next === CH_LPAREN) {
          const csStart = this.pos;
          this.pos += 2;
          this.extractBalanced();
          if (this._unbalanced)
            this.errors.push({ message: "unterminated command substitution", pos: csStart });
          continue;
        }
        if (next === CH_LBRACE) {
          this.pos += 2;
          let d = 1;
          while (this.pos < len && d > 0) {
            const c2 = src.charCodeAt(this.pos);
            if (c2 === CH_RBRACE) {
              if (--d === 0) {
                this.pos++;
                break;
              }
            } else if (c2 === CH_LBRACE && this.pos > 0 && src.charCodeAt(this.pos - 1) === CH_DOLLAR)
              d++;
            else if (c2 === CH_BACKSLASH) {
              this.pos++;
            } else if (c2 === CH_SQUOTE) {
              this.pos++;
              this.skipSQ();
              continue;
            } else if (c2 === CH_DQUOTE) {
              this.pos++;
              this.skipDQ();
              continue;
            }
            this.pos++;
          }
          continue;
        }
      }
      if (ch === CH_BACKTICK) {
        this.pos++;
        while (this.pos < len && src.charCodeAt(this.pos) !== CH_BACKTICK) {
          if (src.charCodeAt(this.pos) === CH_BACKSLASH)
            this.pos++;
          this.pos++;
        }
        if (this.pos < len)
          this.pos++;
        continue;
      }
      this.pos++;
    }
  }
  skipSpacesAndTabs() {
    const src = this.src;
    const len = this.srcEnd;
    while (this.pos < len) {
      const ch = src.charCodeAt(this.pos);
      if (ch === CH_SPACE || ch === CH_TAB)
        this.pos++;
      else if (ch === CH_BACKSLASH && this.pos + 1 < len && src.charCodeAt(this.pos + 1) === CH_NL)
        this.pos += 2;
      else
        break;
    }
  }
  readDoubleQuoted() {
    const src = this.src;
    const len = this.srcEnd;
    const contentStart = this.pos;
    let hasExpansions = false;
    const bp = this._buildParts;
    const bt = bp || this._buildValue;
    if (!bp) {
      let p = this.pos;
      while (p < len) {
        const c2 = src.charCodeAt(p);
        if (c2 === CH_DQUOTE) {
          this._dqText = bt ? src.slice(contentStart, p) : "";
          this._dqEnd = p;
          this.pos = p + 1;
          this._dqHasExpansions = false;
          this._dqParts = null;
          return;
        }
        if (c2 === CH_DOLLAR || c2 === CH_BACKTICK || c2 === CH_BACKSLASH)
          break;
        p++;
      }
    }
    let text = "";
    let parts = null;
    let litBuf = "";
    let litStart = bp ? this.pos : 0;
    while (this.pos < len && src.charCodeAt(this.pos) !== CH_DQUOTE) {
      const runStart = this.pos;
      while (this.pos < len) {
        const c2 = src.charCodeAt(this.pos);
        if (c2 === CH_DQUOTE || c2 === CH_BACKSLASH || c2 === CH_DOLLAR || c2 === CH_BACKTICK)
          break;
        this.pos++;
      }
      if (bt && this.pos > runStart) {
        const chunk = src.slice(runStart, this.pos);
        text += chunk;
        if (bp)
          litBuf += chunk;
      }
      if (this.pos >= len || src.charCodeAt(this.pos) === CH_DQUOTE)
        break;
      const ch = src.charCodeAt(this.pos);
      if (ch === CH_BACKSLASH) {
        this.pos++;
        if (this.pos < len) {
          const next = src.charCodeAt(this.pos);
          if (next === CH_NL) {
            this.pos++;
            continue;
          }
          if (bt) {
            if (next === CH_DOLLAR || next === CH_BACKTICK || next === CH_DQUOTE || next === CH_BACKSLASH) {
              const c2 = src[this.pos];
              text += c2;
              if (bp)
                litBuf += c2;
            } else {
              const pair = "\\" + src[this.pos];
              text += pair;
              if (bp)
                litBuf += pair;
            }
          }
          this.pos++;
        }
        continue;
      }
      if (ch === CH_DOLLAR) {
        const afterDollar = this.pos + 1 < len ? src.charCodeAt(this.pos + 1) : 0;
        if (afterDollar === CH_DQUOTE || afterDollar === CH_SQUOTE) {
          if (bt) {
            text += "$";
            if (bp)
              litBuf += "$";
          }
          this.pos++;
          continue;
        }
        const expStart = this.pos;
        this.readDollar();
        if (bt)
          text += this._resultText;
        if (this._resultHasExpansion)
          hasExpansions = true;
        if (bp) {
          const rp = this._resultPart;
          if (rp && isDQChild(rp)) {
            if (!parts)
              parts = [];
            if (litBuf) {
              parts.push({ type: "Literal", value: litBuf, text: src.slice(litStart, expStart) });
              litBuf = "";
            }
            parts.push(rp);
            litStart = this.pos;
          } else {
            litBuf += this._resultText;
          }
        }
        continue;
      }
      if (ch === CH_BACKTICK) {
        const btStart = this.pos;
        this.readBacktickExpansion();
        if (bt)
          text += this._resultText;
        hasExpansions = true;
        if (bp && this._resultPart && isDQChild(this._resultPart)) {
          if (!parts)
            parts = [];
          if (litBuf) {
            parts.push({ type: "Literal", value: litBuf, text: src.slice(litStart, btStart) });
            litBuf = "";
          }
          parts.push(this._resultPart);
          litStart = this.pos;
        }
        continue;
      }
    }
    if (bp && parts && litBuf)
      parts.push({ type: "Literal", value: litBuf, text: src.slice(litStart, this.pos) });
    this._dqEnd = this.pos;
    if (this.pos < len)
      this.pos++;
    else
      this.errors.push({ message: "unterminated double quote", pos: contentStart - 1 });
    this._dqText = text;
    this._dqHasExpansions = hasExpansions;
    this._dqParts = parts;
  }
  readDollar() {
    const dollarPos = this.pos;
    this.pos++;
    const src = this.src;
    const len = this.srcEnd;
    const bt = this._buildParts || this._buildValue;
    if (this.pos >= len) {
      this._resultText = "$";
      this._resultIsRaw = true;
      this._resultHasExpansion = false;
      this._resultPart = void 0;
      return;
    }
    const ch = src.charCodeAt(this.pos);
    if (ch === CH_LPAREN) {
      if (this.pos + 1 < len && src.charCodeAt(this.pos + 1) === CH_LPAREN) {
        const savedPos = this.pos;
        const savedErrors = this.errors.length;
        this.readArithmeticExpansion();
        if (!this._notArithmetic)
          return;
        this.errors.length = savedErrors;
        this.pos = savedPos;
      }
      this.readCommandSubstitution();
      return;
    }
    if (ch === CH_LBRACE) {
      const after = this.pos + 1 < len ? src.charCodeAt(this.pos + 1) : 0;
      if (after === CH_SPACE || after === CH_TAB || after === CH_NL) {
        this.readBraceCommandSubstitution();
        return;
      }
      if (after === CH_PIPE) {
        this.readValueSubstitution();
        return;
      }
      this.readParameterExpansion();
      return;
    }
    if (ch === CH_SQUOTE) {
      this.pos++;
      if (bt) {
        const value = this.readAnsiCQuoted();
        this._resultText = value;
        this._resultPart = this._buildParts ? { type: "AnsiCQuoted", text: src.slice(dollarPos, this.pos), value } : void 0;
      } else {
        this.skipAnsiCQuoted();
        this._resultText = "";
        this._resultPart = void 0;
      }
      this._resultIsRaw = false;
      this._resultHasExpansion = false;
      return;
    }
    if (ch === CH_DQUOTE) {
      this.pos++;
      this.readDoubleQuoted();
      this._resultText = this._dqText;
      this._resultIsRaw = false;
      this._resultHasExpansion = this._dqHasExpansions;
      if (this._buildParts) {
        const text = src.slice(dollarPos, this.pos);
        this._resultPart = {
          type: "LocaleString",
          text,
          parts: this._dqParts ?? [
            { type: "Literal", value: this._dqText, text: src.slice(dollarPos + 2, this._dqEnd) }
          ]
        };
      } else {
        this._resultPart = void 0;
      }
      return;
    }
    if (ch === CH_AT || ch === CH_STAR || ch === CH_HASH || ch === CH_QUESTION || ch === CH_DASH || ch === CH_DOLLAR || ch === CH_BANG || ch >= CH_0 && ch <= CH_9) {
      this.pos++;
      const text = bt ? src.slice(this.pos - 2, this.pos) : "";
      this._resultText = text;
      this._resultIsRaw = true;
      this._resultHasExpansion = false;
      this._resultPart = this._buildParts ? { type: "SimpleExpansion", text } : void 0;
      return;
    }
    if (ch < 128 && isIdChar[ch] & 1) {
      const namePos = this.pos - 1;
      while (this.pos < len) {
        const c2 = src.charCodeAt(this.pos);
        if (c2 < 128 && isIdChar[c2] & 2)
          this.pos++;
        else
          break;
      }
      const text = bt ? src.slice(namePos, this.pos) : "";
      this._resultText = text;
      this._resultIsRaw = true;
      this._resultHasExpansion = false;
      this._resultPart = this._buildParts ? { type: "SimpleExpansion", text } : void 0;
      return;
    }
    if (ch === CH_LBRACKET) {
      const close = this.findClosingArithmeticBracket(this.pos + 1);
      if (close !== -1) {
        const bodyStart = this.pos + 1;
        const body = src.slice(bodyStart, close);
        this.pos = close + 1;
        const text = bt ? src.slice(dollarPos, this.pos) : "";
        this._resultText = text;
        this._resultIsRaw = true;
        this._resultHasExpansion = false;
        this._resultPart = this._buildParts ? { type: "ArithmeticExpansion", text, expression: this.buildArithmeticExpression(body, bodyStart) } : void 0;
        return;
      }
    }
    this._resultText = "$";
    this._resultIsRaw = true;
    this._resultHasExpansion = false;
    this._resultPart = void 0;
  }
  scanArithmeticBody() {
    this._notArithmetic = false;
    this.pos += 2;
    let depth = 1;
    let parenDepth = 0;
    let parentParenDepth = 0;
    let parenDepths;
    let expansions = 0;
    let reported = false;
    const src = this.src;
    const len = this.srcEnd;
    const start = this.pos;
    while (this.pos < len && depth > 0) {
      const c2 = src.charCodeAt(this.pos);
      if (c2 === CH_BACKSLASH) {
        this.pos += 2;
      } else if (c2 === CH_SQUOTE) {
        this.pos++;
        this.skipSQ();
      } else if (c2 === CH_DQUOTE) {
        this.pos++;
        this.skipDQ();
      } else if (c2 === CH_BACKTICK) {
        this.pos++;
        while (this.pos < len && src.charCodeAt(this.pos) !== CH_BACKTICK) {
          if (src.charCodeAt(this.pos) === CH_BACKSLASH)
            this.pos++;
          this.pos++;
        }
        if (this.pos < len)
          this.pos++;
      } else if (c2 === CH_DOLLAR && this.pos + 2 < len && src.charCodeAt(this.pos + 1) === CH_LPAREN && src.charCodeAt(this.pos + 2) !== CH_LPAREN) {
        const dollarPos = this.pos;
        this.pos += 2;
        this.extractBalanced();
        if (this._unbalanced)
          this.errors.push({ message: "unterminated command substitution", pos: dollarPos });
      } else if (c2 === CH_DOLLAR && this.pos + 1 < len && src.charCodeAt(this.pos + 1) === CH_LBRACE) {
        const close = this.findClosingBrace(this.pos + 2, len);
        this.pos = close === -1 ? len : close + 1;
      } else if ((c2 === CH_LT || c2 === CH_GT) && this.pos + 1 < len && src.charCodeAt(this.pos + 1) === CH_LPAREN) {
        this.pos += 2;
        this.extractBalanced();
      } else if (c2 === CH_LPAREN) {
        if (src.charCodeAt(this.pos - 1) === CH_DOLLAR && src.charCodeAt(this.pos + 1) === CH_LPAREN) {
          if (depth === 1)
            parentParenDepth = parenDepth;
          else
            (parenDepths ??= []).push(parenDepth);
          depth++;
          parenDepth = 0;
          if (++expansions + this._nestingDepth >= MAX_SYNTAX_NESTING) {
            if (!reported) {
              this.errors.push({ message: "maximum arithmetic expansion nesting depth exceeded", pos: this.pos - 1 });
              reported = true;
            }
          }
          this.pos += 2;
        } else {
          parenDepth++;
          this.pos++;
        }
      } else if (c2 === CH_RPAREN && parenDepth > 0) {
        parenDepth--;
        this.pos++;
      } else if (c2 === CH_RPAREN && this.pos + 1 < len && src.charCodeAt(this.pos + 1) === CH_RPAREN) {
        if (--depth === 0) {
          this.pos += 2;
          break;
        }
        parenDepth = depth === 1 ? parentParenDepth : parenDepths.pop();
        this.pos += 2;
      } else if (c2 === CH_RPAREN && depth === 1) {
        this._notArithmetic = true;
        return "";
      } else {
        this.pos++;
      }
    }
    return this._buildParts || this._buildValue ? src.slice(start, this.pos - 2) : "";
  }
  readArithmeticExpansion() {
    const bodyStart = this.pos + 2;
    const body = this.scanArithmeticBody();
    if (this._notArithmetic)
      return;
    const text = this._buildParts || this._buildValue ? "$((" + body + "))" : "";
    this._resultText = text;
    this._resultIsRaw = true;
    this._resultHasExpansion = false;
    this._resultPart = this._buildParts ? { type: "ArithmeticExpansion", text, expression: this.buildArithmeticExpression(body, bodyStart) } : void 0;
  }
  // Pass the absolute body offset so arithmetic nodes index the original source directly
  // (no re-basing). Nested $(...) command subs inside the arithmetic get an absolute
  // innerStart so resolveCollected parses their window in place.
  buildArithmeticExpression(body, bodyStart) {
    if (!hasEmbeddedWordStructure(this.src, bodyStart, bodyStart + body.length)) {
      return parseArithmeticExpression(body, bodyStart) ?? void 0;
    }
    const commandExpansions = [];
    const embeddedWords = [];
    const expr = parseArithmeticExpression(body, bodyStart, {
      commandExpansions,
      embeddedWords,
      findClosingBracket: (start, end) => this.findClosingBracket(start, end),
      findClosingBrace: (start, end) => this.findClosingBrace(start, end),
      findClosingParenthesis: (start, end) => this.findClosingParenthesis(start, end),
      findArithmeticExpansionEnd: (start, end) => this.findArithmeticExpansionEnd(start, end),
      findArithmeticWordEnd: (start, end) => this.findArithmeticWordEnd(start, end)
    }) ?? void 0;
    for (const node of commandExpansions) {
      node.innerStart = node.pos + 2;
      this.collect(node);
    }
    for (const node of embeddedWords)
      node.parts = this.parseSubFieldWord(node.pos, node.end).parts;
    return expr;
  }
  readArithmeticCommand(out, tokenStart) {
    const savedBuildValue = this._buildValue;
    this._buildValue = true;
    const body = this.scanArithmeticBody();
    this._buildValue = savedBuildValue;
    setToken(out, Token.ArithCmd, body, tokenStart, this.pos);
  }
  readCommandSubstitution() {
    const dollarPos = this.pos - 1;
    this.pos++;
    const inner = this.extractBalanced();
    if (this._unbalanced)
      this.errors.push({ message: "unterminated command substitution", pos: dollarPos });
    const bt = this._buildParts || this._buildValue;
    const text = bt ? this.src.slice(dollarPos, this.pos) : "";
    this._resultText = text;
    this._resultIsRaw = true;
    this._resultHasExpansion = true;
    if (this._buildParts) {
      this._resultPart = { type: "CommandExpansion", text, script: void 0, inner, innerStart: dollarPos + 2 };
      this.collect(this._resultPart);
    } else {
      this._resultPart = void 0;
    }
  }
  readBraceCommandSubstitution() {
    this.readBraceSubstitution(1);
  }
  readValueSubstitution() {
    this.readBraceSubstitution(2);
  }
  readBraceSubstitution(skip) {
    const dollarPos = this.pos - 1;
    this.pos += skip;
    const src = this.src;
    const len = this.srcEnd;
    let depth = 1;
    const start = this.pos;
    while (this.pos < len) {
      const c2 = src.charCodeAt(this.pos);
      if (c2 === CH_LBRACE)
        depth++;
      else if (c2 === CH_RBRACE) {
        if (--depth === 0) {
          this.pos++;
          break;
        }
      } else if (c2 === CH_SQUOTE) {
        this.pos++;
        this.skipSQ();
        continue;
      } else if (c2 === CH_DQUOTE) {
        this.pos++;
        this.skipDQ();
        continue;
      } else if (c2 === CH_BACKSLASH)
        this.pos++;
      this.pos++;
    }
    this._resultIsRaw = true;
    this._resultHasExpansion = true;
    if (this._buildParts || this._buildValue) {
      const rawInner = src.slice(start, this.pos - 1);
      const inner = rawInner.trim();
      const text = src.slice(dollarPos, this.pos);
      this._resultText = text;
      if (this._buildParts) {
        const innerStart = start + (rawInner.length - rawInner.trimStart().length);
        this._resultPart = { type: "CommandExpansion", text, script: void 0, inner, innerStart };
        this.collect(this._resultPart);
      } else {
        this._resultPart = void 0;
      }
    } else {
      this._resultText = "";
      this._resultPart = void 0;
    }
  }
  readBacktickExpansion() {
    this.pos++;
    const src = this.src;
    const len = this.srcEnd;
    const start = this.pos;
    if (!this._buildParts && !this._buildValue) {
      while (this.pos < len && src.charCodeAt(this.pos) !== CH_BACKTICK) {
        if (src.charCodeAt(this.pos) === CH_BACKSLASH && this.pos + 1 < len)
          this.pos++;
        this.pos++;
      }
      if (this.pos < len)
        this.pos++;
      else
        this.errors.push({ message: "unterminated backtick", pos: start - 1 });
      this._resultText = "";
      this._resultIsRaw = false;
      this._resultHasExpansion = true;
      this._resultPart = void 0;
      return;
    }
    let inner = "";
    let hasEscapes = false;
    while (this.pos < len && src.charCodeAt(this.pos) !== CH_BACKTICK) {
      if (src.charCodeAt(this.pos) === CH_BACKSLASH) {
        hasEscapes = true;
        break;
      }
      this.pos++;
    }
    if (!hasEscapes) {
      inner = src.slice(start, this.pos);
    } else {
      inner = src.slice(start, this.pos);
      while (this.pos < len && src.charCodeAt(this.pos) !== CH_BACKTICK) {
        if (src.charCodeAt(this.pos) === CH_BACKSLASH) {
          this.pos++;
          if (this.pos < len) {
            const c2 = src.charCodeAt(this.pos);
            if (c2 === CH_DOLLAR || c2 === CH_BACKTICK || c2 === CH_BACKSLASH) {
              inner += src[this.pos];
            } else {
              inner += "\\" + src[this.pos];
            }
            this.pos++;
          }
        } else {
          const runStart = this.pos;
          while (this.pos < len) {
            const c2 = src.charCodeAt(this.pos);
            if (c2 === CH_BACKTICK || c2 === CH_BACKSLASH)
              break;
            this.pos++;
          }
          inner += src.slice(runStart, this.pos);
        }
      }
    }
    if (this.pos < len)
      this.pos++;
    else
      this.errors.push({ message: "unterminated backtick", pos: start - 1 });
    const text = src.slice(start - 1, this.pos);
    this._resultText = inner;
    this._resultHasExpansion = true;
    if (this._buildParts) {
      this._resultPart = {
        type: "CommandExpansion",
        text,
        script: void 0,
        inner,
        innerStart: hasEscapes ? void 0 : start
      };
      this.collect(this._resultPart);
    } else {
      this._resultPart = void 0;
    }
  }
  readParameterExpansion() {
    const src = this.src;
    const len = this.srcEnd;
    const start = this.pos;
    this.pos++;
    let depth = 1;
    let reported = false;
    while (this.pos < len && depth > 0) {
      const ch = src.charCodeAt(this.pos);
      if (ch === CH_DOLLAR) {
        const next = this.pos + 1 < len ? src.charCodeAt(this.pos + 1) : 0;
        if (next === CH_LBRACE) {
          depth++;
          if (this._nestingDepth + depth > MAX_SYNTAX_NESTING && !reported) {
            this.errors.push({ message: "maximum parameter expansion nesting depth exceeded", pos: this.pos });
            reported = true;
          }
          this.pos += 2;
          continue;
        }
        if (next === CH_DOLLAR) {
          this.pos += 2;
          continue;
        }
        if (next === CH_LPAREN) {
          const dollarPos = this.pos;
          this.pos += 2;
          this.extractBalanced();
          if (this._unbalanced)
            this.errors.push({ message: "unterminated command substitution", pos: dollarPos });
          continue;
        }
      } else if (ch === CH_BACKTICK) {
        this.pos++;
        while (this.pos < len && src.charCodeAt(this.pos) !== CH_BACKTICK) {
          if (src.charCodeAt(this.pos) === CH_BACKSLASH)
            this.pos++;
          this.pos++;
        }
        if (this.pos < len)
          this.pos++;
        continue;
      } else if (ch === CH_RBRACE) {
        if (--depth === 0) {
          this.pos++;
          break;
        }
      } else if (ch === CH_BACKSLASH) {
        this.pos++;
      } else if (ch === CH_SQUOTE) {
        this.pos++;
        if (this.pos > start + 1 && src.charCodeAt(this.pos - 2) === CH_DOLLAR)
          this.skipAnsiCQuoted();
        else
          this.skipSQ();
        continue;
      } else if (ch === CH_DQUOTE) {
        this.pos++;
        this.skipDQ();
        continue;
      }
      this.pos++;
    }
    const closed = depth === 0;
    if (!closed)
      this.errors.push({ message: "unterminated parameter expansion", pos: start - 1 });
    const text = this._buildParts || this._buildValue ? src.slice(start - 1, this.pos) : "";
    this._resultText = text;
    this._resultIsRaw = true;
    this._resultHasExpansion = false;
    if (this._buildParts) {
      const inner = src.slice(start + 1, closed ? this.pos - 1 : this.pos);
      this._resultPart = this.parseParamInner(text, inner, start + 1);
    } else {
      this._resultPart = void 0;
    }
  }
  // `innerStart` is the absolute offset of `inner` in the original source, so each sub-field
  // word is parsed in place at its true position. `sub(a, b)` maps inner-relative offsets to
  // that absolute window.
  parseParamInner(text, inner, innerStart) {
    const result = {
      type: "ParameterExpansion",
      text,
      parameter: "",
      index: void 0,
      indexParts: void 0,
      indirect: void 0,
      length: void 0,
      operator: void 0,
      operand: void 0,
      slice: void 0,
      replace: void 0
    };
    const ilen = inner.length;
    if (ilen === 0)
      return result;
    const sub = (a, b) => this.parseSubFieldWord(innerStart + a, innerStart + b);
    const closeBracket = (start) => {
      const close = this.findClosingBracket(innerStart + start, innerStart + ilen);
      return close === -1 ? -1 : close - innerStart;
    };
    let i = 0;
    if (inner.charCodeAt(0) === CH_BANG) {
      result.indirect = true;
      i = 1;
    }
    if (!result.indirect && inner.charCodeAt(0) === CH_HASH) {
      if (ilen === 1) {
        result.parameter = "#";
        return result;
      }
      if (inner.charCodeAt(1) === CH_HASH) {
        result.parameter = "#";
        i = 1;
      } else {
        const tryI = this.scanParamName(inner, 1);
        if (tryI > 1) {
          let endI = tryI;
          if (endI < ilen && inner.charCodeAt(endI) === CH_LBRACKET) {
            const closeB = closeBracket(endI + 1);
            if (closeB !== -1)
              endI = closeB + 1;
          }
          if (endI >= ilen) {
            result.length = true;
            result.parameter = inner.slice(1, tryI);
            if (tryI < ilen && inner.charCodeAt(tryI) === CH_LBRACKET) {
              const closeB = closeBracket(tryI + 1);
              if (closeB !== -1) {
                result.index = inner.slice(tryI + 1, closeB);
                result.indexParts = sub(tryI + 1, closeB).parts;
              }
            }
            return result;
          }
        }
        result.parameter = "#";
        i = 1;
      }
    }
    if (!result.parameter) {
      const nameStart = i;
      i = this.scanParamName(inner, i);
      result.parameter = inner.slice(nameStart, i);
    }
    if (i < ilen && inner.charCodeAt(i) === CH_LBRACKET) {
      const closeB = closeBracket(i + 1);
      if (closeB !== -1) {
        result.index = inner.slice(i + 1, closeB);
        result.indexParts = sub(i + 1, closeB).parts;
        i = closeB + 1;
      }
    }
    if (i >= ilen)
      return result;
    const opChar = inner.charCodeAt(i);
    if (opChar === CH_COLON) {
      if (i + 1 < ilen) {
        const nc = inner.charCodeAt(i + 1);
        if (nc === CH_DASH || nc === CH_EQ || nc === CH_PLUS || nc === CH_QUESTION) {
          result.operator = inner.slice(i, i + 2);
          result.operand = sub(i + 2, ilen);
          return result;
        }
      }
      i++;
      const sliceRest = inner.slice(i);
      const colonIdx = findUnnested(sliceRest, CH_COLON);
      if (colonIdx === -1) {
        result.slice = { offset: sub(i, ilen), length: void 0 };
      } else {
        result.slice = {
          offset: sub(i, i + colonIdx),
          length: sub(i + colonIdx + 1, ilen)
        };
      }
      return result;
    }
    if (opChar === CH_DASH || opChar === CH_EQ || opChar === CH_PLUS || opChar === CH_QUESTION) {
      result.operator = inner[i];
      result.operand = sub(i + 1, ilen);
      return result;
    }
    if (opChar === CH_HASH) {
      if (i + 1 < ilen && inner.charCodeAt(i + 1) === CH_HASH) {
        result.operator = "##";
        result.operand = sub(i + 2, ilen);
      } else {
        result.operator = "#";
        result.operand = sub(i + 1, ilen);
      }
      return result;
    }
    if (opChar === CH_PERCENT) {
      if (i + 1 < ilen && inner.charCodeAt(i + 1) === CH_PERCENT) {
        result.operator = "%%";
        result.operand = sub(i + 2, ilen);
      } else {
        result.operator = "%";
        result.operand = sub(i + 1, ilen);
      }
      return result;
    }
    if (opChar === CH_SLASH) {
      i++;
      let replOp = "/";
      if (i < ilen) {
        const nc = inner.charCodeAt(i);
        if (nc === CH_SLASH) {
          replOp = "//";
          i++;
        } else if (nc === CH_HASH) {
          replOp = "/#";
          i++;
        } else if (nc === CH_PERCENT) {
          replOp = "/%";
          i++;
        }
      }
      result.operator = replOp;
      const rest = inner.slice(i);
      const sepIdx = findUnnested(rest, CH_SLASH);
      if (sepIdx === -1) {
        result.replace = {
          pattern: sub(i, ilen),
          replacement: new WordImpl("", innerStart + ilen, innerStart + ilen)
        };
      } else {
        result.replace = {
          pattern: sub(i, i + sepIdx),
          replacement: sub(i + sepIdx + 1, ilen)
        };
      }
      return result;
    }
    if (opChar === CH_CARET) {
      if (i + 1 < ilen && inner.charCodeAt(i + 1) === CH_CARET) {
        result.operator = "^^";
        if (i + 2 < ilen)
          result.operand = sub(i + 2, ilen);
      } else {
        result.operator = "^";
        if (i + 1 < ilen)
          result.operand = sub(i + 1, ilen);
      }
      return result;
    }
    if (opChar === CH_COMMA) {
      if (i + 1 < ilen && inner.charCodeAt(i + 1) === CH_COMMA) {
        result.operator = ",,";
        if (i + 2 < ilen)
          result.operand = sub(i + 2, ilen);
      } else {
        result.operator = ",";
        if (i + 1 < ilen)
          result.operand = sub(i + 1, ilen);
      }
      return result;
    }
    if (opChar === CH_AT) {
      result.operator = "@";
      result.operand = sub(i + 1, ilen);
      return result;
    }
    result.operator = inner.slice(i);
    return result;
  }
  scanParamName(s, start) {
    let i = start;
    if (i >= s.length)
      return i;
    const c2 = s.charCodeAt(i);
    if (c2 === CH_AT || c2 === CH_STAR || c2 === CH_HASH || c2 === CH_QUESTION || c2 === CH_DASH || c2 === CH_DOLLAR || c2 === CH_BANG) {
      return i + 1;
    }
    if (c2 >= CH_0 && c2 <= CH_9) {
      while (i < s.length && s.charCodeAt(i) >= CH_0 && s.charCodeAt(i) <= CH_9)
        i++;
      return i;
    }
    if (c2 >= CH_a && c2 <= CH_z || c2 >= CH_A && c2 <= CH_Z || c2 === CH_UNDERSCORE) {
      i++;
      while (i < s.length) {
        const ch = s.charCodeAt(i);
        if (ch >= CH_a && ch <= CH_z || ch >= CH_A && ch <= CH_Z || ch >= CH_0 && ch <= CH_9 || ch === CH_UNDERSCORE)
          i++;
        else
          break;
      }
    }
    return i;
  }
  readAnsiCQuoted() {
    const quotePos = this.pos - 1;
    const result = decodeAnsiCQuoted(this.src, this.pos, this.srcEnd);
    this.pos = result.end;
    if (!result.closed)
      this.errors.push({ message: "unterminated ANSI-C quote", pos: quotePos });
    return result.value;
  }
  // Extract balanced parens for $(...) — respects nested quotes and case..esac
  extractBalanced() {
    const src = this.src;
    const len = this.srcEnd;
    const bt = this._buildParts || this._buildValue;
    let depth = 1;
    const start = this.pos;
    this._unbalanced = false;
    while (this.pos < len) {
      const c2 = src.charCodeAt(this.pos);
      if (c2 === CH_RPAREN) {
        const result = bt ? src.slice(start, this.pos) : "";
        this.pos++;
        return result;
      } else if (c2 === CH_LPAREN || c2 === CH_BACKSLASH || c2 === CH_SQUOTE || c2 === CH_DQUOTE || c2 === CH_BACKTICK) {
        break;
      } else if (c2 === CH_LT && this.pos + 1 < len && src.charCodeAt(this.pos + 1) === CH_LT) {
        break;
      } else if (c2 === CH_HASH && (this.pos === start || src.charCodeAt(this.pos - 1) < 128 && charType[src.charCodeAt(this.pos - 1)] & 1)) {
        break;
      } else if (c2 === 99 && // Ensure word start boundary (not inside e.g. "lowercase"); only `& 1` ends a word.
      (this.pos === start || src.charCodeAt(this.pos - 1) < 128 && charType[src.charCodeAt(this.pos - 1)] & 1) && this.pos + 3 < len && src.charCodeAt(this.pos + 1) === 97 && src.charCodeAt(this.pos + 2) === 115 && src.charCodeAt(this.pos + 3) === 101 && (this.pos + 4 >= len || src.charCodeAt(this.pos + 4) < 128 && charType[src.charCodeAt(this.pos + 4)] & 1)) {
        break;
      } else {
        this.pos++;
      }
    }
    let caseDepth = 0;
    let caseParens = 0;
    let pendingDelims = null;
    let arithBase = -1;
    const arithExtent = start >= 2 && src.charCodeAt(start) === CH_LPAREN && src.charCodeAt(start - 1) === CH_LPAREN && src.charCodeAt(start - 2) === CH_DOLLAR;
    let substitutions = 0;
    let reported = false;
    while (this.pos < len && depth > 0) {
      const ch = src.charCodeAt(this.pos);
      if (ch === CH_LPAREN) {
        if (arithBase < 0 && this.pos + 1 < len && src.charCodeAt(this.pos + 1) === CH_LPAREN) {
          arithBase = depth;
        }
        if (src.charCodeAt(this.pos - 1) === CH_DOLLAR && ++substitutions + this._nestingDepth >= MAX_SYNTAX_NESTING) {
          if (!reported) {
            this.errors.push({ message: "maximum command substitution nesting depth exceeded", pos: this.pos - 1 });
            reported = true;
          }
        }
        depth++;
        if (caseDepth > 0)
          caseParens++;
        this.pos++;
      } else if (ch === CH_RPAREN) {
        if (caseDepth > 0 && caseParens === 0) {
          this.pos++;
        } else {
          if (caseDepth > 0)
            caseParens--;
          depth--;
          if (depth === 0) {
            const result = bt ? src.slice(start, this.pos) : "";
            this.pos++;
            return result;
          }
          if (depth <= arithBase)
            arithBase = -1;
          this.pos++;
        }
      } else if (ch === CH_BACKSLASH) {
        this.pos++;
        if (this.pos < len)
          this.pos++;
      } else if (ch === CH_SQUOTE) {
        this.pos++;
        this.skipSQ();
      } else if (ch === CH_DQUOTE) {
        this.pos++;
        this.skipDQ();
      } else if (ch === CH_BACKTICK) {
        this.pos++;
        while (this.pos < len && src.charCodeAt(this.pos) !== CH_BACKTICK) {
          if (src.charCodeAt(this.pos) === CH_BACKSLASH)
            this.pos++;
          if (this.pos < len)
            this.pos++;
        }
        if (this.pos < len)
          this.pos++;
      } else if (ch === CH_LT && arithBase < 0 && this.pos + 1 < len && src.charCodeAt(this.pos + 1) === CH_LT) {
        if (this.pos + 2 < len && src.charCodeAt(this.pos + 2) === CH_LT) {
          this.pos += 3;
        } else {
          this.pos += 2;
          const strip = this.pos < len && src.charCodeAt(this.pos) === CH_DASH;
          if (strip)
            this.pos++;
          this.skipSpacesAndTabs();
          this.readHereDocDelimiter();
          if (this._hereDelim || this._hereQuoted) {
            (pendingDelims ??= []).push({ delimiter: this._hereDelim, strip, quoted: this._hereQuoted });
          }
        }
      } else if (ch === CH_NL && pendingDelims) {
        this.pos++;
        for (const hd of pendingDelims)
          this.skipHereDocBody(hd.delimiter, hd.strip, true, hd.quoted);
        pendingDelims = null;
      } else if (ch === CH_HASH && arithBase < 0 && !arithExtent && opensComment(src, this.pos, start)) {
        while (this.pos < len && src.charCodeAt(this.pos) !== CH_NL)
          this.pos++;
      } else {
        const wStart = this.pos;
        while (this.pos < len) {
          const wc = src.charCodeAt(this.pos);
          if (wc < 128 && charType[wc])
            break;
          this.pos++;
        }
        if (this.pos > wStart) {
          const wLen = this.pos - wStart;
          const prev = wStart > start ? src.charCodeAt(wStart - 1) : 0;
          if (wLen === 4 && (wStart === start || prev < 128 && charType[prev] & 1)) {
            const c0 = src.charCodeAt(wStart);
            if (c0 === 99 && src.charCodeAt(wStart + 1) === 97 && src.charCodeAt(wStart + 2) === 115 && src.charCodeAt(wStart + 3) === 101) {
              caseDepth++;
            } else if (c0 === 101 && src.charCodeAt(wStart + 1) === 115 && src.charCodeAt(wStart + 2) === 97 && src.charCodeAt(wStart + 3) === 99 && caseDepth > 0) {
              caseDepth--;
              if (caseDepth === 0)
                caseParens = 0;
            }
          }
        } else {
          this.pos++;
        }
      }
    }
    this._unbalanced = true;
    return bt ? src.slice(start, this.pos) : "";
  }
};

// node_modules/.pnpm/unbash@4.0.10/node_modules/unbash/dist/parts.js
function computeWordParts(source, word, depth = 0) {
  const lexer = new Lexer2(source, word.pos, word.end);
  lexer._nestingDepth = depth;
  const parts = lexer.buildWordParts(word.pos);
  if (!parts)
    return void 0;
  resolveCollected(lexer);
  return parts;
}
function computeEmbeddedWordParts(source, word, depth = 0) {
  if (!hasEmbeddedWordStructure(source, word.pos, word.end))
    return void 0;
  const lexer = new Lexer2(source, word.pos, word.end);
  lexer._nestingDepth = depth;
  const parts = lexer.buildEmbeddedWordParts(word.pos);
  if (!parts)
    return void 0;
  resolveCollected(lexer);
  return parts;
}
function computeHereDocBodyParts(source, word, depth = 0) {
  const lexer = new Lexer2(source, word.pos, word.end);
  lexer._nestingDepth = depth;
  const parts = lexer.buildHereDocParts(word.pos, word.end);
  if (!parts)
    return void 0;
  resolveCollected(lexer);
  return parts;
}
function resolveCollected(lexer) {
  const source = lexer.getSource();
  for (const [e, innerDepth] of lexer.getCollectedExpansions()) {
    if (e.inner !== void 0) {
      const depth = innerDepth + 1;
      if (depth > MAX_SYNTAX_NESTING + 1) {
      } else if (e.innerStart !== void 0) {
        e.script = parseRegion(source, e.innerStart, e.innerStart + e.inner.length, depth);
      } else {
        e.script = parse2(e.inner);
        Object.defineProperty(e.script, "source", { value: e.inner, enumerable: false });
      }
      e.inner = void 0;
      e.innerStart = void 0;
    }
  }
}

// node_modules/.pnpm/unbash@4.0.10/node_modules/unbash/dist/parser.js
WordImpl._resolveWord = computeWordParts;
WordImpl._resolveHeredocBody = computeHereDocBodyParts;
var ArithmeticCommandImpl = class {
  type = "ArithmeticCommand";
  pos;
  end;
  body;
  #source;
  #depth;
  #expression = null;
  constructor(pos, end, body, source, depth) {
    this.pos = pos;
    this.end = end;
    this.body = body;
    this.#source = source;
    this.#depth = depth;
  }
  get expression() {
    if (this.#expression === null) {
      this.#expression = parseArithmeticWithParts(this.body, this.pos + 2, this.#source, this.#depth);
    }
    return this.#expression;
  }
  set expression(v) {
    this.#expression = v ?? void 0;
  }
  toJSON() {
    return {
      type: this.type,
      pos: this.pos,
      end: this.end,
      expression: this.expression,
      body: this.body
    };
  }
};
var ArithmeticForImpl = class {
  type = "ArithmeticFor";
  pos;
  end;
  body;
  #initStr;
  #testStr;
  #updateStr;
  #initPos;
  #testPos;
  #updatePos;
  #source;
  #depth;
  #initialize = null;
  #test = null;
  #update = null;
  constructor(pos, end, body, initStr, testStr, updateStr, initPos, testPos, updatePos, source, depth) {
    this.pos = pos;
    this.end = end;
    this.body = body;
    this.#initStr = initStr;
    this.#testStr = testStr;
    this.#updateStr = updateStr;
    this.#initPos = initPos;
    this.#testPos = testPos;
    this.#updatePos = updatePos;
    this.#source = source;
    this.#depth = depth;
  }
  get initialize() {
    if (this.#initialize === null) {
      if (this.#initStr) {
        this.#initialize = parseArithmeticWithParts(this.#initStr, this.#initPos, this.#source, this.#depth);
      } else {
        this.#initialize = void 0;
      }
    }
    return this.#initialize;
  }
  set initialize(v) {
    this.#initialize = v ?? void 0;
  }
  get test() {
    if (this.#test === null) {
      if (this.#testStr) {
        this.#test = parseArithmeticWithParts(this.#testStr, this.#testPos, this.#source, this.#depth);
      } else {
        this.#test = void 0;
      }
    }
    return this.#test;
  }
  set test(v) {
    this.#test = v ?? void 0;
  }
  get update() {
    if (this.#update === null) {
      if (this.#updateStr) {
        this.#update = parseArithmeticWithParts(this.#updateStr, this.#updatePos, this.#source, this.#depth);
      } else {
        this.#update = void 0;
      }
    }
    return this.#update;
  }
  set update(v) {
    this.#update = v ?? void 0;
  }
  toJSON() {
    return {
      type: this.type,
      pos: this.pos,
      end: this.end,
      initialize: this.initialize,
      test: this.test,
      update: this.update,
      body: this.body
    };
  }
};
var CASE_TERMINATORS = {
  [Token.DoubleSemi]: ";;",
  [Token.SemiAmp]: ";&",
  [Token.DoubleSemiAmp]: ";;&"
};
var REDIRECT_OPS = {
  ">": ">",
  ">>": ">>",
  "<": "<",
  "<<": "<<",
  "<<-": "<<-",
  "<<<": "<<<",
  "<>": "<>",
  "<&": "<&",
  ">&": ">&",
  ">|": ">|",
  "&>": "&>",
  "&>>": "&>>"
};
function parseArithmeticWithParts(body, offset, source, depth = 0) {
  if (!hasEmbeddedWordStructure(source, offset, offset + body.length)) {
    return parseArithmeticExpression(body, offset) ?? void 0;
  }
  const commandExpansions = [];
  const embeddedWords = [];
  const lexer = new Lexer2(source);
  const expression = parseArithmeticExpression(body, offset, {
    commandExpansions,
    embeddedWords,
    findClosingBracket: (start, end) => lexer.findClosingBracket(start, end),
    findClosingBrace: (start, end) => lexer.findClosingBrace(start, end),
    findClosingParenthesis: (start, end) => lexer.findClosingParenthesis(start, end),
    findArithmeticExpansionEnd: (start, end) => lexer.findArithmeticExpansionEnd(start, end),
    findArithmeticWordEnd: (start, end) => lexer.findArithmeticWordEnd(start, end)
  }) ?? void 0;
  for (const node of commandExpansions) {
    if (node.inner !== void 0) {
      if (depth <= MAX_SYNTAX_NESTING) {
        const innerStart = node.pos + 2;
        node.script = parseRegion(source, innerStart, innerStart + node.inner.length, depth + 1);
      }
      node.inner = void 0;
    }
  }
  for (const node of embeddedWords)
    node.parts = computeEmbeddedWordParts(source, node, depth);
  return expression;
}
var listTerminators = new Uint8Array(37);
listTerminators[Token.EOF] = 1;
listTerminators[Token.RParen] = 1;
listTerminators[Token.RBrace] = 1;
listTerminators[Token.Then] = 1;
listTerminators[Token.Else] = 1;
listTerminators[Token.Elif] = 1;
listTerminators[Token.Fi] = 1;
listTerminators[Token.Do] = 1;
listTerminators[Token.Done] = 1;
listTerminators[Token.Esac] = 1;
listTerminators[Token.DoubleSemi] = 1;
listTerminators[Token.SemiAmp] = 1;
listTerminators[Token.DoubleSemiAmp] = 1;
var compoundClosers = new Uint8Array(37);
compoundClosers[Token.RParen] = 1;
compoundClosers[Token.RBrace] = 1;
compoundClosers[Token.DblRBracket] = 1;
compoundClosers[Token.Fi] = 1;
compoundClosers[Token.Done] = 1;
compoundClosers[Token.Esac] = 1;
compoundClosers[Token.ArithCmd] = 1;
function isTestNegation(t) {
  return t.token === Token.Word && t.keywordEligible && t.value === "!";
}
var commandStarts = new Uint8Array(37);
commandStarts[Token.Word] = 1;
commandStarts[Token.Assignment] = 1;
commandStarts[Token.Bang] = 1;
commandStarts[Token.LParen] = 1;
commandStarts[Token.LBrace] = 1;
commandStarts[Token.DblLBracket] = 1;
commandStarts[Token.If] = 1;
commandStarts[Token.For] = 1;
commandStarts[Token.While] = 1;
commandStarts[Token.Until] = 1;
commandStarts[Token.Case] = 1;
commandStarts[Token.Function] = 1;
commandStarts[Token.Select] = 1;
commandStarts[Token.ArithCmd] = 1;
commandStarts[Token.Coproc] = 1;
commandStarts[Token.Redirect] = 1;
var UNARY_TEST_OPS = {
  "-a": 1,
  "-b": 1,
  "-c": 1,
  "-d": 1,
  "-e": 1,
  "-f": 1,
  "-g": 1,
  "-h": 1,
  "-k": 1,
  "-p": 1,
  "-r": 1,
  "-s": 1,
  "-t": 1,
  "-u": 1,
  "-v": 1,
  "-w": 1,
  "-x": 1,
  "-z": 1,
  "-n": 1,
  "-o": 1,
  "-N": 1,
  "-S": 1,
  "-L": 1,
  "-G": 1,
  "-O": 1,
  "-R": 1
};
var BINARY_TEST_OPS = {
  "==": 1,
  "!=": 1,
  "=~": 1,
  "=": 1,
  "-eq": 1,
  "-ne": 1,
  "-lt": 1,
  "-le": 1,
  "-gt": 1,
  "-ge": 1,
  "-nt": 1,
  "-ot": 1,
  "-ef": 1,
  "<": 1,
  ">": 1
};
function heredocDelimiterParts(value) {
  return (source, word) => {
    const raw = source.slice(word.pos, word.end);
    return raw === value ? void 0 : [{ type: "Literal", value, text: raw }];
  };
}
var EMPTY_REDIRECTS = [];
function ownEmpty(values) {
  return values.length === 0 ? [] : values;
}
function parse2(source) {
  return new Parser2(source, 0, source.length).run();
}
function parseRegion(source, start, end, depth = 0) {
  return new Parser2(source, start, end, depth).run();
}
var Parser2 = class {
  tok;
  source;
  start;
  end;
  depth;
  errors = null;
  _redirects = EMPTY_REDIRECTS;
  syntaxDepth = 0;
  // `depth` counts the substitution scripts (and sub-fields) enclosing this region; it
  // shares the MAX_SYNTAX_NESTING budget with the lexer's lazy word-part materialization.
  constructor(source, start, end, depth = 0) {
    this.tok = new Lexer2(source, start, end);
    this.tok._nestingDepth = depth;
    this.source = source;
    this.start = start;
    this.end = end;
    this.depth = depth;
  }
  run() {
    const start = this.start;
    if (this.depth > MAX_SYNTAX_NESTING)
      this.error("maximum substitution nesting depth exceeded", start);
    let shebang;
    if (start === 0 && this.source.charCodeAt(0) === 35 && this.source.charCodeAt(1) === 33) {
      const nl = this.source.indexOf("\n");
      shebang = nl === -1 ? this.source : this.source.slice(0, nl);
    }
    const commands = this.list();
    for (; ; ) {
      const unexpected = this.tok.peek(LexContext.CommandStart);
      if (unexpected.token === Token.EOF)
        break;
      this.error(`unexpected token '${unexpected.value}'`, unexpected.pos);
      if (!listTerminators[unexpected.token] && unexpected.token !== Token.In)
        break;
      this.tok.next(LexContext.CommandStart);
      let separator = this.tok.peek(LexContext.CommandStart).token;
      if (separator !== Token.Semi && separator !== Token.Newline && separator !== Token.Amp)
        break;
      while (separator === Token.Semi || separator === Token.Newline || separator === Token.Amp) {
        this.tok.next(LexContext.CommandStart);
        separator = this.tok.peek(LexContext.CommandStart).token;
      }
      const recovered = this.list();
      for (let i = 0; i < recovered.length; i++)
        commands.push(recovered[i]);
    }
    const lexerErrors = this.tok._errors;
    if (lexerErrors !== null && lexerErrors.length > 0) {
      const errors = this.errors ??= [];
      for (let i = 0; i < lexerErrors.length; i++)
        errors.push(lexerErrors[i]);
    }
    if (this.errors !== null && this.errors.length > 1)
      this.errors.sort((a, b) => a.pos - b.pos);
    const result = {
      type: "Script",
      pos: start,
      end: this.end,
      shebang,
      commands,
      errors: this.errors ?? void 0
    };
    return result;
  }
  error(message, pos) {
    (this.errors ??= []).push({ message, pos });
  }
  skipSemi() {
    if (this.tok.peek(LexContext.Normal).token === Token.Semi)
      this.tok.next(LexContext.Normal);
  }
  accept(token, ctx = LexContext.Normal) {
    if (this.tok.peek(ctx).token === token)
      return this.tok.next(ctx);
    return null;
  }
  acceptEnd(token, ctx = LexContext.Normal) {
    if (this.tok.peek(ctx).token === token)
      return this.tok.next(ctx).end;
    return -1;
  }
  skipNewlines(ctx = LexContext.Normal) {
    while (this.tok.peek(ctx).token === Token.Newline)
      this.tok.next(ctx);
  }
  makeStatement(command, redirects) {
    const end = redirects.length > 0 ? redirects[redirects.length - 1].end : command.end;
    return {
      type: "Statement",
      pos: command.pos,
      end,
      command,
      background: void 0,
      redirects: ownEmpty(redirects)
    };
  }
  // list := and_or ((';' | '&' | NEWLINE) and_or)* [';' | '&' | NEWLINE]
  list() {
    const commands = [];
    this.skipNewlines(LexContext.CommandStart);
    let t = this.tok.peek(LexContext.CommandStart).token;
    if (listTerminators[t] || !commandStarts[t])
      return commands;
    const first = this.andOr();
    if (first) {
      const redirects = this._redirects;
      this._redirects = EMPTY_REDIRECTS;
      commands.push(this.makeStatement(first, redirects));
    }
    for (; ; ) {
      t = this.tok.peekFollow(compoundClosers).token;
      if (t !== Token.Semi && t !== Token.Newline && t !== Token.Amp)
        break;
      const isBackground = t === Token.Amp;
      const sepEnd = this.tok.next(LexContext.Normal).end;
      if (isBackground) {
        const stmt = commands[commands.length - 1];
        stmt.background = true;
        stmt.end = sepEnd;
      }
      this.skipNewlines(LexContext.CommandStart);
      t = this.tok.peek(LexContext.CommandStart).token;
      if (listTerminators[t] || !commandStarts[t])
        break;
      const node = this.andOr();
      if (node) {
        const redirects = this._redirects;
        this._redirects = EMPTY_REDIRECTS;
        commands.push(this.makeStatement(node, redirects));
      }
    }
    return commands;
  }
  // and_or := pipeline (('&&' | '||') newlines pipeline)*
  andOr() {
    const first = this.pipeline();
    if (!first)
      return null;
    let t = this.tok.peek(LexContext.Normal).token;
    if (t !== Token.And && t !== Token.Or)
      return first;
    let wrappedFirst = first;
    if (this._redirects.length > 0) {
      wrappedFirst = this.makeStatement(first, this._redirects);
      this._redirects = EMPTY_REDIRECTS;
    }
    const commands = [wrappedFirst];
    const operators = [];
    do {
      const operatorToken = this.tok.next(LexContext.Normal);
      const operator = operatorToken.token === Token.And ? "&&" : "||";
      this.skipNewlines(LexContext.CommandStart);
      const next = this.pipeline();
      if (!next) {
        this.error(`expected command after '${operator}'`, operatorToken.end);
        break;
      }
      operators.push(operator);
      commands.push(next);
      t = this.tok.peek(LexContext.Normal).token;
    } while (t === Token.And || t === Token.Or);
    return {
      type: "AndOr",
      pos: first.pos,
      end: commands[commands.length - 1].end,
      commands,
      operators
    };
  }
  wrapCompoundRedirects(node) {
    const redirects = this._redirects;
    this._redirects = EMPTY_REDIRECTS;
    if (redirects.length === 0)
      return node;
    return this.makeStatement(node, redirects);
  }
  // pipeline := ['time' ['-p']] ['!'] command ('|' newlines command)*
  pipeline() {
    let time = false;
    let pipelinePos = 0;
    let prefixEnd = 0;
    const firstToken = this.tok.peek(LexContext.CommandStart);
    if (firstToken.token === Token.Word && firstToken.keywordEligible && firstToken.value === "time") {
      time = true;
      const timeToken = this.tok.next(LexContext.CommandStart);
      pipelinePos = timeToken.pos;
      prefixEnd = timeToken.end;
      const flag = this.tok.peek(LexContext.CommandStart);
      if (flag.token === Token.Word && flag.keywordEligible && flag.value === "-p")
        prefixEnd = this.tok.next(LexContext.CommandStart).end;
    }
    let negated = false;
    const bang = this.tok.peek(LexContext.CommandStart);
    if (bang.token === Token.Bang) {
      if (!time)
        pipelinePos = bang.pos;
      prefixEnd = this.tok.next(LexContext.CommandStart).end;
      negated = true;
      const repeated = this.tok.peek(LexContext.CommandStart);
      if (repeated.token === Token.Bang) {
        this.error("unexpected token '!'", repeated.pos);
        do {
          prefixEnd = this.tok.next(LexContext.CommandStart).end;
        } while (this.tok.peek(LexContext.CommandStart).token === Token.Bang);
      }
    }
    const first = this.command();
    if (!first) {
      if (time || negated) {
        const pipeline2 = {
          type: "Pipeline",
          pos: pipelinePos,
          end: prefixEnd,
          commands: [],
          negated: negated ? true : void 0,
          operators: [],
          time: time ? true : void 0
        };
        return pipeline2;
      }
      return null;
    }
    if (!time && !negated)
      pipelinePos = first.pos;
    const commands = [first];
    const operators = [];
    let firstRedirects = this._redirects;
    this._redirects = EMPTY_REDIRECTS;
    while (this.tok.peek(LexContext.Normal).token === Token.Pipe) {
      if (commands.length === 1 && firstRedirects.length > 0) {
        commands[0] = this.makeStatement(first, firstRedirects);
        firstRedirects = [];
      }
      const pipeToken = this.tok.next(LexContext.Normal);
      const operator = pipeToken.value === "|&" ? "|&" : "|";
      this.skipNewlines(LexContext.CommandStart);
      const cmd = this.command();
      if (!cmd) {
        this.error(`expected command after '${operator}'`, pipeToken.end);
        break;
      }
      operators.push(operator);
      commands.push(this.wrapCompoundRedirects(cmd));
    }
    if (commands.length === 1 && !negated && !time) {
      this._redirects = firstRedirects;
      return commands[0];
    }
    if (firstRedirects.length > 0) {
      commands[0] = this.makeStatement(first, firstRedirects);
    }
    const pipeline = {
      type: "Pipeline",
      pos: pipelinePos,
      end: commands[commands.length - 1].end,
      commands,
      negated: negated ? true : void 0,
      operators,
      time: time ? true : void 0
    };
    return pipeline;
  }
  // command := compound_command | function_def | simple_command
  command() {
    switch (this.tok.peek(LexContext.CommandStart).token) {
      case Token.LParen:
        return this.subshell();
      case Token.LBrace:
        return this.braceGroup();
      case Token.If:
        return this.ifClause();
      case Token.For:
        return this.forClause();
      case Token.While:
        return this.whileClause();
      case Token.Until:
        return this.untilClause();
      case Token.Case:
        return this.caseClause();
      case Token.Function:
        return this.functionDef();
      case Token.Select:
        return this.selectClause();
      case Token.DblLBracket:
        return this.testCommand();
      case Token.ArithCmd:
        return this.arithCommand();
      case Token.Coproc:
        return this.coprocCommand();
      case Token.Word:
      case Token.Assignment:
      case Token.Redirect:
        return this.simpleCommandOrFunction();
      default:
        return null;
    }
  }
  collectTrailingRedirects() {
    let redirects = EMPTY_REDIRECTS;
    while (this.tok.peekFollow(compoundClosers).token === Token.Redirect) {
      redirects = this.collectRedirect(redirects, LexContext.Normal);
    }
    return redirects;
  }
  // arith_command := (( expr ))
  arithCommand() {
    const tok = this.tok.next(LexContext.CommandStart);
    this._redirects = this.collectTrailingRedirects();
    return new ArithmeticCommandImpl(tok.pos, tok.end, tok.value, this.source, this.depth);
  }
  // coproc := COPROC [name] command [redirections]
  coprocCommand() {
    const startTok = this.tok.next(LexContext.CommandStart);
    const pos = startTok.pos;
    const startEnd = startTok.end;
    const t = this.tok.peek(LexContext.CommandStart);
    if (t.token !== Token.Word && t.token !== Token.Assignment && t.token !== Token.Redirect) {
      const body2 = this.pipeline() ?? {
        type: "Command",
        pos,
        end: startEnd,
        name: void 0,
        prefix: [],
        suffix: [],
        redirects: []
      };
      const bodyRedirects2 = this._redirects;
      this._redirects = EMPTY_REDIRECTS;
      const redirects2 = this.collectTrailingRedirects();
      const allRedirects2 = [...bodyRedirects2, ...redirects2];
      const end2 = allRedirects2.length > 0 ? allRedirects2[allRedirects2.length - 1].end : body2.end;
      return { type: "Coproc", pos, end: end2, name: void 0, body: body2, redirects: allRedirects2 };
    }
    const tentativeWord = this.toWord(this.tok.next(LexContext.CommandStart));
    const body = this.pipeline();
    if (body === null) {
      const cmd = {
        type: "Command",
        pos: tentativeWord.pos,
        end: tentativeWord.end,
        name: tentativeWord,
        prefix: [],
        suffix: [],
        redirects: []
      };
      const redirects2 = this.collectTrailingRedirects();
      const end2 = redirects2.length > 0 ? redirects2[redirects2.length - 1].end : cmd.end;
      return { type: "Coproc", pos, end: end2, name: void 0, body: cmd, redirects: ownEmpty(redirects2) };
    }
    if (body.type === "Command") {
      const cmd = body;
      if (cmd.name) {
        cmd.suffix = [cmd.name, ...cmd.suffix];
      }
      cmd.name = tentativeWord;
      cmd.pos = tentativeWord.pos;
      const redirects2 = this.collectTrailingRedirects();
      const end2 = redirects2.length > 0 ? redirects2[redirects2.length - 1].end : cmd.end;
      return { type: "Coproc", pos, end: end2, name: void 0, body: cmd, redirects: ownEmpty(redirects2) };
    }
    const bodyRedirects = this._redirects;
    this._redirects = EMPTY_REDIRECTS;
    const redirects = this.collectTrailingRedirects();
    const allRedirects = [...bodyRedirects, ...redirects];
    const end = allRedirects.length > 0 ? allRedirects[allRedirects.length - 1].end : body.end;
    return { type: "Coproc", pos, end, name: tentativeWord, body, redirects: allRedirects };
  }
  // subshell := '(' list ')'
  subshell() {
    return this.subshellBody(this.tok.next(LexContext.CommandStart).pos);
  }
  // Continues a subshell whose '(' the caller already consumed.
  subshellBody(pos) {
    if (this.syntaxDepth === MAX_SYNTAX_NESTING) {
      this.error("maximum subshell nesting depth exceeded", pos);
      const closeEnd2 = this.tok.skipSubshellBody();
      if (closeEnd2 < 0)
        this.error("expected ')' to close subshell", this.tok.getPos());
      const end2 = closeEnd2 >= 0 ? closeEnd2 : pos;
      this._redirects = this.collectTrailingRedirects();
      return { type: "Subshell", pos, end: end2, body: this.makeCompoundList([]) };
    }
    this.syntaxDepth++;
    const commands = this.list();
    this.syntaxDepth--;
    const closeEnd = this.acceptEnd(Token.RParen, LexContext.Normal);
    if (closeEnd < 0)
      this.error("expected ')' to close subshell", this.tok.getPos());
    const end = closeEnd >= 0 ? closeEnd : pos;
    this._redirects = this.collectTrailingRedirects();
    return { type: "Subshell", pos, end, body: this.makeCompoundList(commands) };
  }
  // brace_group := '{' list '}'
  braceGroup() {
    const pos = this.tok.next(LexContext.CommandStart).pos;
    if (this.syntaxDepth === MAX_SYNTAX_NESTING) {
      this.error("maximum brace group nesting depth exceeded", pos);
      const closeEnd2 = this.tok.skipCompoundBody(Token.RBrace);
      if (closeEnd2 < 0)
        this.error("expected '}' to close brace group", this.tok.getPos());
      const end2 = closeEnd2 >= 0 ? closeEnd2 : pos;
      this._redirects = this.collectTrailingRedirects();
      return { type: "BraceGroup", pos, end: end2, body: this.makeCompoundList([]) };
    }
    this.syntaxDepth++;
    const commands = this.list();
    this.syntaxDepth--;
    const closeEnd = this.acceptEnd(Token.RBrace, LexContext.Normal);
    if (closeEnd < 0)
      this.error("expected '}' to close brace group", this.tok.getPos());
    const end = closeEnd >= 0 ? closeEnd : pos;
    this._redirects = this.collectTrailingRedirects();
    return { type: "BraceGroup", pos, end, body: this.makeCompoundList(commands) };
  }
  // if_clause := IF list THEN list (ELIF list THEN list)* [ELSE list] FI
  ifClause() {
    const pos = this.tok.next(LexContext.CommandStart).pos;
    if (this.syntaxDepth === MAX_SYNTAX_NESTING) {
      this.error("maximum if nesting depth exceeded", pos);
      const closeEnd = this.tok.skipCompoundBody(Token.Fi);
      if (closeEnd < 0)
        this.error("expected 'fi' to close 'if'", this.tok.getPos());
      const end2 = closeEnd >= 0 ? closeEnd : pos;
      this._redirects = this.collectTrailingRedirects();
      return {
        type: "If",
        pos,
        end: end2,
        clause: this.makeCompoundList([]),
        then: this.makeCompoundList([]),
        else: void 0
      };
    }
    this.syntaxDepth++;
    let firstBranch;
    let lastBranch;
    let branchPos = pos;
    let clause;
    let then_;
    for (; ; ) {
      clause = this.makeCompoundList(this.list());
      this.skipSemi();
      if (!this.accept(Token.Then, LexContext.CommandStart))
        this.error("expected 'then'", this.tok.getPos());
      then_ = this.makeCompoundList(this.list());
      this.skipSemi();
      const elif = this.accept(Token.Elif, LexContext.CommandStart);
      if (!elif)
        break;
      const branch2 = {
        type: "If",
        pos: branchPos,
        end: branchPos,
        clause,
        then: then_,
        else: void 0
      };
      if (lastBranch)
        lastBranch.else = branch2;
      else
        firstBranch = branch2;
      lastBranch = branch2;
      branchPos = elif.pos;
    }
    let else_;
    let end;
    if (this.accept(Token.Else, LexContext.CommandStart)) {
      else_ = this.makeCompoundList(this.list());
      this.skipSemi();
      const closeEnd = this.acceptEnd(Token.Fi, LexContext.CommandStart);
      if (closeEnd < 0)
        this.error("expected 'fi' to close 'if'", this.tok.getPos());
      end = closeEnd >= 0 ? closeEnd : branchPos;
    } else {
      const closeEnd = this.acceptEnd(Token.Fi, LexContext.CommandStart);
      if (closeEnd < 0)
        this.error("expected 'fi' to close 'if'", this.tok.getPos());
      end = closeEnd >= 0 ? closeEnd : branchPos;
    }
    this.syntaxDepth--;
    this._redirects = this.collectTrailingRedirects();
    const finalBranch = { type: "If", pos: branchPos, end, clause, then: then_, else: else_ };
    if (!firstBranch)
      return finalBranch;
    lastBranch.else = finalBranch;
    let branch = firstBranch;
    while (branch !== finalBranch) {
      branch.end = end;
      branch = branch.else;
    }
    return firstBranch;
  }
  // for_clause := FOR word [IN word* (';'|NL)] DO list DONE
  //            | FOR '((' expr '))' [';'|NL] DO list DONE
  forClause() {
    const pos = this.tok.next(LexContext.CommandStart).pos;
    if (this.tok.peek(LexContext.Normal).token === Token.LParen) {
      return this.cStyleFor(pos);
    }
    const name2 = this.readWord(LexContext.Normal);
    const wordlist = [];
    this.skipNewlines(LexContext.CommandStart);
    if (this.tok.peek(LexContext.CommandStart).token === Token.In) {
      this.tok.next(LexContext.CommandStart);
      while (this.tok.peek(LexContext.Normal).token === Token.Word) {
        wordlist.push(this.readWord(LexContext.Normal));
      }
    }
    this.skipSemi();
    this.skipNewlines(LexContext.CommandStart);
    if (this.tok.peek(LexContext.CommandStart).token === Token.LBrace) {
      const bg = this.braceGroup();
      return { type: "For", pos, end: bg.end, name: name2, wordlist, body: bg.body };
    }
    if (!this.accept(Token.Do, LexContext.CommandStart))
      this.error("expected 'do'", this.tok.getPos());
    if (this.syntaxDepth === MAX_SYNTAX_NESTING) {
      this.error("maximum for nesting depth exceeded", pos);
      const closeEnd2 = this.tok.skipCompoundBody(Token.Done);
      if (closeEnd2 < 0)
        this.error("expected 'done' to close 'for'", this.tok.getPos());
      const end2 = closeEnd2 >= 0 ? closeEnd2 : pos;
      this._redirects = this.collectTrailingRedirects();
      return { type: "For", pos, end: end2, name: name2, wordlist, body: this.makeCompoundList([]) };
    }
    this.syntaxDepth++;
    const body = this.list();
    this.syntaxDepth--;
    this.skipSemi();
    const closeEnd = this.acceptEnd(Token.Done, LexContext.CommandStart);
    if (closeEnd < 0)
      this.error("expected 'done' to close 'for'", this.tok.getPos());
    const end = closeEnd >= 0 ? closeEnd : pos;
    this._redirects = this.collectTrailingRedirects();
    return { type: "For", pos, end, name: name2, wordlist, body: this.makeCompoundList(body) };
  }
  // C-style for: (( expr; expr; expr )) [;|NL] do list done | { list }
  cStyleFor(pos) {
    const [initStr, testStr, updateStr, initPos, testPos, updatePos] = this.tok.readCStyleForExprs();
    if (this.tok.peek(LexContext.CommandStart).token === Token.Semi)
      this.tok.next(LexContext.CommandStart);
    this.skipNewlines(LexContext.CommandStart);
    if (this.tok.peek(LexContext.CommandStart).token === Token.LBrace) {
      const bg = this.braceGroup();
      return new ArithmeticForImpl(pos, bg.end, bg.body, initStr, testStr, updateStr, initPos, testPos, updatePos, this.source, this.depth);
    }
    if (!this.accept(Token.Do, LexContext.CommandStart))
      this.error("expected 'do'", this.tok.getPos());
    if (this.syntaxDepth === MAX_SYNTAX_NESTING) {
      this.error("maximum for nesting depth exceeded", pos);
      const closeEnd2 = this.tok.skipCompoundBody(Token.Done);
      if (closeEnd2 < 0)
        this.error("expected 'done' to close 'for'", this.tok.getPos());
      const end2 = closeEnd2 >= 0 ? closeEnd2 : pos;
      this._redirects = this.collectTrailingRedirects();
      return new ArithmeticForImpl(pos, end2, this.makeCompoundList([]), initStr, testStr, updateStr, initPos, testPos, updatePos, this.source, this.depth);
    }
    this.syntaxDepth++;
    const body = this.list();
    this.syntaxDepth--;
    const closeEnd = this.acceptEnd(Token.Done, LexContext.CommandStart);
    if (closeEnd < 0)
      this.error("expected 'done' to close 'for'", this.tok.getPos());
    const end = closeEnd >= 0 ? closeEnd : pos;
    this._redirects = this.collectTrailingRedirects();
    return new ArithmeticForImpl(pos, end, this.makeCompoundList(body), initStr, testStr, updateStr, initPos, testPos, updatePos, this.source, this.depth);
  }
  whileClause() {
    return this.whileOrUntil("while");
  }
  untilClause() {
    return this.whileOrUntil("until");
  }
  whileOrUntil(kind) {
    const pos = this.tok.next(LexContext.CommandStart).pos;
    if (this.syntaxDepth === MAX_SYNTAX_NESTING) {
      this.error(`maximum ${kind} nesting depth exceeded`, pos);
      const closeEnd2 = this.tok.skipCompoundBody(Token.Done);
      if (closeEnd2 < 0)
        this.error(`expected 'done' to close '${kind}'`, this.tok.getPos());
      const end2 = closeEnd2 >= 0 ? closeEnd2 : pos;
      this._redirects = this.collectTrailingRedirects();
      return {
        type: "While",
        pos,
        end: end2,
        kind,
        clause: this.makeCompoundList([]),
        body: this.makeCompoundList([])
      };
    }
    this.syntaxDepth++;
    const clause = this.makeCompoundList(this.list());
    this.skipSemi();
    if (!this.accept(Token.Do, LexContext.CommandStart))
      this.error("expected 'do'", this.tok.getPos());
    const body = this.list();
    this.skipSemi();
    const closeEnd = this.acceptEnd(Token.Done, LexContext.CommandStart);
    if (closeEnd < 0)
      this.error(`expected 'done' to close '${kind}'`, this.tok.getPos());
    const end = closeEnd >= 0 ? closeEnd : pos;
    this.syntaxDepth--;
    this._redirects = this.collectTrailingRedirects();
    return { type: "While", pos, end, kind, clause, body: this.makeCompoundList(body) };
  }
  // case_clause := CASE word IN (pattern) list (;; | ;& | ;;&) ... ESAC
  caseClause() {
    const pos = this.tok.next(LexContext.CommandStart).pos;
    const word = this.readWord(LexContext.Normal);
    this.skipNewlines(LexContext.CommandStart);
    if (!this.accept(Token.In, LexContext.CommandStart))
      this.error("expected 'in' after 'case' word", this.tok.getPos());
    this.skipNewlines(LexContext.CommandStart);
    if (this.syntaxDepth === MAX_SYNTAX_NESTING) {
      this.error("maximum case nesting depth exceeded", pos);
      const closeEnd2 = this.tok.skipCompoundBody(Token.Esac);
      if (closeEnd2 < 0)
        this.error("expected 'esac' to close 'case'", this.tok.getPos());
      const end2 = closeEnd2 >= 0 ? closeEnd2 : pos;
      this._redirects = this.collectTrailingRedirects();
      return { type: "Case", pos, end: end2, word, items: [] };
    }
    this.syntaxDepth++;
    const items = [];
    let t = this.tok.peek(LexContext.CommandStart).token;
    while (t !== Token.Esac && t !== Token.EOF) {
      const itemPos = this.tok.peek(LexContext.Normal).pos;
      this.accept(Token.LParen, LexContext.Normal);
      const pattern = [];
      t = this.tok.peek(LexContext.Normal).token;
      while (t !== Token.RParen && t !== Token.EOF) {
        if (t !== Token.Pipe)
          pattern.push(this.toWord(this.tok.next(LexContext.Normal)));
        else
          this.tok.next(LexContext.Normal);
        t = this.tok.peek(LexContext.Normal).token;
      }
      const rparenEnd = this.acceptEnd(Token.RParen, LexContext.Normal);
      const cmds = this.list();
      let itemEnd = rparenEnd >= 0 ? rparenEnd : itemPos;
      if (cmds.length > 0)
        itemEnd = cmds[cmds.length - 1].end;
      const item = {
        type: "CaseItem",
        pos: itemPos,
        end: itemEnd,
        pattern,
        body: this.makeCompoundList(cmds),
        terminator: void 0
      };
      t = this.tok.peek(LexContext.CommandStart).token;
      if (t === Token.DoubleSemi || t === Token.SemiAmp || t === Token.DoubleSemiAmp) {
        const termTok = this.tok.next(LexContext.CommandStart);
        item.terminator = CASE_TERMINATORS[termTok.token];
        item.end = termTok.end;
      }
      items.push(item);
      this.skipNewlines(LexContext.CommandStart);
      t = this.tok.peek(LexContext.CommandStart).token;
    }
    const closeEnd = this.acceptEnd(Token.Esac, LexContext.CommandStart);
    if (closeEnd < 0)
      this.error("expected 'esac' to close 'case'", this.tok.getPos());
    const end = closeEnd >= 0 ? closeEnd : pos;
    this.syntaxDepth--;
    this._redirects = this.collectTrailingRedirects();
    return { type: "Case", pos, end, word, items };
  }
  // select_clause := SELECT word [IN word* (';'|NL)] DO list DONE
  selectClause() {
    const pos = this.tok.next(LexContext.CommandStart).pos;
    const name2 = this.readWord(LexContext.Normal);
    const wordlist = [];
    this.skipNewlines(LexContext.CommandStart);
    if (this.tok.peek(LexContext.CommandStart).token === Token.In) {
      this.tok.next(LexContext.CommandStart);
      while (this.tok.peek(LexContext.Normal).token === Token.Word) {
        wordlist.push(this.readWord(LexContext.Normal));
      }
    }
    this.skipSemi();
    this.skipNewlines(LexContext.CommandStart);
    if (this.tok.peek(LexContext.CommandStart).token === Token.LBrace) {
      const bg = this.braceGroup();
      return { type: "Select", pos, end: bg.end, name: name2, wordlist, body: bg.body };
    }
    if (!this.accept(Token.Do, LexContext.CommandStart))
      this.error("expected 'do'", this.tok.getPos());
    if (this.syntaxDepth === MAX_SYNTAX_NESTING) {
      this.error("maximum select nesting depth exceeded", pos);
      const closeEnd2 = this.tok.skipCompoundBody(Token.Done);
      if (closeEnd2 < 0)
        this.error("expected 'done' to close 'select'", this.tok.getPos());
      const end2 = closeEnd2 >= 0 ? closeEnd2 : pos;
      this._redirects = this.collectTrailingRedirects();
      return { type: "Select", pos, end: end2, name: name2, wordlist, body: this.makeCompoundList([]) };
    }
    this.syntaxDepth++;
    const body = this.list();
    this.syntaxDepth--;
    this.skipSemi();
    const closeEnd = this.acceptEnd(Token.Done, LexContext.CommandStart);
    if (closeEnd < 0)
      this.error("expected 'done' to close 'select'", this.tok.getPos());
    const end = closeEnd >= 0 ? closeEnd : pos;
    this._redirects = this.collectTrailingRedirects();
    return { type: "Select", pos, end, name: name2, wordlist, body: this.makeCompoundList(body) };
  }
  // test_command := [[ test_expr ]]
  testCommand() {
    const pos = this.tok.next(LexContext.CommandStart).pos;
    const expr = this.parseTestOr();
    const closeEnd = this.acceptEnd(Token.DblRBracket, LexContext.TestMode);
    if (closeEnd < 0)
      this.error("expected ']]' to close '[['", this.tok.getPos());
    const end = closeEnd >= 0 ? closeEnd : pos;
    this._redirects = this.collectTrailingRedirects();
    return { type: "TestCommand", pos, end, expression: expr };
  }
  // test_or := test_and ('||' test_and)*
  parseTestOr() {
    let left = this.parseTestAnd();
    while (this.tok.peek(LexContext.TestMode).token === Token.Or) {
      this.tok.next(LexContext.TestMode);
      const right = this.parseTestAnd();
      left = {
        type: "TestLogical",
        pos: left.pos,
        end: right.end,
        operator: "||",
        left,
        right
      };
    }
    return left;
  }
  // test_and := test_not ('&&' test_not)*
  parseTestAnd() {
    let left = this.parseTestNot();
    while (this.tok.peek(LexContext.TestMode).token === Token.And) {
      this.tok.next(LexContext.TestMode);
      const right = this.parseTestNot();
      left = {
        type: "TestLogical",
        pos: left.pos,
        end: right.end,
        operator: "&&",
        left,
        right
      };
    }
    return left;
  }
  // test_not := '!' test_not | test_primary
  parseTestNot() {
    let t = this.tok.peek(LexContext.TestMode);
    if (!isTestNegation(t))
      return this.parseTestPrimary();
    const firstPos = this.tok.next(LexContext.TestMode).pos;
    t = this.tok.peek(LexContext.TestMode);
    if (!isTestNegation(t)) {
      const operand = this.parseTestPrimary();
      return { type: "TestNot", pos: firstPos, end: operand.end, operand };
    }
    const positions = [firstPos];
    while (isTestNegation(t)) {
      positions.push(this.tok.next(LexContext.TestMode).pos);
      t = this.tok.peek(LexContext.TestMode);
    }
    let expression = this.parseTestPrimary();
    for (let i = positions.length - 1; i >= 0; i--) {
      expression = {
        type: "TestNot",
        pos: positions[i],
        end: expression.end,
        operand: expression
      };
    }
    return expression;
  }
  // test_primary := '(' test_or ')' | unary_op word | word binary_op word | word
  parseTestPrimary() {
    if (this.tok.peek(LexContext.TestMode).token === Token.LParen) {
      const openPos = this.tok.next(LexContext.TestMode).pos;
      if (this.syntaxDepth === MAX_SYNTAX_NESTING) {
        this.error("maximum test group nesting depth exceeded", openPos);
        const closeEnd2 = this.tok.skipTestGroup();
        if (closeEnd2 < 0)
          this.error("expected ')' to close test group", this.tok.getPos());
        const end2 = closeEnd2 >= 0 ? closeEnd2 : openPos;
        const operand = new WordImpl("", openPos, openPos, this.source, void 0, this.depth);
        const expression = {
          type: "TestUnary",
          pos: openPos,
          end: openPos,
          operator: "-n",
          operand
        };
        return { type: "TestGroup", pos: openPos, end: end2, expression };
      }
      this.syntaxDepth++;
      const expr = this.parseTestOr();
      this.syntaxDepth--;
      const closeEnd = this.acceptEnd(Token.RParen, LexContext.TestMode);
      if (closeEnd < 0)
        this.error("expected ')' to close test group", this.tok.getPos());
      const end = closeEnd >= 0 ? closeEnd : openPos;
      return { type: "TestGroup", pos: openPos, end, expression: expr };
    }
    const first = this.tok.next(LexContext.TestMode);
    const val = first.value;
    const firstPos = first.pos;
    const firstEnd = first.end;
    if (first.keywordEligible && UNARY_TEST_OPS[val] === 1) {
      const nt2 = this.tok.peek(LexContext.TestMode).token;
      if (nt2 === Token.Word) {
        const operand = this.readWord(LexContext.TestMode);
        return {
          type: "TestUnary",
          pos: firstPos,
          end: operand.end,
          operator: val,
          operand
        };
      }
    }
    const nt = this.tok.peek(LexContext.TestMode);
    if (nt.token === Token.Word && nt.keywordEligible && BINARY_TEST_OPS[nt.value] === 1) {
      const op = this.tok.next(LexContext.TestMode).value;
      let right;
      if (op === "=~") {
        const token = this.tok.readTestRegexWord();
        right = new WordImpl(this.source.slice(token.pos, token.end), token.pos, token.end, this.source, computeEmbeddedWordParts, this.depth);
      } else {
        right = this.readWord(LexContext.TestMode);
      }
      const left = this.toWordFromPosEnd(first, firstPos, firstEnd);
      return {
        type: "TestBinary",
        pos: firstPos,
        end: right.end,
        operator: op,
        left,
        right
      };
    }
    const w = this.toWordFromPosEnd(first, firstPos, firstEnd);
    return { type: "TestUnary", pos: firstPos, end: w.end, operator: "-n", operand: w };
  }
  // function_def with 'function' keyword
  functionDef() {
    const pos = this.tok.next(LexContext.CommandStart).pos;
    const name2 = this.readWord(LexContext.Normal);
    let body;
    if (this.tok.peek(LexContext.CommandStart).token === Token.LParen) {
      const openPos = this.tok.next(LexContext.CommandStart).pos;
      if (this.tok.peek(LexContext.CommandStart).token === Token.RParen) {
        this.tok.next(LexContext.CommandStart);
        this.skipNewlines(LexContext.CommandStart);
        body = this.commandAsBody();
      } else {
        body = this.subshellBody(openPos);
      }
    } else {
      this.skipNewlines(LexContext.CommandStart);
      body = this.commandAsBody();
    }
    const redirects = this._redirects;
    this._redirects = EMPTY_REDIRECTS;
    const end = redirects.length > 0 ? redirects[redirects.length - 1].end : body.end;
    return { type: "Function", pos, end, name: name2, body, redirects: ownEmpty(redirects) };
  }
  // simple_command or function_def (word '(' ')' body)
  simpleCommandOrFunction() {
    const prefix = [];
    let redirects = [];
    let cmdPos = this.tok.peek(LexContext.CommandStart).pos;
    let lastEnd = cmdPos;
    let ctx = LexContext.CommandStart;
    for (; ; ) {
      const t = this.tok.peek(ctx).token;
      if (t === Token.Assignment) {
        const assignment = this.tok.next(ctx);
        lastEnd = assignment.end;
        prefix.push(this.parseAssignment(assignment));
      } else if (t === Token.Redirect) {
        redirects = this.collectRedirect(redirects, ctx);
        lastEnd = redirects[redirects.length - 1].end;
      } else {
        break;
      }
      ctx = LexContext.CommandPrefix;
    }
    if (this.tok.peek(LexContext.Normal).token !== Token.Word) {
      return {
        type: "Command",
        pos: cmdPos,
        end: lastEnd,
        name: void 0,
        prefix,
        suffix: [],
        redirects
      };
    }
    const name2 = this.readWord(LexContext.Normal);
    lastEnd = name2.end;
    if (this.tok.peek(LexContext.Normal).token === Token.LParen) {
      this.tok.next(LexContext.Normal);
      if (this.tok.peek(LexContext.Normal).token === Token.RParen) {
        this.tok.next(LexContext.Normal);
        this.skipNewlines(LexContext.CommandStart);
        const body = this.commandAsBody();
        const bodyRedirects = this._redirects;
        this._redirects = EMPTY_REDIRECTS;
        const end = bodyRedirects.length > 0 ? bodyRedirects[bodyRedirects.length - 1].end : body.end;
        return {
          type: "Function",
          pos: name2.pos,
          end,
          name: name2,
          body,
          redirects: ownEmpty(bodyRedirects)
        };
      }
    }
    const suffix = [];
    for (; ; ) {
      const st = this.tok.peek(LexContext.Normal).token;
      if (st === Token.Word || st === Token.Assignment) {
        const w = this.readWord(LexContext.Normal);
        suffix.push(w);
        lastEnd = w.end;
      } else if (st === Token.Redirect) {
        redirects = this.collectRedirect(redirects, LexContext.Normal);
        lastEnd = redirects[redirects.length - 1].end;
      } else {
        break;
      }
    }
    return {
      type: "Command",
      pos: cmdPos,
      end: lastEnd,
      name: name2,
      prefix,
      suffix,
      redirects
    };
  }
  collectRedirect(redirects, ctx) {
    if (redirects === EMPTY_REDIRECTS)
      redirects = [];
    const t = this.tok.next(ctx);
    const tPos = t.pos;
    const tEnd = t.end;
    const r = {
      pos: tPos,
      end: tEnd,
      operator: REDIRECT_OPS[t.value] ?? ">",
      target: void 0,
      fileDescriptor: t.fileDescriptor,
      variableName: t.variableName,
      content: t.content,
      heredocQuoted: void 0,
      body: void 0
    };
    if (t.targetEnd > t.targetPos) {
      const heredoc = t.value === "<<" || t.value === "<<-";
      const resolver = heredoc ? heredocDelimiterParts(t.content ?? "") : void 0;
      const text = this.source.slice(t.targetPos, t.targetEnd);
      r.target = new WordImpl(text, t.targetPos, t.targetEnd, this.source, resolver, this.depth);
    } else {
      this.error("expected redirect target", t.targetPos);
    }
    if (r.target && (t.value === "<<" || t.value === "<<-"))
      this.tok.registerHereDocTarget(r);
    redirects.push(r);
    return redirects;
  }
  commandAsBody() {
    const t = this.tok.peek(LexContext.CommandStart).token;
    if (t === Token.LBrace)
      return this.braceGroup();
    if (t === Token.LParen)
      return this.subshell();
    const cmd = this.command();
    const p = this.tok.getPos();
    return cmd ?? { type: "CompoundList", pos: p, end: p, commands: [] };
  }
  readWord(ctx) {
    return this.toWord(this.tok.next(ctx));
  }
  toWord(tok) {
    const text = tok.raw ? tok.value : this.source.slice(tok.pos, tok.end);
    return new WordImpl(text, tok.pos, tok.end, this.source, void 0, this.depth);
  }
  toWordFromPosEnd(tok, pos, end) {
    const text = tok.raw && tok.pos === pos && tok.end === end ? tok.value : this.source.slice(pos, end);
    return new WordImpl(text, pos, end, this.source, void 0, this.depth);
  }
  parseAssignment(tok) {
    const text = tok.raw ? tok.value : this.source.slice(tok.pos, tok.end);
    const tokPos = tok.pos;
    const tokEnd = tok.end;
    const result = {
      type: "Assignment",
      pos: tokPos,
      end: tokEnd,
      text,
      name: void 0,
      value: void 0,
      append: void 0,
      index: void 0,
      indexParts: void 0,
      array: void 0
    };
    const eqIdx = tok.assignmentOperatorPos - tokPos;
    if (eqIdx <= 0)
      return result;
    let nameEnd = eqIdx;
    let append = false;
    let index;
    let appendPos = eqIdx;
    while (appendPos >= 2 && text.charCodeAt(appendPos - 2) === 92 && text.charCodeAt(appendPos - 1) === 10)
      appendPos -= 2;
    if (text.charCodeAt(appendPos - 1) === 43) {
      append = true;
      nameEnd = appendPos - 1;
    }
    const bracketIdx = text.indexOf("[");
    if (bracketIdx > 0 && bracketIdx < nameEnd) {
      const rbracketIdx = text.lastIndexOf("]", eqIdx);
      if (rbracketIdx > bracketIdx) {
        index = text.slice(bracketIdx + 1, rbracketIdx);
        nameEnd = bracketIdx;
      }
    }
    const rawName = text.slice(0, nameEnd);
    const name2 = rawName.includes("\\\n") ? rawName.split("\\\n").join("") : rawName;
    result.name = name2;
    if (append)
      result.append = true;
    if (index !== void 0) {
      result.index = index;
      const indexPos = tokPos + bracketIdx + 1;
      const indexEnd = indexPos + index.length;
      if (hasEmbeddedWordStructure(this.source, indexPos, indexEnd)) {
        const indexWord = new WordImpl(index, indexPos, indexEnd, this.source, computeEmbeddedWordParts, this.depth);
        Object.defineProperty(result, "indexParts", {
          configurable: true,
          enumerable: true,
          get: () => indexWord.parts,
          set: (value) => {
            indexWord.parts = value;
          }
        });
      }
    }
    const valStart = eqIdx + 1;
    const valueStart = tokPos + valStart;
    if (valStart < text.length && text.charCodeAt(valStart) === 40 && text.charCodeAt(text.length - 1) === 41) {
      const elements = this.parseArrayElements(valueStart + 1, tokEnd - 1);
      result.array = elements;
    } else {
      result.value = new WordImpl(text.slice(valStart), valueStart, tokEnd, this.source, void 0, this.depth);
    }
    return result;
  }
  parseArrayElements(start, end) {
    const subTok = new Lexer2(this.source, start, end);
    const elements = [];
    while (subTok.peek(LexContext.Normal).token !== Token.EOF) {
      if (subTok.peek(LexContext.Normal).token === Token.Newline) {
        subTok.next(LexContext.Normal);
        continue;
      }
      const t = subTok.next(LexContext.Normal);
      if (t.token === Token.Word || t.token === Token.Assignment) {
        const text = t.raw ? t.value : this.source.slice(t.pos, t.end);
        elements.push(new WordImpl(text, t.pos, t.end, this.source, void 0, this.depth));
      }
    }
    return elements;
  }
  makeCompoundList(commands) {
    const p = this.tok.getPos();
    const pos = commands.length > 0 ? commands[0].pos : p;
    const end = commands.length > 0 ? commands[commands.length - 1].end : p;
    return { type: "CompoundList", pos, end, commands };
  }
};

// plugins/tool-render/src/bash-diagram.ts
var BASH_DIAGRAM_MAX_COMMAND = 2e4;
var BASH_DIAGRAM_CACHE_LIMIT = 200;
function isHeredocOperator(op) {
  return op === "<<" || op === "<<-";
}
function countNewlines(text) {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) n++;
  }
  return n;
}
function carveHeredocs(command, statementEnd, heredocs) {
  const firstNewline = command.indexOf("\n", statementEnd);
  if (firstNewline === -1) return null;
  let cursor = firstNewline + 1;
  const carved = [];
  for (const h of heredocs) {
    if (typeof h.delimiter !== "string") return null;
    const bodyStart = cursor;
    let found = false;
    while (cursor <= command.length) {
      const eol = command.indexOf("\n", cursor);
      const lineEnd = eol === -1 ? command.length : eol;
      let line = command.slice(cursor, lineEnd);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      const compared = h.operator === "<<-" ? line.replace(/^\t+/, "") : line;
      if (compared === h.delimiter) {
        carved.push({
          body: command.slice(bodyStart, cursor),
          delimiterLine: command.slice(cursor, lineEnd),
          newline: eol === -1 ? "" : "\n"
        });
        cursor = eol === -1 ? command.length : eol + 1;
        found = true;
        break;
      }
      if (eol === -1) break;
      cursor = eol + 1;
    }
    if (!found) return null;
  }
  return carved;
}
function classifyInner(inner) {
  if (inner === null || typeof inner !== "object") return null;
  if (inner.type === "Pipeline") {
    if (!Array.isArray(inner.commands) || inner.commands.length === 0) return null;
    if (inner.commands.length === 1) {
      const only = inner.commands[0];
      if (only === null || typeof only !== "object" || only.type !== "Command") return null;
      return {
        kind: "command",
        negated: inner.negated === true,
        timed: inner.time === true,
        rawStages: [only],
        operators: []
      };
    }
    if (!inner.commands.every((s) => s !== null && typeof s === "object" && s.type === "Command")) {
      return null;
    }
    const rawStages = inner.commands;
    const operators = Array.isArray(inner.operators) ? inner.operators : [];
    if (operators.length !== rawStages.length - 1) return null;
    for (const op of operators) {
      if (op !== "|" && op !== "|&") return null;
    }
    return {
      kind: "pipeline",
      negated: inner.negated === true,
      timed: inner.time === true,
      rawStages,
      operators
    };
  }
  if (inner.type === "Command") {
    return { kind: "command", negated: false, timed: false, rawStages: [inner], operators: [] };
  }
  return null;
}
function redirectSpanKey(r) {
  if (r === null || typeof r !== "object") return null;
  if (typeof r.pos !== "number" || typeof r.end !== "number") return null;
  return r.pos + ":" + r.end;
}
function pushRedirectOnce(target, r) {
  if (target.includes(r)) return;
  const key = redirectSpanKey(r);
  if (key !== null) {
    for (const existing of target) {
      if (redirectSpanKey(existing) === key) return;
    }
  }
  target.push(r);
}
function attributeStatementRedirects(statement, rawStages) {
  const statementRedirects = Array.isArray(statement.redirects) ? statement.redirects : [];
  const lists = rawStages.map((s) => Array.isArray(s.redirects) ? s.redirects.slice() : []);
  for (const r of statementRedirects) {
    pushRedirectOnce(lists[lists.length - 1], r);
  }
  return lists;
}
function collectHeredocSpecs(stageRedirectLists) {
  const specs = [];
  let usable = true;
  stageRedirectLists.forEach((list, stage) => {
    list.forEach((r, index) => {
      if (r === null || typeof r !== "object" || typeof r.operator !== "string") return;
      if (!isHeredocOperator(r.operator)) return;
      if (r.target === null || typeof r.target !== "object" || typeof r.target.value !== "string") {
        usable = false;
        return;
      }
      specs.push({
        operator: r.operator,
        delimiter: r.target.value,
        redirectPos: typeof r.pos === "number" ? r.pos : null,
        stage,
        index
      });
    });
  });
  if (!usable) return { specs: [], usable: false };
  specs.sort((a, b) => (a.redirectPos ?? 0) - (b.redirectPos ?? 0));
  return { specs, usable: true };
}
function buildTrailing(command, statementEnd, specs) {
  const trailing = [];
  if (specs.length > 0) {
    const carved = carveHeredocs(
      command,
      statementEnd,
      specs.map((h) => ({ operator: h.operator, delimiter: h.delimiter }))
    );
    if (carved === null || carved.length !== specs.length) return null;
    const firstNewline = command.indexOf("\n", statementEnd);
    let cursor = firstNewline + 1;
    trailing.push({ kind: "gap", text: command.slice(statementEnd, cursor) });
    for (const c2 of carved) {
      trailing.push({ kind: "heredoc", body: c2.body, delimiterLine: c2.delimiterLine, newline: c2.newline });
      cursor += c2.body.length + c2.delimiterLine.length + c2.newline.length;
    }
    trailing.push({ kind: "gap", text: command.slice(cursor) });
    return { trailing, carves: carved };
  }
  trailing.push({ kind: "gap", text: command.slice(statementEnd) });
  return { trailing, carves: [] };
}
function buildStageModels(command, rawStages, stageRedirectLists, heredocByKey) {
  return rawStages.map((s, stageIdx) => {
    const list = stageRedirectLists[stageIdx];
    const spans = [];
    for (const r of list) {
      if (r === null || typeof r !== "object") continue;
      if (typeof r.pos !== "number" || typeof r.end !== "number") continue;
      const start = Math.max(s.pos, Math.min(r.pos, s.end));
      const end = Math.max(s.pos, Math.min(r.end, s.end));
      if (end > start) spans.push({ start, end });
    }
    spans.sort((a, b) => a.start - b.start);
    let words = "";
    let cursor = s.pos;
    for (const span of spans) {
      if (span.start > cursor) words += command.slice(cursor, span.start) + " ";
      cursor = Math.max(cursor, span.end);
    }
    if (s.end > cursor) words += command.slice(cursor, s.end);
    words = words.split(/\s+/).filter((w) => w.length > 0).join(" ");
    const redirects = list.map((r, index) => {
      const slice = r !== null && typeof r === "object" && typeof r.pos === "number" && typeof r.end === "number" && r.pos >= 0 && r.end <= command.length && r.end >= r.pos ? command.slice(r.pos, r.end) : "";
      const operator = r !== null && typeof r === "object" && typeof r.operator === "string" ? r.operator : "";
      const carve = heredocByKey.get(stageIdx + ":" + index);
      return {
        slice,
        operator,
        heredoc: carve === void 0 ? null : {
          body: carve.body,
          delimiter: carve.delimiterLine,
          lines: countNewlines(carve.body)
        }
      };
    });
    return {
      slice: command.slice(s.pos, s.end),
      words,
      redirects,
      exitCode: void 0,
      args: parseStageArgs(command, s)
    };
  });
}
function buildDiagram(command) {
  if (typeof command !== "string" || command === "") return null;
  if (command.length > BASH_DIAGRAM_MAX_COMMAND) return null;
  let script;
  try {
    script = parse2(command);
  } catch {
    return null;
  }
  if (script === null || typeof script !== "object") return null;
  if (Array.isArray(script.errors) && script.errors.length > 0) return null;
  if (!Array.isArray(script.commands) || script.commands.length !== 1) return null;
  const statement = script.commands[0];
  if (statement === null || typeof statement !== "object") return null;
  if (statement.background === true) return null;
  const classified = classifyInner(statement.command);
  if (classified === null) {
    return null;
  }
  const { kind, negated, timed, rawStages, operators } = classified;
  const stageRedirectLists = attributeStatementRedirects(statement, rawStages);
  if (kind === "command") {
    const hasRedirects = stageRedirectLists[0].length > 0;
    if (!hasRedirects) return null;
  }
  for (const s of rawStages) {
    if (typeof s.pos !== "number" || typeof s.end !== "number" || s.pos < 0 || s.end > command.length || s.pos > s.end) {
      return null;
    }
  }
  for (let i = 0; i + 1 < rawStages.length; i++) {
    if (rawStages[i].end > rawStages[i + 1].pos) return null;
  }
  if (typeof statement.end !== "number" || statement.end < rawStages[rawStages.length - 1].end) {
    return null;
  }
  const statementEnd = Math.min(statement.end, command.length);
  const leadingGap = command.slice(0, rawStages[0].pos);
  const arrows = [];
  for (let i = 0; i + 1 < rawStages.length; i++) {
    arrows.push({
      operator: operators[i],
      gap: command.slice(rawStages[i].end, rawStages[i + 1].pos)
    });
  }
  const { specs: heredocSpecs, usable: heredocsUsable } = collectHeredocSpecs(stageRedirectLists);
  if (!heredocsUsable) return null;
  const trailed = buildTrailing(command, statementEnd, heredocSpecs);
  if (trailed === null) return null;
  const trailing = trailed.trailing;
  const heredocByKey = /* @__PURE__ */ new Map();
  heredocSpecs.forEach((h, i) => {
    heredocByKey.set(h.stage + ":" + h.index, trailed.carves[i]);
  });
  const stages = buildStageModels(command, rawStages, stageRedirectLists, heredocByKey);
  return { kind, negated, timed, leadingGap, stages, arrows, trailing };
}
var diagramCache = /* @__PURE__ */ new Map();
function getBashDiagram(command) {
  if (diagramCache.has(command)) return diagramCache.get(command) ?? null;
  const built = buildDiagram(command);
  if (diagramCache.size >= BASH_DIAGRAM_CACHE_LIMIT) {
    const oldest = diagramCache.keys().next();
    if (!oldest.done) diagramCache.delete(oldest.value);
  }
  diagramCache.set(command, built);
  return built;
}
function subtreeHasHeredoc(node) {
  if (node === null || typeof node !== "object") return false;
  if (Array.isArray(node)) {
    for (const el of node) {
      if (subtreeHasHeredoc(el)) return true;
    }
    return false;
  }
  if ((node.operator === "<<" || node.operator === "<<-") && "target" in node) return true;
  for (const key of Object.keys(node)) {
    if (subtreeHasHeredoc(node[key])) return true;
  }
  return false;
}
function conditionalOf(inner) {
  if (inner === null || typeof inner !== "object" || inner.type !== "AndOr") return null;
  const seen = /* @__PURE__ */ new Set();
  const ops = Array.isArray(inner.operators) ? inner.operators : [];
  for (const op of ops) {
    if (op === "&&" || op === "||") seen.add(op);
    else seen.add("other");
  }
  if (seen.size === 1) {
    if (seen.has("&&")) return "&&";
    if (seen.has("||")) return "||";
  }
  return "mixed";
}
var ARG_PROFILES = {
  rg: { valueFlags: ["-e", "-C", "-A", "-B", "--context", "--after-context", "--before-context", "-m", "--max-count", "--type", "--replace", "--max-filesize", "--glob", "-g"] },
  ls: { valueFlags: ["-w", "--block-size", "--width", "--context", "--sort", "--format"] },
  node: { valueFlags: ["-e", "-p", "--eval", "--print", "--max-old-space-size", "--stack-size", "--input-type"] },
  git: {
    valueFlags: ["-C", "-c", "--git-dir", "--work-tree", "--exec-path", "--namespace"],
    subcommands: {
      commit: { valueFlags: ["-m", "-F", "--author", "--date", "-C", "--message"] },
      merge: { valueFlags: ["-m", "-F", "-X"] },
      log: { valueFlags: ["-n", "--since", "--until", "--before", "--after", "--format", "--pretty", "-L", "-S", "-G", "-C", "--grep", "--author", "--max-count"] }
    }
  }
};
var ARG_SUBCOMMANDS = {
  git: /* @__PURE__ */ new Set([
    "add",
    "am",
    "archive",
    "bisect",
    "blame",
    "branch",
    "bundle",
    "checkout",
    "cherry-pick",
    "clean",
    "clone",
    "commit",
    "config",
    "describe",
    "diff",
    "fetch",
    "format-patch",
    "gc",
    "grep",
    "init",
    "log",
    "ls-files",
    "merge",
    "mv",
    "notes",
    "pull",
    "push",
    "rebase",
    "remote",
    "reset",
    "restore",
    "revert",
    "rm",
    "show",
    "stash",
    "status",
    "submodule",
    "switch",
    "tag",
    "worktree"
  ])
};
function parseStageArgs(command, stageNode) {
  if (stageNode === null || typeof stageNode !== "object" || stageNode.type !== "Command") return void 0;
  const stagePos = stageNode.pos;
  const stageEnd = stageNode.end;
  if (typeof stagePos !== "number" || typeof stageEnd !== "number") return void 0;
  const name2 = stageNode.name;
  if (name2 === null || typeof name2 !== "object" || typeof name2.value !== "string" || typeof name2.pos !== "number" || typeof name2.end !== "number") return void 0;
  if (name2.value === "" || name2.value.startsWith("-")) return void 0;
  if (Array.isArray(stageNode.prefix) && stageNode.prefix.length > 0) return void 0;
  const suffix = Array.isArray(stageNode.suffix) ? stageNode.suffix : [];
  const words = [{ value: name2.value, pos: name2.pos, end: name2.end }];
  for (const w of suffix) {
    if (w === null || typeof w !== "object") return void 0;
    if (typeof w.value !== "string" || typeof w.pos !== "number" || typeof w.end !== "number" || w.pos < 0 || w.end > command.length || w.end < w.pos) {
      return void 0;
    }
    words.push({ value: w.value, pos: w.pos, end: w.end });
  }
  const profile = ARG_PROFILES[name2.value];
  const subTbl = ARG_SUBCOMMANDS[name2.value];
  const baseFlags = new Set(profile?.valueFlags ?? []);
  const bound = /* @__PURE__ */ new Map();
  function bind(effective2) {
    for (let i = 1; i < words.length; i++) {
      const v = words[i].value;
      if (!v.startsWith("-") || v === "-" || v === "--") continue;
      if (v.startsWith("--") && v.includes("=")) continue;
      if (effective2.has(v) && i + 1 < words.length && !bound.has(i + 1) && words[i + 1].value !== "" && !words[i + 1].value.startsWith("-")) {
        bound.set(i + 1, i);
        i++;
      }
    }
  }
  function findSubcommand() {
    for (let i = 1; i < words.length; i++) {
      if (bound.has(i)) continue;
      const v = words[i].value;
      if (v === "" || v.startsWith("-")) continue;
      if (subTbl !== void 0 && subTbl.has(v)) return i;
    }
    return -1;
  }
  bind(baseFlags);
  let subIndex = findSubcommand();
  if (subIndex >= 0) {
    const subFlags = profile?.subcommands?.[words[subIndex].value]?.valueFlags ?? [];
    bound.clear();
    bind(/* @__PURE__ */ new Set([...baseFlags, ...subFlags]));
    subIndex = findSubcommand();
  }
  const effective = new Set(baseFlags);
  if (subIndex >= 0) {
    for (const f of profile?.subcommands?.[words[subIndex].value]?.valueFlags ?? []) effective.add(f);
  }
  const args = [];
  args.push({ slice: command.slice(words[0].pos, words[0].end), role: "flag" });
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    const v = w.value;
    const slice = command.slice(w.pos, w.end);
    if (v.startsWith("-") && v !== "-" && v !== "--") {
      if (v.startsWith("--") && v.includes("=")) {
        args.push({ slice, role: "flag" });
        continue;
      }
      if (bound.get(i + 1) === i) {
        args.push({ slice, role: "flag" });
        args.push({ slice: command.slice(words[i + 1].pos, words[i + 1].end), role: "value" });
        i++;
        continue;
      }
      args.push({ slice, role: "flag" });
      continue;
    }
    if (bound.has(i)) continue;
    if (i === subIndex) {
      args.push({ slice, role: "subcommand" });
      continue;
    }
    args.push({ slice, role: "positional" });
  }
  return { stageSlice: command.slice(stagePos, stageEnd), args };
}
function prepareStatementUnit(command, st, classified) {
  const { kind, negated, timed, rawStages, operators } = classified;
  for (const s of rawStages) {
    if (typeof s.pos !== "number" || typeof s.end !== "number" || s.pos < 0 || s.end > command.length || s.pos > s.end) {
      return null;
    }
  }
  for (let i = 0; i + 1 < rawStages.length; i++) {
    if (rawStages[i].end > rawStages[i + 1].pos) return null;
  }
  if (rawStages[0].pos < st.pos || rawStages[rawStages.length - 1].end > st.end) return null;
  const stmtEnd = Math.min(st.end, command.length);
  const lists = attributeStatementRedirects(st, rawStages);
  const unit = {
    kind,
    negated,
    timed,
    leadingGap: command.slice(st.pos, rawStages[0].pos),
    stages: [],
    arrows: [],
    groupGap: command.slice(rawStages[rawStages.length - 1].end, stmtEnd),
    conditional: null
  };
  for (let i = 0; i + 1 < rawStages.length; i++) {
    unit.arrows.push({
      operator: operators[i],
      gap: command.slice(rawStages[i].end, rawStages[i + 1].pos)
    });
  }
  const { specs, usable } = collectHeredocSpecs(lists);
  if (!usable) return null;
  return { owner: "", unit, rawStages, lists, specs };
}
function buildChainGroup(command, st) {
  const inner = st.command;
  if (inner === null || typeof inner !== "object" || inner.type !== "AndOr") return null;
  const opsIn = Array.isArray(inner.operators) ? inner.operators : [];
  const cmdsIn = Array.isArray(inner.commands) ? inner.commands : [];
  if (cmdsIn.length < 2 || opsIn.length !== cmdsIn.length - 1) return null;
  for (const op of opsIn) {
    if (op !== "&&" && op !== "||") return null;
  }
  if (typeof st.pos !== "number" || typeof st.end !== "number") return null;
  const stmtEnd = Math.min(st.end, command.length);
  const rows = [];
  const pends = [];
  for (let oi = 0; oi < cmdsIn.length; oi++) {
    const op = cmdsIn[oi];
    if (op === null || typeof op !== "object") return null;
    const classified = classifyInner(op);
    if (classified === null) return null;
    const pen = prepareStatementUnit(command, op, classified);
    if (pen === null) return null;
    pen.unit.conditional = oi > 0 ? opsIn[oi - 1] : null;
    pen.owner = `_chain_${oi}`;
    rows.push(pen.unit);
    pends.push(pen);
  }
  for (const pen of pends) {
    if (pen.specs.length > 0) return null;
  }
  const statementRedirects = Array.isArray(st.redirects) ? st.redirects : [];
  const lastLists = pends[pends.length - 1].lists;
  for (const r of statementRedirects) pushRedirectOnce(lastLists[lastLists.length - 1], r);
  for (let i = 0; i < cmdsIn.length; i++) {
    const op = cmdsIn[i];
    if (typeof op.pos !== "number" || typeof op.end !== "number" || op.pos < 0 || op.end > command.length) return null;
    if (i > 0 && cmdsIn[i - 1].end > op.pos) return null;
  }
  if (cmdsIn[0].pos < st.pos || cmdsIn[cmdsIn.length - 1].end > st.end) return null;
  const lastPen = pends[pends.length - 1];
  const lastStageEnd = lastPen.rawStages[lastPen.rawStages.length - 1].end;
  lastPen.unit.groupGap = command.slice(lastStageEnd, stmtEnd);
  const chain = {
    kind: "chain",
    leadingGap: command.slice(st.pos, cmdsIn[0].pos),
    rows,
    operators: opsIn,
    separators: []
  };
  for (let i = 0; i + 1 < cmdsIn.length; i++) {
    chain.separators.push(command.slice(cmdsIn[i].end, cmdsIn[i + 1].pos));
  }
  return { chain, rows: pends };
}
function buildSequenceDiagram(command) {
  if (typeof command !== "string" || command === "") return null;
  if (command.length > BASH_DIAGRAM_MAX_COMMAND) return null;
  let script;
  try {
    script = parse2(command);
  } catch {
    return null;
  }
  if (script === null || typeof script !== "object") return null;
  if (Array.isArray(script.errors) && script.errors.length > 0) return null;
  if (!Array.isArray(script.commands) || script.commands.length < 2) return null;
  const statements = script.commands;
  for (const st of statements) {
    if (st === null || typeof st !== "object") return null;
    if (st.background === true) return null;
  }
  for (let i = 0; i < statements.length; i++) {
    const st = statements[i];
    if (typeof st.pos !== "number" || typeof st.end !== "number" || st.pos < 0 || st.end > command.length || st.pos > st.end) {
      return null;
    }
    if (i > 0 && statements[i - 1].end > st.pos) return null;
  }
  const lastEnd = Math.min(statements[statements.length - 1].end, command.length);
  const separators = [];
  for (let i = 0; i + 1 < statements.length; i++) {
    const sep = command.slice(statements[i].end, statements[i + 1].pos);
    if (sep.includes("&")) return null;
    separators.push(sep);
  }
  const groups = [];
  const pending = [];
  const allSpecs = [];
  let textGroupHeredocs = false;
  for (let si = 0; si < statements.length; si++) {
    const st = statements[si];
    const innerIsAndOr = st.command !== null && typeof st.command === "object" && st.command.type === "AndOr";
    let chained = null;
    if (innerIsAndOr) {
      chained = buildChainGroup(command, st);
      if (chained !== null) {
        for (const r of chained.rows) {
          for (const spec of r.specs) allSpecs.push({ ...spec, owner: `${si}:${r.owner}` });
          r.owner = `${si}:${r.owner}`;
          pending.push(r);
        }
        groups.push({ kind: "chain", chain: chained.chain });
        continue;
      }
    }
    const classified = classifyInner(st.command);
    if (classified !== null) {
      const pen = prepareStatementUnit(command, st, classified);
      if (pen === null) return null;
      pen.owner = String(si);
      for (const spec of pen.specs) allSpecs.push({ ...spec, owner: pen.owner });
      pending.push(pen);
      groups.push({ kind: "diagram", unit: pen.unit });
    } else {
      if (subtreeHasHeredoc(st)) textGroupHeredocs = true;
      groups.push({
        kind: "text",
        slice: command.slice(st.pos, Math.min(st.end, command.length)),
        conditional: conditionalOf(st.command)
      });
    }
  }
  if (allSpecs.length > 0 && textGroupHeredocs) return null;
  for (const spec of allSpecs) {
    if (spec.redirectPos === null) return null;
    if (command.slice(spec.redirectPos, lastEnd).includes("\n")) return null;
  }
  allSpecs.sort((a, b) => (a.redirectPos ?? 0) - (b.redirectPos ?? 0));
  const trailed = buildTrailing(command, lastEnd, allSpecs);
  if (trailed === null) return null;
  const carveByOwner = /* @__PURE__ */ new Map();
  allSpecs.forEach((h, i) => {
    carveByOwner.set(h.owner + ":" + h.stage + ":" + h.index, trailed.carves[i]);
  });
  for (const p of pending) {
    const sub = /* @__PURE__ */ new Map();
    for (const s of p.specs) {
      const carve = carveByOwner.get(p.owner + ":" + s.stage + ":" + s.index);
      if (carve !== void 0) sub.set(s.stage + ":" + s.index, carve);
    }
    p.unit.stages = buildStageModels(command, p.rawStages, p.lists, sub);
  }
  return {
    kind: "sequence",
    leadingGap: command.slice(0, statements[0].pos),
    statements: groups,
    separators,
    trailing: trailed.trailing
  };
}
var sequenceCache = /* @__PURE__ */ new Map();
function getBashSequenceDiagram(command) {
  if (sequenceCache.has(command)) return sequenceCache.get(command) ?? null;
  const built = buildSequenceDiagram(command);
  if (sequenceCache.size >= BASH_DIAGRAM_CACHE_LIMIT) {
    const oldest = sequenceCache.keys().next();
    if (!oldest.done) sequenceCache.delete(oldest.value);
  }
  sequenceCache.set(command, built);
  return built;
}
function resolveBashTab(command, rewritten) {
  const commandText = typeof command === "string" ? command : null;
  if (commandText === null || rewritten === true) {
    return { drawable: false, showTabs: false, defaultTab: "command", commandText };
  }
  const drawable = getBashDiagram(commandText) !== null || getBashSequenceDiagram(commandText) !== null;
  return drawable ? { drawable: true, showTabs: true, defaultTab: "graph", commandText } : { drawable: false, showTabs: false, defaultTab: "command", commandText };
}

// plugins/tool-render/src/bash-graph/constants.ts
var SCALE = [
  { key: "xs", max: 12, w: 112 },
  { key: "s", max: 28, w: 168 },
  { key: "m", max: 56, w: 232 },
  { key: "l", max: 96, w: 312 },
  { key: "xl", max: 150, w: 400 }
];
function sizeFor(len) {
  for (const s of SCALE) if (len <= s.max) return s;
  return null;
}
function stepFor(nat) {
  for (const s of SCALE) if (nat <= s.w) return s.key;
  return "xl";
}
var NODE_M = 10;
var OP_W = 36;
var PILL_MAX_PX = 220;
var PIPE_GAP = 80;
var GAP = 22;
var ROWGAP = 22;
var IND = 32;
var SHORT_T = 16;
var ARG_T = 80;
var CARD_AVAIL = 716;
function cardAvail() {
  try {
    const g = globalThis;
    const col = g.document ? g.document.querySelector("#col") : null;
    const w = col && col.clientWidth ? col.clientWidth : 748;
    return Math.max(200, w - 32);
  } catch {
    return CARD_AVAIL;
  }
}

// plugins/tool-render/src/bash-graph/measure.ts
function activeDocument() {
  const g = globalThis;
  if (!g.document) throw new Error("bash-graph: no document for measurement");
  return g.document;
}
function naturalWidth(html, sk) {
  if (sk === "op") return OP_W + NODE_M * 2;
  try {
    const meas = activeDocument().querySelector("#measure");
    if (!meas) return 120;
    meas.innerHTML = `<div style="width:max-content;white-space:nowrap">${html}</div>`;
    const nodeEl = meas.firstChild && meas.firstChild.firstChild;
    if (nodeEl && nodeEl.style) nodeEl.style.width = "auto";
    const sw = nodeEl ? nodeEl.scrollWidth || 0 : 0;
    const ow = nodeEl ? nodeEl.offsetWidth || 0 : 0;
    meas.innerHTML = "";
    if (sw > 0) return Math.ceil(sw) + 2 + NODE_M * 2;
    if (ow > 0) return Math.ceil(ow) + NODE_M * 2;
  } catch {
  }
  return 120;
}
function measureH(html, w) {
  const meas = activeDocument().querySelector("#measure");
  if (!meas) return 30;
  meas.innerHTML = `<div class="fobjwrap" style="width:${w}px">${html}</div>`;
  const inner = meas.firstChild;
  const node = inner && inner.firstChild ? inner.firstChild : null;
  if (node && node.style && node.classList && node.classList.contains("prim-node") && !node.classList.contains("op")) {
    node.style.width = Math.max(0, w - NODE_M * 2) + "px";
    node.style.maxWidth = Math.max(0, w - NODE_M * 2) + "px";
  }
  let h = inner ? inner.offsetHeight : 0;
  try {
    if (inner && inner.getBoundingClientRect) {
      const bb = inner.getBoundingClientRect();
      if (bb.height > h) h = bb.height;
    }
  } catch {
  }
  meas.innerHTML = "";
  return Math.max(30, Math.ceil(h));
}
function setNodeWidth(s, step) {
  if (s.sk === "op") return;
  if (s.html.includes('class="prim-node has-chip"'))
    s.html = s.html.replace(
      'class="prim-node has-chip"',
      `class="prim-node has-chip" style="width:${Math.max(0, s.w - NODE_M * 2)}px"`
    );
  else
    s.html = s.html.replace(
      'class="prim-node"',
      `class="prim-node" style="width:${Math.max(0, s.w - NODE_M * 2)}px"`
    );
  s.html = s.html.replace(/data-size="[a-z]+"/, `data-size="${step}"`);
}
function fitWidth(html, wMax, minw, Hw) {
  void html;
  const lo0 = minw || 0;
  if (!(wMax > lo0)) return wMax;
  const hMax = Hw(wMax);
  if (Hw(lo0) <= hMax) return lo0;
  let lo = lo0;
  let hi = wMax;
  while (hi - lo > 4) {
    const mid = (lo + hi) / 2;
    if (Hw(mid) <= hMax) hi = mid;
    else lo = mid;
  }
  const w = Math.ceil(hi);
  return Hw(w) <= hMax ? w : wMax;
}
function fillLevel(nats, budget) {
  const s = [...nats].sort((a, b) => a - b);
  let prev = 0;
  let rem = budget;
  for (let i = 0; i < s.length; i++) {
    const need = (s[i] - prev) * (s.length - i);
    if (rem >= need) {
      rem -= need;
      prev = s[i];
    } else return prev + rem / (s.length - i);
  }
  return prev;
}
function unescapeEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
function specMinW(html) {
  const tx = unescapeEntities;
  const hasIcon = html.includes("data-lucide");
  const chipR = chipReserve(html, tx);
  const chrome = 16 + 2 + (hasIcon ? 20 : 0) + NODE_M * 2 + chipR;
  let mx = 0;
  let m;
  const reSeg = /<span class="seg">(.*?)<\/span>/g;
  while (m = reSeg.exec(html)) mx = Math.max(mx, tx(m[1]).length * 7.2);
  const rePill = /<button class="prim-badge"[^>]*>([\s\S]*?)<\/button>/g;
  while (m = rePill.exec(html)) {
    const pl = tx(m[1].replace(/<[^>]*>/g, ""));
    mx = Math.max(mx, Math.min(pl.length * 7.2, PILL_MAX_PX + (m[0].includes("data-hd") ? 18 : 14)));
  }
  return mx > 0 ? Math.ceil(mx + chrome) : 0;
}
function chipReserve(html, tx) {
  const cm = /<span class="op-chip"[^>]*>([\s\S]*?)<\/span>/.exec(html);
  if (!cm) return 0;
  return Math.min(tx(cm[1]).length * 7.2, 200) + 30;
}

// plugins/tool-render/src/bash-graph/layout.ts
function layoutRow(items) {
  let x = 10;
  const H = Math.max(...items.map((it) => it.h)) + 6;
  const pos = /* @__PURE__ */ new Map();
  for (const it of items) {
    pos.set(it.id, { x: x + it.w / 2, y: H / 2 });
    x += it.w + 22;
  }
  let W = x - 22 + 10;
  const engine = "fallback-chain";
  let minL = Infinity;
  let maxR = -Infinity;
  for (const it of items) {
    const q = pos.get(it.id);
    if (!q) continue;
    minL = Math.min(minL, q.x - it.w / 2);
    maxR = Math.max(maxR, q.x + it.w / 2);
  }
  const sh = -minL;
  if (sh !== 0)
    for (const it of items) {
      const q = pos.get(it.id);
      if (q) q.x += sh;
    }
  W = maxR + sh + NODE_M;
  return { W, H, pos, engine };
}
function enforceGaps(lay, items, gap = GAP) {
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    const p = lay.pos.get(items[i].id);
    if (!p) continue;
    p.x += acc;
    if (i + 1 < items.length) {
      const req = items[i].gapAfter != null ? items[i].gapAfter : gap;
      const nx = (lay.pos.get(items[i + 1].id)?.x ?? 0) + acc;
      const need = p.x + items[i].w / 2 + req + items[i + 1].w / 2;
      if (need > nx + 1e-9) acc += need - nx;
    }
  }
  lay.W += acc;
  return acc;
}
function planRows(items, avail, ind = IND, gap = GAP, rowGap = ROWGAP, H) {
  const n = items.length;
  if (!n) return { rows: [], totalH: 0 };
  const hcache = /* @__PURE__ */ new Map();
  const Hc = (it, w) => {
    const k = it.id + "@" + w;
    let v = hcache.get(k);
    if (v === void 0) {
      v = H(it, w);
      hcache.set(k, v);
    }
    return v;
  };
  function rowCost(js, ie, first) {
    const g = items.slice(js, ie + 1);
    const aw = avail - (first ? 0 : ind);
    const gaps = g.slice(0, -1).reduce((a, s) => a + (s.gapAfter != null ? s.gapAfter : gap), 0) + 20;
    const natSum = g.reduce((a, s) => a + s.nat, 0);
    const widths = /* @__PURE__ */ new Map();
    if (natSum + gaps <= aw) {
      let h2 = 0;
      for (const s of g) {
        widths.set(s.id, s.nat);
        h2 = Math.max(h2, Hc(s, s.nat));
      }
      return { h: h2 + (first ? 6 : 0), widths, scroll: false, left: aw - natSum - (gaps - 20) };
    }
    const inflex = g.filter((s) => !s.flex);
    const flex = g.filter((s) => s.flex);
    const iSum = inflex.reduce((a, s) => a + s.nat, 0);
    const budget = aw - gaps - iSum;
    const L = budget >= 0 && flex.length ? fillLevel(flex.map((s) => s.nat), budget) : -1;
    if (L < 0 || flex.some((s) => Math.min(s.nat, L) < (s.minw || 0))) {
      let h2 = 0;
      for (const s of g) {
        widths.set(s.id, s.nat);
        h2 = Math.max(h2, Hc(s, s.nat));
      }
      const hidden = Math.max(0, natSum + gaps - aw);
      return { h: h2 + (first ? 6 : 0) + hidden, widths, scroll: true, left: 0 };
    }
    let h = 0;
    const rawW = /* @__PURE__ */ new Map();
    for (const s of g) {
      const w = s.flex ? Math.ceil(Math.min(s.nat, L)) : s.nat;
      rawW.set(s.id, w);
      h = Math.max(h, Hc(s, w));
    }
    for (const s of g) {
      widths.set(
        s.id,
        s.flex ? fitWidth(s.html ?? "", rawW.get(s.id) ?? 0, s.minw || 0, (w) => Hc(s, w)) : s.nat
      );
    }
    let used = 0;
    for (const s of g) used += widths.get(s.id) ?? 0;
    return { h: h + (first ? 6 : 0), widths, scroll: false, left: aw - used - (gaps - 20) };
  }
  const INF = 1e15;
  const dp = new Array(n + 1).fill(INF);
  const par = new Array(n + 1).fill(-1);
  const rc = new Array(
    n + 1
  ).fill(null);
  dp[0] = 0;
  for (let i2 = 1; i2 <= n; i2++) {
    for (let j = 0; j < i2; j++) {
      const c2 = rowCost(j, i2 - 1, j === 0);
      const tot = dp[j] + c2.h + (j > 0 ? rowGap : 0);
      if (tot < dp[i2] || tot === dp[i2] && j > par[i2]) {
        dp[i2] = tot;
        par[i2] = j;
        rc[i2] = c2;
      }
    }
  }
  const rows = [];
  let i = n;
  while (i > 0) {
    const j = par[i];
    const c2 = rc[i];
    if (!c2 || j < 0) break;
    const ids = [];
    for (let k = j; k < i; k++) ids.push(items[k].id);
    rows.unshift({
      ids,
      widths: ids.map((id) => c2.widths.get(id) ?? 0),
      left: Math.max(0, Math.round(c2.left)),
      first: j === 0,
      scroll: c2.scroll
    });
    i = j;
  }
  return { rows, totalH: dp[n] };
}

// plugins/tool-render/src/bash-graph/text.ts
function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c2) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c2]
  );
}
function SL(src, a, b) {
  return src.slice(a, b);
}
function segHTML(raw) {
  return String(raw).split("/").map((p) => `<span class="seg">${esc(p)}</span>`).join("/<wbr>");
}
function wbrHTML(s) {
  return esc(s).replace(/\//g, "/<wbr>");
}
function xRunHTML(s, isName) {
  let named = !isName;
  return String(s).split(/(\s+)/g).map((p) => {
    if (p === "" || /^\s+$/.test(p)) return esc(p);
    const inner = segHTML(p);
    if (!named) {
      named = true;
      return `<span class="node-name">${inner}</span>`;
    }
    return inner;
  }).join("");
}
function hlCmd(src, ta, tb, isFirst) {
  const raw = SL(src, ta, tb);
  const toks = [];
  let m;
  const re = /("[^"]*"|'[^']*'|\$[\w{}()#]+|--?[A-Za-z0-9_][\w.-]*|\/[^\s'"`|&;()]*|\b\d[\d.]*\b)/g;
  let last = 0;
  while (m = re.exec(raw)) {
    if (m.index > last) toks.push({ t: "x", s: raw.slice(last, m.index) });
    const s = m[0];
    let cls = "x";
    if (/^['"]/.test(s)) cls = "hl-str";
    else if (/^\$/.test(s)) cls = "hl-var";
    else if (/^-/.test(s)) cls = "hl-flag";
    else if (/^\//.test(s)) cls = "hl-path";
    toks.push({ t: cls, s });
    last = m.index + s.length;
  }
  if (last < raw.length) toks.push({ t: "x", s: raw.slice(last) });
  const first = /^\s*\S+/.exec(raw);
  const nameEnd = first ? first[0].length : 0;
  let html = "";
  let pos = 0;
  for (const tk of toks) {
    const end = pos + tk.s.length;
    if (tk.t === "x") html += xRunHTML(tk.s, pos < nameEnd && isFirst !== false);
    else if (tk.t === "hl-path") html += `<span class="hl-path">${segHTML(tk.s)}</span>`;
    else html += `<span class="${tk.t}">${wbrHTML(tk.s)}</span>`;
    pos = end;
  }
  const nm = (first ? first[0] : "").trim();
  return { html, name: nm };
}
function hlBody(text) {
  return esc(text).replace(
    /(&quot;.*?&quot;|&#39;.*?&#39;|(?<!&)#[^\n]*)/g,
    (s) => s.startsWith("#") ? `<span class="hl-var">${s}</span>` : `<span class="hl-str">${s}</span>`
  );
}
function hlArgBody(text) {
  return `<span class="hl-str">${esc(text)}</span>`;
}
function cmdNameOf(src, t) {
  const raw = SL(src, t.ta, t.tb);
  const words = raw.match(/[^\s'"]+|'[^']*'|"[^"]*"/g) || [];
  for (const w0 of words) {
    const w = w0.trim();
    if (!w) continue;
    if (/^[A-Za-z_]\w*=/.test(w)) continue;
    return w;
  }
  return "?";
}

// plugins/tool-render/src/bash-graph/primitives.ts
var OP_MEANING = {
  "|": "pipe: passes the previous step's output as input to the next step",
  "&&": "and: runs only if the previous step succeeded",
  "||": "or: runs only if the previous step failed",
  ">": "redirect: writes the previous step's output into a file (truncate)",
  ">>": "redirect: appends the previous step's output to a file",
  "2>&1": "merge: folds error output into standard output",
  "2>&1 |": "merge then pipe: folds error output into standard output and passes it on as input to the next step",
  "<<": "heredoc: feeds the collapsed lines below as input \u2014 activate the node to expand"
};
var OP_ICON = {
  "|": "pipe-glyph",
  "&&": "check",
  "||": "circle-plus",
  ">": "file-output",
  ">>": "file-output",
  "2>&1": "merge",
  "2>&1 |": "merge",
  "<<": "scroll-text"
};
var CMD_ICON = {
  git: "git-branch",
  npm: "package",
  node: "hexagon",
  deno: "shell",
  python: "file-code",
  python3: "file-code",
  rg: "search",
  sed: "scissors",
  cd: "folder",
  echo: "megaphone",
  cat: "file-text",
  ls: "list",
  head: "chevrons-up",
  tail: "chevrons-down",
  wc: "hash",
  sort: "arrow-down-wide-narrow",
  uniq: "list-checks",
  export: "upload",
  timeout: "timer"
};
var PIPE_GLYPH_SYMBOL = `<symbol id="pipe-glyph" viewBox="0 0 512 512"><g transform="rotate(-90 256 256)"><path d="m 488.727,232.727 h -93.091 c -12.853,0 -23.273,10.42 -23.273,23.273 v 23.273 H 232.727 V 139.636 H 256 c 12.853,0 23.273,-10.42 23.273,-23.273 V 23.273 C 279.273,10.42 268.853,0 256,0 H 23.273 C 10.42,0 0,10.42 0,23.273 v 93.091 c 0,12.853 10.42,23.273 23.273,23.273 h 23.273 v 219.415 c 0,58.77 47.633,106.403 106.403,106.403 h 219.415 v 23.273 c 0,12.853 10.42,23.273 23.273,23.273 h 93.091 C 501.58,512 512,501.58 512,488.727 V 256 c 0,-12.853 -10.42,-23.273 -23.273,-23.273 z M 46.545,46.545 H 232.727 V 93.09 H 209.454 69.818 46.545 Z m 106.403,372.364 c -33.064,0 -59.857,-26.794 -59.857,-59.857 V 139.636 h 93.091 v 162.909 c 0,12.853 10.42,23.273 23.273,23.273 h 162.909 v 93.091 z m 312.507,46.546 H 418.91 V 442.182 302.545 279.272 h 46.545 z" fill="currentColor"/></g></symbol>`;
function PipeGlyph() {
  return `<span class="prim-icon"><svg aria-hidden="true"><use href="#pipe-glyph"></use></svg></span>`;
}
function Icon(name2, fb, cls) {
  if (name2 === "pipe-glyph") return PipeGlyph();
  return `<span class="prim-icon${cls ? " " + cls : ""}"><i data-lucide="${esc(name2)}" data-fb="${esc(fb || "\u2022")}"></i></span>`;
}
function Badge(text, tone) {
  return `<span class="prim-badge"${tone ? ` data-tone="${tone}"` : ""}>${esc(text)}</span>`;
}
function chipHTML(sym, meaning) {
  const body = sym === "||" ? Icon(OP_ICON["||"], "||") : segHTML(sym);
  return `<span class="op-chip" title="${esc(meaning)}">${body}</span>`;
}
function pipeTagHTML(kind, mx, y) {
  const cfg = kind === "pipe" ? { icon: "pipe-glyph", fb: "|", spin: null, meaning: OP_MEANING["|"] } : { icon: "merge", fb: "2>&1 |", spin: "rot90", meaning: OP_MEANING["2>&1 |"] };
  return `<span class="pipe-tag" data-pipe="${kind}" title="${esc(cfg.meaning)}" style="left:${mx.toFixed(1)}px;top:${y.toFixed(1)}px">${Icon(cfg.icon, cfg.fb, cfg.spin ?? void 0)}</span>`;
}
function Node(o) {
  if (o.op)
    return `<div class="prim-node op" data-size="op" title="${esc(o.meaning ?? "")}">${Icon(o.icon ?? "", o.sym ?? "", o.spin ?? void 0)}<span class="op-sym">${esc(o.sym ?? "")}</span></div>`;
  const main = (o.icon ? Icon(o.icon, o.iconFb ?? "") : "") + `<span class="node-text"><code>${o.bodyHTML ?? ""}</code></span>` + (o.dockHTML ? `<div class="hdock">${o.dockHTML}</div>` : "");
  if (o.chip)
    return `<div class="prim-node has-chip" data-size="${o.size}"${o.name ? ` data-cmd="${esc(o.name)}"` : ""}>` + chipHTML(o.chip.sym, o.chip.meaning) + `<span class="node-main">${main}</span></div>`;
  return `<div class="prim-node" data-size="${o.size}"${o.name ? ` data-cmd="${esc(o.name)}"` : ""}${o.meaning ? ` title="${esc(o.meaning)}"` : ""}>` + main + `</div>`;
}

// plugins/tool-render/src/bash-graph/parse.ts
function countLines(txt) {
  return txt === "" ? 0 : txt.split("\n").length - (txt.endsWith("\n") ? 1 : 0);
}
function parseHeredocOpen(src, i) {
  let j = i + 2;
  let allowTabs = false;
  if (src[j] === "-") {
    allowTabs = true;
    j++;
  }
  while (src[j] === " " || src[j] === "	") j++;
  let qc = null;
  if (src[j] === "'" || src[j] === '"' || src[j] === "\\") {
    qc = src[j];
    j++;
  }
  let delim = "";
  if (qc) {
    while (j < src.length && src[j] !== qc) {
      delim += src[j];
      j++;
    }
    j++;
  } else {
    const m = /^[A-Za-z0-9_]+/.exec(src.slice(j));
    if (!m) return null;
    delim = m[0];
    j += delim.length;
  }
  if (!delim) return null;
  return { delim, allowTabs, end: j };
}
function splitLines2(src) {
  const N = src.length;
  const lines = [];
  let i = 0;
  let start = 0;
  let q = null;
  let depth = 0;
  let esc2 = false;
  let pending = [];
  const flushLine = (nlPos, _isEOF) => {
    const bodyStart = nlPos != null ? nlPos + 1 : N;
    const bodies = [];
    let pos = bodyStart;
    for (const h of pending) {
      let p = pos;
      let found = false;
      while (p <= N) {
        let e = src.indexOf("\n", p);
        if (e === -1) e = N;
        let cmp = src.slice(p, e);
        if (h.allowTabs) cmp = cmp.replace(/^\t+/, "");
        if (cmp === h.delim) {
          const txt = src.slice(pos, p);
          bodies.push({ delim: h.delim, a: pos, b: p, lines: countLines(txt), unterminated: false });
          pos = e + 1;
          found = true;
          break;
        }
        p = e + 1;
      }
      if (!found) {
        const txt = src.slice(pos);
        bodies.push({ delim: h.delim, a: pos, b: N, lines: countLines(txt), unterminated: true });
        pos = N;
      }
    }
    if (src.slice(start, nlPos ?? N).trim() !== "" || bodies.length)
      lines.push({ a: start, b: nlPos ?? N, endExt: pos, heredocs: bodies });
    if (nlPos != null) {
      i = pos;
      start = pos;
    }
    pending = [];
  };
  while (i < N) {
    const c2 = src[i];
    if (esc2) {
      esc2 = false;
      i++;
      continue;
    }
    if (q) {
      if (c2 === "\\" && q !== "'") esc2 = true;
      else if (c2 === q) q = null;
      i++;
      continue;
    }
    if (c2 === "\\") {
      esc2 = true;
      i++;
      continue;
    }
    if (c2 === "'" || c2 === '"' || c2 === "`") {
      q = c2;
      i++;
      continue;
    }
    if (c2 === "$" && (src[i + 1] === "(" || src[i + 1] === "{")) {
      depth++;
      i += 2;
      continue;
    }
    if (c2 === "(" || c2 === "{") {
      depth++;
      i++;
      continue;
    }
    if ((c2 === ")" || c2 === "}") && depth > 0) {
      depth--;
      i++;
      continue;
    }
    if (depth === 0 && c2 === "<" && src[i + 1] === "<") {
      const h = parseHeredocOpen(src, i);
      if (h) {
        pending.push(h);
        i = h.end;
        continue;
      }
      i++;
      continue;
    }
    if (depth === 0 && c2 === "\n") {
      flushLine(i, false);
      continue;
    }
    i++;
  }
  flushLine(null, true);
  return lines;
}
function splitSemis(src, a, b) {
  const parts = [];
  let i = a;
  let start = a;
  let q = null;
  let depth = 0;
  let esc2 = false;
  const push = (e) => {
    if (src.slice(start, e).trim() !== "") parts.push({ a: start, b: e });
    start = e + 1;
  };
  while (i < b) {
    const c2 = src[i];
    if (esc2) {
      esc2 = false;
      i++;
      continue;
    }
    if (q) {
      if (c2 === "\\" && q !== "'") esc2 = true;
      else if (c2 === q) q = null;
      i++;
      continue;
    }
    if (c2 === "\\" && q !== null) {
      esc2 = true;
      i++;
      continue;
    }
    if (c2 === "\\" && q === null) {
      esc2 = true;
      i++;
      continue;
    }
    if (c2 === "'" || c2 === '"' || c2 === "`") {
      q = c2;
      i++;
      continue;
    }
    if (c2 === "$" && (src[i + 1] === "(" || src[i + 1] === "{")) {
      depth++;
      i += 2;
      continue;
    }
    if (c2 === "(" || c2 === "{") {
      depth++;
      i++;
      continue;
    }
    if ((c2 === ")" || c2 === "}") && depth > 0) {
      depth--;
      i++;
      continue;
    }
    if (depth === 0 && c2 === ";") {
      push(i);
      i++;
      continue;
    }
    i++;
  }
  if (src.slice(start, b).trim() !== "") parts.push({ a: start, b });
  return parts;
}
var OPS = ["2>&1", "1>&2", "&>", "<<-", "<<", ">>", "&&", "||", ">", "<", "|"];
function tokenizeParts(src, a, b) {
  const items = [];
  let i = a;
  let cur = null;
  const q_ = { q: null, depth: 0, esc: false };
  const isOp = () => {
    if (q_.q || q_.depth > 0) return null;
    for (const o of OPS) if (src.startsWith(o, i)) return o;
    return null;
  };
  const closeCmd = (e) => {
    if (cur !== null) {
      let ta = cur;
      let tb = e;
      while (ta < tb && /\s/.test(src[ta])) ta++;
      while (tb > ta && /\s/.test(src[tb - 1])) tb--;
      if (tb > ta) items.push({ t: "cmd", a: cur, b: e, ta, tb });
      cur = null;
    }
  };
  while (i < b) {
    const c2 = src[i];
    if (q_.esc) {
      q_.esc = false;
      i++;
      continue;
    }
    if (q_.q) {
      if (c2 === "\\" && q_.q !== "'") q_.esc = true;
      else if (c2 === q_.q) q_.q = null;
      i++;
      continue;
    }
    if (c2 === "\\") {
      q_.esc = true;
      i++;
      continue;
    }
    if (c2 === "'" || c2 === '"' || c2 === "`") {
      if (cur === null) cur = i;
      q_.q = c2;
      i++;
      continue;
    }
    if (c2 === "$" && (src[i + 1] === "(" || src[i + 1] === "{")) {
      if (cur === null) cur = i;
      q_.depth++;
      i += 2;
      continue;
    }
    if (c2 === "(" || c2 === "{") {
      if (cur === null) cur = i;
      q_.depth++;
      i++;
      continue;
    }
    if ((c2 === ")" || c2 === "}") && q_.depth > 0) {
      q_.depth--;
      i++;
      continue;
    }
    if (q_.depth === 0 && /\s/.test(c2)) {
      i++;
      continue;
    }
    const o = isOp();
    if (o) {
      closeCmd(i);
      if (o === ">" || o === ">>" || o === "<") {
        items.push({ t: "op", op: o, a: i, b: i + o.length });
        i += o.length;
        while (i < b && /\s/.test(src[i])) i++;
        const s = i;
        let qq = null;
        let e2 = false;
        while (i < b) {
          const d = src[i];
          if (e2) {
            e2 = false;
            i++;
            continue;
          }
          if (qq) {
            if (d === "\\" && qq !== "'") e2 = true;
            else if (d === qq) qq = null;
            i++;
            continue;
          }
          if (d === "\\" && qq === null) {
            e2 = true;
            i++;
            continue;
          }
          if (d === "'" || d === '"') {
            qq = d;
            i++;
            continue;
          }
          if (/\s/.test(d)) break;
          if ("><|&;".includes(d)) break;
          i++;
        }
        let ta = s;
        let tb = i;
        while (ta < tb && /\s/.test(src[ta])) ta++;
        while (tb > ta && /\s/.test(src[tb - 1])) tb--;
        if (tb > ta) items.push({ t: "target", a: s, b: i, ta, tb });
        continue;
      }
      if (o === "<<" || o === "<<-") {
        items.push({ t: "op", op: "<<", a: i, b: i + o.length });
        i += o.length;
        while (i < b && /\s/.test(src[i])) i++;
        const s = i;
        if (src[i] === "'" || src[i] === '"') {
          const qq = src[i];
          i++;
          while (i < b && src[i] !== qq) i++;
          i++;
        } else while (i < b && /[A-Za-z0-9_]+/.test(src[i]) && !/\s/.test(src[i])) i++;
        items.push({ t: "delim", a: s, b: i, ta: s, tb: i });
        continue;
      }
      items.push({ t: "op", op: o, a: i, b: i + o.length });
      i += o.length;
      continue;
    }
    if (cur === null) cur = i;
    i++;
  }
  closeCmd(b);
  return items;
}
function detectGroup(src, ta, tb) {
  const head = src.slice(ta, Math.min(tb, ta + 24));
  const m = /^\s*(for|while|until|select|if|case)\b/.exec(head);
  if (m) return { kind: "kw", kw: m[1] };
  if (/^\s*\(/.test(head)) return { kind: "subshell" };
  if (/^\s*\{/.test(head)) return { kind: "brace" };
  if (/^\s*\w[\w-]*\s*\(\)/.test(src.slice(ta, tb))) return { kind: "function" };
  return null;
}
function parseTest(raw) {
  const mOpen = /^\s*(\[\[?)\s+/.exec(raw);
  if (!mOpen) return null;
  const dbl = mOpen[1] === "[[";
  const endRe = dbl ? /\s+\]\]\s*$/ : /\s+\]\s*$/;
  if (!endRe.test(raw)) return null;
  const inner = raw.slice(mOpen[0].length).replace(endRe, "");
  const toks = [];
  let i = 0;
  let cur = "";
  let q = null;
  let closed = true;
  const push = () => {
    toks.push(cur);
    cur = "";
  };
  while (i < inner.length) {
    const c2 = inner[i];
    if (q) {
      cur += c2;
      if (c2 === "\\" && q === '"' && i + 1 < inner.length) {
        cur += inner[i + 1];
        i += 2;
        continue;
      }
      if (c2 === q) q = null;
      i++;
      continue;
    }
    if (c2 === "'" || c2 === '"') {
      q = c2;
      cur += c2;
      i++;
      continue;
    }
    if (c2 === "\\") {
      cur += c2;
      if (i + 1 < inner.length) cur += inner[i + 1];
      i += 2;
      continue;
    }
    if (/\s/.test(c2)) {
      if (cur !== "") push();
      i++;
      continue;
    }
    cur += c2;
    i++;
  }
  if (q) closed = false;
  if (cur !== "") push();
  if (!closed || !toks.length) return null;
  const U = {
    "-e": "exists?",
    "-f": "is a file?",
    "-d": "is a directory?",
    "-L": "is a symlink?",
    "-h": "is a symlink?",
    "-r": "is readable?",
    "-w": "is writable?",
    "-x": "is executable?",
    "-s": "is non-empty?",
    "-z": "is empty?",
    "-n": "is non-empty?"
  };
  const BNUM = {
    "-eq": "is numerically equal to",
    "-ne": "is numerically different from",
    "-lt": "is numerically less than",
    "-le": "is numerically at most",
    "-gt": "is numerically greater than",
    "-ge": "is numerically at least"
  };
  if (toks.length === 2 && U[toks[0]]) return { op1: toks[1], mid: U[toks[0]], op2: null };
  if (toks.length === 3) {
    if (!dbl && toks[1] === "=") return { op1: toks[0], mid: "equals", op2: toks[2] };
    if (!dbl && toks[1] === "!=") return { op1: toks[0], mid: "is not equal to", op2: toks[2] };
    if (dbl && (toks[1] === "=" || toks[1] === "=="))
      return { op1: toks[0], mid: "matches the pattern", op2: toks[2] };
    if (dbl && toks[1] === "!=") return { op1: toks[0], mid: "does not match the pattern", op2: toks[2] };
    if (dbl && toks[1] === "=~") return { op1: toks[0], mid: "matches the regex", op2: toks[2] };
    if (BNUM[toks[1]]) return { op1: toks[0], mid: BNUM[toks[1]], op2: toks[2] };
  }
  return null;
}
function testBodyHTML(d) {
  const W = (s) => `<span class="test-word">${esc(s)}</span>`;
  if (d.op2 == null) return `<code>${segHTML(d.op1)}</code> ${W(d.mid)}`;
  return `<code>${segHTML(d.op1)}</code> ${W(d.mid)} <code>${segHTML(d.op2)}</code>${W("?")}`;
}
function extractArgs(src, ta, tb, idx, seq2, argBodies) {
  const spans = [];
  let i = ta;
  let sub = 0;
  while (i < tb) {
    const c2 = src[i];
    if (c2 === "$" && (src[i + 1] === "(" || src[i + 1] === "{")) {
      sub++;
      i += 2;
      continue;
    }
    if ((c2 === ")" || c2 === "}") && sub > 0) {
      sub--;
      i++;
      continue;
    }
    if (sub === 0 && (c2 === "'" || c2 === '"')) {
      const q = c2;
      let j = i + 1;
      let isEsc = false;
      let closed = false;
      while (j < tb) {
        const d = src[j];
        if (isEsc) {
          isEsc = false;
          j++;
          continue;
        }
        if (d === "\\" && q === '"') {
          isEsc = true;
          j++;
          continue;
        }
        if (d === q) {
          closed = true;
          break;
        }
        j++;
      }
      if (closed) {
        if (j - (i + 1) > ARG_T) spans.push({ a: i, b: j + 1 });
        i = j + 1;
        continue;
      }
      i++;
      continue;
    }
    i++;
  }
  let html = "";
  let pos = ta;
  for (const s of spans) {
    const fm = /(--[A-Za-z][\w-]*|-[A-Za-z])(\s*)$/.exec(SL(src, ta, s.a));
    const flag = fm ? fm[1] : null;
    const fa = fm ? s.a - fm[0].length : s.a;
    if (fa > pos) html += hlCmd(src, pos, fa, false).html;
    const bodyText = SL(src, fa, s.b);
    const inner = SL(src, s.a + 1, s.b - 1);
    const lines = countLines(inner) || 1;
    const id = `a${idx}_${seq2.n++}`;
    let front = inner.slice(0, 48);
    if (inner.length > 48) {
      const sp = front.lastIndexOf(" ");
      if (sp > 20) front = front.slice(0, sp);
    }
    const unitLen = s.b - fa;
    const label = (flag ? flag + " " : "") + `'${front}${inner.length > front.length ? "\u2026" : ""}' \xB7 ${unitLen}ch \xB7 ${lines} line${lines > 1 ? "s" : ""}`;
    html += `<button class="prim-badge" data-arg="${id}" aria-expanded="false" title="quoted argument${flag ? ` to ${flag}` : ""} \xB7 verbatim front slice, activate to expand below the panel."><span class="pill-label">${esc(label)}</span></button>`;
    argBodies.push({ id, flag, chars: unitLen, lines, body: bodyText });
    pos = s.b;
  }
  if (pos < tb) html += hlCmd(src, pos, tb, false).html;
  return { html, count: spans.length };
}
function adoptSpans(src, cmds, ub) {
  void src;
  if (ub.status !== "ok" || !ub.nodes.length) return { adopted: 0, total: 0 };
  const like = ub.nodes.filter(
    (n) => /command/i.test(n.type) && !/list|pipeline|script|program|compound|clause|file|word|redirect|expansion/i.test(n.type)
  );
  let adopted = 0;
  for (const c2 of cmds) {
    const hit = like.find((n) => Math.abs(n.pos - c2.ta) <= 2 && n.end <= c2.tb + 2 && n.end > n.pos);
    if (hit) {
      c2.ta = hit.pos;
      c2.tb = Math.min(hit.end, c2.tb);
      adopted++;
    }
  }
  return { adopted, total: like.length };
}

// plugins/tool-render/src/bash-graph/model.ts
function makeBuildContext(idx) {
  return {
    idx,
    hdN: { n: 0 },
    argSeq: { n: 0 },
    argBodies: [],
    adopted: { n: 0 },
    counts: { nCmd: 0, nOp: 0, nRedir: 0, nHd: 0, nArg: 0, nChip: 0, nPipe: 0 },
    maxSeg: { n: 0 }
  };
}
function buildNodes(src, items, line, segKeys, ub, ctx) {
  const { idx, counts, maxSeg } = ctx;
  const { li, si } = segKeys;
  const cmds = items.filter((t) => t.t === "cmd");
  const r = adoptSpans(src, cmds, ub);
  ctx.adopted.n += r.adopted;
  const hdItems = items.filter((t) => t.t === "delim").map((d) => {
    if (d.t !== "delim") return { item: d, hd: null };
    const hb = line.heredocs[hdItemsCount(items, d)];
    if (hb) {
      const owned = {
        ...hb,
        n: ++ctx.hdN.n,
        raw: SL(src, d.ta, d.tb)
      };
      d.hd = owned;
      return { item: d, hd: owned };
    }
    return { item: d, hd: null };
  });
  const nodes = [];
  const skip = /* @__PURE__ */ new Set();
  items.forEach((t, k) => {
    if (t.t === "op" && (t.op === ">" || t.op === ">>" || t.op === "<") && items[k + 1] && items[k + 1].t === "target") {
      const tgt = items[k + 1];
      if (tgt.t !== "target") return;
      skip.add(k + 1);
      t.merge = { kind: "redir", text: SL(src, tgt.ta, tgt.tb) };
    } else if (t.t === "op" && t.op === "<<" && items[k + 1] && items[k + 1].t === "delim" && items[k + 1].hd) {
      const d = items[k + 1];
      skip.add(k + 1);
      if (d.hd) d.hd.consumed = true;
      t.merge = { kind: "heredoc", hd: d.hd };
    }
  });
  items.forEach((t, k) => {
    if (skip.has(k)) return;
    if (t.t === "cmd") {
      const ex = extractArgs(src, t.ta, t.tb, idx, ctx.argSeq, ctx.argBodies);
      counts.nArg += ex.count;
      const len = t.tb - t.ta;
      if (len > maxSeg.n) maxSeg.n = len;
      const sz = sizeFor(len);
      counts.nCmd++;
      const nm = cmdNameOf(src, t);
      const grp = detectGroup(src, t.ta, t.tb);
      const tst = ex.count === 0 ? parseTest(SL(src, t.ta, t.tb)) : null;
      const owned = hdItems.filter((d) => {
        if (!d.hd || d.hd.consumed) return false;
        const di = items.indexOf(d.item);
        if (di < k) return false;
        for (let q = k + 1; q < di; q++) if (items[q].t === "cmd") return false;
        return true;
      }).map((d) => d.hd);
      nodes.push({
        kind: "cmd",
        key: "n" + idx + "_" + li + "_" + si + "_" + k,
        hl: tst ? testBodyHTML(tst) : ex.html,
        len,
        sz,
        name: nm,
        grp,
        hd: owned,
        test: tst ? 1 : 0
      });
    } else if (t.t === "op" && t.merge) {
      const merge2 = t.merge;
      if (merge2.kind === "redir") {
        counts.nOp++;
        counts.nRedir++;
        const sz = sizeFor(t.op.length + 1 + (merge2.text ?? "").length) || { key: "breakout", w: 680, max: 0 };
        nodes.push({
          kind: "redir",
          key: "n" + idx + "_" + li + "_" + si + "_" + k,
          op: t.op,
          text: merge2.text,
          sz
        });
      } else if (merge2.kind === "heredoc") {
        counts.nOp++;
        counts.nHd++;
        nodes.push({
          kind: "heredoc",
          key: "n" + idx + "_" + li + "_" + si + "_" + k,
          hd: merge2.hd
        });
      }
    } else if (t.t === "op") {
      counts.nOp++;
      nodes.push({ kind: "op", key: "n" + idx + "_" + li + "_" + si + "_" + k, op: t.op, a: t.a, b: t.b });
    } else if (t.t === "target") {
      nodes.push({ kind: "chip", key: "n" + idx + "_" + li + "_" + si + "_" + k, text: SL(src, t.ta, t.tb) });
    } else if (t.t === "delim") {
      if (!t.hd || !t.hd?.consumed)
        nodes.push({ kind: "chip", key: "n" + idx + "_" + li + "_" + si + "_" + k, text: SL(src, t.ta, t.tb) });
    }
  });
  reorderInputs(nodes);
  fuseMergePipe(src, nodes);
  const segLinks = consumeOperators(src, nodes, counts);
  return { nodes, segLinks, hdItems };
}
function hdItemsCount(items, d) {
  let n = 0;
  for (const t of items) {
    if (t === d) return n;
    if (t.t === "delim") n++;
  }
  return n;
}
function reorderInputs(nodes) {
  const isIn = (n) => n.kind === "heredoc" || n.kind === "redir" && n.op === "<";
  const isBrk = (n) => n.kind === "op" && (n.op === "|" || n.op === "&&" || n.op === "||");
  const st = [[]];
  for (const n of nodes) {
    if (isBrk(n)) {
      st.push([n]);
      st.push([]);
    } else st[st.length - 1].push(n);
  }
  nodes.length = 0;
  for (const s of st) {
    const ci = s.findIndex((n) => n.kind === "cmd");
    if (ci < 0) {
      for (const n of s) nodes.push(n);
      continue;
    }
    nodes.push(s[ci]);
    for (let i = 0; i < s.length; i++) if (i !== ci && isIn(s[i])) nodes.push(s[i]);
    for (let i = 0; i < s.length; i++) if (i !== ci && !isIn(s[i])) nodes.push(s[i]);
  }
}
function fuseMergePipe(src, nodes) {
  for (let fi = 0; fi + 1 < nodes.length; fi++) {
    const fa = nodes[fi];
    const fb = nodes[fi + 1];
    if (fa.kind === "op" && fa.op === "2>&1" && fb.kind === "op" && fb.op === "|") {
      nodes.splice(fi, 2, {
        kind: "op",
        key: fa.key + "+" + ((fb.key.match(/(\d+)$/) || [])[1] ?? ""),
        op: "2>&1 |",
        sym: SL(src, fa.a ?? 0, fb.b ?? 0),
        a: fa.a,
        b: fb.b,
        fused: true
      });
    }
  }
}
function consumeOperators(src, nodes, counts) {
  const segLinks = /* @__PURE__ */ new Map();
  const out = [];
  const cmdish = (t) => !!t && (t.kind === "cmd" || t.kind === "redir" || t.kind === "heredoc");
  for (let ci = 0; ci < nodes.length; ci++) {
    const n = nodes[ci];
    if (n.kind === "op" && (n.op === "&&" || n.op === "||") && cmdish(nodes[ci + 1])) {
      const t = nodes[ci + 1];
      t.chip = { sym: SL(src, n.a ?? 0, n.b ?? 0), meaning: OP_MEANING[n.op ?? ""] || n.op };
      t.incoming = "chip";
      counts.nChip++;
      if (out.length) segLinks.set(out[out.length - 1].key + ">" + t.key, "chip");
      continue;
    }
    if (n.kind === "op" && (n.op === "|" || n.op === "2>&1 |") && out.length && cmdish(nodes[ci + 1])) {
      const t = nodes[ci + 1];
      t.incoming = n.op === "|" ? "pipe" : "pipe-fused";
      counts.nPipe++;
      segLinks.set(out[out.length - 1].key + ">" + t.key, t.incoming);
      continue;
    }
    if (out.length && !segLinks.has(out[out.length - 1].key + ">" + n.key)) {
      const A = out[out.length - 1];
      const isStdin = n.kind === "heredoc" || n.kind === "redir" && n.op === "<";
      segLinks.set(A.key + ">" + n.key, isStdin && A.kind === "cmd" ? "stdin" : "flow");
    }
    out.push(n);
  }
  nodes.length = 0;
  for (const n of out) nodes.push(n);
  return segLinks;
}
function exitBadgeHTML(code) {
  const failed = code !== 0;
  const tip = failed ? "stage exit code " + code + " (failed)" : "stage exit code 0";
  return `<span class="prim-badge"${failed ? ` data-tone="error"` : ""} title="${esc(tip)}">exit ${code}</span>`;
}
function attributePipeStages(nodes, pipeStages) {
  const out = nodes.map((n) => ({ ...n }));
  const cmds = out.filter((n) => n.kind === "cmd");
  for (const c2 of cmds) c2.exitCode = void 0;
  if (Array.isArray(pipeStages) && pipeStages.length === cmds.length) {
    let ok = true;
    const codes = [];
    for (const entry of pipeStages) {
      if (entry === null || typeof entry !== "object" || typeof entry.name !== "string" || entry.name.length === 0 || !Number.isInteger(entry.exitCode)) {
        ok = false;
        break;
      }
      codes.push(entry.exitCode);
    }
    if (ok) {
      for (let i = 0; i < cmds.length; i++) cmds[i].exitCode = codes[i];
    }
  }
  return out;
}
function attributeFinalSegment(nodes, pipeStages, isLast) {
  if (!isLast) return nodes.map((n) => ({ ...n }));
  if (nodes.some((n) => n.chip)) return nodes.map((n) => ({ ...n }));
  return attributePipeStages(nodes, pipeStages);
}
function buildSpecs(src, nodes, ctx) {
  void src;
  const { idx } = ctx;
  return nodes.map((nd) => {
    if (nd.kind === "cmd") {
      const iconName = CMD_ICON[nd.name ?? ""] || CMD_ICON[(nd.name ?? "").replace(/\d+$/, "")] || null;
      const dock = (nd.hd ?? []).map(
        (h) => `<button class="prim-badge" data-hd="${idx}_${h.n}" title="heredoc [${h.n}:${esc(h.raw)}] feeds ${h.lines} lines as input; the terminator line itself is not drawn. Click to expand below the panel.">&lt;&lt;${esc(h.raw)} [${h.n}:${h.lines}]</button>`
      ).join("") + (nd.grp ? Badge(nd.grp.kind === "kw" ? "starts a " + nd.grp.kw : nd.grp.kind, "") : "") + (nd.exitCode !== void 0 ? exitBadgeHTML(nd.exitCode) : "");
      const sizeKey = nd.sz ? nd.sz.key : "breakout";
      const w2 = nd.sz ? nd.sz.w : 680;
      return {
        id: nd.key,
        flex: (nd.len ?? 0) > SHORT_T,
        sk: sizeKey,
        w: w2,
        h: 50,
        html: Node({
          size: sizeKey,
          icon: iconName ?? void 0,
          iconFb: nd.name ? nd.name[0] : "\u2022",
          name: nd.name,
          bodyHTML: nd.hl,
          dockHTML: dock,
          chip: nd.chip
        })
      };
    }
    if (nd.kind === "redir") {
      const sz = nd.sz ?? { key: "breakout", w: 680, max: 0 };
      return {
        id: nd.key,
        flex: true,
        sk: sz.key,
        w: sz.w,
        h: 40,
        html: Node({
          size: sz.key,
          icon: OP_ICON[nd.op ?? ""] || "chevron-right",
          iconFb: nd.op,
          meaning: OP_MEANING[nd.op ?? ""],
          bodyHTML: `<span class="prim-chip">${segHTML(nd.text ?? "")}</span>`,
          chip: nd.chip
        })
      };
    }
    if (nd.kind === "heredoc") {
      const hh = nd.hd;
      const label = `<<${hh.raw} [${hh.n}:${hh.lines}]`;
      const tip = `heredoc [${hh.n}:${hh.raw}] feeds ${hh.lines} lines as input; the terminator line itself is not drawn. Activate to expand below the panel.`;
      const sk0 = sizeFor(label.length) || { key: "breakout", w: 680, max: 0 };
      return {
        id: nd.key,
        flex: false,
        sk: sk0.key,
        w: sk0.w,
        h: 50,
        html: `<button class="prim-node${nd.chip ? " has-chip" : ""}" data-size="${sk0.key}" data-hd="${idx}_${hh.n}" aria-expanded="false" title="${esc(tip)}">` + (nd.chip ? chipHTML(nd.chip.sym, nd.chip.meaning) : "") + (nd.chip ? `<span class="node-main">` : "") + `<span class="hd-pair">${Icon("scroll-text", "<<")}<span class="node-text"><code><span class="hd-label">${esc(label)}</span></code></span></span>` + (nd.chip ? `</span>` : "") + `</button>`
      };
    }
    if (nd.kind === "op")
      return {
        id: nd.key,
        flex: false,
        sk: "op",
        w: OP_W + NODE_M * 2,
        h: 44,
        html: Node({
          op: nd.op,
          sym: nd.sym || nd.op,
          icon: OP_ICON[nd.op ?? ""] || "chevron-right",
          meaning: OP_MEANING[nd.op ?? ""] || nd.op,
          spin: nd.fused ? "rot90" : null
        })
      };
    const w = sizeFor((nd.text ?? "").length + 4);
    return {
      id: nd.key,
      flex: true,
      sk: w ? w.key : "breakout",
      w: w ? w.w : 400,
      h: 34,
      html: `<div class="prim-node" data-size="${w ? w.key : "breakout"}"><span class="prim-chip">${segHTML(nd.text ?? "")}</span></div>`
    };
  });
}

// plugins/tool-render/src/bash-graph/render.ts
var uidc = 0;
function svgRowHTML(rowItems, edges) {
  for (const r of rowItems) {
    r.h = measureH(r.html, r.w);
  }
  const lay = layoutRow(rowItems);
  enforceGaps(lay, rowItems, GAP);
  const gapsAttr = rowItems.slice(0, -1).map((s2) => s2.gapAfter != null ? s2.gapAfter : GAP).join(",");
  let T = Infinity;
  let maxB = -Infinity;
  let hmin = Infinity;
  let maxh = 0;
  for (const r of rowItems) {
    const p = lay.pos.get(r.id);
    if (!p) continue;
    T = Math.min(T, p.y - r.h / 2);
    maxB = Math.max(maxB, p.y + r.h / 2);
    hmin = Math.min(hmin, r.h);
    maxh = Math.max(maxh, r.h);
  }
  const H2 = T + maxh + (lay.H - maxB);
  const yEdge = T + hmin / 2;
  const aid = "arr" + ++uidc;
  let s = `<svg width="${Math.ceil(lay.W)}" height="${Math.ceil(H2)}" data-gaps="${gapsAttr}" role="img"><defs><marker id="${aid}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M3 1 L10 5 L3 9" fill="none" stroke="var(--dsw-alias-label-tertiary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>`;
  for (const r of rowItems) {
    const p = lay.pos.get(r.id);
    if (!p) continue;
    s += `<foreignObject x="${(p.x - r.w / 2).toFixed(1)}" y="${T.toFixed(1)}" width="${r.w}" height="${r.h}"><div class="fobjwrap" style="width:${r.w}px" xmlns="http://www.w3.org/1999/xhtml">${r.html}</div></foreignObject>`;
  }
  const tags = [];
  for (const e of edges) {
    const A = rowItems.find((q) => q.id === e.a);
    const B = rowItems.find((q) => q.id === e.b);
    if (!A || !B) continue;
    const x1 = (lay.pos.get(A.id)?.x ?? 0) + A.w / 2;
    const x2 = (lay.pos.get(B.id)?.x ?? 0) - B.w / 2;
    if (e.link === "stdin")
      s += `<path class="prim-edge reversed" d="M${x2.toFixed(1)} ${yEdge.toFixed(1)} L${x1.toFixed(1)} ${yEdge.toFixed(1)}" marker-end="url(#${aid})"/>`;
    else
      s += `<path class="prim-edge" d="M${x1.toFixed(1)} ${yEdge.toFixed(1)} L${x2.toFixed(1)} ${yEdge.toFixed(1)}" marker-end="url(#${aid})"/>`;
    if (e.link === "pipe" || e.link === "pipe-fused")
      tags.push(pipeTagHTML(e.link, (x1 + x2) / 2, yEdge));
  }
  return { svg: s + "</svg>", engine: lay.engine, tags };
}
function svgStatement(plan, specs, ind = IND, rowGap = ROWGAP, engines, segLinks) {
  const byId = new Map(specs.map((s2) => [s2.id, s2]));
  const f = (x) => x.toFixed(1);
  const laid = [];
  let y = 0;
  let maxW = 0;
  plan.rows.forEach((r) => {
    for (const id of r.ids) {
      const s2 = byId.get(id);
      if (s2) s2.h = measureH(s2.html, s2.w);
    }
    const items = r.ids.map((id) => byId.get(id)).filter((s2) => !!s2);
    const lay = layoutRow(items);
    enforceGaps(lay, items, GAP);
    if (engines) engines[lay.engine] = true;
    const dx = r.first ? 0 : ind;
    let T = Infinity;
    let maxB = -Infinity;
    let hmin = Infinity;
    let maxh = 0;
    for (const id of r.ids) {
      const s2 = byId.get(id);
      const q = lay.pos.get(id);
      if (!s2 || !q) continue;
      T = Math.min(T, q.y - s2.h / 2);
      maxB = Math.max(maxB, q.y + s2.h / 2);
      hmin = Math.min(hmin, s2.h);
      maxh = Math.max(maxh, s2.h);
    }
    const H2 = T + maxh + (lay.H - maxB);
    const pos = /* @__PURE__ */ new Map();
    for (const id of r.ids) {
      const s2 = byId.get(id);
      const q = lay.pos.get(id);
      if (!s2 || !q) continue;
      pos.set(id, { x: q.x + dx, y: T + s2.h / 2 + y });
    }
    laid.push({
      r,
      lay,
      dx,
      dy: y,
      H: H2,
      yEdge: T + hmin / 2 + y,
      pos,
      links: r.ids.map(
        (id, k) => k + 1 < r.ids.length ? segLinks?.get(id + ">" + r.ids[k + 1]) || "flow" : null
      )
    });
    maxW = Math.max(maxW, lay.W + dx);
    y += H2 + rowGap;
  });
  const H = y - rowGap;
  const aid = "arr" + ++uidc;
  const gapsAttr = specs.slice(0, -1).map((s2) => s2.gapAfter != null ? s2.gapAfter : GAP).join(",");
  let s = `<svg width="${Math.ceil(maxW)}" height="${Math.ceil(H)}" data-rows="${plan.rows.length}" data-left="${plan.rows.map((r) => r.left ?? "").join(",")}" data-gaps="${gapsAttr}" role="img"><defs><marker id="${aid}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M3 1 L10 5 L3 9" fill="none" stroke="var(--dsw-alias-label-tertiary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>`;
  const clip = (c2, t) => {
    const dx = t.x - c2.x;
    const dy = t.y - c2.y;
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return { x: c2.x, y: c2.y };
    let k = 1;
    if (Math.abs(dx) > 1e-9) k = Math.min(k, c2.hw / Math.abs(dx));
    if (Math.abs(dy) > 1e-9) k = Math.min(k, c2.hh / Math.abs(dy));
    return { x: c2.x + dx * k, y: c2.y + dy * k };
  };
  const boxOf = (L, id) => {
    const r = byId.get(id);
    const q = L.pos.get(id);
    return { x: q.x, y: q.y, hw: r.w / 2, hh: r.h / 2 };
  };
  const tags = [];
  laid.forEach((L, ri) => {
    for (const id of L.r.ids) {
      const r = byId.get(id);
      const q = L.pos.get(id);
      if (!r || !q) continue;
      s += `<foreignObject x="${f(q.x - r.w / 2)}" y="${f(q.y - r.h / 2)}" width="${r.w}" height="${r.h}"><div class="fobjwrap" style="width:${r.w}px" xmlns="http://www.w3.org/1999/xhtml">${r.html}</div></foreignObject>`;
    }
    for (let k = 0; k + 1 < L.r.ids.length; k++) {
      const lk = L.links[k];
      const A = boxOf(L, L.r.ids[k]);
      const B = boxOf(L, L.r.ids[k + 1]);
      if (lk === "stdin")
        s += `<path class="prim-edge reversed" d="M${f(B.x - B.hw)} ${f(L.yEdge)} L${f(A.x + A.hw)} ${f(L.yEdge)}" marker-end="url(#${aid})"/>`;
      else
        s += `<path class="prim-edge" d="M${f(A.x + A.hw)} ${f(L.yEdge)} L${f(B.x - B.hw)} ${f(L.yEdge)}" marker-end="url(#${aid})"/>`;
      if (lk === "pipe" || lk === "pipe-fused")
        tags.push(pipeTagHTML(lk, (A.x + A.hw + B.x - B.hw) / 2, L.yEdge));
    }
    if (ri + 1 < laid.length) {
      const A = boxOf(L, L.r.ids[L.r.ids.length - 1]);
      const B = boxOf(laid[ri + 1], laid[ri + 1].r.ids[0]);
      const gy = L.dy + L.H + rowGap * 0.25;
      const p0 = clip(A, { x: A.x, y: A.y + 1e3 });
      const p3 = clip(B, { x: B.x, y: B.y - 1e3 });
      const dx = Math.sign(p3.x - p0.x);
      let d;
      if (Math.abs(p3.x - p0.x) < 1e-9) {
        d = `M${f(p0.x)} ${f(p0.y)} V${f(p3.y)}`;
      } else {
        const R = Math.max(
          0,
          Math.min(6, (gy - p0.y) / 2, (p3.y - gy) / 2, Math.abs(p3.x - p0.x) / 2)
        );
        d = `M${f(p0.x)} ${f(p0.y)} V${f(gy - R)} Q${f(p0.x)} ${f(gy)} ${f(p0.x + dx * R)} ${f(gy)} H${f(p3.x - dx * R)} Q${f(p3.x)} ${f(gy)} ${f(p3.x)} ${f(gy + R)} V${f(p3.y)}`;
      }
      s += `<path class="prim-edge hook" d="${d}" marker-end="url(#${aid})"/>`;
      const hlink = segLinks && segLinks.get(L.r.ids[L.r.ids.length - 1] + ">" + laid[ri + 1].r.ids[0]) || "flow";
      if (hlink === "pipe" || hlink === "pipe-fused")
        tags.push(pipeTagHTML(hlink, (p0.x + p3.x) / 2, gy));
    }
  });
  return `<div class="panel-scroll"><div class="edgewrap">${s}</svg>${tags.join("")}</div></div>`;
}
function renderOne(idx, src, ub, engines, pipeStages) {
  const lines = splitLines2(src);
  const ctx = makeBuildContext(idx);
  const panelsHTML = [];
  let nPanels = 0;
  let lastKey = null;
  if (pipeStages !== void 0) {
    lines.forEach((ln, li) => {
      const segs = splitSemis(src, ln.a, ln.b);
      segs.forEach((sg, si) => {
        if (tokenizeParts(src, sg.a, sg.b).length > 0) lastKey = li + "_" + si;
      });
    });
  }
  lines.forEach((ln, li) => {
    const segs = splitSemis(src, ln.a, ln.b);
    segs.forEach((sg, si) => {
      const items = tokenizeParts(src, sg.a, sg.b);
      if (!items.length) return;
      const adoptedBefore = ctx.adopted.n;
      const { nodes, segLinks, hdItems } = buildNodes(src, items, ln, { li, si }, ub, ctx);
      engines.adopted += ctx.adopted.n - adoptedBefore;
      const attrNodes = lastKey !== null && li + "_" + si === lastKey ? attributeFinalSegment(nodes, pipeStages, true) : nodes;
      const specs = buildSpecs(src, attrNodes, ctx);
      specs.forEach((s) => {
        s.nat = naturalWidth(s.html, s.sk);
      });
      specs.forEach((s) => {
        s.minw = s.flex ? specMinW(s.html) : 0;
      });
      specs.forEach((s, k) => {
        const nx = attrNodes[k + 1];
        const lk = nx ? segLinks.get(attrNodes[k].key + ">" + nx.key) : null;
        s.gapAfter = lk === "pipe" || lk === "pipe-fused" ? PIPE_GAP : GAP;
      });
      const avail = engines.avail || CARD_AVAIL;
      const planItems = specs.map((s) => ({
        id: s.id,
        nat: s.nat ?? 0,
        flex: s.flex,
        minw: s.minw ?? 0,
        html: s.html,
        gapAfter: s.gapAfter
      }));
      const plan = planRows(planItems, avail, IND, GAP, ROWGAP, (it, w) => {
        const spec = specs.find((q) => q.id === it.id);
        return measureH(spec ? spec.html : it.html ?? "", w);
      });
      let html = "";
      if (plan.rows.length === 1 && plan.rows[0].ids.length === 1) {
        const s = specs[0];
        s.w = s.nat ?? s.w;
        s.html = s.html.replace(/data-size="[a-z]+"/, 'data-size="lone"');
        html += `<div class="panel-scroll">${s.html}</div>`;
      } else {
        plan.rows.forEach((r) => {
          r.ids.forEach((id, k) => {
            const s = specs.find((q) => q.id === id);
            if (!s) return;
            s.w = r.widths[k];
            setNodeWidth(s, stepFor(s.nat ?? 0));
          });
        });
        if (plan.rows.length === 1) {
          const rowItems = plan.rows[0].ids.map((id) => specs.find((q) => q.id === id)).filter((s) => !!s);
          const edges = [];
          for (let k = 0; k + 1 < rowItems.length; k++) {
            const A = rowItems[k].id;
            const B = rowItems[k + 1].id;
            edges.push({ a: A, b: B, link: segLinks.get(A + ">" + B) || "flow" });
          }
          const r1 = svgRowHTML(rowItems, edges);
          if (engines) engines[r1.engine] = true;
          html += `<div class="panel-scroll"><div class="edgewrap">${r1.svg}${r1.tags.join("")}</div></div>`;
        } else {
          const rows = plan.rows.map((r) => ({ ids: r.ids, first: r.first, left: r.left }));
          html += svgStatement({ rows }, specs, IND, ROWGAP, engines, segLinks);
        }
      }
      nPanels++;
      const hdBlocks = hdItems.map((d) => d.hd).filter((h) => Boolean(h)).map(
        (h) => `<div class="hd-body" id="hd-${idx}_${h.n}" hidden><div class="hd-cap">heredoc [${h.n}] \xB7 ${h.lines} lines \xB7 expanded from the node above; the terminator line is not drawn</div><pre>${hlBody(SL(src, h.a, h.b))}</pre></div>`
      ).join("");
      const argBlocks = ctx.argBodies.splice(0).map(
        (a) => `<div class="hd-body" id="arg-${a.id}" hidden><div class="hd-cap">${a.flag ? esc(a.flag) + " \xB7 " : ""}${a.chars} chars \xB7 ${a.lines} line${a.lines > 1 ? "s" : ""} \xB7 full verbatim argument</div><pre>${hlArgBody(a.body)}</pre></div>`
      ).join("");
      panelsHTML.push(
        `<div class="prim-panel stmt" data-seg="${li}_${si}" data-nodes="${nodes.length}">${html}</div>` + hdBlocks + argBlocks
      );
    });
  });
  return {
    panelsHTML,
    nCmd: ctx.counts.nCmd,
    nOp: ctx.counts.nOp,
    nRedir: ctx.counts.nRedir,
    nHd: ctx.counts.nHd,
    nArg: ctx.counts.nArg,
    nChip: ctx.counts.nChip,
    nPipe: ctx.counts.nPipe,
    nPanels,
    maxSeg: ctx.maxSeg.n,
    adopted: ctx.adopted.n
  };
}

// css-text:/home/sid/repos/dotfiles-ai/plugins/tool-render/src/bash-graph/styles.css
var styles_default = `/* bash-graph styles: fair copy of the prototype diagram rules.
 *
 * PORT NOTE (criterion 4): this file transcribes the prototype <style>
 * rules for everything render.ts emits. Page chrome is dropped (body,
 * .page-head, .controls, #col, .colmeta, .foot, legend/coverage helpers,
 * pre.orig show-original, .cmd card frame): the prototype NOTES list those
 * as incidental scaffolding, and this module stops at the panelsHTML
 * boundary. Rule order and values are otherwise verbatim, including the
 * round comments that record which bug each rule exists for (criterion 6).
 *
 * THEME NOTE for ticket #173 (the swap): the :root token VALUES below are
 * prototype stand-ins; only the token NAMES are real. The swap must
 * reconcile these with the production theme instead of shipping the
 * stand-in values as global overrides. The --proto-* highlight colours
 * likewise need a production home.
 */

/* ---- real repo token NAMES, plausible values per theme ---- */
:root, :root[data-theme="dark"], html[data-theme="dark"]{
  --dsw-alias-bg-base:#16161a;
  --dsw-alias-bg-layer-1:#232329;
  --dsw-alias-border-l1:#2e2e37;
  --dsw-alias-border-l2:#41414d;
  --dsw-alias-border-l3:#5b5b68;
  --dsw-alias-label-primary:#ececf1;
  --dsw-alias-label-secondary:#b9b9c6;
  --dsw-alias-label-tertiary:#8e8e9a;
  --dsw-alias-label-caption:#6d6d78;
  --dsw-alias-markdown-code-block:#0f0f13;
  --dsw-alias-state-error-primary:#f2555a;
  --dsw-alias-state-business-primary:#5b9bff;
  --dsw-alias-interactive-bg-hover:#33333d;
  --ds-font-family-code:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --proto-str:#9ece6a; --proto-path:#e0af68; --proto-flag:#7aa2f7; --proto-var:#bb9af7;
}
html[data-theme="light"]{
  --dsw-alias-bg-base:#f3f3f5;
  --dsw-alias-bg-layer-1:#ffffff;
  --dsw-alias-border-l1:#e3e3e8;
  --dsw-alias-border-l2:#d2d2da;
  --dsw-alias-border-l3:#a8a8b5;
  --dsw-alias-label-primary:#191920;
  --dsw-alias-label-secondary:#41414c;
  --dsw-alias-label-tertiary:#71717e;
  --dsw-alias-label-caption:#a0a0ab;
  --dsw-alias-markdown-code-block:#e9e9ed;
  --dsw-alias-state-error-primary:#c81e1e;
  --dsw-alias-state-business-primary:#0b5cff;
  --dsw-alias-interactive-bg-hover:#e4e4ea;
  --ds-font-family-code:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --proto-str:#2c7a2c; --proto-path:#9a5b00; --proto-flag:#1d4fd7; --proto-var:#6d28d9;
}
/* ---- the six primitives ---- */
.prim-panel{box-sizing:border-box;border:none;
  border-radius:.75rem;background:var(--dsw-alias-bg-base);
  margin-top:.125rem;margin-bottom:.125rem;padding:.25rem .375rem;}
.prim-panel-head{display:flex;flex-wrap:wrap;gap:.375rem;align-items:baseline;
  font-size:.75rem;color:var(--dsw-alias-label-secondary);margin-bottom:.25rem;}
.prim-panel-head .idx{font-family:var(--ds-font-family-code);color:var(--dsw-alias-label-primary);font-weight:600;}
.prim-node{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l3);
  border-radius:.5rem;background:var(--dsw-alias-bg-layer-1);
  padding:.375rem .5rem;font-family:var(--ds-font-family-code);
  font-size:.75rem;line-height:1.25rem;color:var(--dsw-alias-label-primary);}
/* R10.1: length steps are MAX-WIDTH ceilings, never assigned widths. JS assigns
   inline widths at or below natural (which never exceeds the step recorded for
   it \u2014 stepFor(nat) >= nat by definition), so the ceiling is a no-op safety
   net, not a sizer; the top step is open (a >400px natural must never clip).
   Lone rows keep width:auto/max-width:100% (a node alone is never capped). */
.prim-node[data-size="xs"]{max-width:112px;} .prim-node[data-size="s"]{max-width:168px;}
.prim-node[data-size="m"]{max-width:232px;} .prim-node[data-size="l"]{max-width:312px;}
.prim-node[data-size="xl"]{max-width:none;} .prim-node[data-size="op"]{width:36px;text-align:center;}
.prim-node[data-size="breakout"]{width:100%;}
.prim-node[data-size="lone"]{width:auto;max-width:100%;}
button.prim-node[data-size="lone"]{width:max-content;min-width:max-content;max-width:none;}
.prim-node.op{background:transparent;border-style:solid;border-color:var(--dsw-alias-border-l3);
  padding:.25rem .125rem;}
.prim-node .node-text{overflow-wrap:anywhere;word-break:normal;}
/* D3: .seg is the token-aware part (paths break ONLY after "/"; everywhere
   else the breaker prefers spaces and fires anywhere solely on genuine
   overflow of one token). anywhere stays as the last resort so an over-long
   slash-less word wraps visibly instead of spilling out of the foreignObject
   with no indication. */
.seg{white-space:nowrap;}
/* R10.2/R11.2: the heredoc chip summary (<<'DELIM' [n:lines]) is unbreakable
   by rule \u2014 heredoc nodes are inflexible (keep natural width), so this guard
   can never clip: it only forbids a wrap the layout already priced out.
   R11.2: nowrap alone was NOT unbreakable. overflow-wrap is inherited, so
   .prim-node .node-text{overflow-wrap:anywhere} reached straight through the
   guard and broke the label mid-token on any overflow (the node inline width
   derives from scrollWidth, which excludes the 1px borders \u2014 the content
   area is systematically ~2px short of natural, i.e. it always overflows).
   The guard must cover the overflow-wrap axis too (word-break is already
   normal by inheritance; stated here so the contract survives later edits). */
.hd-label{white-space:nowrap;overflow-wrap:normal;word-break:normal;}
/* R12.2: the icon and the label are one atomic pair. The R11.2 guard covers
   text INSIDE the label but says nothing about the icon/label boundary, and
   the owner saw them separate across lines (any overflow + anywhere can split
   two inline boxes with no whitespace between them). The wrapper carries the
   full guard on both axes, so the pair cannot separate whatever overflows;
   it stays an inline span (no box change), and there is no whitespace inside
   the markup to offer a break. */
.hd-pair{white-space:nowrap;overflow-wrap:normal;word-break:normal;}
/* R13.1 SUPERSEDED BY THE OWNER, same day, after seeing both in the browser.
   The four declarations tried here (padding-left, padding-right,
   display:inline-block on the pair, transform:translateX(-0.75rem)) are GONE.
   The replacement below is better for a reason beyond taste: translateX moves
   PAINT ONLY, so every measured width, DP decision and edge coordinate would
   have kept describing the un-shifted box, and the -12px answered to no
   declared constant. margin-left on an inline-block CHILD is real layout: the
   measurer sees it, so the model and the browser keep agreeing (the round-8
   rule). No compensating constant survives into the port. */
.hd-pair .node-text{display:inline-block;margin-left:0.3rem;}
.prim-node .node-text code{font:inherit;background:none;padding:0;}
/* R13.3: generated test words are prose, not source. The operand stays
   code-styled (verbatim slice); the surrounding words render in the system
   sans at secondary color, so no reader mistakes a claim for a quote. (The
   prototype page has no UI-sans token - everything is --ds-font-family-code -
   so the stack is explicit; the production host should use its UI font.) */
.test-word{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--dsw-alias-label-secondary);}
.prim-node .hdock{margin-top:.375rem;}
.prim-chip{display:inline;font-family:var(--ds-font-family-code);font-size:.6875rem;
  line-height:1rem;border:1px solid var(--dsw-alias-border-l3);border-radius:.25rem;
  padding:0 .25rem;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);
  overflow-wrap:anywhere;-webkit-box-decoration-break:clone;box-decoration-break:clone;}
.prim-badge{display:inline-flex;align-items:center;gap:.25rem;border:1px solid var(--dsw-alias-border-l3);
  background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);
  border-radius:999px;padding:.0625rem .375rem;font-size:.6875rem;line-height:1rem;
  white-space:nowrap;cursor:default;}
button.prim-badge{cursor:pointer;font:inherit;max-width:100%;}
/* R12.3: pills can never exceed their node. The button cap alone is not
   enough: as a flex item the label's min-width:auto (its full nowrap text)
   would refuse to shrink and spill past the capped box. min-width:0 lets it
   shrink into its existing ellipsis instead \u2014 truncation with \u2026 (the full
   text stays one click away), never a spill past the foreignObject edge. */
button.prim-badge:hover{color:var(--dsw-alias-label-primary);}
.prim-badge[data-tone="error"]{color:var(--dsw-alias-state-error-primary);}
/* R7.2: arg pills are compact badges, not banners. The label is already a
   truncated front slice with an explicit \u2026 + counts (full text expands below
   the panel), so capping the visual width loses nothing. */
.prim-badge[data-hd]{padding-right:.625rem;}
/* R12.5: heredoc chips breathe on the right edge (.375rem -> .625rem,
   right-only). Padding, not a width bump and not a margin: the heredoc pill
   is one of the measured elements this round's borders fix touched, so the
   extra 4px rides INSIDE its measured width everywhere the width is priced \u2014
   naturalWidth reads the rendered scrollWidth, and specMinW charges the
   18px-wide data-hd chrome (6px left + 10px right + 2 borders) instead of
   the 14px blanket. Arg pills stay symmetric. */

.prim-badge .pill-label{display:block;min-width:0;max-width:220px;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;}
.prim-icon{display:inline-flex;vertical-align:-2px;margin-right:.375rem;
  color:var(--dsw-alias-label-tertiary);}
.prim-icon svg{width:14px;height:14px;}
.prim-node.op .prim-icon{margin-right:0;color:var(--dsw-alias-label-secondary);}
.prim-node.op .prim-icon svg{width:16px;height:16px;}
/* R7.5: the merge-then-pipe node reuses the merge glyph rotated to point
   RIGHT (the glyph as drawn points up: chevron apex at the top). Rotation
   is in place on the square icon box, so measurement is unaffected. */
.prim-icon.rot90 svg{transform:rotate(90deg);}
/* R8.1: nodes rendered inside SVG foreignObjects carry NO vertical margin.
   The 10px .prim-node margins are load-bearing ONLY on the horizontal axis
   (10px gutters inside the foreignObject; nodes are x-positioned). On the
   vertical axis the foreignObject height IS the row pitch, so any vertical
   margin is either phantom (collapses through the wrapper div and renders
   as dead space below the node) or a clip risk (if it does not collapse).
   Zeroing it in BOTH the measurer and the render (same .fobjwrap wrapper
   class) makes collapse behaviour irrelevant: measurer and render agree by
   construction, and the foreignObject fits the border-box exactly. Lone
   HTML-flow nodes keep their margins (BFC container, real breathing room). */
.fobjwrap>.prim-node{margin-top:0;margin-bottom:0;}
/* R8.3: operator symbols never wrap mid-label (the fused 2>&1 | stays one
   line even on its degenerate standalone-node fallback path). */
.prim-node.op .op-sym{white-space:nowrap;}
/* R8.4: CONDITIONALS ride as prefix chips on the dependent card \u2014 one split
   card, chip one colour and body the other, sharing one outline. The chip is
   a full-height bar on the left edge (flex stretch); the body keeps normal
   inline flow inside .node-main, so icon-inline and token wrapping behave
   exactly as on unchipped nodes. Chip text is the verbatim operator slice
   (seg-wrapped: unbreakable, counted in the unbreakable-run minimum). */
.prim-node.has-chip{display:flex;align-items:stretch;padding-top:0;padding-bottom:0;padding-left:0;}
.prim-node.has-chip .op-chip{flex:none;display:flex;align-items:center;
  background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);
  border-right:1px solid var(--dsw-alias-border-l3);
  border-radius:calc(.5rem - 1px) 0 0 calc(.5rem - 1px);
  padding:.375rem .5rem;margin-right:.5rem;white-space:nowrap;font-weight:700;}
.prim-node.has-chip .node-main{min-width:0;padding-top:.375rem;padding-bottom:.375rem;}
/* R13.2: a glyph-only || chip carries no text after its icon, so the
   .prim-icon trailing margin would be dead space inside the bar - zeroed,
   mirroring the pipe-tag precedent (.pipe-tag .prim-icon{margin-right:0}). */
.prim-node.has-chip .op-chip .prim-icon{margin-right:0;}
/* R8.4: PIPES are split arrows \u2014 one continuous edge with the glyph inline.
   R9.3/R10.3: the tag is a SQUARE overlay centred on the edge line \u2014
   explicit 26px border-box with a .25rem (chip-step) radius, square by
   construction (the round-9 999px radius rendered a circle, which is why the
   badge read as "not square"). The 18px glyph is the largest with >=3px
   clearance per side ((26-2-18)/2); overflow:hidden keeps the box square
   even on the no-lucide fallback path, where the text glyph would otherwise
   spill past the box. R9.5: tags live inside .edgewrap (the padding-free
   positioned wrapper around each svg), so svg-space left/top resolve
   against the svg origin whatever padding .panel-scroll carries. The
   single marker-end arrowhead underneath keeps direction unambiguous; the
   tooltip carries the meaning the old operator node used to hold. */
.edgewrap{position:relative;}
.pipe-tag{position:absolute;transform:translate(-50%,-50%);
  display:inline-flex;align-items:center;justify-content:center;
  box-sizing:border-box;width:26px;height:26px;padding:0;overflow:hidden;
  background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l3);
  border-radius:.25rem;line-height:1;white-space:nowrap;}
.pipe-tag .prim-icon{margin-right:0;vertical-align:0;color:var(--dsw-alias-label-secondary);}
.pipe-tag .prim-icon svg{width:18px;height:18px;}
button.prim-node{cursor:pointer;text-align:left;}
button.prim-node:hover{border-color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);}
button.prim-node:active{transform:translateY(1px);}
button.prim-node:focus-visible{outline:.125rem solid var(--dsw-alias-state-business-primary);outline-offset:2px;}
button.prim-node[aria-expanded="true"]{border-color:var(--dsw-alias-label-secondary);}
/* R10.7: arrowheads are stroked outline chevrons (production primitive
   IconChevronDownOutline14 \u2014 outline, stroked, not filled), not solid
   triangles. The marker keeps the old viewBox/refX/size/orient and the tip
   stays at (10,5): the tip lands exactly where the triangle tip landed, so
   no edge endpoint moves and heads neither float short nor overlap into
   cards. Only the path changed (fill -> 2-unit round stroke). */
.prim-edge{fill:none;stroke:var(--dsw-alias-label-tertiary);stroke-width:1.5;}
/* ---- diagram-only helpers (candidate one-offs, see NOTES.md) ---- */
.panel-scroll{overflow-x:scroll;scrollbar-width:thin;
  scrollbar-color:var(--dsw-alias-border-l3) var(--dsw-alias-border-l2);}
/* R9B/R10.8 (owner decision: option 2 \u2014 always visible, styled). The
   horizontal track is permanently present (~8px: thin in Firefox, 8px in
   WebKit) so a row never changes height when its content starts or stops
   overflowing \u2014 layout stability worth 8px per scroll container. R10.8:
   the track token moved border-l1 -> border-l2 because a DISABLED
   (nothing-to-scroll) bar paints track-only, and l1 on bg-base is near
   invisible in both themes \u2014 the page paid the gutter everywhere while
   showing a track nowhere. l2 stays a border token, readable against the
   panel field in both themes and distinct from the l3 thumb. The old
   unconditional padding-bottom:.25rem is gone (4px x every container for
   nothing): with a permanent gutter the track itself is the separation.
   All colours are existing theme tokens, so light and dark follow with no
   hardcoded grey; radii reuse the .25rem chip step. Firefox (the owner's
   browser) is styled by the base rule above \u2014 scrollbar-width/color \u2014 NOT
   by the WebKit pseudos below; the two APIs do not overlap, so neither
   engine is an afterthought. Vertical overflow stays auto: content always
   fits by construction, so no vertical bar appears and no vertical slack
   is introduced by this rule. */
.panel-scroll::-webkit-scrollbar{height:8px;}
.panel-scroll::-webkit-scrollbar-track{background:var(--dsw-alias-border-l2);border-radius:.25rem;}
.panel-scroll::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l3);border-radius:.25rem;}
.panel-scroll::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-label-secondary);}
/* R9.5/R9A: breathing room above diagram svgs \u2014 scoped as a CHILD of the
   statement region, not a descendant of any panel. A bare
   \`.panel-scroll:has(svg)\` (or \`.prim-panel .panel-scroll\`) would also match
   a scroll nested DEEPER inside a panel (expanded bodies, future nested
   diagrams); the child combinator pins the rule to exactly the outer,
   statement-level scroll, so no second rule ever has to fight it. Lone
   panels (no svg) keep no top padding. Safe ONLY because pipe tags resolve
   against .edgewrap (the svg's own origin): container padding shifts the
   svg and its tags together, so nothing offsets. */
.prim-panel.stmt > .panel-scroll:has(svg){padding-top:10px;}
.panel-scroll svg{display:block;}
.op-sym{display:block;font-size:.6875rem;color:var(--dsw-alias-label-caption);line-height:1rem;}
.node-name{font-weight:700;}
.hl-flag{color:var(--proto-flag);} .hl-str{color:var(--proto-str);}
.hl-path{color:var(--proto-path);} .hl-var{color:var(--proto-var);}
.hd-body{margin:.25rem 0 .125rem .25rem;}
.hd-body pre{background:transparent;border:none;margin:.125rem 0 0;padding:0 0 0 .5rem;
  font-family:var(--ds-font-family-code);font-size:.75rem;line-height:1.25rem;
  color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere;}
.hd-cap{font-size:.6875rem;color:var(--dsw-alias-label-caption);}
#measure{position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;}
/* D1: reserve the icon's rendered size while measuring. Node HTML is measured
   with empty <i data-lucide> placeholders; after the lucide swap they become
   14px (16px on op discs) SVGs plus the .prim-icon margin. Without this the
   measured width is ~20px short, text wraps one row deeper than measured, and
   the fixed-height foreignObject clips the last line. */
#measure i[data-lucide]{display:inline-block;width:14px;height:14px;}
#measure .prim-node.op i[data-lucide]{width:16px;height:16px;}
/* R7.3, owner's exact CSS (R10.4: px, not rem \u2014 the margin IS NODE_M, the
   same 10px the layout normalises every svg row origin to, so HTML lone
   nodes and svg rows share a left edge by construction, not by coincidence.
   Heights/widths measured in JS add the margin back \u2014 see NODE_M \u2014 since
   offsetHeight/scrollWidth exclude margins.) */
.prim-panel{margin:0;padding:0;}
.prim-node{margin:10px;}
/* R10.5: lone (plain-HTML) rows carry no dagre pitch and no hooks \u2014 their
   only vertical cost is this margin plus the scroll container. 6px keeps
   breathing room while halving the 24px stacked gap (10+4+10) the owner
   flagged. Horizontal margins stay 10px (the shared left-edge origin). */
.prim-panel.stmt>.panel-scroll>.prim-node[data-size="lone"]{margin-top:6px;margin-bottom:6px;}
`;

// plugins/tool-render/src/escalation.ts
var ESCALATION_LABEL = "agent requests sandbox access escalation";
var ESCALATION_LABEL_SETTLED = "agent requested sandbox access escalation";
function escalationLabel(settled) {
  return settled ? ESCALATION_LABEL_SETTLED : ESCALATION_LABEL;
}
var ESCALATION_REASON_CLASS = "tool-render-escalation-reason";
var ESCALATION_REASON_MUTED_CLASS = "tool-render-escalation-reason-muted";
function escalationReasonClassName(settled) {
  return settled ? ESCALATION_REASON_CLASS + " " + ESCALATION_REASON_MUTED_CLASS : ESCALATION_REASON_CLASS;
}
function pickString(value, keys) {
  for (let i = 0; i < keys.length; i++) {
    const v = value[keys[i]];
    if (typeof v === "string" && v !== "") return v;
  }
  return void 0;
}
function splitEscalationReason(reason) {
  if (typeof reason !== "string") return null;
  const prefix = HOST_ESCALATION_PREFIX;
  if (reason.indexOf(prefix) !== 0) return null;
  const rest = reason.slice(prefix.length);
  const colon = rest.indexOf(":");
  if (colon === -1) return null;
  const mode = rest.slice(0, colon).trim();
  const justification = rest.slice(colon + 1).replace(/^\s+/, "");
  if (mode === "" || /[\s:]/.test(mode)) return null;
  if (justification === "") return null;
  return { mode, justification };
}
function escalationDetailOf(args) {
  if (args === null || typeof args !== "object" || Array.isArray(args)) return null;
  const record = args;
  const mode = pickString(record, ["sandbox_permissions"]);
  if (mode !== "workspace-write" && mode !== "danger-full-access") return null;
  const justification = pickString(record, ["justification"]);
  if (justification === void 0 || justification.trim() === "") return null;
  if (isBashGuardReason(justification)) return null;
  const prefixed = splitEscalationReason(justification);
  if (prefixed !== null && prefixed.mode === mode) return { mode, justification: prefixed.justification };
  return { mode, justification };
}

// plugins/tool-render/src/verdict-tip.ts
var VERDICT_TIP_REWRITE_LABEL = "Rewrite";
var VERDICT_TIP_PROMPT_LABEL = "Prompt";
var VERDICT_TIP_LINE_MAX = 300;
function singleLineTipText(text) {
  return text.replace(/\s+/g, " ").trim();
}
function summariseGuardPromptReason(reason) {
  if (typeof reason !== "string" || !isBashGuardReason(reason)) return null;
  var parsed = null;
  try {
    parsed = parse(reason);
  } catch (error) {
    parsed = null;
  }
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    var summary = parsed.summary;
    if (typeof summary === "string") {
      var summaryLine = singleLineTipText(summary);
      if (summaryLine !== "") return summaryLine;
    }
  }
  var lines = reason.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = singleLineTipText(lines[i]);
    if (line !== "") return line;
  }
  return null;
}
function guardRewriteTipLine(originalCmd, ranCmd) {
  if (typeof ranCmd !== "string") return null;
  var ran = singleLineTipText(ranCmd);
  if (ran === "") return null;
  var label = guardRewriteLabel(typeof originalCmd === "string" ? originalCmd : void 0, ranCmd);
  return label + " " + ran;
}
function capTipLine(line) {
  var collapsed = singleLineTipText(line);
  if (collapsed === "") return null;
  if (collapsed.length <= VERDICT_TIP_LINE_MAX) return collapsed;
  return collapsed.slice(0, VERDICT_TIP_LINE_MAX - 1).replace(/\s+$/, "") + "\u2026";
}
function composeVerdictTooltip(rewriteReason, promptReason) {
  var lines = [];
  if (typeof rewriteReason === "string") {
    var rewrite = capTipLine(rewriteReason);
    if (rewrite !== null) lines.push(VERDICT_TIP_REWRITE_LABEL + ": " + rewrite);
  }
  if (typeof promptReason === "string") {
    var prompt = capTipLine(promptReason);
    if (prompt !== null) lines.push(VERDICT_TIP_PROMPT_LABEL + ": " + prompt);
  }
  if (lines.length === 0) return null;
  return lines.join("\n");
}

// plugins/tool-render/src/client.tsx
var primitives = __toESM(require("@deepseek-ai/dsh-client-ui-primitives"), 1);

// node_modules/.pnpm/lucide-react@1.46.0_react@19.3.0/node_modules/lucide-react/dist/esm/createLucideIcon.mjs
var import_react3 = require("react");

// node_modules/.pnpm/lucide-react@1.46.0_react@19.3.0/node_modules/lucide-react/dist/esm/shared/src/utils/toKebabCase.mjs
var toKebabCase = (string2) => string2?.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

// node_modules/.pnpm/lucide-react@1.46.0_react@19.3.0/node_modules/lucide-react/dist/esm/shared/src/utils/toLucideIconData.mjs
function toLucideIconData(iconName, iconNode, aliases = []) {
  if (iconNode == null) {
    throw new Error("[lucide]: iconNode is required when icon name is used");
  }
  return {
    name: toKebabCase(iconName),
    size: 24,
    node: iconNode,
    ...aliases.length > 0 ? { aliases } : {}
  };
}

// node_modules/.pnpm/lucide-react@1.46.0_react@19.3.0/node_modules/lucide-react/dist/esm/shared/src/utils/toCamelCase.mjs
var toCamelCase = (string2) => {
  let out = "";
  let upperNext = false;
  for (const ch of string2) {
    if (ch === "-" || ch === "_" || ch <= " ") {
      upperNext = out.length > 0;
      continue;
    }
    if (out.length === 0) {
      out += ch.toLowerCase();
    } else {
      out += upperNext ? ch.toUpperCase() : ch;
    }
    upperNext = false;
  }
  return out;
};

// node_modules/.pnpm/lucide-react@1.46.0_react@19.3.0/node_modules/lucide-react/dist/esm/shared/src/utils/toPascalCase.mjs
var toPascalCase = (string2) => {
  const camelCase = toCamelCase(string2);
  return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
};

// node_modules/.pnpm/lucide-react@1.46.0_react@19.3.0/node_modules/lucide-react/dist/esm/Icon.mjs
var import_react2 = require("react");

// node_modules/.pnpm/lucide-react@1.46.0_react@19.3.0/node_modules/lucide-react/dist/esm/shared/src/utils/mergeClasses.mjs
var mergeClasses = (...classes) => classes.filter((className, index, array) => {
  return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
}).join(" ").trim();

// node_modules/.pnpm/lucide-react@1.46.0_react@19.3.0/node_modules/lucide-react/dist/esm/shared/src/build/defaultAttributes.mjs
var defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 2,
  "stroke-linecap": "round",
  "stroke-linejoin": "round"
};

// node_modules/.pnpm/lucide-react@1.46.0_react@19.3.0/node_modules/lucide-react/dist/esm/shared/src/build/buildLucideIconNode.mjs
function isDefined(value) {
  return value !== null && value !== void 0;
}
function buildLucideIconNode(icon, params = {}) {
  const attributeNames = params.attributeNames ?? {};
  const getAttributeName = (attributeName) => attributeNames[attributeName] ?? attributeName;
  const viewBoxWidth = icon.size ?? icon.width ?? defaultAttributes["width"];
  const viewBoxHeight = icon.size ?? icon.height ?? defaultAttributes["height"];
  const aliasClassNames = icon.aliases?.filter((alias) => typeof alias === "string" && alias.trim() !== "").map((alias) => `lucide-${alias}`) ?? [];
  const iconClassNames = [...icon.name ? [`lucide-${icon.name}`] : [], ...aliasClassNames];
  const classNamesFromClassName = params.className?.split(" ").filter(Boolean) ?? [];
  const className = params.includeDefaultClasses === false ? mergeClasses(...classNamesFromClassName) : mergeClasses("lucide", ...iconClassNames, ...classNamesFromClassName);
  const calculatedStrokeWidth = params.absoluteStrokeWidth ? Number(params.strokeWidth ?? defaultAttributes["stroke-width"]) * Number(icon.size ?? icon.width ?? defaultAttributes["width"]) / Number(params.size ?? params.width ?? defaultAttributes["width"]) : params.strokeWidth ?? defaultAttributes["stroke-width"];
  const attributes = {
    ...Object.entries(defaultAttributes).reduce((attrs, [attrName, value]) => {
      attrs[getAttributeName(attrName)] = value;
      return attrs;
    }, {}),
    ..."color" in params && params.color && {
      [getAttributeName("stroke")]: params.color
    },
    ..."size" in params && isDefined(params.size) && {
      [getAttributeName("width")]: params.size,
      [getAttributeName("height")]: params.size
    },
    ..."width" in params && isDefined(params.width) && {
      [getAttributeName("width")]: params.width
    },
    ..."height" in params && isDefined(params.height) && {
      [getAttributeName("height")]: params.height
    },
    [getAttributeName("stroke-width")]: calculatedStrokeWidth,
    ...className && {
      [getAttributeName("class")]: className
    },
    [getAttributeName("viewBox")]: `0 0 ${viewBoxWidth} ${viewBoxHeight}`,
    ...params.hasA11yProp === false ? {
      [getAttributeName("aria-hidden")]: "true"
    } : {},
    ..."attributes" in params && params.attributes
  };
  return [
    "svg",
    attributes,
    icon.node.map((child) => {
      const [name2, attrs, children] = child;
      const nextAttrs = params.nonScalingStroke ? { [getAttributeName("vector-effect")]: "non-scaling-stroke", ...attrs } : attrs;
      return children ? [name2, nextAttrs, children] : [name2, nextAttrs];
    })
  ];
}

// node_modules/.pnpm/lucide-react@1.46.0_react@19.3.0/node_modules/lucide-react/dist/esm/shared/src/build/buildLucideIconForReact.mjs
function buildLucideIconForReact(icon, params = {}) {
  return buildLucideIconNode(icon, {
    ...params,
    attributeNames: {
      ...params.attributeNames,
      class: "className",
      "stroke-width": "strokeWidth",
      "stroke-linecap": "strokeLinecap",
      "stroke-linejoin": "strokeLinejoin",
      "vector-effect": "vectorEffect"
    }
  });
}

// node_modules/.pnpm/lucide-react@1.46.0_react@19.3.0/node_modules/lucide-react/dist/esm/shared/src/utils/hasA11yProp.mjs
var hasA11yProp = (props) => {
  for (const prop in props) {
    if (prop.startsWith("aria-") || prop === "role" || prop === "title") {
      return true;
    }
  }
  return false;
};

// node_modules/.pnpm/lucide-react@1.46.0_react@19.3.0/node_modules/lucide-react/dist/esm/context.mjs
var import_react = require("react");
var LucideContext = (0, import_react.createContext)({});
var useLucideContext = () => (0, import_react.useContext)(LucideContext);

// node_modules/.pnpm/lucide-react@1.46.0_react@19.3.0/node_modules/lucide-react/dist/esm/Icon.mjs
var Icon2 = (0, import_react2.forwardRef)(
  ({
    color,
    size,
    width,
    height,
    strokeWidth,
    absoluteStrokeWidth,
    nonScalingStroke,
    className = "",
    children,
    iconNode = [],
    icon = {
      node: iconNode,
      aliases: [],
      size: 24
    },
    ...rest
  }, ref) => {
    const {
      size: contextSize = 24,
      strokeWidth: contextStrokeWidth = 2,
      absoluteStrokeWidth: contextAbsoluteStrokeWidth = false,
      nonScalingStroke: contextNonScalingStroke = false,
      color: contextColor = "currentColor",
      className: contextClass = ""
    } = useLucideContext() ?? {};
    const hasAccessibleProp = Boolean(children) || hasA11yProp(rest);
    const [name2, svgAttributes, builtIconNode = []] = buildLucideIconForReact(icon, {
      color: color ?? contextColor,
      width: width ?? size ?? contextSize,
      height: height ?? size ?? contextSize,
      strokeWidth: strokeWidth ?? contextStrokeWidth,
      absoluteStrokeWidth: absoluteStrokeWidth ?? contextAbsoluteStrokeWidth,
      nonScalingStroke: nonScalingStroke ?? contextNonScalingStroke,
      className: mergeClasses(contextClass, className),
      hasA11yProp: hasAccessibleProp,
      attributes: rest
    });
    return (0, import_react2.createElement)(
      name2,
      {
        ref,
        ...svgAttributes
      },
      [
        ...builtIconNode.map(([tag, attrs]) => (0, import_react2.createElement)(tag, attrs)),
        ...Array.isArray(children) ? children : [children]
      ]
    );
  }
);

// node_modules/.pnpm/lucide-react@1.46.0_react@19.3.0/node_modules/lucide-react/dist/esm/createLucideIcon.mjs
function createLucideIcon(iconDataOrName, iconNode = [], aliases = []) {
  const iconData = typeof iconDataOrName === "string" ? toLucideIconData(iconDataOrName, iconNode, aliases) : iconDataOrName;
  const Component = (0, import_react3.forwardRef)(
    ({ className, ...props }, ref) => (0, import_react3.createElement)(Icon2, {
      ref,
      icon: iconData,
      className,
      ...props
    })
  );
  if (iconData.name) {
    Component.displayName = toPascalCase(iconData.name);
  }
  return Component;
}

// node_modules/.pnpm/lucide-react@1.46.0_react@19.3.0/node_modules/lucide-react/dist/esm/icons/image.mjs
var __iconData = {
  name: "image",
  size: 24,
  node: [
    ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", ry: "2", key: "1m3agn" }],
    ["circle", { cx: "9", cy: "9", r: "2", key: "af1f0g" }],
    ["path", { d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21", key: "1xmnt7" }]
  ]
};
__iconData.node;
var Image = createLucideIcon(__iconData);

// plugins/tool-render/src/client.tsx
var languageModules = {
  javascript,
  typescript,
  json,
  python,
  bash,
  yaml,
  markdown,
  css,
  xml,
  html: xml,
  sql,
  go,
  rust,
  java,
  c,
  cpp,
  diff
};
var registeredLanguages = /* @__PURE__ */ new Set();
function ensureLanguage(name2) {
  if (!Object.prototype.hasOwnProperty.call(languageModules, name2)) return;
  if (registeredLanguages.has(name2)) return;
  core_default.registerLanguage(name2, languageModules[name2]);
  registeredLanguages.add(name2);
}
var EXTENSION_LANGUAGE = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescript",
  json: "json",
  jsonc: "json",
  jsonl: "json",
  py: "python",
  pyi: "python",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  markdown: "markdown",
  css: "css",
  html: "xml",
  htm: "xml",
  xml: "xml",
  svg: "xml",
  sql: "sql",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  hh: "cpp",
  diff: "diff",
  patch: "diff"
};
var useState = import_react4.default.useState;
var useEffect = import_react4.default.useEffect;
var useRef = import_react4.default.useRef;
var IconBrowseOutline162 = primitives.IconBrowseOutline16;
var IconEditOutline162 = primitives.IconEditOutline16;
var IconApiOutline142 = primitives.IconApiOutline14;
var IconChevronDownOutline142 = primitives.IconChevronDownOutline14;
var IconInspectOutline122 = primitives.IconInspectOutline12;
var IconChecklistOutline142 = primitives.IconChecklistOutline14;
var IconPlayOutline162 = primitives.IconPlayOutline16;
var IconQuestionOutline142 = primitives.IconQuestionOutline14;
var IconAgentPresetOutline162 = primitives.IconAgentPresetOutline16;
var IconStopFill162 = primitives.IconStopFill16;
var MarkdownText2 = primitives.MarkdownText;
var PLUGIN_NAME = "tool-render";
var COMPACTION_VIEWS_KEY = "tool-render/compaction-views";
var GUARDED_APPROVALS_KEY = "tool-render/guarded-approvals";
var STYLE_TAG_ID = "tool-render/client.module.css";
var HLJS_BOX_CSS = [
  "pre code.hljs{display:block;overflow-x:auto;padding:1em}",
  "code.hljs{padding:0.1875rem 0.3125rem}",
  ".hljs{color:#c9d1d9;background:#0d1117}"
].join("");
injectStyle(PLUGIN_NAME, STYLE_TAG_ID, mergeCss(client_default, HLJS_BOX_CSS));
injectStyle(PLUGIN_NAME, "tool-render/bash-graph.css", stripBashGraphRoot(styles_default));
injectStyle(PLUGIN_NAME, "dsh-hljs-theme", HLJS_THEME_CSS);
injectStyle(PLUGIN_NAME, "dsh-permission-outline", PERMISSION_OUTLINE_CSS);
injectStyle(PLUGIN_NAME, "dsh-plan-row", PLAN_ROW_CSS);
var HLJS_SCOPE_SELECTOR = ".tool-render-card pre code";
function hljsPassEligible(el) {
  if (el.dataset.highlighted) return false;
  if (el.children && el.children.length > 0) return false;
  var cls = typeof el.className === "string" ? el.className : "";
  var m = /(?:^|\s)language-([A-Za-z0-9_-]+)/.exec(cls);
  if (m !== null) return core_default.getLanguage(m[1].toLowerCase()) !== void 0;
  return (el.textContent || "").length <= 4096;
}
function runHljsPass(root) {
  var blocks;
  try {
    blocks = root.querySelectorAll(HLJS_SCOPE_SELECTOR);
  } catch (error) {
    return;
  }
  for (var i = 0; i < blocks.length; i++) {
    var el = blocks[i];
    if (!hljsPassEligible(el)) continue;
    try {
      core_default.highlightElement(el);
    } catch (error) {
    }
  }
}
function ensureHljsPass() {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
  if (typeof window !== "undefined" && window.__toolRenderHljsPass) return;
  if (typeof window !== "undefined") window.__toolRenderHljsPass = true;
  runHljsPass(document);
  var observer = new MutationObserver(function(mutations) {
    for (var m = 0; m < mutations.length; m++) {
      var added = mutations[m].addedNodes;
      if (!added || added.length === 0) continue;
      for (var i = 0; i < added.length; i++) {
        var node = added[i];
        if (!node || node.nodeType !== 1) continue;
        if (typeof node.matches === "function" && node.matches(HLJS_SCOPE_SELECTOR)) {
          if (hljsPassEligible(node)) {
            try {
              core_default.highlightElement(node);
            } catch (error) {
            }
          }
          continue;
        }
        if (typeof node.querySelectorAll === "function") {
          var blocks = node.querySelectorAll(HLJS_SCOPE_SELECTOR);
          for (var b = 0; b < blocks.length; b++) {
            var el = blocks[b];
            if (!hljsPassEligible(el)) continue;
            try {
              core_default.highlightElement(el);
            } catch (error) {
            }
          }
        }
      }
    }
  });
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
}
ensureHljsPass();
function parseArgs2(raw) {
  if (typeof raw !== "string" || raw === "") return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}
function doneOf(block) {
  return block !== null && typeof block === "object" && "kind" in block;
}
function argsRawOf(block) {
  return doneOf(block) ? block.call && typeof block.call.argsRaw === "string" ? block.call.argsRaw : "" : block !== null && typeof block === "object" && typeof block.argsRaw === "string" ? block.argsRaw : "";
}
function callNameOf(block) {
  return doneOf(block) ? block.call && typeof block.call.name === "string" ? block.call.name : "" : block !== null && typeof block === "object" && typeof block.name === "string" ? block.name : "";
}
function rowStateOf(block) {
  if (block === null || typeof block !== "object" || !doneOf(block)) return "running";
  if (block.error && block.error.code === "interrupted") return "stopped";
  return block.isError === true ? "error" : "ok";
}
function guardRewriteOf(block, resultText) {
  if (!doneOf(block)) return null;
  var meta = block.meta;
  if (meta !== null && typeof meta === "object" && !Array.isArray(meta)) {
    if (meta.rewritten !== true) return null;
    if (typeof meta.ran !== "string" || meta.ran.length === 0) return null;
    return { ran: meta.ran };
  }
  return guardRewriteFromText(resultText);
}
function resultTextOf(block) {
  if (!doneOf(block)) return null;
  var parts = [];
  var content = Array.isArray(block.content) ? block.content : [];
  for (var i = 0; i < content.length; i++) {
    var item = content[i];
    if (item && item.type === "text" && typeof item.text === "string") parts.push(item.text);
    else if (item) {
      try {
        parts.push(JSON.stringify(item, null, 2));
      } catch (error) {
      }
    }
  }
  return parts.join("\n");
}
function errorTextOf(block) {
  if (!doneOf(block)) return null;
  var text = resultTextOf(block);
  if (text !== null && text !== "") return text;
  if (block.error && block.error.message) return String(block.error.message);
  if (block.error && block.error.code) return String(block.error.code);
  return null;
}
function firstLine2(text) {
  var at = text.indexOf("\n");
  return at === -1 ? text : text.slice(0, at);
}
function relativizeToCwd(text, cwd) {
  if (typeof cwd !== "string" || cwd === "" || typeof text !== "string") return text;
  var root = cwd.replace(/[/\\]+$/, "");
  if (text === root) return text;
  if (text.indexOf(root + "/") === 0) return text.slice(root.length + 1);
  if (text.indexOf(root + "\\") === 0) return text.slice(root.length + 1);
  return text;
}
function escalatedOf(args) {
  var mode = args !== null && args !== void 0 ? pickString2(args, ["sandbox_permissions"]) : void 0;
  return mode === "workspace-write" || mode === "danger-full-access";
}
function pickString2(value, keys) {
  for (var i = 0; i < keys.length; i++) {
    var v = value[keys[i]];
    if (typeof v === "string" && v !== "") return v;
  }
  return void 0;
}
var ANSI_RE = /\x1B(?:\[[0-9;?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\)|\([A-Z0-9]|\)[A-Z0-9])|[\r\u0008]/g;
function stripAnsi(text) {
  return String(text).replace(ANSI_RE, "");
}
function extOf(path) {
  var m = /\.([A-Za-z0-9_+-]+)$/.exec(String(path || ""));
  return m === null ? "" : m[1].toLowerCase();
}
function languageFor(path) {
  var ext = extOf(path);
  return EXTENSION_LANGUAGE[ext] || null;
}
function highlightCode(text, language) {
  if (language !== null) ensureLanguage(language);
  var use = language !== null && core_default.getLanguage(language) ? language : null;
  try {
    if (use !== null) return core_default.highlight(text, { language: use }).value;
  } catch (error) {
  }
  return escapeHtml(text);
}
function toolNameHue(name2) {
  var h = 0;
  for (var i = 0; i < name2.length; i++) {
    h = h * 31 + name2.charCodeAt(i) | 0;
  }
  h = Math.abs(h);
  var golden = 0.6180339887498949;
  var frac2 = h * golden % 1;
  return Math.floor(frac2 * 360);
}
function toolNameBadge(toolName, icon, state) {
  if (toolName === void 0 || toolName === null || toolName === "") return null;
  var isError = state === "error";
  var isBash = toolName === "Run bash";
  var hue = toolNameHue(toolName);
  var background = isError ? "color-mix(in srgb, var(--dsw-alias-state-error-primary) 85%, black)" : isBash ? "color-mix(in srgb, var(--dsh-outline-guard) 55%, var(--dsw-alias-bg-tertiary))" : "color-mix(in srgb, hsl(" + hue + " 65% 45%) 55%, var(--dsw-alias-bg-tertiary))";
  var border = isError ? "#fff" : isBash ? "var(--dsh-outline-guard)" : "hsl(" + hue + " 55% 60%)";
  var color = isError ? "#fff" : void 0;
  return /* @__PURE__ */ import_react4.default.createElement(
    "span",
    {
      className: "tool-render-name-badge",
      style: { background, borderColor: border, color }
    },
    /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-name-badge-icon" }, icon),
    /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-name-badge-text", title: toolName, "data-dsh-tip": "" }, toolName)
  );
}
function toolRenderRow(options) {
  var answerable = options.callId !== void 0 && options.callId !== null && typeof options.useSession === "function";
  return answerable ? /* @__PURE__ */ import_react4.default.createElement(ToolRenderAnswerableCard, { options }) : renderToolRenderCard(options, false);
}
function ToolRenderAnswerableCard(props) {
  var options = props.options;
  var approvalOpen = options.useSession(function(snapshot) {
    return pendingApprovalOf(snapshot, options.callId) !== null;
  }) === true;
  return renderToolRenderCard(options, approvalOpen);
}
function renderToolRenderCard(options, approvalOpen) {
  var interactive = options.expandable === true;
  var open = (options.expanded === true || approvalOpen === true || options.questionState === "pending") && interactive;
  var leading = toolNameBadge(options.toolName, options.icon, options.state);
  var summary;
  var showsError = options.state === "error" && options.errorSummary !== void 0;
  if (!showsError && options.path !== void 0 && options.path !== null && options.onOpenFile !== void 0) {
    summary = /* @__PURE__ */ import_react4.default.createElement(
      "span",
      {
        className: "tool-render-path",
        role: "link",
        tabIndex: 0,
        title: options.path,
        "data-dsh-tip": "",
        onClick: function(event) {
          event.stopPropagation();
          options.onOpenFile(options.path);
        },
        onKeyDown: function(event) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            options.onOpenFile(options.path);
          }
        }
      },
      options.summary
    );
  } else {
    summary = /* @__PURE__ */ import_react4.default.createElement(
      "span",
      {
        className: "tool-render-summary",
        "tool-render-error": options.errorSummary !== void 0 || void 0
      },
      options.errorSummary !== void 0 ? options.errorSummary : options.summary
    );
  }
  return /* @__PURE__ */ import_react4.default.createElement(
    "div",
    {
      className: "tool-render-card",
      "data-call-id": options.callId ?? void 0,
      "data-escalated": options.escalated || void 0,
      "data-escalation-mode": options.escalation !== null && options.escalation !== void 0 ? options.escalation.mode : void 0,
      "data-guard-approval": options.guardApproval || void 0,
      "data-guard-pending": options.guardPending || void 0,
      "data-escalation-pending": options.escalationPending || void 0,
      "data-question-pending": options.questionState === "pending" || void 0,
      "data-question-answered": options.questionState === "answered" || void 0,
      "data-error": options.state === "error" || void 0,
      "data-stopped": options.state === "stopped" || void 0,
      "data-run-code": options.runCode || void 0
    },
    /* @__PURE__ */ import_react4.default.createElement(
      "div",
      {
        className: "tool-render-row",
        "data-state": options.state,
        "data-expandable": interactive || void 0,
        role: interactive ? "button" : void 0,
        tabIndex: interactive ? 0 : void 0,
        "aria-expanded": interactive ? open : void 0,
        onClick: interactive ? options.onToggle : void 0,
        onKeyDown: interactive ? function(event) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            options.onToggle();
          }
        } : void 0
      },
      interactive ? /* @__PURE__ */ import_react4.default.createElement(
        IconChevronDownOutline142,
        {
          className: open ? "tool-render-chevron tool-render-chevron-open" : "tool-render-chevron"
        }
      ) : /* @__PURE__ */ import_react4.default.createElement(
        IconChevronDownOutline142,
        {
          className: "tool-render-chevron tool-render-chevron-disabled",
          "aria-hidden": true
        }
      ),
      leading,
      leading === null ? /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-title" }, options.title) : null,
      options.badge !== void 0 && options.badge !== null && options.badge !== "" ? /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-badge" }, options.badge) : null,
      options.callId !== void 0 && options.callId !== null && typeof options.useSession === "function" ? /* @__PURE__ */ import_react4.default.createElement(
        ToolRenderApprovalVerdict,
        {
          callId: options.callId,
          useSession: options.useSession,
          useProjection: options.useProjection,
          tip: options.verdictTip
        }
      ) : null,
      /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-sep", "aria-hidden": true }),
      summary
    ),
    open === true ? /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-body" }, options.body !== null && options.body !== void 0 ? options.body : options.state === "error" && options.errorText !== null && options.errorText !== void 0 && options.errorText !== "" ? /* @__PURE__ */ import_react4.default.createElement("pre", { className: "tool-render-output", "tool-render-error": true }, options.errorText) : null, options.inspect !== void 0 ? /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", className: "tool-render-inspect", onClick: options.inspect }, /* @__PURE__ */ import_react4.default.createElement(IconInspectOutline122, null), " Inspect") : null) : null,
    options.below !== null && options.below !== void 0 ? options.below : null,
    options.callId !== void 0 && options.callId !== null && typeof options.useSession === "function" ? /* @__PURE__ */ import_react4.default.createElement(
      ToolRenderApprovalBar,
      {
        callId: options.callId,
        useSession: options.useSession,
        useProjection: options.useProjection,
        escalation: options.escalation
      }
    ) : null
  );
}
function ToolRenderApprovalVerdict(props) {
  var decidedRecord = useGuardedApprovals(props.useSession, props.useProjection);
  var outcome = decidedRecord !== null && decidedRecord !== void 0 ? decidedRecord.outcomes[props.callId] : void 0;
  var label = outcome === "allowed-once" || outcome === "approved" ? "approved" : outcome === "rejected" ? "rejected" : null;
  if (label === null) return null;
  return /* @__PURE__ */ import_react4.default.createElement(
    "span",
    {
      className: "tool-render-verdict",
      "data-outcome": label,
      title: props.tip !== null && props.tip !== void 0 ? props.tip : void 0
    },
    /* @__PURE__ */ import_react4.default.createElement(
      "svg",
      {
        className: "tool-render-verdict-shield",
        viewBox: "0 0 16 16",
        width: "11",
        height: "11",
        "aria-hidden": true,
        focusable: "false"
      },
      /* @__PURE__ */ import_react4.default.createElement(
        "path",
        {
          d: "M8 1.5 3 3.4v4.2c0 3.1 2.1 5.9 5 6.9 2.9-1 5-3.8 5-6.9V3.4L8 1.5Z",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: "1.3",
          strokeLinejoin: "round"
        }
      )
    ),
    /* @__PURE__ */ import_react4.default.createElement("span", null, label === "approved" ? "APPROVED" : "REJECTED")
  );
}
function pendingApprovalOf(snapshot, callId) {
  var pending = snapshot !== null && snapshot !== void 0 ? snapshot.pending : void 0;
  if (!Array.isArray(pending)) return null;
  for (var p = 0; p < pending.length; p++) {
    var item = pending[p];
    if (item === null || item === void 0 || item.kind !== "approval") continue;
    var payload = item.payload;
    if (payload === null || payload === void 0) continue;
    if (payload.callId !== callId) continue;
    return item;
  }
  return null;
}
function buildApprovalSteer(sessions) {
  return function steerTo(sessionId, comment) {
    if (sessions === void 0 || sessions === null) {
      console.warn("[tool-render] steering skipped, sessions service is unavailable");
      return Promise.resolve(false);
    }
    var binding = sessions.binding(sessionId);
    if (binding === void 0 || binding.session === void 0) {
      console.warn("[tool-render] steering skipped, session binding is gone", sessionId);
      return Promise.resolve(false);
    }
    return binding.session.prompt([{ type: "text", text: comment }], "steer").then(
      function(result) {
        if (!result.ok)
          console.warn(
            "[tool-render] steering failed",
            result.error && result.error.code,
            result.error && result.error.message
          );
        return result.ok === true;
      },
      function(error) {
        console.warn("[tool-render] steering threw", error);
        return false;
      }
    );
  };
}
var approvalSteerTo = null;
var REJECT_ARM_RESET_MS = 4e3;
function ToolRenderApprovalBar(props) {
  var pendingRef = useRef(null);
  var approvalId = props.useSession(function(snapshot) {
    var found = pendingApprovalOf(snapshot, props.callId);
    pendingRef.current = found;
    return found === null ? null : String(found.payload.approvalId);
  });
  var answeredState = useState(false);
  var answered = answeredState[0];
  var setAnswered = answeredState[1];
  var commentOpenState = useState(false);
  var commentOpen = commentOpenState[0];
  var setCommentOpen = commentOpenState[1];
  var draftState = useState("");
  var draft = draftState[0];
  var setDraft = draftState[1];
  var armedState = useState(false);
  var armed = armedState[0];
  var setArmed = armedState[1];
  var armTimerRef = useRef(0);
  useEffect(function() {
    return function() {
      if (armTimerRef.current !== 0) clearTimeout(armTimerRef.current);
    };
  }, []);
  useEffect(
    function() {
      setAnswered(false);
      setArmed(false);
      setDraft("");
      setCommentOpen(false);
    },
    [approvalId]
  );
  var answer = function(outcome) {
    if (answered) return;
    var current = pendingRef.current;
    if (current === null || current === void 0) return;
    console.debug("[tool-render] approval answer:", outcome, props.callId);
    setAnswered(true);
    var commentText = draft.trim();
    if (commentText !== "") {
      if (approvalSteerTo !== null) {
        approvalSteerTo(current.sessionId, commentText);
      } else {
        console.warn("[tool-render] comment dropped, steering wire is unavailable");
      }
    }
    try {
      Promise.resolve(
        current.respond({
          ok: true,
          value: {
            sessionId: current.sessionId,
            approvalId: current.payload.approvalId,
            outcome
          }
        })
      ).then(function(receipt) {
        if (receipt === void 0 || receipt === null || !receipt.accepted) {
          throw new Error(
            "approval response rejected: " + (receipt === void 0 || receipt === null || receipt.reason === void 0 ? "unknown" : receipt.reason)
          );
        }
        console.debug("[tool-render] approval answered", props.callId, outcome);
      }).catch(function(error) {
        console.warn("[tool-render] approval answer failed", props.callId, outcome, error);
        setAnswered(false);
      });
    } catch (error) {
      console.warn("[tool-render] approval answer failed", props.callId, outcome, error);
      setAnswered(false);
    }
  };
  var clearArm = function() {
    if (armTimerRef.current !== 0) {
      clearTimeout(armTimerRef.current);
      armTimerRef.current = 0;
    }
  };
  var onReject = function() {
    if (answered) return;
    if (draft.trim() !== "") {
      clearArm();
      setArmed(false);
      answer("rejected");
      return;
    }
    if (armed) {
      clearArm();
      setArmed(false);
      answer("rejected");
      return;
    }
    setArmed(true);
    clearArm();
    armTimerRef.current = setTimeout(function() {
      armTimerRef.current = 0;
      setArmed(false);
    }, REJECT_ARM_RESET_MS);
  };
  var onApprove = function() {
    if (answered) return;
    answer("allowed-once");
  };
  var onCommentKeyDown = function(event) {
    if (answered) return;
    if (event.key === "Escape") {
      setCommentOpen(false);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !(event.nativeEvent && event.nativeEvent.isComposing)) {
      event.preventDefault();
      onReject();
    }
  };
  var pending = approvalId === null ? null : pendingRef.current;
  if (pending === null || pending === void 0) {
    return null;
  }
  var hasDraft = draft.trim() !== "";
  var argsEscalation = props.escalation !== null && props.escalation !== void 0 ? props.escalation : null;
  var pendingPayload = pending !== null && pending !== void 0 ? pending.payload : void 0;
  var pendingReason = pendingPayload !== null && pendingPayload !== void 0 ? pendingPayload.reason : void 0;
  var reasonText = argsEscalation !== null ? null : typeof pendingReason === "string" && pendingReason.trim() !== "" && !isBashGuardReason(pendingReason) ? pendingReason : null;
  return /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-approval-strip" }, reasonText === null ? null : /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-approval-reason" }, reasonText), /* @__PURE__ */ import_react4.default.createElement(
    "button",
    {
      type: "button",
      className: "tool-render-approval-comment-toggle",
      disabled: answered,
      "aria-expanded": commentOpen,
      onClick: function() {
        setCommentOpen(!commentOpen);
      }
    },
    commentOpen ? "hide comment" : "add comment"
  ), commentOpen ? /* @__PURE__ */ import_react4.default.createElement(
    "textarea",
    {
      className: "tool-render-approval-comment",
      rows: 2,
      value: draft,
      disabled: answered,
      autoFocus: true,
      "aria-label": "Comment for the agent",
      placeholder: "Optional comment for the agent",
      onChange: function(event) {
        setDraft(event.target.value);
      },
      onKeyDown: onCommentKeyDown
    }
  ) : null, /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-approval-actions" }, /* @__PURE__ */ import_react4.default.createElement(
    "button",
    {
      type: "button",
      className: "tool-render-approval-btn tool-render-approval-reject",
      "data-armed": armed && !hasDraft ? true : void 0,
      disabled: answered,
      onClick: onReject
    },
    armed && !hasDraft ? "? Confirm reject" : "\u2717 Reject"
  ), /* @__PURE__ */ import_react4.default.createElement(
    "button",
    {
      type: "button",
      className: "tool-render-approval-btn tool-render-approval-approve",
      "data-with-comment": hasDraft || void 0,
      disabled: answered,
      onClick: onApprove
    },
    hasDraft ? "Approve + send" : "\u2713 Approve"
  )));
}
function ReadRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var block = props.block;
  var done = doneOf(block);
  var args = parseArgs2(argsRawOf(block));
  var path = args !== null ? pickString2(args, ["path", "file_path"]) : void 0;
  var output = done ? resultTextOf(block) : null;
  var errorText = done ? errorTextOf(block) : null;
  var state = rowStateOf(block);
  var errorSummary = state === "error" && errorText !== null && errorText !== "" ? firstLineOfError(errorText) : void 0;
  var summary = path !== void 0 ? relativizeToCwd(firstLine2(path), props.cwd) : "Read";
  var body = null;
  if (output !== null && output !== "") {
    if (state === "error") {
      body = /* @__PURE__ */ import_react4.default.createElement("pre", { className: "tool-render-output", "tool-render-error": true }, output);
    } else {
      var rows = numberedReadRows(output, readStartLine(args, output));
      var language = languageFor(path !== void 0 ? path : "");
      body = /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-code" }, readLineRows(rows, language));
    }
  }
  return toolRenderRow({
    callId: props.callId,
    useSession: props.useSession,
    useProjection: props.useProjection,
    toolName: "Read file",
    icon: /* @__PURE__ */ import_react4.default.createElement(IconBrowseOutline162, { size: 14 }),
    title: "Read",
    summary,
    escalated: escalatedOf(args),
    path,
    onOpenFile: props.openFile,
    state,
    expandable: body !== null,
    expanded,
    onToggle: function() {
      setExpanded(!expanded);
    },
    body,
    errorSummary,
    errorText,
    inspect: props.inspect
  });
}
function escalationBanner(detail, settled) {
  return /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-escalation" }, /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-cmd-label" }, escalationLabel(settled), /* @__PURE__ */ import_react4.default.createElement(
    "code",
    {
      className: "tool-render-escalation-mode",
      title: "requested sandbox mode: " + detail.mode
    },
    detail.mode
  )), /* @__PURE__ */ import_react4.default.createElement("div", { className: escalationReasonClassName(settled) }, detail.justification));
}
var BASH_GRAPH_MAX_COMMAND = 2e4;
var BASH_GRAPH_CACHE_LIMIT = 200;
var bashGraphCache = /* @__PURE__ */ new Map();
var bashGraphNextIdx = 0;
var BASH_MEASURE_ID = "measure";
function ensureBashGraphMeasure() {
  if (typeof document === "undefined") return false;
  if (document.querySelector("#" + BASH_MEASURE_ID) !== null) return true;
  var el = document.createElement("div");
  el.id = BASH_MEASURE_ID;
  var parent = document.body || document.documentElement;
  if (!parent) return false;
  parent.appendChild(el);
  return document.querySelector("#" + BASH_MEASURE_ID) !== null;
}
function stripBashGraphRoot(cssText) {
  return String(cssText).replace(/:root[^{]*\{[^}]*\}/g, "").replace(/html\[data-theme="light"\]\{[^}]*\}/g, "");
}
function bashGraphCacheKey(command, pipeStages) {
  var stages = "";
  if (pipeStages !== void 0 && pipeStages !== null) {
    try {
      stages = JSON.stringify(pipeStages);
    } catch (err) {
      stages = String(pipeStages);
    }
  }
  return command + "\n" + stages;
}
function getBashGraphPanels(command, pipeStages) {
  if (typeof command !== "string" || command.length > BASH_GRAPH_MAX_COMMAND) return [];
  ensureBashGraphMeasure();
  var key = bashGraphCacheKey(command, pipeStages);
  var hit = bashGraphCache.get(key);
  if (hit !== void 0) return hit;
  var engines = { adopted: 0, avail: cardAvail() };
  var scan = { status: "stable-unavailable", nodes: [] };
  var idx = bashGraphNextIdx;
  var result = renderOne(idx, command, scan, engines, pipeStages);
  bashGraphNextIdx = idx + 1;
  if (bashGraphCache.size >= BASH_GRAPH_CACHE_LIMIT) {
    var oldest = bashGraphCache.keys().next();
    if (!oldest.done) bashGraphCache.delete(oldest.value);
  }
  bashGraphCache.set(key, result.panelsHTML);
  return result.panelsHTML;
}
function toggleBashGraphBlock(doc, btn) {
  if (doc === null || doc === void 0 || btn === null || btn === void 0) return false;
  var hd = btn.getAttribute("data-hd");
  var el = null;
  if (hd !== null) {
    el = doc.getElementById("hd-" + hd);
  } else {
    var arg = btn.getAttribute("data-arg");
    if (arg !== null) el = doc.getElementById("arg-" + arg);
  }
  if (el === null || el === void 0) return false;
  var willShow = el.hasAttribute("hidden");
  if (willShow) el.removeAttribute("hidden");
  else el.setAttribute("hidden", "");
  btn.setAttribute("aria-expanded", willShow ? "true" : "false");
  return true;
}
function BashGraphPanels(props) {
  var panels = props.panels;
  var onPanelsClick = function(event) {
    var root = event.target && event.target.closest ? event.target.closest("[data-hd],[data-arg]") : null;
    if (root === null || typeof document === "undefined") return;
    toggleBashGraphBlock(document, root);
  };
  return /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-bash-graph", onClick: onPanelsClick }, /* @__PURE__ */ import_react4.default.createElement("div", { dangerouslySetInnerHTML: { __html: '<svg aria-hidden="true" style="display:none">' + PIPE_GLYPH_SYMBOL + "</svg>" } }), panels.map(function(html, i) {
    return /* @__PURE__ */ import_react4.default.createElement("div", { key: i, dangerouslySetInnerHTML: { __html: html } });
  }));
}
function BashTabStrip(props) {
  var tab = props.tab;
  var onSelect = props.onSelect;
  var idPrefix = props.idPrefix;
  var order = ["graph", "command"];
  var labelOf = function(id) {
    return id === "graph" ? "Visual" : "Command";
  };
  var onKeyDown = function(event) {
    var key = event.key;
    if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Home" && key !== "End")
      return;
    event.preventDefault();
    var next;
    if (key === "Home") next = "graph";
    else if (key === "End") next = "command";
    else {
      var at = order.indexOf(tab);
      var step = key === "ArrowRight" ? 1 : order.length - 1;
      next = order[(at + step) % order.length];
    }
    onSelect(next);
    var list = event.currentTarget.querySelectorAll('[role="tab"]');
    for (var i = 0; i < list.length; i++) {
      if (list[i].getAttribute("data-tab") === next) {
        list[i].focus();
        break;
      }
    }
  };
  var buttons = order.map(function(id) {
    var selected = tab === id;
    return /* @__PURE__ */ import_react4.default.createElement(
      "button",
      {
        key: id,
        type: "button",
        role: "tab",
        "data-tab": id,
        id: idPrefix !== null ? idPrefix + "-" + id : void 0,
        "aria-selected": selected,
        "aria-controls": idPrefix !== null ? idPrefix + "-panel" : void 0,
        tabIndex: selected ? 0 : -1,
        className: "tool-render-bash-tab",
        onClick: function() {
          onSelect(id);
        }
      },
      labelOf(id)
    );
  });
  return /* @__PURE__ */ import_react4.default.createElement(
    "div",
    {
      className: "tool-render-bash-tabs",
      role: "tablist",
      "aria-label": "Bash command view",
      onKeyDown
    },
    buttons
  );
}
function BashRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var bashTabUserState = useState(null);
  var bashTabUser = bashTabUserState[0];
  var setBashTabUser = bashTabUserState[1];
  var block = props.block;
  var done = doneOf(block);
  var argsObj = parseArgs2(argsRawOf(block));
  var command = argsObj !== null ? pickString2(argsObj, ["command"]) : void 0;
  var description = argsObj !== null ? pickString2(argsObj, ["description"]) : void 0;
  var output = done ? resultTextOf(block) : null;
  var errorText = done ? errorTextOf(block) : null;
  var state = bashErrorState(rowStateOf(block), output, block.meta);
  var errorSummary = state === "error" && errorText !== null && errorText !== "" ? firstLineOfError(errorText) : void 0;
  var summary = description !== void 0 && description !== "" ? firstLine2(description) : command !== void 0 ? firstLine2(command) : "Bash";
  var escalated = escalatedOf(argsObj);
  var escalation = escalationDetailOf(argsObj);
  var escalationSettled = props.useSession(function(snapshot) {
    return pendingApprovalOf(snapshot, props.callId) === null;
  }) === true;
  var durableGuardApproval = useGuardedApprovals(props.useSession, props.useProjection);
  var openGuardApproval = props.useSession(function(snapshot) {
    var open = pendingApprovalOf(snapshot, props.callId);
    if (open === null) return false;
    var payload = open.payload;
    if (payload === null || payload === void 0) return false;
    return isBashGuardReason(payload.reason);
  }) === true;
  var openEscalationApproval = props.useSession(function(snapshot) {
    var open = pendingApprovalOf(snapshot, props.callId);
    if (open === null) return false;
    var payload = open.payload;
    if (payload === null || payload === void 0) return false;
    return !isBashGuardReason(payload.reason);
  }) === true;
  var guardApproval = openGuardApproval;
  if (durableGuardApproval !== null && durableGuardApproval !== void 0 && durableGuardApproval.guarded[props.callId] === true) {
    guardApproval = true;
  }
  var guardRewrite = guardRewriteOf(block, output);
  if (guardRewrite !== null) guardApproval = true;
  var verdictTip = (function() {
    var rewriteLine = guardRewrite !== null ? guardRewriteTipLine(command, guardRewrite.ran) : null;
    var promptLine = null;
    if (durableGuardApproval !== null && durableGuardApproval !== void 0 && durableGuardApproval.reasons !== null && durableGuardApproval.reasons !== void 0) {
      var storedGuardReason = durableGuardApproval.reasons[props.callId];
      if (storedGuardReason !== void 0) {
        promptLine = summariseGuardPromptReason(storedGuardReason);
      }
    }
    return composeVerdictTooltip(rewriteLine, promptLine);
  })();
  var body = null;
  if (escalation !== null || command !== void 0 || output !== null && output !== "") {
    var inner = [];
    if (escalation !== null) {
      inner.push(escalationBanner(escalation, escalationSettled));
    }
    if (command !== void 0) {
      var commandBlock = function(label, text) {
        var commandHtml = highlightCode(text, "bash");
        var parts = [];
        if (label !== null) {
          parts.push(/* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-cmd-label" }, label));
        }
        parts.push(
          /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-command" }, label === null ? "$ " : null, /* @__PURE__ */ import_react4.default.createElement(
            "code",
            {
              className: "hljs",
              "data-highlighted": "yes",
              dangerouslySetInnerHTML: { __html: commandHtml }
            }
          ))
        );
        return parts;
      };
      var rewrittenPair = guardRewrite !== null && guardRewrite.ran !== command;
      var tabs = resolveBashTab(command, rewrittenPair);
      var diagramMeta = block.meta !== null && typeof block.meta === "object" && !Array.isArray(block.meta) ? block.meta : null;
      if (!rewrittenPair) {
        var graphStages = diagramMeta !== null ? diagramMeta.pipeStages : void 0;
        var graphPanelsNow = getBashGraphPanels(command, graphStages);
        var graphDrawableNow = graphPanelsNow.length > 0;
        tabs = {
          drawable: graphDrawableNow,
          showTabs: graphDrawableNow,
          defaultTab: graphDrawableNow ? "graph" : "command",
          commandText: tabs.commandText
        };
      }
      if (rewrittenPair) {
        inner.push.apply(
          inner,
          commandBlock("wrote", command).concat(
            commandBlock(guardRewriteLabel(command, guardRewrite.ran), guardRewrite.ran)
          )
        );
      } else if (tabs.showTabs) {
        var activeTab = bashTabUser === null ? tabs.defaultTab : bashTabUser;
        var tabPrefix = props.callId !== void 0 && props.callId !== null ? "bash-tab-" + String(props.callId) : null;
        inner.push(
          /* @__PURE__ */ import_react4.default.createElement(
            BashTabStrip,
            {
              tab: activeTab,
              onSelect: function(id) {
                setBashTabUser(id);
              },
              idPrefix: tabPrefix
            }
          )
        );
        var tabBody = null;
        if (activeTab === "graph") {
          tabBody = /* @__PURE__ */ import_react4.default.createElement(BashGraphPanels, { panels: graphPanelsNow });
        } else {
          tabBody = commandBlock(null, tabs.commandText ?? command);
        }
        inner.push(
          /* @__PURE__ */ import_react4.default.createElement(
            "div",
            {
              className: "tool-render-bash-panel",
              role: "tabpanel",
              id: tabPrefix !== null ? tabPrefix + "-panel" : void 0,
              "aria-labelledby": tabPrefix !== null ? tabPrefix + "-" + activeTab : void 0
            },
            tabBody
          )
        );
      } else {
        inner.push.apply(inner, commandBlock(null, tabs.commandText ?? command));
      }
    }
    if (output !== null && output !== "") {
      inner.push(
        /* @__PURE__ */ import_react4.default.createElement("pre", { className: "tool-render-output", "tool-render-error": state === "error" || void 0 }, stripAnsi(output))
      );
    }
    body = /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-io" }, inner);
  }
  return toolRenderRow({
    callId: props.callId,
    useSession: props.useSession,
    useProjection: props.useProjection,
    toolName: "Run bash",
    icon: /* @__PURE__ */ import_react4.default.createElement(IconApiOutline142, { size: 14 }),
    title: "Bash",
    summary,
    escalated,
    escalation,
    guardApproval,
    guardPending: openGuardApproval,
    escalationPending: openEscalationApproval,
    verdictTip,
    state,
    expandable: body !== null,
    expanded,
    onToggle: function() {
      setExpanded(!expanded);
    },
    body,
    errorSummary,
    errorText,
    inspect: props.inspect
  });
}
function narrowDiffs(diffs) {
  if (!Array.isArray(diffs) || diffs.length === 0) return null;
  var out = [];
  for (var i = 0; i < diffs.length; i++) {
    var hunk = diffs[i];
    if (typeof hunk !== "object" || hunk === null) return null;
    if (typeof hunk.path !== "string") return null;
    if (hunk.oldText !== null && typeof hunk.oldText !== "string") return null;
    if (typeof hunk.newText !== "string") return null;
    out.push({ path: hunk.path, oldText: hunk.oldText, newText: hunk.newText });
  }
  return out;
}
function wireDiffs(block) {
  if (block === null || typeof block !== "object") return null;
  if (!doneOf(block)) {
    var call = block.callView !== void 0 && block.callView !== null && block.callView.card === "diff" ? block.callView : null;
    var callDiffs = call === null ? null : narrowDiffs(call.diffs);
    return callDiffs === null ? null : { diffs: callDiffs };
  }
  var result = block.resultView !== void 0 && block.resultView !== null && block.resultView.card === "diff" ? block.resultView : null;
  var resultDiffs = result === null ? null : narrowDiffs(result.diffs);
  return resultDiffs === null ? null : { diffs: resultDiffs };
}
function matchesPath(a, b, cwd) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  var strip = function(p) {
    return p.replace(/[/\\]+$/, "");
  };
  if (strip(a) === strip(b)) return true;
  if (typeof cwd !== "string" || cwd === "") return false;
  var root = cwd.replace(/[/\\]+$/, "");
  var relA = relativizeToCwd(a, root);
  var relB = relativizeToCwd(b, root);
  if (strip(relA) === strip(relB)) return true;
  var joinedA = /^[/\\]/.test(a) ? a : root + "/" + a;
  var joinedB = /^[/\\]/.test(b) ? b : root + "/" + b;
  return strip(joinedA) === strip(joinedB);
}
function readsOf(snapshot, path, beforeTime, cwd) {
  var nodes = snapshot && snapshot.chat && snapshot.chat.nodes;
  if (nodes === void 0 || nodes === null || typeof nodes.values !== "function") return [];
  var iter = nodes.values();
  if (iter === null || iter === void 0) return [];
  var entries;
  if (typeof iter.next === "function") {
    entries = [];
    for (var entry = iter.next(); entry.done !== true; entry = iter.next())
      entries.push(entry.value);
  } else {
    entries = Array.isArray(iter) ? iter : [];
  }
  var out = [];
  for (var i = 0; i < entries.length; i++) {
    var node = entries[i];
    if (node === void 0 || node === null || node.kind !== "tool-call") continue;
    var block = node.data !== void 0 && node.data !== null ? node.data.root : void 0;
    if (block === void 0 || block === null) continue;
    if (callNameOf(block) !== "read") continue;
    if (doneOf(block) !== true || block.isError === true) continue;
    var time = typeof block.time === "number" ? block.time : void 0;
    if (time === void 0) continue;
    if (typeof beforeTime === "number" && time >= beforeTime) continue;
    var args = parseArgs2(argsRawOf(block));
    if (args === null) continue;
    var readPath = pickString2(args, ["path", "file_path"]);
    if (readPath === void 0 || !matchesPath(readPath, path, cwd)) continue;
    var text = resultTextOf(block);
    if (text === null || text === "") continue;
    out.push({ time, text, args });
  }
  out.sort(function(a, b) {
    return b.time - a.time;
  });
  return out;
}
function latestReadText(snapshot, path, beforeTime, cwd) {
  var reads = readsOf(snapshot, path, beforeTime, cwd);
  return reads.length === 0 ? null : reads[0].text;
}
function splitLines3(text) {
  return typeof text === "string" && text !== "" ? text.split("\n") : [];
}
function diffLines(oldText, newText) {
  var a = splitLines3(oldText);
  var b = splitLines3(newText);
  var n = a.length;
  var m = b.length;
  var dp = [];
  for (var i = 0; i <= n; i++) {
    dp.push(new Array(m + 1));
    dp[i][m] = 0;
  }
  for (var j = 0; j <= m; j++) dp[n][j] = 0;
  for (var i = n - 1; i >= 0; i--) {
    for (var j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  var ops = [];
  var i = 0;
  var j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "del", text: a[i] });
      i++;
    } else {
      ops.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) {
    ops.push({ type: "del", text: a[i] });
    i++;
  }
  while (j < m) {
    ops.push({ type: "add", text: b[j] });
    j++;
  }
  return ops;
}
function collectEditRequests(args) {
  var out = [];
  if (typeof args !== "object" || args === null) return out;
  if (typeof args.file_path === "string" && args.file_path !== "" && typeof args.old_string === "string") {
    out.push({
      path: args.file_path,
      oldText: args.old_string,
      newText: typeof args.new_string === "string" ? args.new_string : ""
    });
  }
  if (typeof args.path === "string" && args.path !== "" && typeof args.remove_from === "string") {
    out.push({
      path: args.path,
      oldText: null,
      newText: typeof args.replacement_text === "string" ? args.replacement_text : "",
      removeFrom: args.remove_from,
      removeTo: typeof args.remove_to === "string" ? args.remove_to : void 0
    });
  }
  var editPath = typeof args.path === "string" && args.path !== "" ? args.path : typeof args.file_path === "string" && args.file_path !== "" ? args.file_path : void 0;
  if (editPath !== void 0 && Array.isArray(args.edits)) {
    for (var i = 0; i < args.edits.length; i++) {
      var item = args.edits[i];
      if (!Array.isArray(item) || item.length !== 3 || typeof item[0] !== "string" || typeof item[1] !== "string" || typeof item[2] !== "string")
        continue;
      out.push({
        path: editPath,
        oldText: null,
        newText: item[2],
        removeFrom: item[0],
        removeTo: item[1] === "" ? void 0 : item[1]
      });
    }
  }
  return out;
}
function resolveEditDiffs(block, requests, useSession, cwd) {
  var running = !doneOf(block);
  var beforeTime = running ? block.time : typeof block.callTime === "number" ? block.callTime : void 0;
  var filter = typeof beforeTime === "number" ? beforeTime : void 0;
  var out = [];
  for (var i = 0; i < requests.length; i++) {
    var req = requests[i];
    var oldText = req.oldText;
    var oldStart;
    if (oldText === null && useSession !== void 0) {
      var recovered = useSession(function(snapshot) {
        var reads = readsOf(snapshot, req.path, filter, cwd);
        for (var r = 0; r < reads.length; r++) {
          var hunk = extractHunk(
            reads[r].text,
            req.removeFrom,
            req.removeTo,
            req.newText,
            readStartLine(reads[r].args, reads[r].text)
          );
          if (hunk !== null) return hunk;
        }
        return null;
      });
      if (recovered !== null) {
        oldText = recovered.before;
        oldStart = recovered.oldStart;
      }
    }
    out.push({ path: req.path, oldText, newText: req.newText, startOld: oldStart });
  }
  return out;
}
function allHunksNull(diffs) {
  for (var i = 0; i < diffs.length; i++) {
    if (diffs[i].oldText !== null) return false;
  }
  return true;
}
function diffFallbackBody(diffs, language) {
  var onlyDels = true;
  for (var i = 0; i < diffs.length; i++) {
    if (typeof diffs[i].newText === "string" && diffs[i].newText !== "") {
      onlyDels = false;
      break;
    }
  }
  var children = [
    /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-fallback-note" }, onlyDels ? "After text unavailable" : "Before text unavailable")
  ];
  var lines = [];
  var numbers = [];
  for (var i = 0; i < diffs.length; i++) {
    var d = diffs[i];
    var text = onlyDels ? deIndent(typeof d.oldText === "string" ? d.oldText : "") : deIndent(typeof d.newText === "string" ? d.newText : "");
    var parts = splitLines3(text);
    var startBase = typeof d.startOld === "number" ? d.startOld : 1;
    for (var j = 0; j < parts.length; j++) {
      lines.push(parts[j]);
      numbers.push(onlyDels ? null : startBase + j);
    }
  }
  var width = gutterWidthCh(numbers);
  for (var i = 0; i < lines.length; i++) {
    children.push(diffLineRow(onlyDels ? "del" : "add", lines[i], numbers[i], width, language));
  }
  return /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-diff-fallback" }, children);
}
function resolveEffectiveCwd(props) {
  if (typeof props.useSessions === "function") {
    try {
      var cwd = props.useSessions(function(list) {
        if (list === null || typeof list !== "object") return void 0;
        var id = typeof props.sessionId === "string" && props.sessionId !== "" ? props.sessionId : typeof list.current === "string" ? list.current : void 0;
        if (id === void 0) return void 0;
        var row = list.byId === void 0 || list.byId === null ? void 0 : list.byId[id];
        if (row === void 0 || row === null) return void 0;
        return row.cwd;
      });
      if (typeof cwd === "string" && cwd !== "") return cwd;
    } catch (error) {
    }
  }
  if (typeof props.cwd === "string" && props.cwd !== "") return props.cwd;
  return void 0;
}
function editBadgeLabel(rawName, toolTitle) {
  if (rawName === "edit") return "Edit file";
  if (rawName === "undo_edit") return "Undo edit";
  if (rawName === "undo_last_edit") return "Undo last edit";
  return toolTitle;
}
function makeEditRow(toolTitle) {
  return function EditToolRow(props) {
    var expandedState = useState(false);
    var expanded = expandedState[0];
    var setExpanded = expandedState[1];
    var block = props.block;
    if (block === null || typeof block !== "object") {
      return toolRenderRow({
        callId: props.callId,
        useSession: props.useSession,
        useProjection: props.useProjection,
        toolName: editBadgeLabel(callNameOf(block), toolTitle),
        icon: /* @__PURE__ */ import_react4.default.createElement(IconEditOutline162, { size: 14 }),
        title: toolTitle,
        summary: toolTitle,
        state: "ok",
        expandable: false,
        expanded: false,
        onToggle: function() {
        },
        body: null,
        inspect: props.inspect
      });
    }
    var done = doneOf(block);
    var args = parseArgs2(argsRawOf(block));
    var argsObject = args !== null ? args : {};
    var effectiveCwd = resolveEffectiveCwd(props);
    var wire = wireDiffs(block);
    var diffs = null;
    try {
      if (wire !== null) {
        diffs = wire.diffs;
      } else {
        var requests = collectEditRequests(argsObject);
        var resolved = resolveEditDiffs(block, requests, props.useSession, effectiveCwd);
        if (resolved.length > 0) diffs = resolved;
      }
    } catch (error) {
      diffs = null;
    }
    var output = done ? resultTextOf(block) : null;
    var errorText = done ? errorTextOf(block) : null;
    var state = rowStateOf(block);
    var errorSummary = state === "error" && errorText !== null && errorText !== "" ? firstLineOfError(errorText) : void 0;
    var summaryPath = pickString2(argsObject, ["path", "file_path"]);
    var summary = summaryPath !== void 0 ? relativizeToCwd(firstLine2(summaryPath), effectiveCwd) : toolTitle;
    var body = null;
    if (state !== "error" && diffs !== null && diffs.length > 0) {
      if (wire === null && done && state === "ok" && allHunksNull(diffs)) {
        body = diffFallbackBody(diffs, languageFor(summaryPath !== void 0 ? summaryPath : ""));
      } else {
        body = editDiffBody(diffs);
      }
    } else if (output !== null && output !== "") {
      body = /* @__PURE__ */ import_react4.default.createElement("pre", { className: "tool-render-output", "tool-render-error": state === "error" || void 0 }, output);
    }
    return toolRenderRow({
      callId: props.callId,
      useSession: props.useSession,
      useProjection: props.useProjection,
      // One component serves the `edit`, `undo_edit`, and `undo_last_edit`
      // registrations. The block carries the real call name, so the badge
      // shows the right human-readable label for the exact call being rendered.
      toolName: editBadgeLabel(callNameOf(block), toolTitle),
      icon: /* @__PURE__ */ import_react4.default.createElement(IconEditOutline162, { size: 14 }),
      title: toolTitle,
      summary,
      escalated: escalatedOf(args),
      path: summaryPath,
      onOpenFile: props.openFile,
      state,
      expandable: body !== null,
      expanded,
      onToggle: function() {
        setExpanded(!expanded);
      },
      body,
      errorSummary,
      errorText,
      inspect: props.inspect
    });
  };
}
var EditRow = makeEditRow("Edit");
var UndoEditRow = makeEditRow("Undo edit");
function gutterWidthCh(numbers) {
  var max = 1;
  for (var i = 0; i < numbers.length; i++) {
    if (numbers[i] === null || numbers[i] === void 0) continue;
    var len = String(numbers[i]).length;
    if (len > max) max = len;
  }
  return max + 2 + "ch";
}
function gutterSpan(number, width) {
  return /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-gutter", "aria-hidden": true, style: { width } }, number === null || number === void 0 ? "" : String(number));
}
function readLineRows(rows, language) {
  var numbers = [];
  for (var i = 0; i < rows.length; i++) numbers.push(rows[i].number);
  var width = gutterWidthCh(numbers);
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    out.push(
      /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-code-row" }, gutterSpan(rows[i].number, width), /* @__PURE__ */ import_react4.default.createElement(
        "code",
        {
          className: "tool-render-line-cell hljs",
          "data-highlighted": "yes",
          dangerouslySetInnerHTML: { __html: highlightCode(rows[i].text, language) }
        }
      ))
    );
  }
  return out;
}
function diffLineRow(type, text, number, width, language) {
  return /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-diff-row" + (type === "same" ? "" : " tool-render-line-" + type) }, diffMarker(type === "same" ? null : type), gutterSpan(number, width), /* @__PURE__ */ import_react4.default.createElement(
    "code",
    {
      className: "tool-render-line-cell hljs",
      "data-highlighted": "yes",
      dangerouslySetInnerHTML: { __html: highlightCode(text, language) }
    }
  ));
}
function alignDiffOps(ops, startOld) {
  var rows = [];
  var oldNum = typeof startOld === "number" ? startOld : 1;
  var newNum = typeof startOld === "number" ? startOld : 1;
  var i = 0;
  while (i < ops.length) {
    var op = ops[i];
    if (op.type === "same") {
      rows.push({
        left: { text: op.text, kind: "same" },
        right: { text: op.text, kind: "same" },
        oldNum: oldNum++,
        newNum: newNum++
      });
      i++;
      continue;
    }
    var dels = [];
    var adds = [];
    while (i < ops.length && ops[i].type !== "same") {
      if (ops[i].type === "del") dels.push(ops[i].text);
      else adds.push(ops[i].text);
      i++;
    }
    var n = Math.max(dels.length, adds.length);
    for (var k = 0; k < n; k++) {
      rows.push({
        left: dels[k] === void 0 ? null : { text: dels[k], kind: "del" },
        right: adds[k] === void 0 ? null : { text: adds[k], kind: "add" },
        oldNum: dels[k] === void 0 ? null : oldNum++,
        newNum: adds[k] === void 0 ? null : newNum++
      });
    }
  }
  return rows;
}
function diffMarker(kind) {
  return /* @__PURE__ */ import_react4.default.createElement(
    "span",
    {
      className: "tool-render-diff-marker" + (kind === null ? "" : " tool-render-diff-marker-" + kind),
      "aria-hidden": true
    },
    kind === "del" ? "-" : kind === "add" ? "+" : ""
  );
}
function diffCell(kind, text, number, width, language) {
  return /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-diff-cell" + (kind === "same" ? "" : " tool-render-line-" + kind) }, diffMarker(kind === "same" ? null : kind), gutterSpan(number, width), /* @__PURE__ */ import_react4.default.createElement(
    "code",
    {
      className: "tool-render-line-cell hljs",
      "data-highlighted": "yes",
      dangerouslySetInnerHTML: { __html: highlightCode(text, language) }
    }
  ));
}
function diffPairRow(row, leftWidth, rightWidth, language) {
  var left = row.left === null ? /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-diff-cell" }, diffMarker(null), gutterSpan(null, leftWidth)) : diffCell(row.left.kind, row.left.text, row.oldNum, leftWidth, language);
  var right = row.right === null ? /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-diff-cell" }, diffMarker(null), gutterSpan(null, rightWidth)) : diffCell(row.right.kind, row.right.text, row.newNum, rightWidth, language);
  return /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-diff-pair" }, left, right);
}
function editDiffBody(diffs) {
  var children = [];
  var previousPath = null;
  for (var i = 0; i < diffs.length; i++) {
    var file = diffs[i];
    var filePath = typeof file.path === "string" ? file.path : "";
    var language = languageFor(filePath);
    if (filePath !== previousPath) {
      children.push(/* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-diff-path" }, filePath));
      previousPath = filePath;
    } else {
      children.push(
        /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-diff-sep", "aria-hidden": true }, "\u22EF")
      );
    }
    var oldText = deIndent(typeof file.oldText === "string" ? file.oldText : "");
    var newText = deIndent(typeof file.newText === "string" ? file.newText : "");
    var ops = diffLines(oldText, newText);
    var hasDel = false;
    var hasAdd = false;
    for (var o = 0; o < ops.length; o++) {
      if (ops[o].type === "del") hasDel = true;
      else if (ops[o].type === "add") hasAdd = true;
      if (hasDel && hasAdd) break;
    }
    if (hasDel && hasAdd) {
      var rows = alignDiffOps(ops, typeof file.startOld === "number" ? file.startOld : 1);
      var leftNumbers = [];
      var rightNumbers = [];
      for (var r = 0; r < rows.length; r++) {
        leftNumbers.push(rows[r].oldNum);
        rightNumbers.push(rows[r].newNum);
      }
      var leftWidth = gutterWidthCh(leftNumbers);
      var rightWidth = gutterWidthCh(rightNumbers);
      for (var r = 0; r < rows.length; r++) {
        children.push(diffPairRow(rows[r], leftWidth, rightWidth, language));
      }
    } else {
      var type = hasDel ? "del" : hasAdd ? "add" : "same";
      var text = hasDel ? oldText : hasAdd ? newText : oldText;
      var parts = splitLines3(text);
      var startBase = typeof file.startOld === "number" ? file.startOld : 1;
      var numbers = [];
      for (var l = 0; l < parts.length; l++) numbers.push(startBase + l);
      var width = gutterWidthCh(numbers);
      for (var l = 0; l < parts.length; l++) {
        children.push(diffLineRow(type, parts[l], numbers[l], width, language));
      }
    }
  }
  return /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-write-diff" }, children);
}
function writeBody(path, before, newText) {
  var language = languageFor(path !== void 0 ? path : "");
  if (before === null || before === "") {
    return /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-write" }, /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-write-note" }, "No earlier version on record; new content below"), /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-code" }, readLineRows(numberedReadRows(newText, 1), language)));
  }
  var cleaned = cleanReadTextForDiff(before);
  var ops = diffLines(deIndent(cleaned.content), deIndent(newText));
  var hasDel = false;
  var hasAdd = false;
  for (var i = 0; i < ops.length; i++) {
    if (ops[i].type === "del") hasDel = true;
    else if (ops[i].type === "add") hasAdd = true;
    if (hasDel && hasAdd) break;
  }
  var lines = [];
  if (hasDel && hasAdd) {
    var rows = alignDiffOps(ops, cleaned.start);
    var leftNumbers = [];
    var rightNumbers = [];
    for (var i = 0; i < rows.length; i++) {
      leftNumbers.push(rows[i].oldNum);
      rightNumbers.push(rows[i].newNum);
    }
    var leftWidth = gutterWidthCh(leftNumbers);
    var rightWidth = gutterWidthCh(rightNumbers);
    for (var i = 0; i < rows.length; i++) {
      lines.push(diffPairRow(rows[i], leftWidth, rightWidth, language));
    }
  } else {
    var type = hasDel ? "del" : hasAdd ? "add" : "same";
    var text = hasDel ? deIndent(cleaned.content) : hasAdd ? deIndent(newText) : deIndent(cleaned.content);
    var parts = splitLines3(text);
    var startBase = typeof cleaned.start === "number" ? cleaned.start : 1;
    var numbers = [];
    for (var i = 0; i < parts.length; i++) numbers.push(startBase + i);
    var width = gutterWidthCh(numbers);
    for (var i = 0; i < parts.length; i++) {
      lines.push(diffLineRow(type, parts[i], numbers[i], width, language));
    }
  }
  return /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-write-diff" }, lines);
}
function WriteRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var block = props.block;
  var done = doneOf(block);
  var args = parseArgs2(argsRawOf(block));
  var argsObject = args !== null ? args : {};
  var effectiveCwd = resolveEffectiveCwd(props);
  var path = pickString2(argsObject, ["file_path", "path"]);
  var newText = typeof argsObject.content === "string" ? argsObject.content : "";
  var output = done ? resultTextOf(block) : null;
  var errorText = done ? errorTextOf(block) : null;
  var state = rowStateOf(block);
  var errorSummary = state === "error" && errorText !== null && errorText !== "" ? firstLineOfError(errorText) : void 0;
  var summary = path !== void 0 ? relativizeToCwd(firstLine2(path), effectiveCwd) : "Write";
  var before = null;
  if (path !== void 0 && props.useSession !== void 0) {
    before = props.useSession(function(snapshot) {
      return latestReadText(snapshot, path, void 0, effectiveCwd);
    });
  }
  var body = null;
  if (done && state === "ok") {
    body = writeBody(path, before, newText);
  } else if (output !== null && output !== "") {
    body = /* @__PURE__ */ import_react4.default.createElement("pre", { className: "tool-render-output", "tool-render-error": state === "error" || void 0 }, output);
  }
  return toolRenderRow({
    callId: props.callId,
    useSession: props.useSession,
    useProjection: props.useProjection,
    toolName: "Write file",
    icon: /* @__PURE__ */ import_react4.default.createElement(IconEditOutline162, { size: 14 }),
    title: "Write",
    summary,
    escalated: escalatedOf(args),
    path,
    onOpenFile: props.openFile,
    state,
    expandable: body !== null,
    expanded,
    onToggle: function() {
      setExpanded(!expanded);
    },
    body,
    errorSummary,
    errorText,
    inspect: props.inspect
  });
}
function todoItems(args) {
  if (args === null || typeof args !== "object" || !Array.isArray(args.todos)) return null;
  var out = [];
  for (var i = 0; i < args.todos.length; i++) {
    var item = args.todos[i];
    if (item === null || typeof item !== "object") return null;
    if (typeof item.content !== "string" || item.content === "") return null;
    var status = item.status === "in_progress" || item.status === "completed" ? item.status : "pending";
    out.push({ content: item.content, status });
  }
  return out;
}
function planSummary(todos) {
  var active = 0;
  var done = 0;
  for (var i = 0; i < todos.length; i++) {
    if (todos[i].status === "in_progress") active++;
    else if (todos[i].status === "completed") done++;
  }
  return { done, total: todos.length, active };
}
function planBody(todos) {
  var children = [];
  for (var i = 0; i < todos.length; i++) {
    var todo = todos[i];
    var attrs = todo.status === "completed" ? { "data-done": true } : todo.status === "in_progress" ? { "data-active": true } : { "data-pending": true };
    children.push(
      /* @__PURE__ */ import_react4.default.createElement("div", { className: "dsh-plan-item", ...attrs }, /* @__PURE__ */ import_react4.default.createElement("span", { className: "dsh-plan-checkbox", "aria-hidden": true }), /* @__PURE__ */ import_react4.default.createElement("span", { className: "dsh-plan-content" }, todo.content))
    );
  }
  return /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-plan" }, children);
}
function TodoRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var block = props.block;
  var done = doneOf(block);
  var args = parseArgs2(argsRawOf(block));
  var todos = todoItems(args);
  var output = done ? resultTextOf(block) : null;
  var errorText = done ? errorTextOf(block) : null;
  var state = rowStateOf(block);
  var errorSummary = state === "error" && errorText !== null && errorText !== "" ? firstLineOfError(errorText) : void 0;
  var counts = todos !== null ? planSummary(todos) : null;
  var summary;
  if (counts !== null && (done === false || state !== "error")) {
    var head = counts.done + "/" + counts.total + " completed";
    var firstActive = null;
    for (var i = 0; i < todos.length; i++) {
      if (todos[i].status === "in_progress") {
        firstActive = todos[i].content;
        break;
      }
    }
    summary = firstActive !== null ? head + " \xB7 " + firstActive : head;
  } else {
    summary = "To-do list";
  }
  var body = null;
  if (todos !== null && output !== null && output !== "") {
    body = planBody(todos);
  }
  return toolRenderRow({
    callId: props.callId,
    useSession: props.useSession,
    useProjection: props.useProjection,
    toolName: "To-do list",
    icon: /* @__PURE__ */ import_react4.default.createElement(IconChecklistOutline142, { size: 14 }),
    title: "To-do list",
    summary,
    state,
    expandable: body !== null,
    expanded,
    onToggle: function() {
      setExpanded(!expanded);
    },
    body,
    errorSummary,
    errorText,
    inspect: props.inspect
  });
}
function askQuestions(args) {
  if (args === null || typeof args !== "object" || !Array.isArray(args.questions)) return null;
  var out = [];
  for (var i = 0; i < args.questions.length; i++) {
    var q = args.questions[i];
    if (q === null || typeof q !== "object") return null;
    if (typeof q.question !== "string" || q.question === "") return null;
    var options = [];
    if (q.options !== void 0 && q.options !== null) {
      if (!Array.isArray(q.options)) return null;
      for (var j = 0; j < q.options.length; j++) {
        var option = q.options[j];
        if (option === null || typeof option !== "object") return null;
        if (typeof option.label !== "string" || option.label === "") return null;
        var description = typeof option.description === "string" && option.description !== "" ? option.description : null;
        options.push({ label: option.label, description });
      }
    }
    out.push({
      id: typeof q.id === "string" ? q.id : null,
      question: q.question,
      options
    });
  }
  return out;
}
function askAnswers(block) {
  if (!doneOf(block) || block.isError === true) return null;
  var parsed = parseArgs2(resultTextOf(block) || "");
  if (parsed === null || typeof parsed !== "object" || !Array.isArray(parsed.answers)) return null;
  var byId = {};
  var order = [];
  for (var i = 0; i < parsed.answers.length; i++) {
    var answer = parsed.answers[i];
    if (answer === null || typeof answer !== "object") return null;
    if (typeof answer.id !== "string") return null;
    if (byId[answer.id] === void 0) order.push(answer.id);
    var selected = Array.isArray(answer.selected) ? answer.selected : [];
    var texts = [];
    for (var j = 0; j < selected.length; j++) {
      if (typeof selected[j] === "string" && selected[j] !== "") texts.push(selected[j]);
    }
    byId[answer.id] = {
      selected: texts,
      custom: typeof answer.custom === "string" ? answer.custom : null
    };
  }
  return { byId, order };
}
function askBody(questions, answers) {
  var children = [];
  for (var i = 0; i < questions.length; i++) {
    var q = questions[i];
    var answer = answers !== null && q.id !== null ? answers.byId[q.id] : void 0;
    var picked = answer === void 0 ? null : answer.selected;
    var rows = [];
    for (var j = 0; j < q.options.length; j++) {
      var option = q.options[j];
      var label = option.label;
      var isSelected = picked !== null && picked.indexOf(label) !== -1;
      rows.push(
        /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-option", "data-selected": isSelected || void 0 }, /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-option-marker", "aria-hidden": true }, isSelected ? "\u25C9" : "\u25CB"), /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-option-text" }, /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-option-label" }, /* @__PURE__ */ import_react4.default.createElement(MarkdownText2, { text: label })), option.description !== null && option.description !== void 0 ? /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-option-description" }, /* @__PURE__ */ import_react4.default.createElement(MarkdownText2, { text: option.description })) : null))
      );
    }
    if (picked !== null) {
      for (var j = 0; j < picked.length; j++) {
        var known = false;
        for (var k = 0; k < q.options.length; k++) {
          if (q.options[k].label === picked[j]) {
            known = true;
            break;
          }
        }
        if (!known) {
          rows.push(
            /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-option", "data-selected": true }, /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-option-marker", "aria-hidden": true }, "\u25C9"), /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-option-label" }, /* @__PURE__ */ import_react4.default.createElement(MarkdownText2, { text: picked[j] })))
          );
        }
      }
    }
    var note = null;
    if (answer !== void 0 && typeof answer.custom === "string" && answer.custom !== "") {
      note = /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-answer-note" }, /* @__PURE__ */ import_react4.default.createElement(MarkdownText2, { text: answer.custom }));
    }
    children.push(
      /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-question" }, /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-question-prompt" }, /* @__PURE__ */ import_react4.default.createElement(MarkdownText2, { text: q.question })), rows, note)
    );
  }
  return /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-ask" }, children);
}
function isQuestionComposing(event) {
  var native = event !== null && event !== void 0 ? event.nativeEvent : void 0;
  if (native === void 0 || native === null) return false;
  return native.isComposing === true || native.keyCode === 229;
}
function renderQuestionOption(option, optionIndex, multi, selected, busy, onChoose) {
  if (option === null || typeof option !== "object" || typeof option.label !== "string") return null;
  var display = parseRecommendedLabel(option.label);
  return /* @__PURE__ */ import_react4.default.createElement(
    "button",
    {
      type: "button",
      className: "tool-render-qoption",
      "data-selected": selected || void 0,
      role: multi ? "checkbox" : "radio",
      "aria-checked": selected,
      "aria-label": display.label,
      disabled: busy !== null,
      onClick: function() {
        onChoose(option.label);
      }
    },
    /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-qoption-marker", "aria-hidden": true }, multi ? selected ? "\u2611" : "\u2610" : optionIndex + 1),
    /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-qoption-text" }, /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-qoption-line" }, /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-qoption-label" }, display.label), display.recommended ? /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-qbadge" }, "Recommended") : null, typeof option.description === "string" && option.description !== "" ? /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-qoption-description" }, option.description) : null))
  );
}
function AskAnswerForm(props) {
  var questions = props.questions;
  var pending = props.pending;
  var indexState = useState(0);
  var index = indexState[0];
  var setIndex = indexState[1];
  var draftsState = useState(function() {
    return blankDrafts(questions.length);
  });
  var drafts = draftsState[0];
  var setDrafts = draftsState[1];
  var busyState = useState(null);
  var busy = busyState[0];
  var setBusy = busyState[1];
  var errorState = useState(null);
  var error = errorState[0];
  var setError = errorState[1];
  var question = questions[index];
  var draft = drafts[index];
  var options = question !== null && typeof question === "object" && Array.isArray(question.options) ? question.options : [];
  var hasOptions = options.length > 0;
  var multi = question !== null && typeof question === "object" && question.multiSelect === true;
  var sendRespond = function(message, which) {
    var receiptOf;
    try {
      receiptOf = Promise.resolve(pending.respond(message));
    } catch (thrown) {
      console.warn("[tool-render] question answer failed", which, thrown);
      setBusy(null);
      setError({ text: thrown instanceof Error ? thrown.message : String(thrown) });
      return;
    }
    receiptOf.then(function(receipt) {
      if (receipt === void 0 || receipt === null || !receipt.accepted) {
        throw new Error(
          "question response rejected: " + (receipt === void 0 || receipt === null || receipt.reason === void 0 ? "unknown" : receipt.reason)
        );
      }
      console.debug("[tool-render] question answered", which);
    }).catch(function(failure) {
      console.warn("[tool-render] question answer failed", which, failure);
      setBusy(null);
      setError({ text: failure instanceof Error ? failure.message : String(failure) });
    });
  };
  var submitDrafts = function(values) {
    var built = buildAnswerBatch(questions, values);
    if (built.ok !== true) {
      setIndex(built.missingIndex);
      setError({ key: "incomplete" });
      return;
    }
    setBusy("answer");
    setError(null);
    sendRespond(answerMessage(pending, built.batch), "answer");
  };
  var continueFlow = function() {
    if (!draftAnswered(draft)) {
      setError({ key: "unanswered" });
      return;
    }
    if (index < questions.length - 1) {
      setIndex(index + 1);
      setError(null);
      return;
    }
    submitDrafts(drafts);
  };
  var replaceDraft = function(next) {
    setDrafts(function(current) {
      return current.map(function(item, itemIndex) {
        return itemIndex === index ? next : item;
      });
    });
    setError(null);
  };
  var choose = function(label) {
    replaceDraft(chooseInDraft(question, draft, label));
    if (!multi && index < questions.length - 1) setIndex(index + 1);
  };
  var draftCustom = function(event) {
    replaceDraft(typeCustomInDraft(question, draft, event.target.value));
  };
  var continueFromCustom = function(event) {
    if (event.key !== "Enter" || event.shiftKey || isQuestionComposing(event)) return;
    event.preventDefault();
    continueFlow();
  };
  var skipQuestion = function() {
    var values = drafts.map(function(item, itemIndex) {
      return itemIndex === index ? skipDraft() : item;
    });
    setDrafts(values);
    setError(null);
    if (index < questions.length - 1) {
      setIndex(index + 1);
      return;
    }
    submitDrafts(values);
  };
  var cancelFlow = function() {
    setBusy("cancel");
    setError(null);
    sendRespond(cancelMessage(), "cancel");
  };
  var errorText = error === null ? null : error.key === "unanswered" ? "Please select an option or enter a custom answer." : error.key === "incomplete" ? "Please complete this question first." : error.text;
  var optionRows = [];
  for (var optionIndex = 0; optionIndex < options.length; optionIndex++) {
    var rawOption = options[optionIndex];
    var rawLabel = rawOption !== null && typeof rawOption === "object" ? rawOption.label : "";
    var rendered = renderQuestionOption(
      rawOption,
      optionIndex,
      multi,
      draft.selected.indexOf(typeof rawLabel === "string" ? rawLabel : "") !== -1,
      busy,
      choose
    );
    if (rendered !== null) optionRows.push(rendered);
  }
  return /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-qform" }, /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-qheader" }, /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-qheading" }, typeof question.header === "string" && question.header !== "" ? /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-qeyebrow" }, question.header) : null, /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-qtitle" }, question.question)), /* @__PURE__ */ import_react4.default.createElement(
    "button",
    {
      type: "button",
      className: "tool-render-qdismiss",
      disabled: busy !== null,
      title: "Dismiss all questions",
      "aria-label": "Dismiss all questions",
      onClick: cancelFlow
    },
    "Dismiss"
  )), /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-qbody" }, typeof question.detail === "string" && question.detail !== "" ? /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-qdetail" }, /* @__PURE__ */ import_react4.default.createElement(MarkdownText2, { text: question.detail })) : null, /* @__PURE__ */ import_react4.default.createElement(
    "div",
    {
      className: "tool-render-qoptions",
      role: multi ? "group" : "radiogroup"
    },
    optionRows,
    hasOptions ? /* @__PURE__ */ import_react4.default.createElement(
      "div",
      {
        className: "tool-render-qcustom-row",
        "data-active": draft.custom !== "" || void 0
      },
      /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-qoption-marker", "aria-hidden": true }, "\u270E"),
      /* @__PURE__ */ import_react4.default.createElement(
        "input",
        {
          type: "text",
          className: "tool-render-qcustom-input",
          value: draft.custom,
          disabled: busy !== null,
          placeholder: "Type your answer",
          "aria-label": "Type your answer",
          onChange: draftCustom,
          onKeyDown: continueFromCustom
        }
      )
    ) : /* @__PURE__ */ import_react4.default.createElement(
      "textarea",
      {
        className: "tool-render-qcustom-textarea",
        value: draft.custom,
        disabled: busy !== null,
        rows: 2,
        placeholder: "Type your answer",
        "aria-label": "Type your answer",
        onChange: draftCustom,
        onKeyDown: continueFromCustom
      }
    )
  )), /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-qfooter" }, /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-qpager" }, /* @__PURE__ */ import_react4.default.createElement(
    "button",
    {
      type: "button",
      className: "tool-render-qnav",
      "aria-label": "Previous question",
      disabled: index === 0 || busy !== null,
      onClick: function() {
        setIndex(index - 1);
        setError(null);
      }
    },
    "\u2039"
  ), /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-qprogress" }, index + 1, " / ", questions.length), /* @__PURE__ */ import_react4.default.createElement(
    "button",
    {
      type: "button",
      className: "tool-render-qnav",
      "aria-label": "Next question",
      disabled: index === questions.length - 1 || busy !== null,
      onClick: function() {
        setIndex(index + 1);
        setError(null);
      }
    },
    "\u203A"
  )), /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-qfeedback", role: "status" }, errorText), /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-qactions" }, /* @__PURE__ */ import_react4.default.createElement(
    "button",
    {
      type: "button",
      className: "tool-render-qbtn",
      disabled: busy !== null,
      onClick: skipQuestion
    },
    "Skip this question"
  ), /* @__PURE__ */ import_react4.default.createElement(
    "button",
    {
      type: "button",
      className: "tool-render-qbtn tool-render-qbtn-primary",
      disabled: busy !== null || !draftAnswered(draft),
      onClick: continueFlow
    },
    busy === "answer" ? "Submitting\u2026" : index === questions.length - 1 ? "Submit" : "Next"
  ))));
}
function AskRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var block = props.block;
  var done = doneOf(block);
  var args = parseArgs2(argsRawOf(block));
  var questions = askQuestions(args);
  var answers = done ? askAnswers(block) : null;
  var output = done ? resultTextOf(block) : null;
  var errorText = done ? errorTextOf(block) : null;
  var state = rowStateOf(block);
  var errorSummary = state === "error" && errorText !== null && errorText !== "" ? firstLineOfError(errorText) : void 0;
  var summary;
  if (state === "error") {
    summary = "Ask user";
  } else if (!done) {
    var count = questions !== null ? questions.length : 0;
    summary = count === 1 ? "waiting for answer" : "waiting for " + count + " answers";
  } else if (answers !== null) {
    var answered = 0;
    for (var i = 0; i < answers.order.length; i++) {
      var a = answers.byId[answers.order[i]];
      if (a.selected.length > 0 || a.custom !== null) answered++;
    }
    summary = answered + "/" + questions.length + " answered";
  } else {
    summary = "Ask user";
  }
  var questionRef = useRef(null);
  var questionKey = typeof props.useSession === "function" ? props.useSession(function(snapshot) {
    var found = done ? null : pendingQuestionForCall(snapshot, props.callId);
    questionRef.current = found;
    return found === null ? null : String(found.key);
  }) : null;
  var livePending = questionKey === null ? null : questionRef.current;
  var pendingQuestions = livePending === null ? null : questionsOfPending(livePending);
  var questionOpen = pendingQuestions !== null && pendingQuestions.length > 0;
  var body = null;
  var questionState;
  if (questionOpen) {
    questionState = "pending";
    body = /* @__PURE__ */ import_react4.default.createElement(AskAnswerForm, { key: questionKey, pending: livePending, questions: pendingQuestions });
  } else if (questions !== null && output !== null && output !== "" && state !== "error") {
    body = askBody(questions, answers);
    if (answers !== null) questionState = "answered";
  }
  return toolRenderRow({
    callId: props.callId,
    useSession: props.useSession,
    useProjection: props.useProjection,
    toolName: "Ask user",
    icon: /* @__PURE__ */ import_react4.default.createElement(IconQuestionOutline142, { size: 14 }),
    title: "Ask user",
    summary,
    state,
    questionState,
    expandable: body !== null,
    expanded,
    onToggle: function() {
      setExpanded(!expanded);
    },
    body,
    errorSummary,
    errorText,
    inspect: props.inspect
  });
}
function subagentPrompt(args) {
  if (args === null || typeof args !== "object") return null;
  if (typeof args.prompt !== "string" || args.prompt === "") return null;
  return args.prompt;
}
function SubagentRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var block = props.block;
  var done = doneOf(block);
  var args = parseArgs2(argsRawOf(block));
  var description = args !== null ? pickString2(args, ["description"]) : void 0;
  var prompt = subagentPrompt(args);
  var output = done ? resultTextOf(block) : null;
  var errorText = done ? errorTextOf(block) : null;
  var state = rowStateOf(block);
  var errorSummary = state === "error" && errorText !== null && errorText !== "" ? firstLineOfError(errorText) : void 0;
  var background = args !== null && args.run_in_background === true;
  var title = background ? "Background subagent" : "Subagent";
  var summary = description !== void 0 ? firstLine2(relativizeToCwd(description, props.cwd)) : title;
  var body = null;
  if (state !== "error" && prompt !== null) {
    body = /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-markdown-body" }, /* @__PURE__ */ import_react4.default.createElement(MarkdownText2, { text: prompt }));
  }
  return toolRenderRow({
    callId: props.callId,
    useSession: props.useSession,
    useProjection: props.useProjection,
    toolName: "Dispatch",
    icon: /* @__PURE__ */ import_react4.default.createElement(IconAgentPresetOutline162, { size: 14 }),
    title,
    summary,
    state,
    expandable: body !== null,
    expanded,
    onToggle: function() {
      setExpanded(!expanded);
    },
    body,
    errorSummary,
    errorText,
    inspect: props.inspect
  });
}
function sendMessageArgs(args) {
  if (args === null || typeof args !== "object") return null;
  if (typeof args.subagent_id !== "string" || args.subagent_id === "") return null;
  if (typeof args.message !== "string" || args.message === "") return null;
  return args;
}
var JOB_STATUS_RE = /\[status: ([a-z]+)\]\s*$/;
function JobOutputRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var block = props.block;
  var done = doneOf(block);
  var args = parseArgs2(argsRawOf(block));
  var jobId = args !== null ? pickString2(args, ["job_id"]) : void 0;
  var output = done ? resultTextOf(block) : null;
  var errorText = done ? errorTextOf(block) : null;
  var state = rowStateOf(block);
  var errorSummary = state === "error" && errorText !== null && errorText !== "" ? firstLineOfError(errorText) : void 0;
  var statusMatch = output !== null ? JOB_STATUS_RE.exec(output) : null;
  var summary = statusMatch !== null ? "status: " + statusMatch[1] : "Job output";
  var body = state !== "error" && output !== null && output !== "" ? /* @__PURE__ */ import_react4.default.createElement("pre", { className: "tool-render-output" }, stripAnsi(output)) : null;
  return toolRenderRow({
    callId: props.callId,
    useSession: props.useSession,
    useProjection: props.useProjection,
    toolName: "Job output",
    icon: /* @__PURE__ */ import_react4.default.createElement(IconApiOutline142, null),
    title: "Job output",
    badge: jobId,
    summary,
    state,
    expandable: body !== null,
    expanded,
    onToggle: function() {
      setExpanded(!expanded);
    },
    body,
    errorSummary,
    errorText,
    inspect: props.inspect
  });
}
function packageActionTitle(action) {
  if (action === "add") return "Add package";
  if (action === "remove") return "Remove package";
  if (action === "update") return "Update package";
  if (action === "add_task") return "Add task";
  return "Package";
}
function PackageRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var block = props.block;
  var done = doneOf(block);
  var args = parseArgs2(argsRawOf(block));
  var action = args !== null ? pickString2(args, ["action"]) : void 0;
  var ecosystem = args !== null ? pickString2(args, ["ecosystem"]) : void 0;
  var target = args !== null ? pickString2(args, ["packageName", "taskName"]) : void 0;
  var output = done ? resultTextOf(block) : null;
  var errorText = done ? errorTextOf(block) : null;
  var state = rowStateOf(block);
  var errorSummary = state === "error" && errorText !== null && errorText !== "" ? firstLineOfError(errorText) : void 0;
  var title = packageActionTitle(action);
  var summary = target !== void 0 && target !== "" ? target : title;
  var body = state !== "error" && output !== null && output !== "" ? /* @__PURE__ */ import_react4.default.createElement("pre", { className: "tool-render-output" }, stripAnsi(output)) : null;
  return toolRenderRow({
    callId: props.callId,
    useSession: props.useSession,
    useProjection: props.useProjection,
    toolName: "Manage package",
    icon: /* @__PURE__ */ import_react4.default.createElement(IconApiOutline142, null),
    title,
    badge: ecosystem,
    summary,
    state,
    expandable: body !== null,
    expanded,
    onToggle: function() {
      setExpanded(!expanded);
    },
    body,
    errorSummary,
    errorText,
    inspect: props.inspect
  });
}
function SendMessageRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var block = props.block;
  var done = doneOf(block);
  var args = sendMessageArgs(parseArgs2(argsRawOf(block)));
  var errorText = done ? errorTextOf(block) : null;
  var state = rowStateOf(block);
  var errorSummary = state === "error" && errorText !== null && errorText !== "" ? firstLineOfError(errorText) : void 0;
  var body = state !== "error" && args !== null ? /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-markdown-body" }, /* @__PURE__ */ import_react4.default.createElement(MarkdownText2, { text: args.message })) : null;
  return toolRenderRow({
    callId: props.callId,
    useSession: props.useSession,
    useProjection: props.useProjection,
    toolName: "Message",
    icon: /* @__PURE__ */ import_react4.default.createElement(IconAgentPresetOutline162, { size: 14 }),
    title: "Message",
    badge: args !== null ? args.subagent_id : void 0,
    summary: args !== null ? firstLine2(args.message) : "Message",
    state,
    expandable: body !== null,
    expanded,
    onToggle: function() {
      setExpanded(!expanded);
    },
    body,
    errorSummary,
    errorText,
    inspect: props.inspect
  });
}
function InterruptAgentRow(props) {
  var block = props.block;
  var done = doneOf(block);
  var args = parseArgs2(argsRawOf(block));
  var agentId = args !== null ? pickString2(args, ["agent_id"]) : void 0;
  var errorText = done ? errorTextOf(block) : null;
  var state = rowStateOf(block);
  var errorSummary = state === "error" && errorText !== null && errorText !== "" ? firstLineOfError(errorText) : void 0;
  return toolRenderRow({
    callId: props.callId,
    useSession: props.useSession,
    useProjection: props.useProjection,
    toolName: "Interrupt agent",
    icon: /* @__PURE__ */ import_react4.default.createElement(IconStopFill162, { size: 14 }),
    title: "Interrupt agent",
    summary: agentId !== void 0 ? agentId : "Interrupt agent",
    state,
    expandable: false,
    expanded: false,
    onToggle: function() {
    },
    body: null,
    errorSummary,
    errorText,
    inspect: props.inspect
  });
}
function agentsSummaryText(entries) {
  if (entries.length === 0) return "No subagents";
  var running = 0;
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].status === "running") running++;
  }
  var head = entries.length === 1 ? "1 agent" : String(entries.length) + " agents";
  return running > 0 ? head + " \xB7 " + String(running) + " running" : head;
}
function ListAgentsRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var block = props.block;
  var done = doneOf(block);
  var output = done ? resultTextOf(block) : null;
  var errorText = done ? errorTextOf(block) : null;
  var state = rowStateOf(block);
  var errorSummary = state === "error" && errorText !== null && errorText !== "" ? firstLineOfError(errorText) : void 0;
  var entries = state === "error" || output === null ? [] : parseAgentLines(output);
  var body = entries.length > 0 ? /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-agents" }, entries.map(function(entry, index) {
    var depth = typeof entry.depth === "number" && entry.depth > 0 ? entry.depth : 0;
    return /* @__PURE__ */ import_react4.default.createElement(
      "div",
      {
        key: String(index),
        className: "tool-render-agent",
        style: depth > 0 ? { paddingLeft: String(depth * 0.75) + "rem" } : void 0
      },
      /* @__PURE__ */ import_react4.default.createElement(
        "span",
        {
          className: "tool-render-agent-status",
          "data-status": entry.status !== null ? entry.status : "diagnostic"
        },
        entry.status !== null ? entry.status : entry.reason
      ),
      /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-agent-id", title: entry.id, "data-dsh-tip": "" }, entry.id),
      /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-agent-label" }, entry.label)
    );
  })) : null;
  return toolRenderRow({
    callId: props.callId,
    useSession: props.useSession,
    useProjection: props.useProjection,
    toolName: "List agents",
    icon: /* @__PURE__ */ import_react4.default.createElement(IconAgentPresetOutline162, { size: 14 }),
    title: "List agents",
    summary: state === "running" ? "List agents" : agentsSummaryText(entries),
    state,
    expandable: body !== null,
    expanded,
    onToggle: function() {
      setExpanded(!expanded);
    },
    body,
    errorSummary,
    errorText,
    inspect: props.inspect
  });
}
function contextText(content) {
  if (!Array.isArray(content)) return "";
  var parts = [];
  for (var i = 0; i < content.length; i++) {
    var block = content[i];
    if (block !== null && typeof block === "object" && block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("\n\n");
}
var FAILOVER_LINE_RE = /^LLM failover (\S+)\/(\S+) -> (\S+)\/(\S+) \(([^)]+)\)$/;
function FailoverRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var text = contextText(props.content);
  var lines = text.split("\n");
  var headerLine = lines.length > 0 ? lines[0] : "";
  var match = FAILOVER_LINE_RE.exec(headerLine);
  if (match === null) {
    return GenericContextCard({
      content: props.content,
      source: props.source,
      provenance: props.provenance,
      form: props.form
    });
  }
  var fromProv = match[1];
  var fromModel = match[2];
  var toProv = match[3];
  var toModel = match[4];
  var code = match[5];
  var detailStart = text.indexOf("\n\n");
  var detail = detailStart !== -1 ? text.slice(detailStart + 2) : "";
  var detailFirstLine = detail.length > 0 ? firstLine2(detail) : "";
  var summary = `${fromProv}/${fromModel} -> ${toProv}/${toModel}`;
  var errorSummary = code + (detailFirstLine ? " \xB7 " + detailFirstLine : "");
  var errorText = detail !== "" ? detail : void 0;
  return toolRenderRow({
    toolName: "LLM failover",
    icon: /* @__PURE__ */ import_react4.default.createElement(IconApiOutline142, { size: 14 }),
    title: "LLM failover",
    summary,
    state: "error",
    expandable: errorText !== void 0,
    expanded,
    onToggle: function() {
      setExpanded(!expanded);
    },
    errorSummary,
    errorText,
    body: errorText !== void 0 ? /* @__PURE__ */ import_react4.default.createElement("pre", { className: "tool-render-output", "tool-render-error": true }, errorText) : null
  });
}
function pluginSourceKey(source) {
  if (source === null || typeof source !== "object") return void 0;
  if (source.kind !== "plugin") return void 0;
  if (typeof source.plugin !== "string" || source.plugin === "") return void 0;
  return source.plugin;
}
function markdownWithReminders(text) {
  var segments = splitSystemReminders(text);
  if (segments.length === 0) return null;
  return segments.map(function(segment, index) {
    if (!segment.reminder) {
      return /* @__PURE__ */ import_react4.default.createElement(MarkdownText2, { key: index, text: segment.text });
    }
    return /* @__PURE__ */ import_react4.default.createElement("div", { key: index, className: "tool-render-reminder" }, /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-reminder-chip" }, "System reminder"), /* @__PURE__ */ import_react4.default.createElement(MarkdownText2, { text: segment.text }));
  });
}
function SkillContentCard(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var body = /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-markdown-body" }, /* @__PURE__ */ import_react4.default.createElement("table", { className: "tool-render-skill-table" }, /* @__PURE__ */ import_react4.default.createElement("tbody", null, /* @__PURE__ */ import_react4.default.createElement("tr", null, /* @__PURE__ */ import_react4.default.createElement("th", null, "Name"), /* @__PURE__ */ import_react4.default.createElement("td", null, props.name)), /* @__PURE__ */ import_react4.default.createElement("tr", null, /* @__PURE__ */ import_react4.default.createElement("th", null, "Resources"), /* @__PURE__ */ import_react4.default.createElement("td", null, props.resourceHint)))), markdownWithReminders(props.instructions));
  return toolRenderRow({
    callId: props.callId,
    useSession: props.useSession,
    useProjection: props.useProjection,
    toolName: "Skill",
    icon: /* @__PURE__ */ import_react4.default.createElement(IconChecklistOutline142, null),
    title: "Skill",
    badge: props.name,
    summary: props.name,
    expandable: true,
    expanded,
    onToggle: function() {
      setExpanded(!expanded);
    },
    body
  });
}
function GenericContextCard(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var provenance = props.provenance;
  var text = contextText(props.content);
  var skill = parseSkillContent(text);
  if (skill !== null) {
    return /* @__PURE__ */ import_react4.default.createElement(
      SkillContentCard,
      {
        name: skill.name,
        resourceHint: skill.resourceHint,
        instructions: skill.instructions
      }
    );
  }
  var recall = provenance !== null && provenance !== void 0 && provenance.role === "recall";
  var title = recall ? "Recalled context" : "Context";
  var badge = provenance !== null && provenance !== void 0 && typeof provenance.label === "string" && provenance.label !== "" ? provenance.label : void 0;
  var body = text !== "" ? /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-markdown-body" }, markdownWithReminders(text)) : null;
  return toolRenderRow({
    callId: props.callId,
    useSession: props.useSession,
    useProjection: props.useProjection,
    toolName: title,
    icon: /* @__PURE__ */ import_react4.default.createElement(IconBrowseOutline162, { size: 14 }),
    title,
    badge,
    summary: text !== "" ? firstLine2(text) : title,
    expandable: body !== null,
    expanded,
    onToggle: function() {
      setExpanded(!expanded);
    },
    body
  });
}
function ContextRow(props) {
  var node = props.node;
  var data = node !== null && node !== void 0 && typeof node === "object" ? node.data : null;
  var content = data !== null && data !== void 0 ? data.content : void 0;
  var source = data !== null && data !== void 0 ? data.source : void 0;
  var provenance = data !== null && data !== void 0 ? data.provenance : void 0;
  var form = data !== null && data !== void 0 ? data.form : void 0;
  var fallback = /* @__PURE__ */ import_react4.default.createElement(GenericContextCard, { content, source, provenance, form });
  var sourceKey = pluginSourceKey(source);
  if (sourceKey === void 0 || typeof props.renderSlot !== "function") return fallback;
  return props.renderSlot(
    "context.injection.view",
    { content, source, provenance, form, node },
    { entryKey: sourceKey, fallback }
  );
}
function SkillRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var block = props.block;
  var done = doneOf(block);
  var errorText = done ? errorTextOf(block) : null;
  var state = rowStateOf(block);
  var errorSummary = state === "error" && errorText !== null && errorText !== "" ? firstLineOfError(errorText) : void 0;
  var skill = state !== "error" && done ? parseSkillContent(resultTextOf(block)) : null;
  if (skill !== null) {
    return /* @__PURE__ */ import_react4.default.createElement(
      SkillContentCard,
      {
        name: skill.name,
        resourceHint: skill.resourceHint,
        instructions: skill.instructions
      }
    );
  }
  var args = parseArgs2(argsRawOf(block));
  var skillName = args !== null ? pickString2(args, ["name"]) : void 0;
  return toolRenderRow({
    callId: props.callId,
    useSession: props.useSession,
    useProjection: props.useProjection,
    toolName: "Load skill",
    icon: /* @__PURE__ */ import_react4.default.createElement(IconChecklistOutline142, null),
    title: "Skill",
    summary: skillName !== void 0 ? skillName : "Skill",
    state,
    expandable: false,
    expanded,
    onToggle: function() {
      setExpanded(!expanded);
    },
    errorSummary,
    errorText,
    inspect: props.inspect
  });
}
function imageRouteUrl(filePath) {
  return "/tool-render/image?path=" + encodeURIComponent(filePath);
}
function basenameOf(path) {
  var parts = String(path).split("/");
  return parts[parts.length - 1];
}
function formatBytes(bytes) {
  if (typeof bytes !== "number" || !isFinite(bytes) || bytes < 0) return "";
  var units = ["B", "KB", "MB", "GB", "TB"];
  var value = bytes;
  var unit = 0;
  while (value >= 1e3 && unit < units.length - 1) {
    value /= 1e3;
    unit++;
  }
  var text = unit === 0 ? String(value) : value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return text + " " + units[unit];
}
function EmbedImage(props) {
  var brokenState = useState(false);
  var broken = brokenState[0];
  var setBroken = brokenState[1];
  var src = imageRouteUrl(props.filePath);
  if (broken) {
    return /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-image-broken" }, "Image unavailable: " + props.filePath);
  }
  return /* @__PURE__ */ import_react4.default.createElement("a", { className: "tool-render-image-link", href: src, target: "_blank", rel: "noreferrer" }, /* @__PURE__ */ import_react4.default.createElement(
    "img",
    {
      className: "tool-render-image",
      src,
      alt: props.alt,
      onError: function() {
        setBroken(true);
      }
    }
  ));
}
var IMAGE_PATH_RE = /<path>([\s\S]*?)<\/path>/;
var IMAGE_CONTENT_RE = /(\S+) image, (\d+)x(\d+) px, (\d+) bytes/;
function parseReadImageResult(text) {
  if (typeof text !== "string") return null;
  var pathMatch = IMAGE_PATH_RE.exec(text);
  var contentMatch = IMAGE_CONTENT_RE.exec(text);
  if (pathMatch === null || contentMatch === null) return null;
  return {
    path: pathMatch[1],
    mediaType: contentMatch[1],
    width: Number(contentMatch[2]),
    height: Number(contentMatch[3]),
    bytes: Number(contentMatch[4])
  };
}
function ReadImageRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var block = props.block;
  var done = doneOf(block);
  var args = parseArgs2(argsRawOf(block));
  var path = args !== null ? pickString2(args, ["file_path"]) : void 0;
  var output = done ? resultTextOf(block) : null;
  var errorText = done ? errorTextOf(block) : null;
  var state = rowStateOf(block);
  var errorSummary = state === "error" && errorText !== null && errorText !== "" ? firstLineOfError(errorText) : void 0;
  var meta = done && state !== "error" ? parseReadImageResult(output) : null;
  var summary = meta !== null ? basenameOf(meta.path) + " \xB7 " + meta.width + "x" + meta.height + " \xB7 " + formatBytes(meta.bytes) : path !== void 0 ? relativizeToCwd(path, props.cwd) : "Read image";
  var body = null;
  if (meta !== null) {
    body = /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-image-body" }, /* @__PURE__ */ import_react4.default.createElement(EmbedImage, { filePath: meta.path, alt: basenameOf(meta.path) }), /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-image-meta" }, /* @__PURE__ */ import_react4.default.createElement("div", null, basenameOf(meta.path)), /* @__PURE__ */ import_react4.default.createElement("div", null, meta.mediaType), /* @__PURE__ */ import_react4.default.createElement("div", null, meta.path)));
  }
  return toolRenderRow({
    callId: props.callId,
    useSession: props.useSession,
    useProjection: props.useProjection,
    toolName: "Read image",
    // Lucide Image, not a shipped primitive: the primitives set has no image
    // or clock glyph (owner decision 2026-09-09, #114), and this row shared
    // IconBrowseOutline16 with unrelated rows. Per-glyph import above keeps
    // tree-shaking; never hand-inline SVG here. Pending owner's eye: lucide
    // is stroke-based (24-grid, stroke-width 2) while the shipped icons are
    // fill-based (16/14-grid), so the weight match is structural, not visual.
    icon: /* @__PURE__ */ import_react4.default.createElement(Image, { size: 14 }),
    title: "Read image",
    summary,
    path,
    onOpenFile: props.openFile,
    state,
    expandable: body !== null,
    expanded,
    onToggle: function() {
      setExpanded(!expanded);
    },
    body,
    errorSummary,
    errorText,
    inspect: props.inspect
  });
}
function SeeRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var showMoreState = useState(false);
  var showMore = showMoreState[0];
  var setShowMore = showMoreState[1];
  var block = props.block;
  var done = doneOf(block);
  var args = parseArgs2(argsRawOf(block));
  var question = args !== null ? pickString2(args, ["question"]) : void 0;
  var imagePath = args !== null ? pickString2(args, ["image"]) : void 0;
  var output = done ? resultTextOf(block) : null;
  var errorText = done ? errorTextOf(block) : null;
  var state = rowStateOf(block);
  var errorSummary = state === "error" && errorText !== null && errorText !== "" ? firstLineOfError(errorText) : void 0;
  var description = done && state !== "error" ? output : null;
  var summary = question !== void 0 ? firstLine2(question) : "See";
  var needsClamp = description !== null && description.length > 400;
  var body = null;
  if (done && state !== "error" && (description !== null || imagePath !== void 0)) {
    body = /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-image-body" }, description !== null && description !== "" ? /* @__PURE__ */ import_react4.default.createElement(
      "div",
      {
        className: needsClamp && showMore !== true ? "tool-render-markdown-body tool-render-see-desc" : "tool-render-markdown-body"
      },
      /* @__PURE__ */ import_react4.default.createElement(MarkdownText2, { text: description })
    ) : null, needsClamp ? /* @__PURE__ */ import_react4.default.createElement(
      "button",
      {
        type: "button",
        className: "tool-render-see-toggle",
        onClick: function() {
          setShowMore(!showMore);
        }
      },
      showMore ? "Show less" : "Show more"
    ) : null, imagePath !== void 0 ? /* @__PURE__ */ import_react4.default.createElement(EmbedImage, { filePath: imagePath, alt: basenameOf(imagePath) }) : null, imagePath !== void 0 ? /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-image-meta" }, imagePath) : null);
  }
  return toolRenderRow({
    callId: props.callId,
    useSession: props.useSession,
    useProjection: props.useProjection,
    toolName: "See image",
    icon: /* @__PURE__ */ import_react4.default.createElement(IconQuestionOutline142, { size: 14 }),
    title: "See",
    summary,
    state,
    expandable: body !== null,
    expanded,
    onToggle: function() {
      setExpanded(!expanded);
    },
    body,
    errorSummary,
    errorText,
    inspect: props.inspect
  });
}
var NO_RESULTS_MARK = "No results found.";
function searchQueries(args) {
  if (args === null || typeof args !== "object" || !Array.isArray(args.queries)) return null;
  var out = [];
  for (var i = 0; i < args.queries.length; i++) {
    if (typeof args.queries[i] !== "string" || args.queries[i] === "") return null;
    out.push(args.queries[i]);
  }
  return out;
}
function searchSummary(queries, state, output) {
  if (state !== "running" && output !== null && output.indexOf(NO_RESULTS_MARK) !== -1) {
    return "No results";
  }
  if (queries === null || queries.length === 0) return "Web search";
  var extra = queries.length > 1 ? " +" + (queries.length - 1) + " more" : "";
  return queries[0] + extra;
}
function WebSearchRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var block = props.block;
  var done = doneOf(block);
  var args = parseArgs2(argsRawOf(block));
  var queries = searchQueries(args);
  var output = done ? resultTextOf(block) : null;
  var errorText = done ? errorTextOf(block) : null;
  var state = rowStateOf(block);
  var errorSummary = state === "error" && errorText !== null && errorText !== "" ? firstLineOfError(errorText) : void 0;
  var summary = searchSummary(queries, state, output);
  var body = state !== "error" && output !== null && output !== "" ? /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-markdown-body" }, /* @__PURE__ */ import_react4.default.createElement(MarkdownText2, { text: output })) : null;
  return toolRenderRow({
    callId: props.callId,
    useSession: props.useSession,
    useProjection: props.useProjection,
    toolName: "Web search",
    icon: /* @__PURE__ */ import_react4.default.createElement(IconBrowseOutline162, { size: 14 }),
    title: "Web search",
    summary,
    state,
    expandable: body !== null,
    expanded,
    onToggle: function() {
      setExpanded(!expanded);
    },
    body,
    errorSummary,
    errorText,
    inspect: props.inspect
  });
}
function WebFetchRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var block = props.block;
  var done = doneOf(block);
  var args = parseArgs2(argsRawOf(block));
  var url = args !== null ? pickString2(args, ["url"]) : void 0;
  var output = done ? resultTextOf(block) : null;
  var errorText = done ? errorTextOf(block) : null;
  var state = rowStateOf(block);
  var errorSummary = state === "error" && errorText !== null && errorText !== "" ? firstLineOfError(errorText) : void 0;
  var summary = url !== void 0 ? firstLine2(url) : "Web fetch";
  var body = null;
  if (state !== "error" && output !== null && output !== "") {
    body = looksLikeRawHtml(output) ? /* @__PURE__ */ import_react4.default.createElement("pre", { className: "tool-render-fetch-body tool-render-fetch-raw" }, output) : /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-fetch-body" }, /* @__PURE__ */ import_react4.default.createElement(MarkdownText2, { text: output }));
  }
  return toolRenderRow({
    callId: props.callId,
    useSession: props.useSession,
    useProjection: props.useProjection,
    toolName: "Web fetch",
    icon: /* @__PURE__ */ import_react4.default.createElement(IconBrowseOutline162, { size: 14 }),
    title: "Web fetch",
    summary,
    state,
    expandable: body !== null,
    expanded,
    onToggle: function() {
      setExpanded(!expanded);
    },
    body,
    errorSummary,
    errorText,
    inspect: props.inspect
  });
}
function runCodeSpoiler(open, label, onToggle, isError) {
  return /* @__PURE__ */ import_react4.default.createElement(
    "button",
    {
      type: "button",
      className: "tool-render-runcode-spoiler",
      "tool-render-error": isError === true || void 0,
      "aria-expanded": open,
      onClick: function() {
        onToggle();
      }
    },
    /* @__PURE__ */ import_react4.default.createElement(
      IconChevronDownOutline142,
      {
        className: open ? "tool-render-chevron tool-render-chevron-open" : "tool-render-chevron"
      }
    ),
    /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-runcode-spoiler-label" }, label)
  );
}
function RunCodeRow(props) {
  var inOpenState = useState(false);
  var inOpen = inOpenState[0];
  var setInOpen = inOpenState[1];
  var outUserState = useState(null);
  var outUser = outUserState[0];
  var setOutUser = outUserState[1];
  var block = props.block;
  var done = doneOf(block);
  var raw = argsRawOf(block);
  var summary = runCodeSummary(raw);
  var codeText = runCodeBodyText(raw);
  var content = done && block !== null && typeof block === "object" && Array.isArray(block.content) ? block.content : [];
  var isError = done && block !== null && typeof block === "object" && block.isError === true;
  var error = done && block !== null && typeof block === "object" ? block.error : void 0;
  var output = done ? runCodeOutputText(content, isError, error) : null;
  var errorText = done ? errorTextOf(block) : null;
  var state = rowStateOf(block);
  var errorSummary = state === "error" && errorText !== null && errorText !== "" ? firstLineOfError(errorText) : void 0;
  var outText = output;
  if (outText === null && isError === true) {
    var errMsg = error !== void 0 && error !== null && typeof error.message === "string" ? error.message : "";
    if (errMsg !== "" && errMsg.trim() !== "") outText = errMsg;
  }
  var outOpen = outUser === null ? isError === true : outUser;
  var inSection = null;
  if (codeText !== null && codeText !== "") {
    var rows = numberedReadRows(codeText, 1);
    inSection = /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-runcode-in" }, /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-code-out-label" }, "IN"), runCodeSpoiler(inOpen, runCodeInSummary(codeText), function() {
      setInOpen(!inOpen);
    }, false), inOpen === true ? /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-code" }, readLineRows(rows, "typescript")) : null);
  }
  var callsLabel = /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-runcode-calls-label" }, /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-code-out-label" }, "TOOL CALLS"));
  var outSection = null;
  if (outText !== null) {
    outSection = /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-code-out tool-render-runcode-out" }, /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-code-out-label" }, "OUT"), runCodeSpoiler(outOpen, runCodeOutSummary(outText), function() {
      setOutUser(!outOpen);
    }, state === "error"), outOpen === true ? /* @__PURE__ */ import_react4.default.createElement(
      "pre",
      {
        className: "tool-render-output tool-render-code-out-text",
        "tool-render-error": state === "error" || void 0
      },
      outText
    ) : null);
  }
  var card = toolRenderRow({
    callId: props.callId,
    useSession: props.useSession,
    useProjection: props.useProjection,
    toolName: "Run code",
    icon: /* @__PURE__ */ import_react4.default.createElement(IconPlayOutline162, { size: 14 }),
    title: "Code",
    summary,
    state,
    expandable: false,
    body: null,
    below: null,
    runCode: true,
    errorSummary,
    errorText,
    inspect: props.inspect
  });
  return /* @__PURE__ */ import_react4.default.createElement(import_react4.default.Fragment, null, card, inSection, callsLabel, outSection);
}
function useCompactionViews(useSession) {
  var face = null;
  var viewsState = useState(null);
  var views = viewsState[0];
  var setViews = viewsState[1];
  var session = typeof useSession === "function" ? useSession(function(value) {
    return value;
  }) : void 0;
  if (session !== null && session !== void 0 && session.projections !== void 0 && session.projections !== null && typeof session.projections.faceOf === "function") {
    try {
      face = session.projections.faceOf(COMPACTION_VIEWS_KEY);
    } catch (error) {
      face = null;
    }
  }
  useEffect(
    function() {
      if (face === null) return void 0;
      var update = function() {
        setViews(face.getSnapshot());
      };
      update();
      return face.subscribe(update);
    },
    [face]
  );
  return views;
}
function useGuardedApprovals(useSession, useProjection) {
  var recordState = useState(null);
  var record = recordState[0];
  var setRecord = recordState[1];
  var projected = typeof useProjection === "function" ? useProjection(GUARDED_APPROVALS_KEY) : void 0;
  var face = null;
  var session = typeof useSession === "function" ? useSession(function(value) {
    return value;
  }) : void 0;
  if (projected === void 0 && session !== null && session !== void 0 && session.projections !== void 0 && session.projections !== null && typeof session.projections.faceOf === "function") {
    try {
      face = session.projections.faceOf(GUARDED_APPROVALS_KEY);
    } catch (error) {
      face = null;
    }
  }
  useEffect(
    function() {
      if (face === null) return void 0;
      var update = function() {
        setRecord(face.getSnapshot());
      };
      update();
      return face.subscribe(update);
    },
    [face]
  );
  return projected !== void 0 && projected !== null ? projected : record;
}
function compactionSummaryText(rows, span) {
  return "Compacted " + countMessageRows(rows) + " messages \xB7 seqs " + span.minSeq + "\u2013" + span.maxSeq;
}
function compactionBody(view, rows) {
  var children = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (row.kind === "message") {
      children.push(
        /* @__PURE__ */ import_react4.default.createElement("div", { key: i, className: "tool-render-compaction-line" }, /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-compaction-role" }, row.role), /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-compaction-text", title: row.text, "data-dsh-tip": "" }, row.text))
      );
    } else if (row.kind === "toolStrip") {
      children.push(
        /* @__PURE__ */ import_react4.default.createElement("div", { key: i, className: "tool-render-compaction-strip" }, /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-compaction-text" }, row.count + " " + row.tool + " calls"), /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-badge" }, String(row.count)), /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-badge" }, "seq " + row.seq))
      );
    } else if (row.kind === "elided") {
      children.push(
        /* @__PURE__ */ import_react4.default.createElement("div", { key: i, className: "tool-render-compaction-note" }, row.note)
      );
    } else if (row.kind === "media") {
      children.push(
        /* @__PURE__ */ import_react4.default.createElement("div", { key: i, className: "tool-render-compaction-line" }, /* @__PURE__ */ import_react4.default.createElement("span", { className: "tool-render-compaction-text" }, row.label))
      );
    }
  }
  var stats = view.stats;
  children.push(
    /* @__PURE__ */ import_react4.default.createElement("div", { key: "stats", className: "tool-render-compaction-stats" }, "dropped ~" + stats.droppedResultTokens + " tokens of tool results, " + stats.erroredCalls + " errored calls hidden, " + stats.hiddenCalls + " hidden calls")
  );
  if (view.tail !== null && view.tail !== void 0) {
    children.push(
      /* @__PURE__ */ import_react4.default.createElement("div", { key: "tail", className: "tool-render-compaction-stats" }, "verbatim tail: " + view.tail.count + " nodes / ~" + view.tail.tokens + " tokens from seq " + view.tail.fromSeq)
    );
  }
  return /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-compaction" }, children);
}
function CompactionRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var data = props.node !== null && props.node !== void 0 && typeof props.node === "object" ? props.node.data : null;
  var node = compactionSummaryNode(data);
  var commandError = compactionCommandError(data);
  var errorSummary = commandError !== null ? firstLineOfError(commandError) : void 0;
  var summary = node !== null && typeof node.summary === "string" ? node.summary : "";
  var summaryEventSeq = node !== null && typeof node.summaryEventSeq === "number" ? node.summaryEventSeq : void 0;
  var counts = node !== null && typeof node.shadowedItemCount === "number" && typeof node.shadowedTokenCount === "number" ? String(node.shadowedItemCount) + " items, " + String(node.shadowedTokenCount) + " tokens compacted" : null;
  var views = useCompactionViews(props.useSession);
  var view = views !== null && views !== void 0 && summaryEventSeq !== void 0 ? views[String(summaryEventSeq)] : null;
  var rows = view !== null && view !== void 0 ? prettyRows(view) : null;
  if (rows === null || rows.length === 0) {
    var fallbackText = stripOuterFence(summary);
    var fallbackBody = fallbackText !== "" ? /* @__PURE__ */ import_react4.default.createElement("div", { className: "tool-render-markdown-body" }, /* @__PURE__ */ import_react4.default.createElement(MarkdownText2, { text: fallbackText })) : null;
    return toolRenderRow({
      callId: props.callId,
      useSession: props.useSession,
      useProjection: props.useProjection,
      toolName: "Compaction",
      icon: /* @__PURE__ */ import_react4.default.createElement(IconBrowseOutline162, { size: 14 }),
      title: "Compaction",
      summary: commandError !== null ? "Compaction" : counts !== null ? counts : fallbackText !== "" ? firstLine2(fallbackText) : "Compaction",
      state: commandError !== null ? "error" : void 0,
      expandable: fallbackBody !== null || commandError !== null,
      expanded,
      onToggle: function() {
        setExpanded(!expanded);
      },
      body: fallbackBody,
      errorSummary,
      errorText: commandError
    });
  }
  var pretty = view;
  return toolRenderRow({
    callId: props.callId,
    useSession: props.useSession,
    useProjection: props.useProjection,
    toolName: "Compaction",
    icon: /* @__PURE__ */ import_react4.default.createElement(IconBrowseOutline162, { size: 14 }),
    title: "Compaction",
    summary: compactionSummaryText(rows, pretty.span),
    expandable: true,
    expanded,
    onToggle: function() {
      setExpanded(!expanded);
    },
    body: compactionBody(pretty, rows)
  });
}
var inject = ["slots"];
var name = PLUGIN_NAME;
function apply(ctx) {
  approvalSteerTo = buildApprovalSteer(
    typeof ctx.get === "function" ? ctx.get("sessions") : void 0
  );
  ctx.slots.inject("context.injection.view", function* () {
    yield ctx.slots.register(
      {
        name: "context.injection.view",
        key: "profiles",
        priority: -100
      },
      FailoverRow
    );
  });
  ctx.slots.inject("tool.call.toolview", function* () {
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "read",
        priority: -100
      },
      ReadRow
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "bash",
        priority: -100
      },
      BashRow
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "edit",
        priority: -100
      },
      EditRow
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "write",
        priority: -100
      },
      WriteRow
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "undo_edit",
        priority: -100
      },
      UndoEditRow
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "undo_last_edit",
        priority: -100
      },
      UndoEditRow
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "todo_write",
        priority: -100
      },
      TodoRow
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "ask_user_question",
        priority: -100
      },
      AskRow
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "subagent",
        priority: -100
      },
      SubagentRow
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "send_message",
        priority: -100
      },
      SendMessageRow
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "interrupt_agent",
        priority: -100
      },
      InterruptAgentRow
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "list_agents",
        priority: -100
      },
      ListAgentsRow
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "skill",
        priority: -100
      },
      SkillRow
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "package",
        priority: -100
      },
      PackageRow
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "job_output",
        priority: -100
      },
      JobOutputRow
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "read_image",
        priority: -100
      },
      ReadImageRow
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "see",
        priority: -100
      },
      SeeRow
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "web_search",
        priority: -100
      },
      WebSearchRow
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "web_fetch",
        priority: -100
      },
      WebFetchRow
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "run_code",
        priority: -100
      },
      RunCodeRow
    );
  });
  ctx.slots.inject("conversation.chat.node", function* () {
    yield ctx.slots.register(
      {
        name: "conversation.chat.node",
        key: "context",
        // The shipped ContextInjectionRow registers "context" at priority 0
        // (bundle B5). Unlike tool.call.toolview, this slot THROWS on a
        // same-key registration at the same priority instead of silently
        // colliding -- it took the whole plugin down on load. Lowest
        // priority renders, so this must be a lower number to shadow it.
        priority: -100,
        // Lets a plugin-named injection be shadowed by its own producer,
        // keyed by source.plugin. See ContextRow / context.injection.view.
        children: { "context.injection.view": { kind: "keyed", scope: "session" } }
      },
      ContextRow
    );
    yield ctx.slots.register(
      {
        name: "conversation.chat.node",
        key: "compaction",
        priority: -100
      },
      CompactionRow
    );
    yield ctx.slots.register(
      {
        name: "conversation.chat.node",
        key: "manual-compaction",
        priority: -100
      },
      CompactionRow
    );
  });
}
/*! Bundled license information:

lucide-react/dist/esm/shared/src/utils/toKebabCase.mjs:
lucide-react/dist/esm/shared/src/utils/toLucideIconData.mjs:
lucide-react/dist/esm/shared/src/utils/toCamelCase.mjs:
lucide-react/dist/esm/shared/src/utils/toPascalCase.mjs:
lucide-react/dist/esm/shared/src/utils/mergeClasses.mjs:
lucide-react/dist/esm/shared/src/build/defaultAttributes.mjs:
lucide-react/dist/esm/shared/src/build/buildLucideIconNode.mjs:
lucide-react/dist/esm/shared/src/build/buildLucideIconForReact.mjs:
lucide-react/dist/esm/shared/src/utils/hasA11yProp.mjs:
lucide-react/dist/esm/context.mjs:
lucide-react/dist/esm/Icon.mjs:
lucide-react/dist/esm/createLucideIcon.mjs:
lucide-react/dist/esm/icons/image.mjs:
lucide-react/dist/esm/lucide-react.mjs:
  (**
   * @license lucide-react v1.46.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)
*/
		return module.exports;
	}
});
