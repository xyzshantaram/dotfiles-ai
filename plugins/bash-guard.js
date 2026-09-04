// plugins/bash-guard.ts
import { readdir, readFile } from "node:fs/promises";
import { join as join2, resolve, sep, isAbsolute as isAbsolute2 } from "node:path";

// node_modules/.pnpm/unbash@3.0.0/node_modules/unbash/dist/chars.js
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

// node_modules/.pnpm/unbash@3.0.0/node_modules/unbash/dist/arithmetic.js
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
var pendingArithCmdExps = null;
function drainArithCmdExps() {
  const out = pendingArithCmdExps;
  pendingArithCmdExps = null;
  return out;
}
function parseArithmeticExpression(src, offset = 0) {
  pendingArithCmdExps = null;
  let pos = 0;
  const len = src.length;
  function skipWS() {
    while (pos < len) {
      const c = src.charCodeAt(pos);
      if (c === CH_SPACE || c === CH_TAB || c === CH_NL)
        pos++;
      else
        break;
    }
  }
  function tryReadBinOp() {
    if (pos >= len)
      return null;
    const c = src.charCodeAt(pos);
    const nc = pos + 1 < len ? src.charCodeAt(pos + 1) : 0;
    const nnc = pos + 2 < len ? src.charCodeAt(pos + 2) : 0;
    switch (c) {
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
      return { type: "ArithmeticWord", pos: pos + offset, end: pos + offset, value: "" };
    const start = pos;
    const c = src.charCodeAt(pos);
    const nc = pos + 1 < len ? src.charCodeAt(pos + 1) : 0;
    if (c === CH_PLUS && nc === CH_PLUS) {
      pos += 2;
      const operand = parseUnaryExpr();
      return { type: "ArithmeticUnary", pos: start + offset, end: operand.end, operator: "++", operand, prefix: true };
    }
    if (c === CH_DASH && nc === CH_DASH) {
      pos += 2;
      const operand = parseUnaryExpr();
      return { type: "ArithmeticUnary", pos: start + offset, end: operand.end, operator: "--", operand, prefix: true };
    }
    if (c === CH_BANG) {
      pos++;
      const operand = parseUnaryExpr();
      return { type: "ArithmeticUnary", pos: start + offset, end: operand.end, operator: "!", operand, prefix: true };
    }
    if (c === CH_TILDE) {
      pos++;
      const operand = parseUnaryExpr();
      return { type: "ArithmeticUnary", pos: start + offset, end: operand.end, operator: "~", operand, prefix: true };
    }
    if (c === CH_PLUS && nc !== CH_PLUS && nc !== CH_EQ) {
      pos++;
      const operand = parseUnaryExpr();
      return { type: "ArithmeticUnary", pos: start + offset, end: operand.end, operator: "+", operand, prefix: true };
    }
    if (c === CH_DASH && nc !== CH_DASH && nc !== CH_EQ) {
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
      const c = src.charCodeAt(pos);
      const nc = src.charCodeAt(pos + 1);
      if (c === CH_PLUS && nc === CH_PLUS) {
        pos += 2;
        return { type: "ArithmeticUnary", pos: operand.pos, end: pos + offset, operator: "++", operand, prefix: false };
      }
      if (c === CH_DASH && nc === CH_DASH) {
        pos += 2;
        return { type: "ArithmeticUnary", pos: operand.pos, end: pos + offset, operator: "--", operand, prefix: false };
      }
    }
    return operand;
  }
  function parseAtom() {
    skipWS();
    if (pos >= len)
      return { type: "ArithmeticWord", pos: pos + offset, end: pos + offset, value: "" };
    const c = src.charCodeAt(pos);
    if (c === CH_LPAREN) {
      const start = pos;
      pos++;
      const expr = parseBinExpr(0);
      skipWS();
      if (pos < len && src.charCodeAt(pos) === CH_RPAREN)
        pos++;
      return { type: "ArithmeticGroup", pos: start + offset, end: pos + offset, expression: expr };
    }
    if (c === CH_DOLLAR) {
      return readDollarAtom();
    }
    return readWordAtom();
  }
  function readDollarAtom() {
    const start = pos;
    pos++;
    if (pos >= len)
      return { type: "ArithmeticWord", pos: start + offset, end: pos + offset, value: "$" };
    const c = src.charCodeAt(pos);
    if (c === CH_LPAREN) {
      if (pos + 1 < len && src.charCodeAt(pos + 1) === CH_LPAREN) {
        pos += 2;
        let depth = 1;
        while (pos < len && depth > 0) {
          if (src.charCodeAt(pos) === CH_LPAREN && pos + 1 < len && src.charCodeAt(pos + 1) === CH_LPAREN) {
            depth++;
            pos += 2;
          } else if (src.charCodeAt(pos) === CH_RPAREN && pos + 1 < len && src.charCodeAt(pos + 1) === CH_RPAREN) {
            depth--;
            if (depth > 0)
              pos += 2;
            else
              pos += 2;
          } else
            pos++;
        }
      } else {
        pos++;
        let depth = 1;
        while (pos < len && depth > 0) {
          const ch = src.charCodeAt(pos);
          if (ch === CH_LPAREN)
            depth++;
          else if (ch === CH_RPAREN)
            depth--;
          pos++;
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
        (pendingArithCmdExps ??= []).push(node);
        return node;
      }
    } else if (c === CH_LBRACE) {
      pos++;
      let depth = 1;
      while (pos < len && depth > 0) {
        const ch = src.charCodeAt(pos);
        if (ch === CH_LBRACE)
          depth++;
        else if (ch === CH_RBRACE)
          depth--;
        pos++;
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
    return { type: "ArithmeticWord", pos: start + offset, end: pos + offset, value: src.slice(start, pos) };
  }
  function readWordAtom() {
    const start = pos;
    while (pos < len) {
      const c = src.charCodeAt(pos);
      if (c >= CH_0 && c <= CH_9 || c >= CH_A && c <= CH_Z || c >= CH_a && c <= CH_z || c === CH_UNDERSCORE || c === 35) {
        pos++;
      } else
        break;
    }
    if (pos > start && pos < len && src.charCodeAt(pos) === CH_LBRACKET) {
      pos++;
      let depth = 1;
      while (pos < len && depth > 0) {
        const c = src.charCodeAt(pos);
        if (c === CH_LBRACKET)
          depth++;
        else if (c === CH_RBRACKET)
          depth--;
        pos++;
      }
    }
    if (pos === start) {
      pos++;
      return { type: "ArithmeticWord", pos: start + offset, end: pos + offset, value: src.slice(start, pos) };
    }
    return { type: "ArithmeticWord", pos: start + offset, end: pos + offset, value: src.slice(start, pos) };
  }
  skipWS();
  if (pos >= len)
    return null;
  const result = parseBinExpr(0);
  skipWS();
  return result;
}

// node_modules/.pnpm/unbash@3.0.0/node_modules/unbash/dist/word.js
function dequoteValue(parts) {
  let s = "";
  for (const c of parts)
    s += c.type === "Literal" ? c.value : c.text;
  return s;
}
var WordImpl = class _WordImpl {
  static _resolveWord;
  static _resolveHeredocBody;
  text;
  pos;
  end;
  #source;
  #resolver;
  #parts;
  #value = null;
  constructor(text, pos, end, source, resolver) {
    this.text = text;
    this.pos = pos;
    this.end = end;
    this.#source = source ?? "";
    this.#resolver = resolver ?? _WordImpl._resolveWord;
    this.#parts = source !== void 0 ? null : void 0;
  }
  get value() {
    if (this.#value === null) {
      const parts = this.parts;
      if (!parts) {
        this.#value = this.text;
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
      this.#parts = this.#resolver(this.#source, this) ?? void 0;
    }
    return this.#parts;
  }
  set parts(v) {
    this.#parts = v ?? void 0;
  }
  toJSON() {
    return { text: this.text, pos: this.pos, end: this.end, parts: this.parts, value: this.value };
  }
};

// node_modules/.pnpm/unbash@3.0.0/node_modules/unbash/dist/lexer.js
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
  value = "";
  pos = 0;
  end = 0;
  fileDescriptor = void 0;
  variableName = void 0;
  content = void 0;
  targetPos = 0;
  targetEnd = 0;
  reset() {
    this.token = Token.EOF;
    this.value = "";
    this.pos = 0;
    this.end = 0;
    this.fileDescriptor = void 0;
    this.variableName = void 0;
    this.content = void 0;
    this.targetPos = 0;
    this.targetEnd = 0;
  }
  copyFrom(other) {
    this.token = other.token;
    this.value = other.value;
    this.pos = other.pos;
    this.end = other.end;
    this.fileDescriptor = other.fileDescriptor;
    this.variableName = other.variableName;
    this.content = other.content;
    this.targetPos = other.targetPos;
    this.targetEnd = other.targetEnd;
  }
};
var RESERVED_WORDS = {
  if: Token.If,
  then: Token.Then,
  else: Token.Else,
  elif: Token.Elif,
  fi: Token.Fi,
  do: Token.Do,
  done: Token.Done,
  for: Token.For,
  while: Token.While,
  until: Token.Until,
  in: Token.In,
  case: Token.Case,
  esac: Token.Esac,
  function: Token.Function,
  select: Token.Select,
  coproc: Token.Coproc,
  "!": Token.Bang,
  "{": Token.LBrace,
  "}": Token.RBrace
};
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
function findUnnested(s, target) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === CH_BACKSLASH) {
      i++;
      continue;
    }
    if (c === CH_LBRACE) {
      depth++;
      continue;
    }
    if (c === CH_RBRACE) {
      if (depth > 0)
        depth--;
      continue;
    }
    if (c === CH_SQUOTE) {
      i++;
      while (i < s.length && s.charCodeAt(i) !== CH_SQUOTE)
        i++;
      continue;
    }
    if (c === CH_DQUOTE) {
      i++;
      while (i < s.length && s.charCodeAt(i) !== CH_DQUOTE) {
        if (s.charCodeAt(i) === CH_BACKSLASH)
          i++;
        i++;
      }
      continue;
    }
    if (c === target && depth === 0)
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
    const c = text.charCodeAt(i);
    if (c < CH_0 || c > CH_9)
      return false;
  }
  return text.length > 0;
}
function isAssignmentWord(text) {
  const eqIdx = text.indexOf("=");
  if (eqIdx <= 0)
    return false;
  let c = text.charCodeAt(0);
  if (c >= 128 || !(isIdChar[c] & 1))
    return false;
  let i = 1;
  for (; i < eqIdx; i++) {
    c = text.charCodeAt(i);
    if (c >= 128 || !(isIdChar[c] & 2))
      break;
  }
  if (i === eqIdx)
    return true;
  if (c === CH_PLUS && i + 1 === eqIdx)
    return true;
  if (c === CH_LBRACKET) {
    const rbIdx = text.indexOf("]", i + 1);
    if (rbIdx > i && (rbIdx + 1 === eqIdx || text.charCodeAt(rbIdx + 1) === CH_PLUS && rbIdx + 2 === eqIdx))
      return true;
  }
  return false;
}
function setToken(out, token, value, pos = 0, end = 0) {
  out.token = token;
  out.value = value;
  out.pos = pos;
  out.end = end;
  out.fileDescriptor = void 0;
  out.variableName = void 0;
  out.content = void 0;
}
var LexContext = {
  Normal: 0,
  CommandStart: 1,
  TestMode: 2
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
var Lexer = class {
  src;
  pos;
  current;
  nextState;
  hasPeek;
  pendingHereDocs;
  collectedExpansions;
  _errors = null;
  _buildParts = false;
  constructor(src) {
    this.src = src;
    this.pos = 0;
    this.current = new TokenValue();
    this.nextState = new TokenValue();
    this.hasPeek = false;
    this.pendingHereDocs = [];
    this.collectedExpansions = [];
    if (src.charCodeAt(0) === CH_HASH && src.charCodeAt(1) === CH_BANG) {
      const nl = src.indexOf("\n");
      this.pos = nl === -1 ? src.length : nl + 1;
    }
  }
  get errors() {
    return this._errors ?? (this._errors = []);
  }
  getCollectedExpansions() {
    return this.collectedExpansions;
  }
  getPos() {
    return this.pos;
  }
  /** Set position and scan a word, building parts. Used by computeWordParts. */
  buildWordParts(startPos) {
    this._buildParts = true;
    this.pos = startPos;
    const ch = this.src.charCodeAt(startPos);
    if ((ch === 60 || ch === 62) && startPos + 1 < this.src.length && this.src.charCodeAt(startPos + 1) === 40) {
      this.pos = startPos + 2;
      const inner = this.extractBalanced();
      const text = this.src.slice(startPos, this.pos);
      const part = {
        type: "ProcessSubstitution",
        text,
        operator: ch === 60 ? "<" : ">",
        script: void 0,
        inner: inner ?? void 0
      };
      this.collectedExpansions.push(part);
      if (this.pos < this.src.length) {
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
    for (const hd of this.pendingHereDocs) {
      if (!hd.target) {
        hd.target = target;
        return;
      }
    }
  }
  // Read the right-hand operand of =~ in [[ ]]. Parentheses and pipe are not
  // metacharacters in regex patterns, so we temporarily clear their charType
  // entries so that readWord's fast/slow path treats them as plain chars.
  readTestRegexWord() {
    this.hasPeek = false;
    const chars = [CH_LPAREN, CH_RPAREN, CH_PIPE, CH_LT, CH_GT];
    const saved = chars.map((c) => charType[c]);
    for (const c of chars)
      charType[c] = 0;
    try {
      this.skipSpacesAndTabs();
      this.readWord(this.current, LexContext.Normal, this.pos);
      return this.current;
    } finally {
      for (let i = 0; i < chars.length; i++)
        charType[chars[i]] = saved[i];
    }
  }
  // Read C-style for expressions: called after first '(' consumed by parser.
  // Expects pos at second '('. Returns [init, test, update] raw text.
  readCStyleForExprs() {
    this.hasPeek = false;
    const src = this.src;
    const len = src.length;
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
      const c = src.charCodeAt(this.pos);
      if (c === CH_LPAREN) {
        depth++;
        this.pos++;
      } else if (c === CH_RPAREN) {
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
      } else if (c === CH_SEMI && depth === 1) {
        const raw = src.slice(partStart, this.pos);
        parts[partIdx] = raw.trim();
        parts[3 + partIdx] = starts[partIdx] + raw.length - raw.trimStart().length;
        if (partIdx < 2)
          partIdx++;
        this.pos++;
        partStart = this.pos;
        starts[partIdx] = partStart;
      } else if (c === CH_SQUOTE) {
        this.pos++;
        this.skipSQ();
      } else if (c === CH_DQUOTE) {
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
    const len = src.length;
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
    if (ctx === LexContext.TestMode && (ch === CH_LT || ch === CH_GT)) {
      this.pos++;
      setToken(out, Token.Word, ch === CH_LT ? "<" : ">", tokenStart, this.pos);
      return;
    }
    if (this.tryReadOperator(out, ch, ctx, tokenStart))
      return;
    this.readWord(out, ctx, tokenStart);
  }
  tryReadOperator(out, ch, ctx, tokenStart) {
    const src = this.src;
    const pos = this.pos;
    const next = pos + 1 < src.length ? src.charCodeAt(pos + 1) : 0;
    switch (ch) {
      case CH_SEMI:
        if (next === CH_SEMI) {
          if (pos + 2 < src.length && src.charCodeAt(pos + 2) === CH_AMP) {
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
          const append = this.pos < src.length && src.charCodeAt(this.pos) === CH_GT;
          if (append)
            this.pos++;
          this.skipSpacesAndTabs();
          this._redirectTargetPos = this.pos;
          if (this.pos < src.length && src.charCodeAt(this.pos) !== CH_NL)
            this.readWordText();
          this.redirectToken(out, append ? "&>>" : "&>", tokenStart);
          return true;
        }
        this.pos++;
        setToken(out, Token.Amp, "&", tokenStart, this.pos);
        return true;
      case CH_LPAREN:
        if (ctx === LexContext.CommandStart && next === CH_LPAREN) {
          this.readArithmeticCommand(out, tokenStart);
          return true;
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
      const next = this.pos < src.length ? src.charCodeAt(this.pos) : 0;
      if (next === CH_LT) {
        this.pos++;
        const third = this.pos < src.length ? src.charCodeAt(this.pos) : 0;
        if (third === CH_LT) {
          this.pos++;
          this.skipSpacesAndTabs();
          this._redirectTargetPos = this.pos;
          if (this.pos < src.length && src.charCodeAt(this.pos) !== CH_NL)
            this.readWordText();
          this.redirectToken(out, "<<<", tokenStart);
          return true;
        }
        const dash = third === CH_DASH;
        if (dash)
          this.pos++;
        this.skipSpacesAndTabs();
        this.readHereDocDelimiter();
        this.pendingHereDocs.push({ delimiter: this._hereDelim, strip: dash, quoted: this._hereQuoted });
        setToken(out, Token.Redirect, dash ? "<<-" : "<<", tokenStart, this.pos);
        out.content = this._hereDelim;
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
      const next = this.pos < src.length ? src.charCodeAt(this.pos) : 0;
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
    if (this.pos < src.length) {
      const nc = src.charCodeAt(this.pos);
      if ((nc === CH_LT || nc === CH_GT) && this.pos + 1 < src.length && src.charCodeAt(this.pos + 1) === CH_LPAREN) {
        const psStart = this.pos;
        this.pos += 2;
        this.extractBalanced();
        const psText = src.slice(psStart, this.pos);
        setToken(out, Token.Redirect, op, tokenStart, this.pos);
        out.content = psText;
        out.targetPos = psStart;
        out.targetEnd = this.pos;
        return true;
      }
      this._redirectTargetPos = this.pos;
      if (nc !== CH_NL)
        this.readWordText();
    }
    this.redirectToken(out, op, tokenStart);
    return true;
  }
  redirectToken(out, operator, tokenStart) {
    setToken(out, Token.Redirect, operator, tokenStart, this.pos);
    out.content = this._wordText;
    out.targetPos = this._redirectTargetPos;
    out.targetEnd = this.pos;
  }
  readProcessSubstitution(out, operator, tokenStart) {
    this.pos++;
    this.extractBalanced();
    const text = this.src.slice(tokenStart, this.pos);
    setToken(out, Token.Word, text, tokenStart, this.pos);
  }
  readHereDocDelimiter() {
    const src = this.src;
    const len = src.length;
    let delimiter = "";
    if (this.pos < len && src.charCodeAt(this.pos) === CH_SQUOTE) {
      this.pos++;
      const start = this.pos;
      while (this.pos < len && src.charCodeAt(this.pos) !== CH_SQUOTE)
        this.pos++;
      delimiter = src.slice(start, this.pos);
      if (this.pos < len)
        this.pos++;
      this._hereDelim = delimiter;
      this._hereQuoted = true;
      return;
    } else if (this.pos < len && src.charCodeAt(this.pos) === CH_DQUOTE) {
      this.pos++;
      while (this.pos < len && src.charCodeAt(this.pos) !== CH_DQUOTE) {
        if (src.charCodeAt(this.pos) === CH_BACKSLASH)
          this.pos++;
        delimiter += src[this.pos];
        this.pos++;
      }
      if (this.pos < len)
        this.pos++;
      this._hereDelim = delimiter;
      this._hereQuoted = true;
      return;
    } else if (this.pos < len && src.charCodeAt(this.pos) === CH_BACKSLASH) {
      while (this.pos < len) {
        const c = src.charCodeAt(this.pos);
        if (c < 128 && charType[c] & 1)
          break;
        if (c === CH_BACKSLASH)
          this.pos++;
        if (this.pos < len) {
          delimiter += src[this.pos];
          this.pos++;
        }
      }
      this._hereDelim = delimiter;
      this._hereQuoted = true;
      return;
    } else {
      const start = this.pos;
      while (this.pos < len) {
        const c = src.charCodeAt(this.pos);
        if (c < 128 && charType[c] & 1)
          break;
        this.pos++;
      }
      this._hereDelim = src.slice(start, this.pos);
      this._hereQuoted = false;
    }
  }
  consumePendingHereDocs() {
    for (const hd of this.pendingHereDocs) {
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
    this.pendingHereDocs.length = 0;
  }
  readHereDocBody(delimiter, strip) {
    const src = this.src;
    const len = src.length;
    const dLen = delimiter.length;
    const bodyStart = this.pos;
    while (this.pos < len) {
      let lineStart = this.pos;
      let lineEnd = src.indexOf("\n", this.pos);
      if (lineEnd === -1)
        lineEnd = len;
      if (strip) {
        while (lineStart < lineEnd && src.charCodeAt(lineStart) === CH_TAB)
          lineStart++;
      }
      if (lineEnd - lineStart === dLen && src.startsWith(delimiter, lineStart)) {
        const body = src.slice(bodyStart, this.pos);
        this.pos = lineEnd < len ? lineEnd + 1 : lineEnd;
        return body;
      }
      this.pos = lineEnd < len ? lineEnd + 1 : lineEnd;
    }
    return src.slice(bodyStart, this.pos);
  }
  // Scan an unquoted heredoc body for expansions ($var, ${...}, $(...), `...`).
  // Returns a Word (without parts — use computeWordParts for those) if expansions exist.
  parseHereDocBody(body, bodyPos) {
    let hasExpansion = false;
    for (let i = 0; i < body.length; i++) {
      const c = body.charCodeAt(i);
      if (c === CH_BACKTICK) {
        hasExpansion = true;
        break;
      }
      if (c === CH_DOLLAR) {
        const next = i + 1 < body.length ? body.charCodeAt(i + 1) : 0;
        if (next === CH_LBRACE || next === CH_LPAREN || next === CH_DOLLAR || next >= CH_a && next <= CH_z || next >= CH_A && next <= CH_Z || next === CH_UNDERSCORE || next === CH_BANG || next === CH_HASH || next === CH_AT || next === CH_STAR || next === CH_QUESTION || next === CH_DASH || next >= CH_0 && next <= CH_9) {
          hasExpansion = true;
          break;
        }
      }
      if (c === CH_BACKSLASH)
        i++;
    }
    if (!hasExpansion)
      return null;
    return new WordImpl(body, bodyPos, bodyPos + body.length, this.src, WordImpl._resolveHeredocBody);
  }
  _wordText = "";
  _wordQuoted = false;
  _wordHasExpansions = false;
  _wordParts = null;
  _redirectTargetPos = 0;
  _resultText = "";
  _resultHasExpansion = false;
  _resultPart;
  _dqText = "";
  _dqHasExpansions = false;
  _dqParts = null;
  _hereDelim = "";
  _hereQuoted = false;
  readWord(out, ctx, tokenStart = 0) {
    this.readWordText();
    const text = this._wordText;
    const hasExpansions = this._wordHasExpansions;
    const quoted = this._wordQuoted;
    const wordEnd = this.pos;
    if (ctx === LexContext.CommandStart) {
      if (!hasExpansions && !quoted) {
        const fc = text.charCodeAt(0);
        if ((fc >= CH_a && fc <= CH_z && text.length <= 8 || fc === CH_BANG || fc === CH_LBRACE || fc === CH_RBRACE) && text in RESERVED_WORDS) {
          setToken(out, RESERVED_WORDS[text], text, tokenStart, wordEnd);
          return;
        }
        if (fc === CH_LBRACKET && text === "[[") {
          setToken(out, Token.DblLBracket, text, tokenStart, wordEnd);
          return;
        }
      }
      if (isAssignmentWord(text)) {
        setToken(out, Token.Assignment, text, tokenStart, wordEnd);
        return;
      }
    }
    if (!hasExpansions && !quoted && text === "]]") {
      setToken(out, Token.DblRBracket, text, tokenStart, wordEnd);
      return;
    }
    if (!hasExpansions && this.pos < this.src.length) {
      const nc = this.src.charCodeAt(this.pos);
      if (nc === CH_LT || nc === CH_GT) {
        if (text.charCodeAt(0) >= CH_0 && text.charCodeAt(0) <= CH_9 && isAllDigits(text)) {
          const fd = Number.parseInt(text, 10);
          if (this.readRedirection(out, tokenStart)) {
            out.fileDescriptor = fd;
            return;
          }
        }
        if (text.charCodeAt(0) === CH_LBRACE && text.charCodeAt(text.length - 1) === CH_RBRACE && text.length > 2) {
          const varname = text.slice(1, -1);
          if (this.readRedirection(out, tokenStart)) {
            out.variableName = varname;
            return;
          }
        }
      }
    }
    setToken(out, Token.Word, text, tokenStart, wordEnd);
  }
  readWordText() {
    const src = this.src;
    const len = src.length;
    let pos = this.pos;
    const fastStart = pos;
    while (pos < len) {
      const c = src.charCodeAt(pos);
      if (c < 128 && charType[c])
        break;
      pos++;
    }
    const exitCh = pos < len ? src.charCodeAt(pos) : 0;
    if (pos >= len || charType[exitCh] & 1 && !(exitCh === CH_LPAREN && pos > fastStart && extglobPrefix[src.charCodeAt(pos - 1)])) {
      this.pos = pos;
      this._wordText = pos > fastStart ? src.slice(fastStart, pos) : "";
      this._wordQuoted = false;
      this._wordHasExpansions = false;
      if (this._buildParts)
        this._wordParts = null;
      return;
    }
    let text = pos > fastStart ? src.slice(fastStart, pos) : "";
    let quoted = false;
    let hasExpansions = false;
    const bp = this._buildParts;
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
          const c = src.charCodeAt(pos);
          if (c < 128 && charType[c])
            break;
          pos++;
        }
        const chunk = src.slice(runStart, pos);
        text += chunk;
        if (bp)
          litBuf += chunk;
        continue;
      }
      if (charType[ch] & 1) {
        if (ch === CH_LPAREN && text.length > 0 && extglobPrefix[text.charCodeAt(text.length - 1)]) {
          const prefixChar = text.charCodeAt(text.length - 1);
          pos++;
          const innerStart = pos;
          let depth = 1;
          while (pos < len && depth > 0) {
            const c = src.charCodeAt(pos);
            if (c === CH_LPAREN)
              depth++;
            else if (c === CH_RPAREN)
              depth--;
            pos++;
          }
          const pattern = src.slice(innerStart, pos - 1);
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
            const fullText = op + eg;
            parts.push({ type: "ExtendedGlob", text: fullText, operator: op, pattern });
            litStart = pos;
          } else if (bp) {
            litBuf += eg;
          }
          continue;
        }
        break;
      }
      if (ch === CH_BACKSLASH) {
        pos++;
        if (pos < len) {
          if (src.charCodeAt(pos) === CH_NL) {
            pos++;
          } else {
            quoted = true;
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
        quoted = true;
        pos++;
        const start = pos;
        while (pos < len && src.charCodeAt(pos) !== CH_SQUOTE)
          pos++;
        const value = src.slice(start, pos);
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
        quoted = true;
        pos++;
        this.pos = pos;
        this.readDoubleQuoted();
        pos = this.pos;
        text += this._dqText;
        if (this._dqHasExpansions)
          hasExpansions = true;
        if (bp) {
          if (litBuf) {
            parts.push({ type: "Literal", value: litBuf, text: src.slice(litStart, dqStart) });
            litBuf = "";
          }
          const dqText = src.slice(dqStart, pos);
          parts.push({
            type: "DoubleQuoted",
            text: dqText,
            parts: this._dqParts ?? [{ type: "Literal", value: this._dqText, text: src.slice(dqStart + 1, pos - 1) }]
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
        if (this._resultHasExpansion)
          hasExpansions = true;
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
        hasExpansions = true;
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
        const braceEnd = scanBraceExpansion(src, pos, len);
        if (braceEnd > 0) {
          const braceText = src.slice(pos, braceEnd);
          text += braceText;
          if (bp) {
            if (litBuf) {
              parts.push({ type: "Literal", value: litBuf, text: src.slice(litStart, pos) });
              litBuf = "";
            }
            parts.push({ type: "BraceExpansion", text: braceText });
            litStart = braceEnd;
          }
          pos = braceEnd;
          continue;
        }
        text += "{";
        if (bp)
          litBuf += "{";
        pos++;
        continue;
      }
      pos++;
    }
    if (bp && litBuf)
      parts.push({ type: "Literal", value: litBuf, text: src.slice(litStart, pos) });
    this.pos = pos;
    this._wordText = text;
    this._wordQuoted = quoted;
    this._wordHasExpansions = hasExpansions;
    if (bp) {
      this._wordParts = parts.length > 1 || parts.length === 1 && parts[0].type !== "Literal" ? parts : null;
    }
  }
  readInnerWordText() {
    const src = this.src;
    const len = src.length;
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
            parts: this._dqParts ?? [{ type: "Literal", value: this._dqText, text: src.slice(dqStart + 1, pos - 1) }]
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
      text += src[pos];
      if (bp)
        litBuf += src[pos];
      pos++;
    }
    if (bp && litBuf)
      parts.push({ type: "Literal", value: litBuf, text: src.slice(litStart, pos) });
    this.pos = pos;
    this._wordText = text;
    this._wordQuoted = false;
    this._wordHasExpansions = false;
    if (bp) {
      this._wordParts = parts.length > 1 || parts.length === 1 && parts[0].type !== "Literal" ? parts : null;
    }
  }
  parseSubFieldWord(s) {
    if (!s)
      return new WordImpl("", 0, 0);
    const savedSrc = this.src;
    const savedPos = this.pos;
    const savedText = this._wordText;
    const savedParts = this._wordParts;
    const savedQuoted = this._wordQuoted;
    this.src = s;
    this.pos = 0;
    this.readInnerWordText();
    const word = new WordImpl(this._wordText, 0, 0);
    if (this._buildParts && this._wordParts) {
      word.parts = this._wordParts;
    }
    this.src = savedSrc;
    this.pos = savedPos;
    this._wordText = savedText;
    this._wordParts = savedParts;
    this._wordQuoted = savedQuoted;
    return word;
  }
  skipSQ() {
    while (this.pos < this.src.length && this.src.charCodeAt(this.pos) !== CH_SQUOTE)
      this.pos++;
    if (this.pos < this.src.length)
      this.pos++;
  }
  skipDQ() {
    const src = this.src;
    const len = src.length;
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
          this.pos += 2;
          this.extractBalanced();
          continue;
        }
        if (next === CH_LBRACE) {
          this.pos += 2;
          let d = 1;
          while (this.pos < len && d > 0) {
            const c = src.charCodeAt(this.pos);
            if (c === CH_RBRACE) {
              if (--d === 0) {
                this.pos++;
                break;
              }
            } else if (c === CH_LBRACE && this.pos > 0 && src.charCodeAt(this.pos - 1) === CH_DOLLAR)
              d++;
            else if (c === CH_BACKSLASH) {
              this.pos++;
            } else if (c === CH_SQUOTE) {
              this.pos++;
              this.skipSQ();
              continue;
            } else if (c === CH_DQUOTE) {
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
    const len = src.length;
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
    const len = src.length;
    const contentStart = this.pos;
    let hasExpansions = false;
    const bp = this._buildParts;
    if (!bp) {
      let p = this.pos;
      while (p < len) {
        const c = src.charCodeAt(p);
        if (c === CH_DQUOTE) {
          this._dqText = src.slice(contentStart, p);
          this.pos = p + 1;
          this._dqHasExpansions = false;
          this._dqParts = null;
          return;
        }
        if (c === CH_DOLLAR || c === CH_BACKTICK || c === CH_BACKSLASH)
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
        const c = src.charCodeAt(this.pos);
        if (c === CH_DQUOTE || c === CH_BACKSLASH || c === CH_DOLLAR || c === CH_BACKTICK)
          break;
        this.pos++;
      }
      if (this.pos > runStart) {
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
          if (next === CH_DOLLAR || next === CH_BACKTICK || next === CH_DQUOTE || next === CH_BACKSLASH) {
            const c = src[this.pos];
            text += c;
            if (bp)
              litBuf += c;
          } else {
            const pair = "\\" + src[this.pos];
            text += pair;
            if (bp)
              litBuf += pair;
          }
          this.pos++;
        }
        continue;
      }
      if (ch === CH_DOLLAR) {
        if (this.pos + 1 < len && src.charCodeAt(this.pos + 1) === CH_DQUOTE) {
          text += "$";
          if (bp)
            litBuf += "$";
          this.pos++;
          continue;
        }
        const expStart = this.pos;
        this.readDollar();
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
    const len = src.length;
    if (this.pos >= len) {
      this._resultText = "$";
      this._resultHasExpansion = false;
      this._resultPart = void 0;
      return;
    }
    const ch = src.charCodeAt(this.pos);
    if (ch === CH_LPAREN) {
      if (this.pos + 1 < len && src.charCodeAt(this.pos + 1) === CH_LPAREN) {
        this.readArithmeticExpansion();
        return;
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
      const value = this.readAnsiCQuoted();
      this._resultText = value;
      this._resultHasExpansion = false;
      this._resultPart = this._buildParts ? { type: "AnsiCQuoted", text: src.slice(dollarPos, this.pos), value } : void 0;
      return;
    }
    if (ch === CH_DQUOTE) {
      this.pos++;
      this.readDoubleQuoted();
      this._resultText = this._dqText;
      this._resultHasExpansion = this._dqHasExpansions;
      if (this._buildParts) {
        const text = src.slice(dollarPos, this.pos);
        this._resultPart = {
          type: "LocaleString",
          text,
          parts: this._dqParts ?? [
            { type: "Literal", value: this._dqText, text: src.slice(dollarPos + 2, this.pos - 1) }
          ]
        };
      } else {
        this._resultPart = void 0;
      }
      return;
    }
    if (ch === CH_AT || ch === CH_STAR || ch === CH_HASH || ch === CH_QUESTION || ch === CH_DASH || ch === CH_DOLLAR || ch === CH_BANG) {
      this.pos++;
      const text = src.slice(this.pos - 2, this.pos);
      this._resultText = text;
      this._resultHasExpansion = false;
      this._resultPart = this._buildParts ? { type: "SimpleExpansion", text } : void 0;
      return;
    }
    if (ch >= CH_0 && ch <= CH_9) {
      this.pos++;
      const text = src.slice(this.pos - 2, this.pos);
      this._resultText = text;
      this._resultHasExpansion = false;
      this._resultPart = this._buildParts ? { type: "SimpleExpansion", text } : void 0;
      return;
    }
    if (ch < 128 && isIdChar[ch] & 1) {
      const dollarPos2 = this.pos - 1;
      while (this.pos < len) {
        const c = src.charCodeAt(this.pos);
        if (c < 128 && isIdChar[c] & 2)
          this.pos++;
        else
          break;
      }
      const text = src.slice(dollarPos2, this.pos);
      this._resultText = text;
      this._resultHasExpansion = false;
      this._resultPart = this._buildParts ? { type: "SimpleExpansion", text } : void 0;
      return;
    }
    this._resultText = "$";
    this._resultHasExpansion = false;
    this._resultPart = void 0;
  }
  scanArithmeticBody() {
    this.pos += 2;
    let depth = 1;
    const src = this.src;
    const len = src.length;
    const start = this.pos;
    while (this.pos < len && depth > 0) {
      const c = src.charCodeAt(this.pos);
      if (c === CH_LPAREN && this.pos + 1 < len && src.charCodeAt(this.pos + 1) === CH_LPAREN) {
        depth++;
        this.pos += 2;
      } else if (c === CH_RPAREN && this.pos + 1 < len && src.charCodeAt(this.pos + 1) === CH_RPAREN) {
        if (--depth === 0) {
          this.pos += 2;
          break;
        }
        this.pos += 2;
      } else {
        this.pos++;
      }
    }
    return src.slice(start, this.pos - 2);
  }
  readArithmeticExpansion() {
    const body = this.scanArithmeticBody();
    const text = "$((" + body + "))";
    this._resultText = text;
    this._resultHasExpansion = false;
    if (this._buildParts) {
      const expr = parseArithmeticExpression(body) ?? void 0;
      const drained = drainArithCmdExps();
      if (drained)
        for (const node of drained)
          this.collectedExpansions.push(node);
      this._resultPart = { type: "ArithmeticExpansion", text, expression: expr };
    } else {
      this._resultPart = void 0;
    }
  }
  readArithmeticCommand(out, tokenStart) {
    const body = this.scanArithmeticBody();
    setToken(out, Token.ArithCmd, body, tokenStart, this.pos);
  }
  readCommandSubstitution() {
    const dollarPos = this.pos - 1;
    this.pos++;
    this.extractBalanced();
    const text = this.src.slice(dollarPos, this.pos);
    this._resultText = text;
    this._resultHasExpansion = true;
    if (this._buildParts) {
      const inner = text.slice(2, -1);
      this._resultPart = { type: "CommandExpansion", text, script: void 0, inner };
      this.collectedExpansions.push(this._resultPart);
    } else {
      this._resultPart = void 0;
    }
  }
  readBraceCommandSubstitution() {
    this.readBraceSubstitution("${ ", 1);
  }
  readValueSubstitution() {
    this.readBraceSubstitution("${| ", 2);
  }
  readBraceSubstitution(prefix, skip) {
    this.pos += skip;
    const src = this.src;
    const len = src.length;
    let depth = 1;
    const start = this.pos;
    while (this.pos < len) {
      const c = src.charCodeAt(this.pos);
      if (c === CH_LBRACE)
        depth++;
      else if (c === CH_RBRACE) {
        if (--depth === 0) {
          this.pos++;
          break;
        }
      } else if (c === CH_SQUOTE) {
        this.pos++;
        this.skipSQ();
        continue;
      } else if (c === CH_DQUOTE) {
        this.pos++;
        this.skipDQ();
        continue;
      } else if (c === CH_BACKSLASH)
        this.pos++;
      this.pos++;
    }
    const inner = src.slice(start, this.pos - 1).trim();
    const text = prefix + inner + " }";
    this._resultText = text;
    this._resultHasExpansion = true;
    if (this._buildParts) {
      this._resultPart = { type: "CommandExpansion", text, script: void 0, inner };
      this.collectedExpansions.push(this._resultPart);
    } else {
      this._resultPart = void 0;
    }
  }
  readBacktickExpansion() {
    this.pos++;
    const src = this.src;
    const len = src.length;
    let inner = "";
    const start = this.pos;
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
            const c = src.charCodeAt(this.pos);
            if (c === CH_DOLLAR || c === CH_BACKTICK || c === CH_BACKSLASH) {
              inner += src[this.pos];
            } else {
              inner += "\\" + src[this.pos];
            }
            this.pos++;
          }
        } else {
          const runStart = this.pos;
          while (this.pos < len) {
            const c = src.charCodeAt(this.pos);
            if (c === CH_BACKTICK || c === CH_BACKSLASH)
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
      this._resultPart = { type: "CommandExpansion", text, script: void 0, inner };
      this.collectedExpansions.push(this._resultPart);
    } else {
      this._resultPart = void 0;
    }
  }
  readParameterExpansion() {
    const src = this.src;
    const len = src.length;
    const start = this.pos;
    this.pos++;
    let depth = 1;
    while (this.pos < len && depth > 0) {
      const ch = src.charCodeAt(this.pos);
      if (ch === CH_LBRACE && this.pos > 0 && src.charCodeAt(this.pos - 1) === CH_DOLLAR)
        depth++;
      else if (ch === CH_RBRACE) {
        if (--depth === 0) {
          this.pos++;
          break;
        }
      } else if (ch === CH_BACKSLASH) {
        this.pos++;
      } else if (ch === CH_SQUOTE) {
        this.pos++;
        this.skipSQ();
        continue;
      } else if (ch === CH_DQUOTE) {
        this.pos++;
        this.skipDQ();
        continue;
      }
      this.pos++;
    }
    const text = src.slice(start - 1, this.pos);
    this._resultText = text;
    this._resultHasExpansion = false;
    if (this._buildParts) {
      const inner = src.slice(start + 1, this.pos - 1);
      this._resultPart = this.parseParamInner(text, inner);
    } else {
      this._resultPart = void 0;
    }
  }
  parseParamInner(text, inner) {
    const result = {
      type: "ParameterExpansion",
      text,
      parameter: "",
      index: void 0,
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
            const closeB = this.findCloseBracket(inner, endI + 1);
            if (closeB !== -1)
              endI = closeB + 1;
          }
          if (endI >= ilen) {
            result.length = true;
            result.parameter = inner.slice(1, tryI);
            if (tryI < ilen && inner.charCodeAt(tryI) === CH_LBRACKET) {
              const closeB = this.findCloseBracket(inner, tryI + 1);
              if (closeB !== -1)
                result.index = inner.slice(tryI + 1, closeB);
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
      const closeB = this.findCloseBracket(inner, i + 1);
      if (closeB !== -1) {
        result.index = inner.slice(i + 1, closeB);
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
          result.operand = this.parseSubFieldWord(inner.slice(i + 2));
          return result;
        }
      }
      i++;
      const sliceRest = inner.slice(i);
      const colonIdx = findUnnested(sliceRest, CH_COLON);
      if (colonIdx === -1) {
        result.slice = { offset: this.parseSubFieldWord(sliceRest), length: void 0 };
      } else {
        result.slice = {
          offset: this.parseSubFieldWord(sliceRest.slice(0, colonIdx)),
          length: this.parseSubFieldWord(sliceRest.slice(colonIdx + 1))
        };
      }
      return result;
    }
    if (opChar === CH_DASH || opChar === CH_EQ || opChar === CH_PLUS || opChar === CH_QUESTION) {
      result.operator = inner[i];
      result.operand = this.parseSubFieldWord(inner.slice(i + 1));
      return result;
    }
    if (opChar === CH_HASH) {
      if (i + 1 < ilen && inner.charCodeAt(i + 1) === CH_HASH) {
        result.operator = "##";
        result.operand = this.parseSubFieldWord(inner.slice(i + 2));
      } else {
        result.operator = "#";
        result.operand = this.parseSubFieldWord(inner.slice(i + 1));
      }
      return result;
    }
    if (opChar === CH_PERCENT) {
      if (i + 1 < ilen && inner.charCodeAt(i + 1) === CH_PERCENT) {
        result.operator = "%%";
        result.operand = this.parseSubFieldWord(inner.slice(i + 2));
      } else {
        result.operator = "%";
        result.operand = this.parseSubFieldWord(inner.slice(i + 1));
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
          pattern: this.parseSubFieldWord(rest),
          replacement: new WordImpl("", 0, 0)
        };
      } else {
        result.replace = {
          pattern: this.parseSubFieldWord(rest.slice(0, sepIdx)),
          replacement: this.parseSubFieldWord(rest.slice(sepIdx + 1))
        };
      }
      return result;
    }
    if (opChar === CH_CARET) {
      if (i + 1 < ilen && inner.charCodeAt(i + 1) === CH_CARET) {
        result.operator = "^^";
        const rest = inner.slice(i + 2);
        if (rest)
          result.operand = this.parseSubFieldWord(rest);
      } else {
        result.operator = "^";
        const rest = inner.slice(i + 1);
        if (rest)
          result.operand = this.parseSubFieldWord(rest);
      }
      return result;
    }
    if (opChar === CH_COMMA) {
      if (i + 1 < ilen && inner.charCodeAt(i + 1) === CH_COMMA) {
        result.operator = ",,";
        const rest = inner.slice(i + 2);
        if (rest)
          result.operand = this.parseSubFieldWord(rest);
      } else {
        result.operator = ",";
        const rest = inner.slice(i + 1);
        if (rest)
          result.operand = this.parseSubFieldWord(rest);
      }
      return result;
    }
    if (opChar === CH_AT) {
      result.operator = "@";
      result.operand = this.parseSubFieldWord(inner.slice(i + 1));
      return result;
    }
    result.operator = inner.slice(i);
    return result;
  }
  scanParamName(s, start) {
    let i = start;
    if (i >= s.length)
      return i;
    const c = s.charCodeAt(i);
    if (c === CH_AT || c === CH_STAR || c === CH_HASH || c === CH_QUESTION || c === CH_DASH || c === CH_DOLLAR || c === CH_BANG) {
      return i + 1;
    }
    if (c >= CH_0 && c <= CH_9) {
      while (i < s.length && s.charCodeAt(i) >= CH_0 && s.charCodeAt(i) <= CH_9)
        i++;
      return i;
    }
    if (c >= CH_a && c <= CH_z || c >= CH_A && c <= CH_Z || c === CH_UNDERSCORE) {
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
  findCloseBracket(s, start) {
    let depth = 1;
    for (let i = start; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c === CH_LBRACKET)
        depth++;
      else if (c === CH_RBRACKET) {
        if (--depth === 0)
          return i;
      }
    }
    return -1;
  }
  readAnsiCQuoted() {
    const src = this.src;
    const len = src.length;
    let text = "";
    while (this.pos < len && src.charCodeAt(this.pos) !== CH_SQUOTE) {
      if (src.charCodeAt(this.pos) === CH_BACKSLASH && this.pos + 1 < len) {
        this.pos++;
        const ch = src[this.pos];
        switch (ch) {
          case "n":
            text += "\n";
            break;
          case "t":
            text += "	";
            break;
          case "r":
            text += "\r";
            break;
          case "\\":
            text += "\\";
            break;
          case "'":
            text += "'";
            break;
          case '"':
            text += '"';
            break;
          case "a":
            text += "\x07";
            break;
          case "b":
            text += "\b";
            break;
          case "e":
          case "E":
            text += "\x1B";
            break;
          case "f":
            text += "\f";
            break;
          case "v":
            text += "\v";
            break;
          default:
            text += "\\" + ch;
            break;
        }
        this.pos++;
      } else {
        const runStart = this.pos;
        while (this.pos < len) {
          const c = src.charCodeAt(this.pos);
          if (c === CH_SQUOTE || c === CH_BACKSLASH)
            break;
          this.pos++;
        }
        text += src.slice(runStart, this.pos);
      }
    }
    if (this.pos < len)
      this.pos++;
    return text;
  }
  // Extract balanced parens for $(...) — respects nested quotes and case..esac
  extractBalanced() {
    const src = this.src;
    const len = src.length;
    let depth = 1;
    const start = this.pos;
    while (this.pos < len && depth > 0) {
      const c = src.charCodeAt(this.pos);
      if (c === CH_RPAREN) {
        depth--;
        if (depth === 0) {
          const result = src.slice(start, this.pos);
          this.pos++;
          return result;
        }
        this.pos++;
      } else if (c === CH_LPAREN || c === CH_BACKSLASH || c === CH_SQUOTE || c === CH_DQUOTE || c === CH_BACKTICK) {
        break;
      } else if (c === 99 && // Ensure word start boundary (not inside e.g. "lowercase")
      (this.pos === start || src.charCodeAt(this.pos - 1) < 128 && charType[src.charCodeAt(this.pos - 1)] !== 0) && this.pos + 3 < len && src.charCodeAt(this.pos + 1) === 97 && src.charCodeAt(this.pos + 2) === 115 && src.charCodeAt(this.pos + 3) === 101 && (this.pos + 4 >= len || src.charCodeAt(this.pos + 4) < 128 && charType[src.charCodeAt(this.pos + 4)] & 1)) {
        break;
      } else {
        this.pos++;
      }
    }
    if (depth === 0)
      return src.slice(start, this.pos);
    let caseDepth = 0;
    while (this.pos < len && depth > 0) {
      const ch = src.charCodeAt(this.pos);
      if (ch === CH_LPAREN) {
        depth++;
        this.pos++;
      } else if (ch === CH_RPAREN) {
        if (caseDepth > 0) {
          this.pos++;
        } else {
          depth--;
          if (depth === 0) {
            const result = src.slice(start, this.pos);
            this.pos++;
            return result;
          }
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
          if (wLen === 4) {
            const c0 = src.charCodeAt(wStart);
            if (c0 === 99 && src.charCodeAt(wStart + 1) === 97 && src.charCodeAt(wStart + 2) === 115 && src.charCodeAt(wStart + 3) === 101) {
              caseDepth++;
            } else if (c0 === 101 && src.charCodeAt(wStart + 1) === 115 && src.charCodeAt(wStart + 2) === 97 && src.charCodeAt(wStart + 3) === 99 && caseDepth > 0) {
              caseDepth--;
            }
          }
        } else {
          this.pos++;
        }
      }
    }
    return src.slice(start, this.pos);
  }
};

// node_modules/.pnpm/unbash@3.0.0/node_modules/unbash/dist/parts.js
function computeWordParts(source, word) {
  const lexer = new Lexer(source);
  const parts = lexer.buildWordParts(word.pos);
  if (!parts)
    return void 0;
  resolveCollected(lexer);
  return parts;
}
function computeHereDocBodyParts(source, word) {
  const lexer = new Lexer(source);
  const parts = lexer.buildHereDocParts(word.pos, word.end);
  if (!parts)
    return void 0;
  resolveCollected(lexer);
  return parts;
}
function resolveCollected(lexer) {
  for (const e of lexer.getCollectedExpansions()) {
    if (e.inner !== void 0) {
      e.script = parse(e.inner);
      e.inner = void 0;
    }
  }
}

// node_modules/.pnpm/unbash@3.0.0/node_modules/unbash/dist/parser.js
WordImpl._resolveWord = computeWordParts;
WordImpl._resolveHeredocBody = computeHereDocBodyParts;
var ArithmeticCommandImpl = class {
  type = "ArithmeticCommand";
  pos;
  end;
  body;
  #expression = null;
  constructor(pos, end, body) {
    this.pos = pos;
    this.end = end;
    this.body = body;
  }
  get expression() {
    if (this.#expression === null) {
      this.#expression = parseArithmeticExpression(this.body, this.pos + 2) ?? void 0;
      resolveDrainedArithCmdExps();
    }
    return this.#expression;
  }
  set expression(v) {
    this.#expression = v ?? void 0;
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
  #initialize = null;
  #test = null;
  #update = null;
  constructor(pos, end, body, initStr, testStr, updateStr, initPos, testPos, updatePos) {
    this.pos = pos;
    this.end = end;
    this.body = body;
    this.#initStr = initStr;
    this.#testStr = testStr;
    this.#updateStr = updateStr;
    this.#initPos = initPos;
    this.#testPos = testPos;
    this.#updatePos = updatePos;
  }
  get initialize() {
    if (this.#initialize === null) {
      if (this.#initStr) {
        const expr = parseArithmeticExpression(this.#initStr);
        if (expr)
          offsetArith(expr, this.#initPos);
        resolveDrainedArithCmdExps();
        this.#initialize = expr ?? void 0;
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
        const expr = parseArithmeticExpression(this.#testStr);
        if (expr)
          offsetArith(expr, this.#testPos);
        resolveDrainedArithCmdExps();
        this.#test = expr ?? void 0;
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
        const expr = parseArithmeticExpression(this.#updateStr);
        if (expr)
          offsetArith(expr, this.#updatePos);
        resolveDrainedArithCmdExps();
        this.#update = expr ?? void 0;
      } else {
        this.#update = void 0;
      }
    }
    return this.#update;
  }
  set update(v) {
    this.#update = v ?? void 0;
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
function offsetArith(node, base) {
  node.pos += base;
  node.end += base;
  switch (node.type) {
    case "ArithmeticBinary":
      offsetArith(node.left, base);
      offsetArith(node.right, base);
      break;
    case "ArithmeticUnary":
      offsetArith(node.operand, base);
      break;
    case "ArithmeticTernary":
      offsetArith(node.test, base);
      offsetArith(node.consequent, base);
      offsetArith(node.alternate, base);
      break;
    case "ArithmeticGroup":
      offsetArith(node.expression, base);
      break;
  }
}
function resolveDrainedArithCmdExps() {
  const list = drainArithCmdExps();
  if (!list)
    return;
  for (const node of list) {
    if (node.inner !== void 0) {
      node.script = parse(node.inner);
      node.inner = void 0;
    }
  }
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
var EMPTY_PREFIX = [];
var EMPTY_SUFFIX = [];
var EMPTY_REDIRECTS = [];
function parse(source) {
  const parser = new Parser(source);
  return parser.parse(source.length);
}
var Parser = class {
  tok;
  source;
  errors = [];
  _redirects = [];
  constructor(source) {
    this.tok = new Lexer(source);
    this.source = source;
  }
  parse(sourceLen) {
    let shebang;
    if (this.source.charCodeAt(0) === 35 && this.source.charCodeAt(1) === 33) {
      const nl = this.source.indexOf("\n");
      shebang = nl === -1 ? this.source : this.source.slice(0, nl);
    }
    const commands = this.list();
    const lexerErrors = this.tok._errors;
    if (lexerErrors !== null) {
      for (let i = 0; i < lexerErrors.length; i++)
        this.errors.push(lexerErrors[i]);
    }
    const result = {
      type: "Script",
      pos: 0,
      end: sourceLen,
      shebang,
      commands,
      errors: this.errors.length > 0 ? this.errors : void 0
    };
    return result;
  }
  error(message, pos) {
    this.errors.push({ message, pos });
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
      redirects
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
      this._redirects = [];
      commands.push(this.makeStatement(first, redirects));
    }
    for (; ; ) {
      t = this.tok.peek(LexContext.Normal).token;
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
        this._redirects = [];
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
      this._redirects = [];
    }
    const commands = [wrappedFirst];
    const operators = [];
    do {
      operators.push(this.tok.next(LexContext.Normal).token === Token.And ? "&&" : "||");
      this.skipNewlines(LexContext.CommandStart);
      const next = this.pipeline();
      if (!next)
        break;
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
    this._redirects = [];
    if (redirects.length === 0)
      return node;
    return this.makeStatement(node, redirects);
  }
  // pipeline := ['time' ['-p']] ['!'] command ('|' newlines command)*
  pipeline() {
    let time = false;
    let pipelinePos = 0;
    if (this.tok.peek(LexContext.CommandStart).token === Token.Word && this.tok.peek(LexContext.CommandStart).value === "time") {
      time = true;
      pipelinePos = this.tok.next(LexContext.CommandStart).pos;
      if (this.tok.peek(LexContext.CommandStart).token === Token.Word && this.tok.peek(LexContext.CommandStart).value === "-p")
        this.tok.next(LexContext.CommandStart);
    }
    const negated = this.tok.peek(LexContext.CommandStart).token === Token.Bang;
    if (negated) {
      if (!time)
        pipelinePos = this.tok.peek(LexContext.CommandStart).pos;
      this.tok.next(LexContext.CommandStart);
    }
    const first = this.command();
    if (!first) {
      if (time || negated) {
        const pipeline2 = {
          type: "Pipeline",
          pos: pipelinePos,
          end: pipelinePos,
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
    this._redirects = [];
    while (this.tok.peek(LexContext.Normal).token === Token.Pipe) {
      if (commands.length === 1 && firstRedirects.length > 0) {
        commands[0] = this.makeStatement(first, firstRedirects);
        firstRedirects = [];
      }
      const pipeVal = this.tok.next(LexContext.Normal).value;
      operators.push(pipeVal === "|&" ? "|&" : "|");
      this.skipNewlines(LexContext.CommandStart);
      const cmd = this.command();
      if (cmd)
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
    let redirects = [];
    while (this.tok.peek(LexContext.Normal).token === Token.Redirect) {
      redirects = this.collectRedirect(redirects, LexContext.Normal);
    }
    return redirects;
  }
  // arith_command := (( expr ))
  arithCommand() {
    const tok = this.tok.next(LexContext.CommandStart);
    this._redirects = this.collectTrailingRedirects();
    return new ArithmeticCommandImpl(tok.pos, tok.end, tok.value);
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
        prefix: EMPTY_PREFIX,
        suffix: EMPTY_SUFFIX,
        redirects: EMPTY_REDIRECTS
      };
      const bodyRedirects2 = this._redirects;
      this._redirects = [];
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
        prefix: EMPTY_PREFIX,
        suffix: EMPTY_SUFFIX,
        redirects: EMPTY_REDIRECTS
      };
      const redirects2 = this.collectTrailingRedirects();
      const end2 = redirects2.length > 0 ? redirects2[redirects2.length - 1].end : cmd.end;
      return { type: "Coproc", pos, end: end2, name: void 0, body: cmd, redirects: redirects2 };
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
      return { type: "Coproc", pos, end: end2, name: void 0, body: cmd, redirects: redirects2 };
    }
    const bodyRedirects = this._redirects;
    this._redirects = [];
    const redirects = this.collectTrailingRedirects();
    const allRedirects = [...bodyRedirects, ...redirects];
    const end = allRedirects.length > 0 ? allRedirects[allRedirects.length - 1].end : body.end;
    return { type: "Coproc", pos, end, name: tentativeWord, body, redirects: allRedirects };
  }
  // subshell := '(' list ')'
  subshell() {
    const pos = this.tok.next(LexContext.CommandStart).pos;
    const commands = this.list();
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
    const commands = this.list();
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
    const clause = this.makeCompoundList(this.list());
    this.skipSemi();
    if (!this.accept(Token.Then, LexContext.CommandStart))
      this.error("expected 'then'", this.tok.getPos());
    const then_ = this.makeCompoundList(this.list());
    this.skipSemi();
    let else_;
    let end;
    if (this.tok.peek(LexContext.CommandStart).token === Token.Elif) {
      else_ = this.ifClause();
      end = else_.end;
    } else if (this.accept(Token.Else, LexContext.CommandStart)) {
      else_ = this.makeCompoundList(this.list());
      this.skipSemi();
      const closeEnd = this.acceptEnd(Token.Fi, LexContext.CommandStart);
      if (closeEnd < 0)
        this.error("expected 'fi' to close 'if'", this.tok.getPos());
      end = closeEnd >= 0 ? closeEnd : pos;
    } else {
      const closeEnd = this.acceptEnd(Token.Fi, LexContext.CommandStart);
      if (closeEnd < 0)
        this.error("expected 'fi' to close 'if'", this.tok.getPos());
      end = closeEnd >= 0 ? closeEnd : pos;
    }
    this._redirects = this.collectTrailingRedirects();
    return { type: "If", pos, end, clause, then: then_, else: else_ };
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
    if (!this.accept(Token.Do, LexContext.CommandStart))
      this.error("expected 'do'", this.tok.getPos());
    const body = this.list();
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
      return new ArithmeticForImpl(pos, bg.end, bg.body, initStr, testStr, updateStr, initPos, testPos, updatePos);
    }
    if (!this.accept(Token.Do, LexContext.CommandStart))
      this.error("expected 'do'", this.tok.getPos());
    const body = this.list();
    const closeEnd = this.acceptEnd(Token.Done, LexContext.CommandStart);
    if (closeEnd < 0)
      this.error("expected 'done' to close 'for'", this.tok.getPos());
    const end = closeEnd >= 0 ? closeEnd : pos;
    this._redirects = this.collectTrailingRedirects();
    return new ArithmeticForImpl(pos, end, this.makeCompoundList(body), initStr, testStr, updateStr, initPos, testPos, updatePos);
  }
  whileClause() {
    return this.whileOrUntil("while");
  }
  untilClause() {
    return this.whileOrUntil("until");
  }
  whileOrUntil(kind) {
    const pos = this.tok.next(LexContext.CommandStart).pos;
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
    if (!this.accept(Token.Do, LexContext.CommandStart))
      this.error("expected 'do'", this.tok.getPos());
    const body = this.list();
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
    if (closeEnd < 0 && this.tok.peek(LexContext.Normal).token === Token.EOF)
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
    if (this.tok.peek(LexContext.TestMode).token === Token.Word && this.tok.peek(LexContext.TestMode).value === "!") {
      const notPos = this.tok.next(LexContext.TestMode).pos;
      const operand = this.parseTestNot();
      return { type: "TestNot", pos: notPos, end: operand.end, operand };
    }
    return this.parseTestPrimary();
  }
  // test_primary := '(' test_or ')' | unary_op word | word binary_op word | word
  parseTestPrimary() {
    if (this.tok.peek(LexContext.TestMode).token === Token.LParen) {
      const openPos = this.tok.next(LexContext.TestMode).pos;
      const expr = this.parseTestOr();
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
    if (UNARY_TEST_OPS[val] === 1) {
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
    if (nt.token === Token.Word && BINARY_TEST_OPS[nt.value] === 1) {
      const op = this.tok.next(LexContext.TestMode).value;
      let right;
      if (op === "=~") {
        right = this.toWord(this.tok.readTestRegexWord());
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
    if (this.tok.peek(LexContext.CommandStart).token === Token.LParen) {
      this.tok.next(LexContext.CommandStart);
      if (!this.accept(Token.RParen, LexContext.CommandStart))
        this.error("expected ')' after '('", this.tok.getPos());
    }
    this.skipNewlines(LexContext.CommandStart);
    const body = this.commandAsBody();
    const redirects = this._redirects;
    this._redirects = [];
    const end = redirects.length > 0 ? redirects[redirects.length - 1].end : body.end;
    return { type: "Function", pos, end, name: name2, body, redirects };
  }
  // simple_command or function_def (word '(' ')' body)
  simpleCommandOrFunction() {
    const prefix = [];
    let redirects = [];
    let cmdPos = this.tok.peek(LexContext.CommandStart).pos;
    let lastEnd = cmdPos;
    while (this.tok.peek(LexContext.CommandStart).token === Token.Assignment) {
      const t = this.tok.next(LexContext.CommandStart);
      lastEnd = t.end;
      prefix.push(this.parseAssignment(t));
    }
    while (this.tok.peek(LexContext.CommandStart).token === Token.Redirect) {
      redirects = this.collectRedirect(redirects, LexContext.CommandStart);
      lastEnd = redirects[redirects.length - 1].end;
    }
    if (this.tok.peek(LexContext.Normal).token !== Token.Word) {
      if (prefix.length > 0) {
        return {
          type: "Command",
          pos: cmdPos,
          end: lastEnd,
          name: void 0,
          prefix,
          suffix: EMPTY_SUFFIX,
          redirects
        };
      }
      return {
        type: "Command",
        pos: cmdPos,
        end: lastEnd,
        name: void 0,
        prefix: EMPTY_PREFIX,
        suffix: EMPTY_SUFFIX,
        redirects: EMPTY_REDIRECTS
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
        this._redirects = [];
        const end = bodyRedirects.length > 0 ? bodyRedirects[bodyRedirects.length - 1].end : body.end;
        return { type: "Function", pos: name2.pos, end, name: name2, body, redirects: bodyRedirects };
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
    return { type: "Command", pos: cmdPos, end: lastEnd, name: name2, prefix, suffix, redirects };
  }
  collectRedirect(redirects, ctx) {
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
    if (t.content != null) {
      r.target = new WordImpl(t.content, t.targetPos, t.targetEnd, this.source);
    }
    if (t.value === "<<" || t.value === "<<-")
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
    return new WordImpl(this.source.slice(tok.pos, tok.end), tok.pos, tok.end, this.source);
  }
  toWordFromPosEnd(tok, pos, end) {
    return new WordImpl(this.source.slice(pos, end), pos, end, this.source);
  }
  parseAssignment(tok) {
    const text = this.source.slice(tok.pos, tok.end);
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
      array: void 0
    };
    const eqIdx = text.indexOf("=");
    if (eqIdx <= 0)
      return result;
    let nameEnd = eqIdx;
    let append = false;
    let index;
    if (text.charCodeAt(eqIdx - 1) === 43) {
      append = true;
      nameEnd = eqIdx - 1;
    }
    const bracketIdx = text.indexOf("[");
    if (bracketIdx > 0 && bracketIdx < nameEnd) {
      const rbracketIdx = text.indexOf("]", bracketIdx);
      if (rbracketIdx > bracketIdx && rbracketIdx + 1 === nameEnd) {
        index = text.slice(bracketIdx + 1, rbracketIdx);
        nameEnd = bracketIdx;
      }
    }
    const name2 = text.slice(0, nameEnd);
    result.name = name2;
    if (append)
      result.append = true;
    if (index !== void 0)
      result.index = index;
    const valStart = eqIdx + 1;
    const valText = text.slice(valStart);
    if (valText.charCodeAt(0) === 40 && valText.charCodeAt(valText.length - 1) === 41) {
      const inner = valText.slice(1, -1);
      const arrayOffset = tokPos + valStart + 1;
      const elements = this.parseArrayElements(inner, arrayOffset);
      result.array = elements;
    } else {
      result.value = new WordImpl(valText, tokPos + valStart, tokEnd, this.source);
    }
    return result;
  }
  parseArrayElements(inner, offset = 0) {
    const subTok = new Lexer(inner);
    const elements = [];
    while (subTok.peek(LexContext.Normal).token !== Token.EOF) {
      if (subTok.peek(LexContext.Normal).token === Token.Newline) {
        subTok.next(LexContext.Normal);
        continue;
      }
      const t = subTok.next(LexContext.Normal);
      if (t.token === Token.Word || t.token === Token.Assignment) {
        const pos = t.pos + offset;
        const end = t.end + offset;
        elements.push(new WordImpl(this.source.slice(pos, end), pos, end, this.source));
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

// node_modules/.pnpm/@cad0p+unbash-walker@0.1.0/node_modules/@cad0p/unbash-walker/dist/extract.js
function createExtractCtx() {
  return { nextGroupId: 0 };
}
function allocGroupId(ctx) {
  return ctx.nextGroupId++;
}
function findLastInGroup(commands, groupId, startIdx) {
  for (let i = commands.length - 1; i >= startIdx; i--) {
    if (commands[i]?.group === groupId) {
      return commands[i];
    }
  }
  return void 0;
}
function extractAllCommandsFromAST(node, source, ctx) {
  const ownCtx = ctx ?? createExtractCtx();
  const topGroup = allocGroupId(ownCtx);
  const commands = [];
  collectNode(node, source, commands, topGroup, ownCtx);
  return commands;
}
function collectNode(node, source, commands, groupId, ctx) {
  if (!node)
    return;
  const t = node.type;
  if (t === "Script" || t === "CompoundList" || t === "Pipeline" || t === "AndOr") {
    collectCompoundOrChain(node, source, commands, groupId, ctx);
    return;
  }
  if (t === "If" || t === "While" || t === "For" || t === "Select" || t === "Case") {
    collectControlFlow(node, source, commands, groupId, ctx);
    return;
  }
  collectRemaining(node, source, commands, groupId, ctx);
}
function collectCompoundOrChain(node, source, commands, groupId, ctx) {
  switch (node.type) {
    case "Script":
    case "CompoundList": {
      for (const [i, child] of node.commands.entries()) {
        const startIdx = commands.length;
        collectNode(child, source, commands, groupId, ctx);
        const joinerTarget = findLastInGroup(commands, groupId, startIdx);
        if (i < node.commands.length - 1 && joinerTarget) {
          joinerTarget.joiner = ";";
        }
      }
      return;
    }
    case "Pipeline":
    case "AndOr": {
      for (const [i, child] of node.commands.entries()) {
        const startIdx = commands.length;
        collectNode(child, source, commands, groupId, ctx);
        const joinerTarget = findLastInGroup(commands, groupId, startIdx);
        const op = node.operators[i];
        if (op !== void 0 && joinerTarget) {
          joinerTarget.joiner = op;
        }
      }
      return;
    }
  }
}
function collectControlFlow(node, source, commands, groupId, ctx) {
  switch (node.type) {
    case "If":
      collectNode(node.clause, source, commands, groupId, ctx);
      collectNode(node.then, source, commands, groupId, ctx);
      if (node.else)
        collectNode(node.else, source, commands, groupId, ctx);
      return;
    case "While":
      collectNode(node.clause, source, commands, groupId, ctx);
      collectNode(node.body, source, commands, groupId, ctx);
      return;
    case "For":
      collectWord(node.name, source, commands, groupId, ctx);
      for (const word of node.wordlist) {
        collectWord(word, source, commands, groupId, ctx);
      }
      collectNode(node.body, source, commands, groupId, ctx);
      return;
    case "Select":
      collectWord(node.name, source, commands, groupId, ctx);
      for (const word of node.wordlist) {
        collectWord(word, source, commands, groupId, ctx);
      }
      collectNode(node.body, source, commands, groupId, ctx);
      return;
    case "Case":
      collectWord(node.word, source, commands, groupId, ctx);
      for (const item of node.items) {
        collectCaseItem(item, source, commands, groupId, ctx);
      }
      return;
  }
}
function collectRemaining(node, source, commands, groupId, ctx) {
  switch (node.type) {
    case "Statement":
      collectNode(node.command, source, commands, groupId, ctx);
      for (const redirect of node.redirects) {
        collectRedirect(redirect, source, commands, groupId, ctx);
      }
      return;
    case "Command":
      collectCommand(node, source, commands, groupId, ctx);
      return;
    case "Subshell":
    case "BraceGroup":
      collectNode(node.body, source, commands, groupId, ctx);
      return;
    case "Function":
      collectWord(node.name, source, commands, groupId, ctx);
      collectNode(node.body, source, commands, groupId, ctx);
      for (const redirect of node.redirects) {
        collectRedirect(redirect, source, commands, groupId, ctx);
      }
      return;
    case "Coproc":
      if (node.name)
        collectWord(node.name, source, commands, groupId, ctx);
      collectNode(node.body, source, commands, groupId, ctx);
      for (const redirect of node.redirects) {
        collectRedirect(redirect, source, commands, groupId, ctx);
      }
      return;
    case "TestCommand":
      collectTestExpression(node.expression, source, commands, groupId, ctx);
      return;
    case "ArithmeticFor":
      collectArithmeticExpression(node.initialize, source, commands, groupId, ctx);
      collectArithmeticExpression(node.test, source, commands, groupId, ctx);
      collectArithmeticExpression(node.update, source, commands, groupId, ctx);
      collectNode(node.body, source, commands, groupId, ctx);
      return;
    case "ArithmeticCommand":
      collectArithmeticExpression(node.expression, source, commands, groupId, ctx);
      return;
  }
}
function collectCommand(node, source, commands, groupId, ctx) {
  if (node.name || node.prefix.length > 0) {
    commands.push({ node, source, group: groupId });
  }
  for (const prefix of node.prefix) {
    collectAssignment(prefix, source, commands, groupId, ctx);
  }
  for (const word of node.suffix) {
    collectWord(word, source, commands, groupId, ctx);
  }
  for (const redirect of node.redirects) {
    collectRedirect(redirect, source, commands, groupId, ctx);
  }
}
function collectAssignment(assignment, source, commands, groupId, ctx) {
  if (assignment.value) {
    collectWord(assignment.value, source, commands, groupId, ctx);
  }
  if (assignment.array) {
    for (const word of assignment.array) {
      collectWord(word, source, commands, groupId, ctx);
    }
  }
}
function collectRedirect(redirect, source, commands, groupId, ctx) {
  if (redirect.target) {
    collectWord(redirect.target, source, commands, groupId, ctx);
  }
  if (redirect.body?.parts) {
    collectWord(redirect.body, source, commands, groupId, ctx);
  }
}
function collectWord(word, source, commands, groupId, ctx) {
  if (!word?.parts)
    return;
  for (const part of word.parts) {
    collectWordPart(part, source, commands, groupId, ctx);
  }
}
function collectWordPart(part, source, commands, groupId, ctx) {
  switch (part.type) {
    case "DoubleQuoted":
    case "LocaleString":
      for (const child of part.parts) {
        collectWordPart(child, source, commands, groupId, ctx);
      }
      return;
    case "CommandExpansion":
    case "ProcessSubstitution": {
      const expansionGroup = allocGroupId(ctx);
      if (part.script) {
        collectNode(part.script, expansionSource(part, source), commands, expansionGroup, ctx);
      }
      return;
    }
    case "ParameterExpansion":
      collectParameterExpansion(part, source, commands, groupId, ctx);
      return;
    case "ArithmeticExpansion":
      collectArithmeticExpression(part.expression, source, commands, groupId, ctx);
      return;
    default:
      return;
  }
}
function collectParameterExpansion(part, source, commands, groupId, ctx) {
  if (part.operand) {
    collectWord(part.operand, source, commands, groupId, ctx);
  }
  if (part.slice) {
    collectWord(part.slice.offset, source, commands, groupId, ctx);
    if (part.slice.length) {
      collectWord(part.slice.length, source, commands, groupId, ctx);
    }
  }
  if (part.replace) {
    collectWord(part.replace.pattern, source, commands, groupId, ctx);
    collectWord(part.replace.replacement, source, commands, groupId, ctx);
  }
}
function expansionSource(part, fallbackSource) {
  if (part.inner != null)
    return part.inner;
  const text = part.text;
  if (text.startsWith("$(") && text.endsWith(")")) {
    return text.slice(2, -1);
  }
  if ((text.startsWith("<(") || text.startsWith(">(")) && text.endsWith(")")) {
    return text.slice(2, -1);
  }
  if (text.startsWith("`") && text.endsWith("`")) {
    return text.slice(1, -1);
  }
  return fallbackSource;
}
function collectCaseItem(item, source, commands, groupId, ctx) {
  for (const pattern of item.pattern) {
    collectWord(pattern, source, commands, groupId, ctx);
  }
  collectNode(item.body, source, commands, groupId, ctx);
}
function collectTestExpression(expr, source, commands, groupId, ctx) {
  switch (expr.type) {
    case "TestUnary":
      collectWord(expr.operand, source, commands, groupId, ctx);
      return;
    case "TestBinary":
      collectWord(expr.left, source, commands, groupId, ctx);
      collectWord(expr.right, source, commands, groupId, ctx);
      return;
    case "TestLogical":
      collectTestExpression(expr.left, source, commands, groupId, ctx);
      collectTestExpression(expr.right, source, commands, groupId, ctx);
      return;
    case "TestNot":
      collectTestExpression(expr.operand, source, commands, groupId, ctx);
      return;
    case "TestGroup":
      collectTestExpression(expr.expression, source, commands, groupId, ctx);
      return;
  }
}
function collectArithmeticExpression(expr, source, commands, groupId, ctx) {
  if (!expr)
    return;
  switch (expr.type) {
    case "ArithmeticBinary":
      collectArithmeticExpression(expr.left, source, commands, groupId, ctx);
      collectArithmeticExpression(expr.right, source, commands, groupId, ctx);
      return;
    case "ArithmeticUnary":
      collectArithmeticExpression(expr.operand, source, commands, groupId, ctx);
      return;
    case "ArithmeticTernary":
      collectArithmeticExpression(expr.test, source, commands, groupId, ctx);
      collectArithmeticExpression(expr.consequent, source, commands, groupId, ctx);
      collectArithmeticExpression(expr.alternate, source, commands, groupId, ctx);
      return;
    case "ArithmeticGroup":
      collectArithmeticExpression(expr.expression, source, commands, groupId, ctx);
      return;
    case "ArithmeticCommandExpansion": {
      const expansionGroup = allocGroupId(ctx);
      if (expr.script) {
        const innerSource = expr.text.startsWith("$(") && expr.text.endsWith(")") ? expr.text.slice(2, -1) : expr.text;
        collectNode(expr.script, innerSource, commands, expansionGroup, ctx);
      } else if (expr.inner) {
        const innerAst = parse(expr.inner);
        collectNode(innerAst, expr.inner, commands, expansionGroup, ctx);
      }
      return;
    }
    case "ArithmeticWord":
      return;
  }
}

// node_modules/.pnpm/@cad0p+unbash-walker@0.1.0/node_modules/@cad0p/unbash-walker/dist/resolve.js
import * as path from "node:path";
function getCommandName(cmd) {
  if (cmd.node.name)
    return cmd.node.name.value ?? cmd.node.name.text;
  if (cmd.node.prefix.length > 0 && cmd.node.prefix[0]?.name) {
    return cmd.node.prefix[0].name;
  }
  return "";
}
function getCommandArgs(cmd) {
  return cmd.node.suffix.map((word) => word.value ?? word.text);
}
function getBasename(cmd) {
  const name2 = getCommandName(cmd);
  if (name2 === "")
    return "";
  return path.basename(name2);
}

// node_modules/.pnpm/@cad0p+unbash-walker@0.1.0/node_modules/@cad0p/unbash-walker/dist/internal/identifier.js
function isIdentifierName(name2) {
  if (name2.length === 0)
    return false;
  const first = name2.charCodeAt(0);
  if (!isIdentStart(first))
    return false;
  for (let i = 1; i < name2.length; i++) {
    if (!isIdentCont(name2.charCodeAt(i)))
      return false;
  }
  return true;
}
function isIdentStart(c) {
  return c >= 65 && c <= 90 || c >= 97 && c <= 122 || c === 95;
}
function isIdentCont(c) {
  return isIdentStart(c) || c >= 48 && c <= 57;
}

// node_modules/.pnpm/@cad0p+unbash-walker@0.1.0/node_modules/@cad0p/unbash-walker/dist/resolve-word.js
function resolveWord(word, env) {
  if (!word.parts || word.parts.length === 0) {
    const bare = word.value ?? word.text;
    return expandTildeIfLeading(bare, env);
  }
  let out = "";
  for (let i = 0; i < word.parts.length; i++) {
    const part = word.parts[i];
    const resolved = resolvePart(part, env);
    if (resolved === void 0)
      return void 0;
    if (i === 0 && part.type === "Literal") {
      const expanded = expandTildeIfLeading(resolved, env);
      if (expanded === void 0)
        return void 0;
      out += expanded;
    } else {
      out += resolved;
    }
  }
  return out;
}
function expandTildeIfLeading(s, env) {
  if (s.length === 0)
    return s;
  if (s[0] !== "~")
    return s;
  if (s === "~") {
    const home = env.get("HOME");
    return home ?? void 0;
  }
  if (s.startsWith("~/")) {
    const home = env.get("HOME");
    if (home === void 0)
      return void 0;
    return home + s.slice(1);
  }
  return s;
}
function resolvePart(part, env) {
  switch (part.type) {
    case "Literal":
    case "SingleQuoted":
      return part.value;
    case "DoubleQuoted": {
      let out = "";
      for (const child of part.parts) {
        const resolved = resolvePart(child, env);
        if (resolved === void 0)
          return void 0;
        out += resolved;
      }
      return out;
    }
    case "SimpleExpansion": {
      const raw = part.text;
      if (!raw.startsWith("$"))
        return void 0;
      const name2 = raw.slice(1);
      if (!isIdentifierName(name2))
        return void 0;
      return env.get(name2);
    }
    case "ParameterExpansion": {
      if (part.operator !== void 0 || part.slice !== void 0 || part.replace !== void 0 || part.length === true || part.indirect === true || part.index !== void 0) {
        return void 0;
      }
      if (!isIdentifierName(part.parameter))
        return void 0;
      return env.get(part.parameter);
    }
    // Intractable categories — see file-header comment.
    case "CommandExpansion":
    case "ArithmeticExpansion":
    case "ProcessSubstitution":
    case "ExtendedGlob":
    case "BraceExpansion":
    case "AnsiCQuoted":
    case "LocaleString":
      return void 0;
    default:
      return void 0;
  }
}

// node_modules/.pnpm/@cad0p+unbash-walker@0.1.0/node_modules/@cad0p/unbash-walker/dist/tracker.js
function isStaticallyResolvable(w) {
  if (!w)
    return true;
  if (!w.parts || w.parts.length === 0)
    return true;
  return w.parts.every(isStaticPart);
}
function isStaticPart(p) {
  if (p.type === "Literal")
    return true;
  if (p.type === "SingleQuoted")
    return true;
  if (p.type === "DoubleQuoted") {
    return (p.parts ?? []).every((child) => isStaticPart(child));
  }
  return false;
}

// node_modules/.pnpm/@cad0p+unbash-walker@0.1.0/node_modules/@cad0p/unbash-walker/dist/trackers/cwd.js
import * as path2 from "node:path";

// node_modules/.pnpm/@cad0p+unbash-walker@0.1.0/node_modules/@cad0p/unbash-walker/dist/internal/seed-process-env.js
function seedProcessEnv() {
  const out = /* @__PURE__ */ new Map();
  const { HOME, USER, PWD } = process.env;
  if (HOME !== void 0)
    out.set("HOME", HOME);
  if (USER !== void 0)
    out.set("USER", USER);
  if (PWD !== void 0)
    out.set("PWD", PWD);
  return out;
}

// node_modules/.pnpm/@cad0p+unbash-walker@0.1.0/node_modules/@cad0p/unbash-walker/dist/trackers/env.js
function resolveAssignmentWord(word, env) {
  const resolved = resolveWord(word, env);
  if (resolved === void 0)
    return void 0;
  return parseAssignmentToken(resolved);
}
function parseAssignmentToken(raw) {
  const eq = raw.indexOf("=");
  if (eq <= 0)
    return void 0;
  const name2 = raw.slice(0, eq);
  if (!isIdentifierName(name2))
    return void 0;
  const value = raw.slice(eq + 1);
  return { name: name2, value };
}
function withSet(current, name2, value) {
  const next = new Map(current);
  next.set(name2, value);
  return next;
}
function withDelete(current, names) {
  let changed = false;
  for (const n of names) {
    if (current.has(n)) {
      changed = true;
      break;
    }
  }
  if (!changed)
    return current;
  const next = new Map(current);
  for (const n of names)
    next.delete(n);
  return next;
}
var bareAssignModifier = {
  scope: "sequential",
  apply: (args, current) => {
    let next = current;
    for (const w of args) {
      const resolved = resolveAssignmentWord(w, next);
      if (resolved === void 0)
        continue;
      next = withSet(next, resolved.name, resolved.value);
    }
    return next;
  }
};
var exportModifier = {
  scope: "sequential",
  apply: (args, current) => {
    let next = current;
    for (const w of args) {
      const raw = w.value ?? w.text;
      if (raw === void 0)
        continue;
      if (raw === "--")
        continue;
      if (raw.startsWith("-"))
        continue;
      const resolved = resolveAssignmentWord(w, next);
      if (resolved === void 0)
        continue;
      next = withSet(next, resolved.name, resolved.value);
    }
    return next;
  }
};
var unsetModifier = {
  scope: "sequential",
  apply: (args, current) => {
    for (const w of args) {
      const raw = w.value ?? w.text;
      if (raw === "-f")
        return current;
    }
    const names = [];
    for (const w of args) {
      const raw = w.value ?? w.text;
      if (raw === void 0)
        continue;
      if (raw === "--")
        continue;
      if (raw.startsWith("-"))
        continue;
      const resolved = resolveWord(w, current);
      if (resolved === void 0)
        continue;
      if (!isIdentifierName(resolved))
        continue;
      names.push(resolved);
    }
    if (names.length === 0)
      return current;
    return withDelete(current, names);
  }
};
function seedFromProcessEnv() {
  return seedProcessEnv();
}
var UNKNOWN_ENV = Object.freeze(/* @__PURE__ */ new Map());
var envTracker = {
  initial: seedFromProcessEnv(),
  unknown: UNKNOWN_ENV,
  modifiers: {
    // Bare-assignment commands have basename "". The walker
    // dispatches on `""` when node.name is absent and node.prefix
    // is non-empty (see handleCommand's bare-assignment branch).
    "": bareAssignModifier,
    export: exportModifier,
    unset: unsetModifier
  },
  subshellSemantics: "isolated"
};

// node_modules/.pnpm/@cad0p+unbash-walker@0.1.0/node_modules/@cad0p/unbash-walker/dist/wrappers.js
var WRAPPER_COMMANDS = {
  xargs: {
    type: "passthrough",
    // Only flags that consume a separate value argument.
    // Boolean flags (-o, -p, -r, -t, -x) are intentionally omitted.
    flagArgs: [
      "-a",
      "-d",
      "-E",
      "-e",
      "-I",
      "-i",
      "-L",
      "-l",
      "-n",
      "-P",
      "-s"
    ]
  },
  sudo: {
    type: "passthrough",
    // Only flags that consume a separate value argument.
    // Boolean flags (-A, -h, -K, -k, -n, -S, -V, -v) are intentionally omitted.
    flagArgs: ["-C", "-D", "-g", "-l", "-p", "-r", "-U", "-u"]
  },
  nice: { type: "passthrough", flagArgs: ["-n"] },
  nohup: { type: "passthrough" },
  env: {
    type: "passthrough",
    // -v is --debug (boolean); only flags that consume a value are listed.
    // Note: `-C DIR` is also modelled by cwdTracker's env modifier (in
    // trackers/cwd.ts) so the outer `env` ref's recorded cwd reflects the
    // -C target. Inner ref surfaced here still inherits sessionCwd today —
    // see the wrapper-interaction follow-up note in trackers/cwd.ts.
    flagArgs: ["-C", "-S", "-u"],
    skipVarAssignments: true
  },
  strace: {
    type: "passthrough",
    flagArgs: ["-o", "-O", "-p", "-S", "-e", "-E"]
  },
  bash: {
    type: "flag",
    flag: "-c",
    flagArgs: ["--init-file", "--rcfile", "-D"]
  },
  sh: { type: "flag", flag: "-c" },
  zsh: { type: "flag", flag: "-c" },
  find: {
    type: "exec",
    keywords: ["-exec", "-ok"],
    terminators: [";", "\\;", "+"]
  },
  fd: {
    type: "exec",
    keywords: ["-x", "--exec", "-X", "--exec-batch"],
    terminators: null
  }
};
function expandWrapperCommands(commands) {
  const expandedWrappers = /* @__PURE__ */ new Set();
  const maxGroupId = commands.reduce((max, cmd) => Math.max(max, cmd.group ?? 0), -1);
  const ctx = { nextGroupId: maxGroupId + 1 };
  const result = doExpand(commands, expandedWrappers, ctx);
  return { commands: result, expandedWrappers };
}
function doExpand(commands, expandedWrappers, ctx) {
  const result = [...commands];
  for (const cmd of commands) {
    const name2 = getCommandName(cmd);
    const spec = WRAPPER_COMMANDS[name2];
    if (!spec)
      continue;
    const subCommands = extractSubCommands(cmd, spec, ctx);
    if (subCommands.length > 0) {
      expandedWrappers.add(cmd);
      result.push(...doExpand(subCommands, expandedWrappers, ctx));
    }
  }
  return result;
}
function extractSubCommands(cmd, spec, ctx) {
  switch (spec.type) {
    case "passthrough":
      return extractPassthrough(cmd, spec.flagArgs, spec.skipVarAssignments ?? false, ctx);
    case "flag":
      return extractFlag(cmd, spec.flag, spec.flagArgs, ctx);
    case "exec":
      return extractExec(cmd, spec.keywords, spec.terminators, ctx);
  }
}
function scanPassthroughBoundary(args, flagArgs, skipVarAssignments = false) {
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === void 0)
      break;
    if (skipVarAssignments && isVarAssignment(arg)) {
      i++;
      continue;
    }
    if (!arg.startsWith("-"))
      break;
    const span = flagSpan(arg, i, args, flagArgs);
    if (span === 2 && skipVarAssignments && isVarAssignment(args[i + 1] ?? "")) {
      i++;
    } else {
      i += span;
    }
  }
  return i;
}
function extractPassthrough(cmd, flagArgs, skipVarAssignments = false, ctx) {
  const args = getCommandArgs(cmd);
  const i = scanPassthroughBoundary(args, flagArgs, skipVarAssignments);
  if (i >= args.length)
    return [];
  return parseSubCommandString(args.slice(i).join(" "), ctx);
}
function extractFlag(cmd, targetFlag, flagArgs, ctx) {
  const args = getCommandArgs(cmd);
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === targetFlag) {
      const scriptArg = args[i + 1];
      return scriptArg ? parseSubCommandString(scriptArg, ctx) : [];
    }
    if (arg?.startsWith("-")) {
      i += flagSpan(arg, i, args, flagArgs);
      continue;
    }
    i++;
  }
  return [];
}
function collectExecCommand(args, startIdx, terminators) {
  const parts = [];
  let i = startIdx;
  while (i < args.length) {
    const part = args[i];
    if (part === void 0)
      break;
    if (terminators?.includes(part))
      return { parts, nextIdx: i + 1 };
    parts.push(part);
    i++;
  }
  return { parts, nextIdx: i };
}
function extractExec(cmd, keywords, terminators, ctx) {
  const args = getCommandArgs(cmd);
  const results = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === void 0)
      break;
    if (keywords.includes(arg)) {
      const { parts, nextIdx } = collectExecCommand(args, i + 1, terminators);
      i = nextIdx;
      if (parts.length > 0) {
        results.push(...parseSubCommandString(parts.join(" "), ctx));
      }
      continue;
    }
    i++;
  }
  return results;
}
function parseSubCommandString(str, ctx) {
  try {
    const ast = parse(str);
    return extractAllCommandsFromAST(ast, str, ctx ?? createExtractCtx());
  } catch {
    return [];
  }
}
function takesValue(flag, flagArgs) {
  if (!flagArgs)
    return false;
  const stripped = flag.replace(/^-+/, "");
  return flagArgs.some((fa) => fa.replace(/^-+/, "") === stripped);
}
function isVarAssignment(arg) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(arg);
}
function flagSpan(arg, i, args, flagArgs) {
  if (arg.includes("="))
    return 1;
  if (arg.length > 2 && !arg.startsWith("--") && takesValue(arg.slice(0, 2), flagArgs))
    return 1;
  if (takesValue(arg, flagArgs) && i + 1 < args.length) {
    const next = args[i + 1];
    if (next && !next.startsWith("-"))
      return 2;
  }
  return 1;
}

// plugins/bash-guard.ts
import { defineTool } from "@deepseek-ai/dsh-tools";
import z from "@deepseek-ai/schemastery";

// plugins/bash-guard-translate.ts
var SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;
function shellQuote(word) {
  if (SHELL_SAFE.test(word)) return word;
  return "'" + word.split("'").join("'\\''") + "'";
}
function blocked(why) {
  return { kind: "blocked", why };
}
function addNote(notes, note) {
  if (!notes.includes(note)) notes.push(note);
}
var GREP_PLAIN_FLAGS = {
  i: ["-i"],
  n: ["-n"],
  v: ["-v"],
  c: ["-c"],
  l: ["-l"],
  L: ["--files-without-match"],
  w: ["-w"],
  x: ["-x"],
  F: ["-F"],
  E: [],
  P: ["-P"],
  o: ["-o"],
  a: ["-a"],
  q: ["-q"],
  s: ["--no-messages"],
  h: ["--no-filename"],
  H: ["-H"],
  z: ["--null-data"],
  r: [],
  R: []
};
var GREP_PLAIN_NOTES = {
  E: "rg uses regular expressions by default, so -E was dropped.",
  r: "rg searches directories by default, so the recursive flag was dropped. rg also skips hidden files and files listed in .gitignore.",
  R: "rg searches directories by default, so the recursive flag was dropped. rg also skips hidden files and files listed in .gitignore.",
  h: "grep -h became rg --no-filename. The rg short form is -I, not -h.",
  z: "grep -z became rg --null-data. The rg -z flag means --search-zip instead."
};
var GREP_LONG_PLAIN = {
  "--ignore-case": "i",
  "--line-number": "n",
  "--invert-match": "v",
  "--count": "c",
  "--files-with-matches": "l",
  "--files-without-match": "L",
  "--word-regexp": "w",
  "--line-regexp": "x",
  "--fixed-strings": "F",
  "--extended-regexp": "E",
  "--perl-regexp": "P",
  "--only-matching": "o",
  "--text": "a",
  "--quiet": "q",
  "--silent": "q",
  "--no-messages": "s",
  "--no-filename": "h",
  "--with-filename": "H",
  "--null-data": "z",
  "--recursive": "r",
  "--dereference-recursive": "R"
};
var GREP_SHORT_VALUE = {
  e: "e",
  f: "f",
  A: "A",
  B: "B",
  C: "C"
};
var GREP_LONG_VALUE = {
  "--regexp": "e",
  "--file": "f",
  "--after-context": "A",
  "--before-context": "B",
  "--context": "C",
  "--include": "include",
  "--exclude": "exclude"
};
var GREP_EXCLUDE_NOTE = "grep --exclude became an rg negated glob, written -g !GLOB.";
var GREP_EGREP_NOTE = "rg uses regular expressions by default, so egrep needed no extra flag.";
function translateGrep(args, name2) {
  const flags = [];
  const notes = [];
  const positional = [];
  let patternGiven = false;
  if (name2 === "fgrep") flags.push("-F");
  if (name2 === "zgrep") flags.push("-z");
  if (name2 === "egrep") addNote(notes, GREP_EGREP_NOTE);
  const applyValue = (key, value) => {
    if (key === "include") {
      flags.push("-g", value);
      return;
    }
    if (key === "exclude") {
      flags.push("-g", "!" + value);
      addNote(notes, GREP_EXCLUDE_NOTE);
      return;
    }
    if (key === "e" || key === "f") patternGiven = true;
    flags.push("-" + key, value);
  };
  let endOfFlags = false;
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    i += 1;
    if (endOfFlags || arg === "-" || !arg.startsWith("-")) {
      positional.push(arg);
      continue;
    }
    if (arg === "--") {
      endOfFlags = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const flagName = eq === -1 ? arg : arg.slice(0, eq);
      const inline = eq === -1 ? void 0 : arg.slice(eq + 1);
      const valueKey = GREP_LONG_VALUE[flagName];
      if (valueKey !== void 0) {
        let value = inline;
        if (value === void 0) {
          if (i >= args.length) return blocked(`The grep flag ${flagName} needs a value.`);
          value = args[i];
          i += 1;
        }
        applyValue(valueKey, value);
        continue;
      }
      const plainKey = GREP_LONG_PLAIN[flagName];
      if (plainKey !== void 0) {
        if (inline !== void 0) return blocked(`The grep flag ${flagName} takes no value.`);
        flags.push(...GREP_PLAIN_FLAGS[plainKey]);
        const note = GREP_PLAIN_NOTES[plainKey];
        if (note) addNote(notes, note);
        continue;
      }
      return blocked(`rg has no safe equivalent for the grep flag ${flagName}.`);
    }
    let rest = arg.slice(1);
    while (rest.length > 0) {
      const key = rest[0];
      rest = rest.slice(1);
      if (GREP_SHORT_VALUE[key] !== void 0) {
        let value = rest;
        rest = "";
        if (value === "") {
          if (i >= args.length) return blocked(`The grep flag -${key} needs a value.`);
          value = args[i];
          i += 1;
        }
        applyValue(GREP_SHORT_VALUE[key], value);
        continue;
      }
      if (GREP_PLAIN_FLAGS[key] === void 0) {
        return blocked(`rg has no safe equivalent for the grep flag -${key}.`);
      }
      flags.push(...GREP_PLAIN_FLAGS[key]);
      const note = GREP_PLAIN_NOTES[key];
      if (note) addNote(notes, note);
    }
  }
  if (!patternGiven && positional.length === 0) {
    return blocked("The grep command has no pattern to translate.");
  }
  return { kind: "ok", argv: ["rg", ...flags, ...positional], notes };
}
var FIND_TYPES = ["f", "d", "l", "s", "p", "b", "c"];
var FIND_SIZE_UNITS = {
  c: "b",
  k: "ki",
  M: "mi",
  G: "gi"
};
var FIND_OPERATORS = ["-o", "-or", "-a", "-and", "-not", "!", "(", ")"];
var FIND_UNSAFE = ["-execdir", "-ok", "-okdir", "-fprint", "-fprintf", "-fls"];
var FIND_IGNORE_NOTE = "fd skips hidden files and files listed in .gitignore by default. find does not.";
var FIND_FULLPATH_NOTE = "fd -p matches the full absolute path. find matches the path from the start point.";
var FIND_REGEX_NOTE = "fd matches a regex anywhere in the path. find -regex must match it all.";
var FIND_SIZE_NOTE = "fd -S treats + and - as at least and at most. find treats them as strictly more and strictly less.";
var FIND_LOGICAL_NOTE = "fd has no -H or -P flag. It does not follow symlinks unless --follow is given.";
function translateFindSize(value) {
  const match = /^([+-])([0-9]+)([ckMG])$/.exec(value);
  if (!match) return void 0;
  return match[1] + match[2] + FIND_SIZE_UNITS[match[3]];
}
function translateFind(args) {
  const searchPaths = [];
  const flags = [];
  const notes = [FIND_IGNORE_NOTE];
  let pattern;
  let patternFrom;
  let execFlag;
  let execCmd = [];
  let askWhy;
  let askFrom;
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "-L") {
      flags.push("--follow");
      i += 1;
      continue;
    }
    if (arg === "-H" || arg === "-P") {
      addNote(notes, FIND_LOGICAL_NOTE);
      i += 1;
      continue;
    }
    if (arg.startsWith("-") || arg === "!" || arg === "(") break;
    searchPaths.push(arg);
    i += 1;
  }
  const setPattern = (predicate, value) => {
    if (patternFrom !== void 0) {
      return blocked(
        `fd matches one pattern, so ${patternFrom} and ${predicate} can not be combined.`
      );
    }
    patternFrom = predicate;
    pattern = value;
    return void 0;
  };
  const setAsk = (predicate, why) => {
    if (askFrom !== void 0) {
      return blocked(`fd runs one command, so ${askFrom} and ${predicate} can not be combined.`);
    }
    askFrom = predicate;
    askWhy = why;
    return void 0;
  };
  while (i < args.length) {
    const arg = args[i];
    i += 1;
    if (FIND_OPERATORS.includes(arg)) {
      return blocked(`fd has no boolean expressions, so the find operator ${arg} can not be used.`);
    }
    if (FIND_UNSAFE.includes(arg)) {
      return blocked(`fd has no safe equivalent for the find predicate ${arg}.`);
    }
    const takeValue = () => {
      if (i >= args.length) return void 0;
      const value = args[i];
      i += 1;
      return value;
    };
    if (arg === "-name" || arg === "-iname" || arg === "-path" || arg === "-ipath" || arg === "-wholename" || arg === "-iwholename" || arg === "-regex") {
      const value = takeValue();
      if (value === void 0) return blocked(`The find predicate ${arg} needs a value.`);
      const bad = setPattern(arg, value);
      if (bad) return bad;
      if (arg === "-regex") {
        flags.push("--regex", "-p");
        addNote(notes, FIND_REGEX_NOTE);
        addNote(notes, FIND_FULLPATH_NOTE);
        continue;
      }
      flags.push("-g");
      if (arg === "-path" || arg === "-ipath" || arg === "-wholename" || arg === "-iwholename") {
        flags.push("-p");
        addNote(notes, FIND_FULLPATH_NOTE);
      }
      if (arg === "-iname" || arg === "-ipath" || arg === "-iwholename") flags.push("-i");
      continue;
    }
    if (arg === "-type") {
      const value = takeValue();
      if (value === void 0) return blocked(`The find predicate ${arg} needs a value.`);
      if (!FIND_TYPES.includes(value)) {
        return blocked(`fd has no equivalent for the find type ${value}.`);
      }
      flags.push("-t", value);
      continue;
    }
    if (arg === "-maxdepth" || arg === "-mindepth") {
      const value = takeValue();
      if (value === void 0) return blocked(`The find predicate ${arg} needs a value.`);
      if (!/^[0-9]+$/.test(value)) {
        return blocked(`The find predicate ${arg} needs a whole number, not ${value}.`);
      }
      flags.push(arg === "-maxdepth" ? "-d" : "--min-depth", value);
      continue;
    }
    if (arg === "-size") {
      const value = takeValue();
      if (value === void 0) return blocked(`The find predicate ${arg} needs a value.`);
      const size = translateFindSize(value);
      if (size === void 0) {
        return blocked(`fd has no equivalent for the find size ${value}.`);
      }
      flags.push("-S", size);
      addNote(notes, FIND_SIZE_NOTE);
      continue;
    }
    if (arg === "-newer") {
      return blocked(
        "fd --newer takes a date or a duration, not a file name, so the find predicate -newer has no translation."
      );
    }
    if (arg === "-empty") {
      flags.push("-t", "e");
      continue;
    }
    if (arg === "-print0") {
      flags.push("-0");
      continue;
    }
    if (arg === "-print") {
      continue;
    }
    if (arg === "-follow" || arg === "-L") {
      flags.push("--follow");
      continue;
    }
    if (arg === "-H" || arg === "-P") {
      addNote(notes, FIND_LOGICAL_NOTE);
      continue;
    }
    if (arg === "-delete") {
      return blocked(
        "fd has no delete flag, and fd skips files listed in .gitignore, so -delete would remove a different set of files than find removes."
      );
    }
    if (arg === "-exec") {
      const cmd = [];
      let terminator;
      while (i < args.length) {
        const part = args[i];
        i += 1;
        if (part === ";" || part === "\\;" || part === "+") {
          terminator = part === "+" ? "+" : ";";
          break;
        }
        cmd.push(part);
      }
      if (terminator === void 0) {
        return blocked("The find predicate -exec has no ; or + terminator.");
      }
      if (cmd.length === 0) {
        return blocked("The find predicate -exec has no command to run.");
      }
      const bad = setAsk(
        arg,
        `The find predicate ${arg} runs another command, so it needs approval.`
      );
      if (bad) return bad;
      execFlag = terminator === ";" ? "-x" : "-X";
      execCmd = cmd;
      continue;
    }
    return blocked(`fd has no safe equivalent for the find predicate ${arg}.`);
  }
  const argv = ["fd"];
  for (const path3 of searchPaths) argv.push("--search-path", path3);
  argv.push(...flags);
  if (pattern !== void 0) argv.push(pattern);
  if (execFlag !== void 0) argv.push(execFlag, ...execCmd);
  if (askWhy !== void 0) return { kind: "ask", argv, notes, why: askWhy };
  return { kind: "ok", argv, notes };
}
var TRANSLATORS = {
  grep: translateGrep,
  find: translateFind
};

// plugins/bash-guard.ts
var name = "bash-guard";
var inject = ["shell"];
var WIDER_MODES = {
  "read-only": ["workspace-write", "danger-full-access"],
  "workspace-write": ["danger-full-access"],
  "danger-full-access": []
};
var ESCALATION_TARGETS = [
  "workspace-write",
  "danger-full-access"
];
var Config = z.object({
  guardsDir: z.string().default("$DSH_HOME/plugins/guards"),
  // Left unset by default (not defaulted to ""): evaluate() falls back to
  // DEFAULT_DENY_TEMPLATE/DEFAULT_ASK_TEMPLATE with `??`, which only skips a
  // nullish value. A "" default here used to satisfy that check and silently
  // format against an empty template, rendering a bare "Error: " on every
  // deny/ask. Do not add a string default back without also changing the
  // `??` fallback in evaluate().
  denyMessage: z.string(),
  askMessage: z.string()
});
function resolveHome(path3) {
  if (!path3.includes("$DSH_HOME")) return path3;
  const home = process.env.DSH_HOME ?? join2(process.env.HOME ?? "", ".dsh");
  return path3.replaceAll("$DSH_HOME", home);
}
async function loadRules(ctx, dir) {
  const rules = /* @__PURE__ */ new Map();
  let names;
  try {
    names = await readdir(dir);
  } catch {
    ctx.logger.debug(`bash-guard: rules directory not found at ${dir}; allowing all commands`);
    return rules;
  }
  for (const name2 of names) {
    if (!name2.endsWith(".json")) continue;
    try {
      const text = await readFile(join2(dir, name2), "utf8");
      const parsed = JSON.parse(text);
      if (typeof parsed !== "object" || parsed === null) throw new Error("not an object");
      const entry = parsed;
      if (!Array.isArray(entry.commands) || entry.commands.length === 0)
        throw new Error("missing commands[]");
      if (entry.verdict !== "deny" && entry.verdict !== "ask" && entry.verdict !== "allow") {
        throw new Error(`bad verdict: ${String(entry.verdict)}`);
      }
      if (entry.readOnly !== void 0 && typeof entry.readOnly !== "boolean") {
        throw new Error(`bad readOnly: ${String(entry.readOnly)}`);
      }
      const clean = entry.commands.filter((c) => typeof c === "string" && c.length > 0);
      let subcommands;
      if (entry.subcommands !== void 0) {
        if (typeof entry.subcommands !== "object" || entry.subcommands === null)
          throw new Error("bad subcommands");
        subcommands = {};
        for (const [sub, verdict] of Object.entries(entry.subcommands)) {
          if (verdict !== "deny" && verdict !== "ask" && verdict !== "allow") {
            throw new Error(`bad subcommand verdict for "${sub}": ${String(verdict)}`);
          }
          subcommands[sub] = verdict;
        }
      }
      let rewrites;
      if (entry.rewrites !== void 0) {
        if (!Array.isArray(entry.rewrites)) throw new Error("bad rewrites");
        rewrites = [];
        for (const r of entry.rewrites) {
          if (typeof r !== "object" || r === null) throw new Error("bad rewrite");
          if (r.drop === void 0 && r.add === void 0)
            throw new Error("bad rewrite: needs drop or add");
          const cleanRewrite = {};
          if (r.drop !== void 0) {
            if (!Array.isArray(r.drop) || r.drop.length === 0) throw new Error("bad rewrite drop");
            for (const d of r.drop) {
              if (typeof d !== "string" || d.length === 0)
                throw new Error("bad rewrite drop entry");
            }
            cleanRewrite.drop = r.drop.filter((d) => typeof d === "string" && d.length > 0);
          }
          if (r.add !== void 0) {
            if (!Array.isArray(r.add) || r.add.length === 0) throw new Error("bad rewrite add");
            cleanRewrite.add = [];
            for (const a of r.add) {
              if (typeof a !== "object" || a === null || typeof a.flag !== "string" || a.flag.length === 0) {
                throw new Error("bad rewrite add entry");
              }
              if (a.value !== void 0 && typeof a.value !== "string") {
                throw new Error("bad rewrite add value");
              }
              cleanRewrite.add.push(
                a.value === void 0 ? { flag: a.flag } : { flag: a.flag, value: a.value }
              );
            }
          }
          if (r.value !== void 0) {
            if (typeof r.value !== "boolean") throw new Error("bad rewrite value");
            cleanRewrite.value = r.value;
          }
          if (r.because !== void 0) {
            if (typeof r.because !== "string") throw new Error("bad rewrite because");
            cleanRewrite.because = r.because;
          }
          rewrites.push(cleanRewrite);
        }
      }
      let translate;
      if (entry.translate !== void 0) {
        if (typeof entry.translate !== "string" || entry.translate.length === 0) {
          throw new Error(`bad translate: ${String(entry.translate)}`);
        }
        if (!Object.hasOwn(TRANSLATORS, entry.translate)) {
          throw new Error(`unknown translate: ${entry.translate}`);
        }
        translate = entry.translate;
      }
      for (const cmd of clean) {
        const built = {
          commands: entry.commands,
          verdict: entry.verdict,
          reason: entry.reason,
          subcommands
        };
        if (rewrites) built.rewrites = rewrites;
        if (translate) built.translate = translate;
        if (entry.readOnly !== void 0) built.readOnly = entry.readOnly;
        rules.set(cmd, built);
      }
      ctx.logger.debug(`bash-guard: loaded ${clean.length} command(s) from rule file ${name2}`);
    } catch (error) {
      ctx.logger.warn(
        `bash-guard: skipping malformed rule file ${name2}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return rules;
}
async function loadRulesMulti(ctx, dirs) {
  const merged = /* @__PURE__ */ new Map();
  for (const dir of dirs) {
    const rules = await loadRules(ctx, dir);
    for (const [cmd, entry] of rules) merged.set(cmd, entry);
  }
  return merged;
}
var DEFAULT_DENY_TEMPLATE = "bash-guard: {name} denied by {count} ({detail})\n\n  {command}\n\nMatched rule(s):\n{matches}";
var DEFAULT_ASK_TEMPLATE = "bash-guard: {name} blocked by {count} ({detail}) \u2014 needs your approval";
function shortDetail(match) {
  if (match.subcommand) return `${match.subcommand} is blocked`;
  const first = match.reason.split(/(?<=[.!?])\s/u)[0] ?? match.reason;
  const trimmed = first.trim().replace(/[.]$/u, "");
  return trimmed.length > 60 ? `${trimmed.slice(0, 59)}\u2026` : trimmed;
}
function formatMessage(template, ctx) {
  const matchesText = ctx.matches.map((m) => {
    const sub = m.subcommand ? ` (${m.subcommand})` : "";
    return `  \u2022 ${m.name}${sub}: ${m.reason}`;
  }).join("\n");
  const primary = ctx.matches[0];
  const details = ctx.matches.slice(0, 2).map(shortDetail);
  if (ctx.matches.length > 2) details.push(`+${ctx.matches.length - 2} more`);
  return template.replace(
    /(\{command\}|\{matches\}|\{name\}|\{reason\}|\{count\}|\{detail\})/g,
    (token) => {
      if (token === "{command}") return ctx.command;
      if (token === "{matches}") return matchesText;
      if (token === "{name}") return primary?.name ?? "unknown";
      if (token === "{count}")
        return `${ctx.matches.length} filter${ctx.matches.length === 1 ? "" : "s"}`;
      if (token === "{detail}") return details.join(", ") || "no detail";
      return primary?.reason ?? "";
    }
  );
}
function matchLines(hits) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const h of hits) {
    const line = {
      name: h.name,
      subcommand: firstSubcommand(getCommandArgs(h.ref)),
      reason: h.rule.reason ?? "(no reason supplied by the rule)"
    };
    const key = `${line.name}\0${line.subcommand ?? ""}\0${line.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}
function mostRestrictive(verdicts) {
  if (verdicts.includes("deny")) return "deny";
  if (verdicts.includes("ask")) return "ask";
  if (verdicts.includes("allow")) return "allow";
  return "none";
}
var GIT_GLOBALS_WITH_VALUE = /* @__PURE__ */ new Set(["-C", "--git-dir", "--work-tree", "--namespace"]);
function firstSubcommand(args) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") break;
    if (GIT_GLOBALS_WITH_VALUE.has(arg)) {
      i++;
      continue;
    }
    if (arg.startsWith("-")) continue;
    return arg;
  }
  return void 0;
}
function verdictFor(rule, ref) {
  if (rule.subcommands === void 0) return rule.verdict;
  const sub = firstSubcommand(getCommandArgs(ref));
  const refined = sub !== void 0 ? rule.subcommands[sub] : void 0;
  return refined ?? rule.verdict;
}
function pathLikeArgs(refs) {
  const out = [];
  for (const ref of refs) {
    for (const arg of getCommandArgs(ref)) {
      if (arg.startsWith("-")) continue;
      if (arg.startsWith("/") || arg.includes("/") || arg.startsWith("./") || arg.startsWith("../") || /\.[A-Za-z0-9]+$/.test(arg)) {
        out.push(arg);
      }
    }
  }
  return out;
}
function normalizeScratchPath(p, workspaceRoot) {
  if (isAbsolute2(p)) return resolve(p);
  if (workspaceRoot) return resolve(join2(workspaceRoot, p));
  return p;
}
function isUnderScratch(target, root) {
  return target === root || target.startsWith(root + sep);
}
function scratchAllowed(refs, safePaths, workspaceRoot) {
  const paths = pathLikeArgs(refs);
  if (paths.length === 0) return false;
  return paths.every((p) => {
    const n = normalizeScratchPath(p, workspaceRoot);
    return safePaths.some((sp) => isUnderScratch(n, sp));
  });
}
var GLOB_CHARS = ["*", "?", "[", "]", "{", "}", "~"];
var LITERAL_WORDS = /* @__PURE__ */ new Set(["{}"]);
function translatableRef(ref, command) {
  if (ref.source !== command) {
    return {
      ok: false,
      why: "it sits inside a wrapper, so its offsets address a rebuilt string"
    };
  }
  if (ref.node.name === void 0) return { ok: false, why: "it has no command word" };
  for (const word of [ref.node.name, ...ref.node.suffix]) {
    if (!isStaticallyResolvable(word)) {
      return { ok: false, why: `\`${word.text}\` depends on a shell expansion` };
    }
    if (word.text === (word.value ?? word.text) && !LITERAL_WORDS.has(word.text) && GLOB_CHARS.some((c) => word.text.includes(c))) {
      return { ok: false, why: `the shell expands \`${word.text}\` before the command runs` };
    }
  }
  return { ok: true };
}
function suggestionMessage(suggested, notes, mutatingWhy) {
  let reason = `bash-guard: that command is not run directly. Run this instead:

  ${suggested}
`;
  if (mutatingWhy.length > 0) {
    reason += `
This command changes files. Ask the user before you run it.
`;
    for (const why of mutatingWhy) reason += `  ${why}
`;
  }
  if (notes.length > 0) {
    reason += `
Why: ${notes[0]}
`;
    for (const note of notes.slice(1)) reason += `     ${note}
`;
  }
  return reason;
}
function rewriteOutcome(suggested, original, notes, mutatingWhy, readOnly) {
  const reason = suggestionMessage(suggested, notes, mutatingWhy);
  const rewritten = suggested !== original;
  if (readOnly) return { action: "run", command: suggested, rewritten, reason };
  return { action: "ask", command: suggested, original, rewritten, reason };
}
function flagPresent(ref, flag) {
  return ref.node.suffix.some((w) => w.text === flag || w.text.startsWith(flag + "="));
}
function rewritingHits(hits) {
  return hits.filter((h) => h.rule.rewrites !== void 0);
}
function isReadOnly(hits) {
  return hits.length > 0 && hits.every((h) => h.rule.readOnly === true);
}
function withRuleReason(hits, notes) {
  const reason = hits[0]?.rule.reason;
  return reason === void 0 ? notes : [reason, ...notes];
}
async function evaluate(ctx, dirs, command, safePaths, workspaceRoot, templates) {
  const notes = [];
  let script;
  try {
    script = parse(command);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    ctx.logger.warn(`bash-guard: parse error in command; denying: ${command} (error: ${errorMsg})`);
    return {
      action: "deny",
      reason: `bash-guard: could not parse the command; refusing to run it unparsed. ${errorMsg}`
    };
  }
  if (script.errors && script.errors.length > 0) {
    const messages = script.errors.map((e) => e.message).join("; ");
    ctx.logger.warn(`bash-guard: script parse errors; denying: ${command} (errors: ${messages})`);
    return {
      action: "deny",
      reason: `bash-guard: parse errors in command; refusing to run it unparsed. ${messages}`
    };
  }
  const refs = extractAllCommandsFromAST(script, command);
  const { commands } = expandWrapperCommands(refs);
  const all = [...refs, ...commands];
  ctx.logger.debug(`bash-guard: extracted ${all.length} command(s) from: ${command}`);
  if (safePaths.length > 0 && scratchAllowed(all, safePaths, workspaceRoot)) {
    ctx.logger.info(`bash-guard: scratch write allowed: ${command}`);
    return { action: "run", command, rewritten: false };
  }
  const rules = await loadRulesMulti(ctx, dirs);
  const hits = all.map((ref) => {
    const name2 = getBasename(ref);
    const rule = rules.get(name2) ?? rules.get("*");
    if (rule === void 0) return void 0;
    return { name: name2, rule, ref, verdict: verdictFor(rule, ref) };
  }).filter(
    (h) => h !== void 0
  );
  if (!hits.some((h) => h.rule.translate) && hits.some((h) => h.rule.rewrites)) {
    const edits = [];
    let addMatched = false;
    for (const hit of hits) {
      if (!hit.rule.rewrites) continue;
      for (const rw of hit.rule.rewrites) {
        for (let i = 0; i < hit.ref.node.suffix.length; i++) {
          const word = hit.ref.node.suffix[i];
          for (const flag of rw.drop ?? []) {
            if (word.text === flag) {
              edits.push({ start: word.pos, end: word.end, text: "", because: rw.because });
              if (rw.value && i + 1 < hit.ref.node.suffix.length) {
                const next = hit.ref.node.suffix[i + 1];
                if (!next.text.startsWith("-")) {
                  edits.push({ start: next.pos, end: next.end, text: "" });
                }
              }
            } else if (word.text.startsWith(flag + "=")) {
              edits.push({ start: word.pos, end: word.end, text: "", because: rw.because });
            } else if (rw.value && flag.length === 2 && word.text.length > 2 && word.text.startsWith(flag)) {
              edits.push({ start: word.pos, end: word.end, text: "", because: rw.because });
            }
          }
        }
        if (rw.add !== void 0) {
          addMatched = true;
          for (const a of rw.add) {
            if (flagPresent(hit.ref, a.flag)) continue;
            let text = ` ${a.flag}`;
            if (a.value !== void 0) text += ` ${shellQuote(a.value)}`;
            const at = hit.ref.node.name.end;
            if (edits.some((e) => e.start === at && e.text === text)) continue;
            edits.push({ start: at, end: at, text, because: rw.because });
          }
        }
      }
    }
    if (edits.length > 0) {
      edits.sort((a, b) => a.start - b.start || a.end - b.end);
      let rewritten = "";
      let lastEnd = 0;
      const logBecauses = [];
      for (const e of edits) {
        if (e.start < lastEnd) continue;
        let from = e.start;
        if (e.text === "" && from > lastEnd && command[from - 1] === " ") from -= 1;
        rewritten += command.slice(lastEnd, from) + e.text;
        lastEnd = e.end;
        if (e.because && !logBecauses.includes(e.because)) {
          logBecauses.push(e.because);
        }
      }
      rewritten += command.slice(lastEnd);
      ctx.logger.debug(
        `bash-guard: rewrite (${logBecauses.join("; ")}) ${command} -> ${rewritten}`
      );
      return rewriteOutcome(
        rewritten,
        command,
        withRuleReason(rewritingHits(hits), logBecauses),
        [],
        isReadOnly(rewritingHits(hits))
      );
    }
    if (addMatched) {
      const rwHits = rewritingHits(hits);
      return rewriteOutcome(command, command, withRuleReason(rwHits, []), [], isReadOnly(rwHits));
    }
  }
  if (hits.some((h) => h.rule.translate)) {
    const ranges = [];
    for (const hit of hits) {
      const key = hit.rule.translate;
      if (key === void 0) continue;
      const translator = TRANSLATORS[key];
      if (translator === void 0) {
        ctx.logger.warn(`bash-guard: no translator named "${key}"; leaving ${hit.name} as written`);
        continue;
      }
      const node = hit.ref.node;
      const splice = translatableRef(hit.ref, command);
      if (splice.ok === false) {
        ctx.logger.debug(`bash-guard: not translating ${hit.name} in ${command}: ${splice.why}`);
        continue;
      }
      const outcome = translator(getCommandArgs(hit.ref), hit.name);
      if (outcome.kind === "blocked") {
        const text = command.slice(node.pos, node.end);
        ctx.logger.warn(`bash-guard: translation blocked for ${hit.name}: ${outcome.why}`);
        return {
          action: "deny",
          reason: `bash-guard: could not translate \`${text}\`. ${outcome.why} Run the rg or fd equivalent yourself.`
        };
      }
      const start = node.name.pos;
      const end = node.suffix.length > 0 ? node.suffix[node.suffix.length - 1].end : node.name.end;
      if (node.redirects.some((r) => r.pos >= start && r.pos < end)) {
        return {
          action: "deny",
          reason: `bash-guard: could not translate \`${command.slice(start, end)}\`. A redirect sits between the arguments. Run the rg or fd equivalent yourself.`
        };
      }
      const lines = [];
      for (const note of outcome.notes) {
        if (note.length > 0) lines.push(note);
      }
      ranges.push({
        start,
        end,
        text: outcome.argv.map(shellQuote).join(" "),
        lines,
        why: outcome.kind === "ask" ? outcome.why : void 0
      });
    }
    if (ranges.length > 0) {
      ranges.sort((a, b) => a.start - b.start);
      let translated = "";
      let lastEnd = 0;
      const whys = [];
      for (const range of ranges) {
        if (range.start < lastEnd) continue;
        translated += command.slice(lastEnd, range.start) + range.text;
        lastEnd = range.end;
        notes.push(...range.lines);
        if (range.why !== void 0) whys.push(range.why);
      }
      translated += command.slice(lastEnd);
      ctx.logger.info(`bash-guard: suggesting \`${translated}\` instead of \`${command}\``);
      const translateHits = hits.filter((h) => h.rule.translate !== void 0);
      return rewriteOutcome(
        translated,
        command,
        withRuleReason(translateHits, notes),
        whys,
        isReadOnly(translateHits)
      );
    }
  }
  if (all.length === 0) {
    ctx.logger.debug(`bash-guard: no actual commands found in: ${command}`);
    return { action: "run", command, rewritten: false };
  }
  if (hits.length === 0) {
    ctx.logger.debug(`bash-guard: no rules matched for: ${command}`);
    return { action: "run", command, rewritten: false };
  }
  const verdicts = hits.map((h) => h.verdict);
  const overall = mostRestrictive(verdicts);
  switch (overall) {
    case "deny": {
      const denying = hits.filter((h) => h.verdict === "deny");
      const reason = formatMessage(templates.deny ?? DEFAULT_DENY_TEMPLATE, {
        command,
        matches: matchLines(denying)
      });
      const ruleNames = [...new Set(denying.map((h) => h.name))].join(", ");
      ctx.logger.warn(`bash-guard: command denied by rules [${ruleNames}]: ${command}`);
      return { action: "deny", reason };
    }
    case "ask": {
      const asking = hits.filter((h) => h.verdict === "ask");
      const reason = formatMessage(templates.ask ?? DEFAULT_ASK_TEMPLATE, {
        command,
        matches: matchLines(asking)
      });
      const ruleNames = [...new Set(asking.map((h) => h.name))].join(", ");
      ctx.logger.warn(`bash-guard: command asks for approval by rules [${ruleNames}]: ${command}`);
      return { action: "ask", command, original: command, rewritten: false, reason };
    }
    case "allow":
    case "none":
    default:
      ctx.logger.debug(`bash-guard: command allowed: ${command}`);
      return { action: "run", command, rewritten: false };
  }
}
function renderShellResult(result) {
  let body = result.stdout.text;
  const stderr = result.stderr.text;
  if (stderr.length > 0) {
    if (body.length > 0 && !body.endsWith("\n")) body += "\n";
    body += `[stderr]
${stderr}`;
  }
  if (body.length === 0) body = "(no output)";
  const markers = [];
  if (result.sandbox?.denied) {
    markers.push(`[sandbox: file access denied under ${result.sandbox.mode} mode]`);
  }
  if (result.timedOut) markers.push(`[timed out after ${result.timeoutMs}ms]`);
  if (result.signal !== null) markers.push(`[killed by signal: ${result.signal}]`);
  else if (result.exitCode !== 0) markers.push(`[exit code: ${result.exitCode}]`);
  if (markers.length === 0) return body;
  if (!body.endsWith("\n")) body += "\n";
  return body + markers.join("\n");
}
function apply(ctx, config) {
  const baseDir = resolveHome(config.guardsDir ?? "$DSH_HOME/plugins/guards");
  const sandboxMode = ctx.shell.sandboxMode;
  const escalationModes = sandboxMode === void 0 ? [] : ESCALATION_TARGETS;
  const sandboxPolicy = ctx.get("sandboxPolicy");
  if (sandboxMode !== void 0 && sandboxPolicy === void 0) {
    throw new Error(
      "bash-guard: the mounted shell executor confines but ctx.sandboxPolicy is missing"
    );
  }
  const approval = ctx.get("approval");
  ctx.tools.register(
    defineTool({
      name: "bash",
      description: "Run a bash command and return its output. Every command passes the bash-guard rule layer first: a rule may replace the command with a preferred form (which runs directly), ask you to wait for user approval, or deny it. " + (escalationModes.length > 0 ? "When the sandbox denies a file operation, retry the exact same command once with sandbox_permissions plus a one-sentence justification. A rejected escalation is final for that command." : ""),
      parameters: {
        command: {
          type: "string",
          required: true,
          description: "The bash command to execute."
        },
        description: {
          type: "string",
          required: true,
          description: 'Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples: "ls" \u2192 "List files in current directory"; "git status" \u2192 "Show working tree status".'
        },
        timeoutMs: {
          type: "number",
          description: "Timeout in milliseconds. The executor applies its configured default and cap, and kills the command on expiry."
        },
        workdir: {
          type: "string",
          description: "Working directory for this command. Defaults to the session workspace; a relative path is resolved against it."
        },
        ...escalationModes.length > 0 ? {
          sandbox_permissions: {
            type: "string",
            enum: [...escalationModes],
            description: "The wider sandbox mode this command needs. Only valid as a one-shot retry of a command the sandbox just denied; requires justification and user approval."
          },
          justification: {
            type: "string",
            description: "Required with sandbox_permissions: one sentence for the user explaining why this exact command needs the wider access."
          }
        } : {}
      },
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: value }]
      },
      async execute(args, exec) {
        const agent = exec.agent;
        const command = args.command;
        if (typeof command !== "string" || command.trim().length === 0) {
          throw new Error("command is required");
        }
        const standing = sandboxPolicy !== void 0 && agent !== void 0 ? sandboxPolicy.resolve({ session: agent.session }) : void 0;
        let policy = standing;
        if (args.sandbox_permissions !== void 0) {
          if (escalationModes.length === 0) {
            throw new Error(
              "sandbox_permissions is not available in this composition (the executor does not confine)"
            );
          }
          if (typeof args.justification !== "string" || args.justification.trim().length === 0) {
            throw new Error(
              "justification is required with sandbox_permissions: one sentence for the user explaining why this exact command needs the wider access"
            );
          }
          if (standing === void 0 || agent === void 0 || approval === void 0) {
            throw new Error(
              "sandbox escalation is unavailable here: it needs a confining executor, a calling agent, and a mounted approval service"
            );
          }
          const requested = args.sandbox_permissions;
          if (!WIDER_MODES[standing.mode].includes(requested)) {
            throw new Error(
              `sandbox_permissions "${requested}" is not strictly wider than the effective mode "${standing.mode}"; a non-widening request never prompts`
            );
          }
          const verdict = await approval.request({
            agent,
            toolName: "bash",
            callId: exec.callId,
            reason: `bash-guard: escalate this bash command from "${standing.mode}" to "${requested}". Justification: ${args.justification}`,
            signal: exec.signal
          });
          if (verdict !== "allowed-once") {
            throw new Error(`sandbox escalation ${verdict}; the command did not run`);
          }
          policy = { ...standing, mode: requested };
        }
        const safePaths = ["/tmp/dsh"];
        let workspaceRoot;
        const aidos = ctx.get("aidos");
        let profile = "none";
        if (aidos && agent) {
          try {
            const bc = aidos.bashContext(agent);
            profile = bc.profile;
            workspaceRoot = bc.workspaceRoot;
            if (bc.scratchDir) safePaths.push(bc.scratchDir);
            ctx.logger.debug(`bash-guard: resolved aidos profile: ${profile}`);
          } catch {
            ctx.logger.debug(`bash-guard: aidos context not available; using default profile`);
          }
        }
        const dirs = profile === "none" ? [baseDir] : [baseDir, join2(baseDir, `profile-${profile}`)];
        const templates = { deny: config.denyMessage, ask: config.askMessage };
        const outcome = await evaluate(ctx, dirs, command, safePaths, workspaceRoot, templates);
        if (outcome.action === "deny") throw new Error(outcome.reason);
        let toRun;
        if (outcome.action === "ask") {
          if (approval === void 0 || agent === void 0) {
            throw new Error(
              "bash-guard: this command needs approval but no approval service is mounted, so it did not run.\n\n" + (outcome.reason ?? "")
            );
          }
          const replaced = outcome.command !== outcome.original;
          const prompt = [
            "bash-guard: this command needs your approval.",
            "",
            "The model wrote:",
            `  ${outcome.original}`,
            "",
            replaced ? "What would actually run instead:" : "What would run if you approve:",
            `  ${outcome.command}`,
            "",
            `Why: ${outcome.reason ?? "a rule asks for approval"}`
          ].join("\n");
          const verdict = await approval.request({
            agent,
            toolName: "bash",
            callId: exec.callId,
            reason: prompt,
            signal: exec.signal
          });
          if (verdict !== "allowed-once") {
            throw new Error(
              `bash-guard: the user rejected this command (${verdict}), so it did not run.` + (outcome.reason !== void 0 ? `

${outcome.reason}` : "")
            );
          }
          toRun = outcome.command;
        } else {
          toRun = outcome.command;
        }
        const headerCwd = agent?.session.header.cwd;
        const workdir = args.workdir === void 0 ? headerCwd : headerCwd !== void 0 && !isAbsolute2(args.workdir) ? resolve(headerCwd, args.workdir) : args.workdir;
        const result = await ctx.shell.run(
          ctx.shell.resolve({
            command: toRun,
            ...workdir !== void 0 ? { workdir } : {},
            ...args.timeoutMs !== void 0 ? { timeoutMs: args.timeoutMs } : {},
            ...exec.signal ? { signal: exec.signal } : {},
            // The policy object is the harness's own resolved
            // SandboxExecutionPolicy; the cast only restores the branded
            // SessionId this file cannot name without the dsh-session types.
            ...policy !== void 0 ? { sandboxPolicy: policy } : {}
          })
        );
        let text = renderShellResult(result);
        if (outcome.reason !== void 0) text += `

bash-guard: ${outcome.reason}`;
        return text;
      },
      presentCall: (args) => ({
        card: "terminal",
        title: args.command,
        description: args.description,
        ...args.workdir !== void 0 ? { cwd: args.workdir } : {}
      })
    })
  );
}
export {
  Config,
  ESCALATION_TARGETS,
  WIDER_MODES,
  apply,
  evaluate,
  inject,
  name
};
