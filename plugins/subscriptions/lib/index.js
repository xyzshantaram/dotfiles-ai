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

// ../../../../../home/sid/repos/dotfiles-ai/node_modules/.pnpm/snappyjs@0.7.0/node_modules/snappyjs/snappy_decompressor.js
var require_snappy_decompressor = __commonJS({
  "../../../../../home/sid/repos/dotfiles-ai/node_modules/.pnpm/snappyjs@0.7.0/node_modules/snappyjs/snappy_decompressor.js"(exports) {
    "use strict";
    var WORD_MASK = [0, 255, 65535, 16777215, 4294967295];
    function copyBytes(fromArray, fromPos, toArray, toPos, length) {
      var i;
      for (i = 0; i < length; i++) {
        toArray[toPos + i] = fromArray[fromPos + i];
      }
    }
    function selfCopyBytes(array, pos, offset, length) {
      var i;
      for (i = 0; i < length; i++) {
        array[pos + i] = array[pos - offset + i];
      }
    }
    function SnappyDecompressor(compressed) {
      this.array = compressed;
      this.pos = 0;
    }
    SnappyDecompressor.prototype.readUncompressedLength = function() {
      var result = 0;
      var shift = 0;
      var c, val;
      while (shift < 32 && this.pos < this.array.length) {
        c = this.array[this.pos];
        this.pos += 1;
        val = c & 127;
        if (val << shift >>> shift !== val) {
          return -1;
        }
        result |= val << shift;
        if (c < 128) {
          return result;
        }
        shift += 7;
      }
      return -1;
    };
    SnappyDecompressor.prototype.uncompressToBuffer = function(outBuffer) {
      var array = this.array;
      var arrayLength = array.length;
      var pos = this.pos;
      var outPos = 0;
      var c, len, smallLen;
      var offset;
      while (pos < array.length) {
        c = array[pos];
        pos += 1;
        if ((c & 3) === 0) {
          len = (c >>> 2) + 1;
          if (len > 60) {
            if (pos + 3 >= arrayLength) {
              return false;
            }
            smallLen = len - 60;
            len = array[pos] + (array[pos + 1] << 8) + (array[pos + 2] << 16) + (array[pos + 3] << 24);
            len = (len & WORD_MASK[smallLen]) + 1;
            pos += smallLen;
          }
          if (pos + len > arrayLength) {
            return false;
          }
          copyBytes(array, pos, outBuffer, outPos, len);
          pos += len;
          outPos += len;
        } else {
          switch (c & 3) {
            case 1:
              len = (c >>> 2 & 7) + 4;
              offset = array[pos] + (c >>> 5 << 8);
              pos += 1;
              break;
            case 2:
              if (pos + 1 >= arrayLength) {
                return false;
              }
              len = (c >>> 2) + 1;
              offset = array[pos] + (array[pos + 1] << 8);
              pos += 2;
              break;
            case 3:
              if (pos + 3 >= arrayLength) {
                return false;
              }
              len = (c >>> 2) + 1;
              offset = array[pos] + (array[pos + 1] << 8) + (array[pos + 2] << 16) + (array[pos + 3] << 24);
              pos += 4;
              break;
            default:
              break;
          }
          if (offset === 0 || offset > outPos) {
            return false;
          }
          selfCopyBytes(outBuffer, outPos, offset, len);
          outPos += len;
        }
      }
      return true;
    };
    exports.SnappyDecompressor = SnappyDecompressor;
  }
});

// ../../../../../home/sid/repos/dotfiles-ai/node_modules/.pnpm/snappyjs@0.7.0/node_modules/snappyjs/snappy_compressor.js
var require_snappy_compressor = __commonJS({
  "../../../../../home/sid/repos/dotfiles-ai/node_modules/.pnpm/snappyjs@0.7.0/node_modules/snappyjs/snappy_compressor.js"(exports) {
    "use strict";
    var BLOCK_LOG = 16;
    var BLOCK_SIZE = 1 << BLOCK_LOG;
    var MAX_HASH_TABLE_BITS = 14;
    var globalHashTables = new Array(MAX_HASH_TABLE_BITS + 1);
    function hashFunc(key, hashFuncShift) {
      return key * 506832829 >>> hashFuncShift;
    }
    function load32(array, pos) {
      return array[pos] + (array[pos + 1] << 8) + (array[pos + 2] << 16) + (array[pos + 3] << 24);
    }
    function equals32(array, pos1, pos2) {
      return array[pos1] === array[pos2] && array[pos1 + 1] === array[pos2 + 1] && array[pos1 + 2] === array[pos2 + 2] && array[pos1 + 3] === array[pos2 + 3];
    }
    function copyBytes(fromArray, fromPos, toArray, toPos, length) {
      var i;
      for (i = 0; i < length; i++) {
        toArray[toPos + i] = fromArray[fromPos + i];
      }
    }
    function emitLiteral(input, ip, len, output, op) {
      if (len <= 60) {
        output[op] = len - 1 << 2;
        op += 1;
      } else if (len < 256) {
        output[op] = 60 << 2;
        output[op + 1] = len - 1;
        op += 2;
      } else {
        output[op] = 61 << 2;
        output[op + 1] = len - 1 & 255;
        output[op + 2] = len - 1 >>> 8;
        op += 3;
      }
      copyBytes(input, ip, output, op, len);
      return op + len;
    }
    function emitCopyLessThan64(output, op, offset, len) {
      if (len < 12 && offset < 2048) {
        output[op] = 1 + (len - 4 << 2) + (offset >>> 8 << 5);
        output[op + 1] = offset & 255;
        return op + 2;
      } else {
        output[op] = 2 + (len - 1 << 2);
        output[op + 1] = offset & 255;
        output[op + 2] = offset >>> 8;
        return op + 3;
      }
    }
    function emitCopy(output, op, offset, len) {
      while (len >= 68) {
        op = emitCopyLessThan64(output, op, offset, 64);
        len -= 64;
      }
      if (len > 64) {
        op = emitCopyLessThan64(output, op, offset, 60);
        len -= 60;
      }
      return emitCopyLessThan64(output, op, offset, len);
    }
    function compressFragment(input, ip, inputSize, output, op) {
      var hashTableBits = 1;
      while (1 << hashTableBits <= inputSize && hashTableBits <= MAX_HASH_TABLE_BITS) {
        hashTableBits += 1;
      }
      hashTableBits -= 1;
      var hashFuncShift = 32 - hashTableBits;
      if (typeof globalHashTables[hashTableBits] === "undefined") {
        globalHashTables[hashTableBits] = new Uint16Array(1 << hashTableBits);
      }
      var hashTable = globalHashTables[hashTableBits];
      var i;
      for (i = 0; i < hashTable.length; i++) {
        hashTable[i] = 0;
      }
      var ipEnd = ip + inputSize;
      var ipLimit;
      var baseIp = ip;
      var nextEmit = ip;
      var hash, nextHash;
      var nextIp, candidate, skip;
      var bytesBetweenHashLookups;
      var base, matched, offset;
      var prevHash, curHash;
      var flag = true;
      var INPUT_MARGIN = 15;
      if (inputSize >= INPUT_MARGIN) {
        ipLimit = ipEnd - INPUT_MARGIN;
        ip += 1;
        nextHash = hashFunc(load32(input, ip), hashFuncShift);
        while (flag) {
          skip = 32;
          nextIp = ip;
          do {
            ip = nextIp;
            hash = nextHash;
            bytesBetweenHashLookups = skip >>> 5;
            skip += 1;
            nextIp = ip + bytesBetweenHashLookups;
            if (ip > ipLimit) {
              flag = false;
              break;
            }
            nextHash = hashFunc(load32(input, nextIp), hashFuncShift);
            candidate = baseIp + hashTable[hash];
            hashTable[hash] = ip - baseIp;
          } while (!equals32(input, ip, candidate));
          if (!flag) {
            break;
          }
          op = emitLiteral(input, nextEmit, ip - nextEmit, output, op);
          do {
            base = ip;
            matched = 4;
            while (ip + matched < ipEnd && input[ip + matched] === input[candidate + matched]) {
              matched += 1;
            }
            ip += matched;
            offset = base - candidate;
            op = emitCopy(output, op, offset, matched);
            nextEmit = ip;
            if (ip >= ipLimit) {
              flag = false;
              break;
            }
            prevHash = hashFunc(load32(input, ip - 1), hashFuncShift);
            hashTable[prevHash] = ip - 1 - baseIp;
            curHash = hashFunc(load32(input, ip), hashFuncShift);
            candidate = baseIp + hashTable[curHash];
            hashTable[curHash] = ip - baseIp;
          } while (equals32(input, ip, candidate));
          if (!flag) {
            break;
          }
          ip += 1;
          nextHash = hashFunc(load32(input, ip), hashFuncShift);
        }
      }
      if (nextEmit < ipEnd) {
        op = emitLiteral(input, nextEmit, ipEnd - nextEmit, output, op);
      }
      return op;
    }
    function putVarint(value, output, op) {
      do {
        output[op] = value & 127;
        value = value >>> 7;
        if (value > 0) {
          output[op] += 128;
        }
        op += 1;
      } while (value > 0);
      return op;
    }
    function SnappyCompressor(uncompressed) {
      this.array = uncompressed;
    }
    SnappyCompressor.prototype.maxCompressedLength = function() {
      var sourceLen = this.array.length;
      return 32 + sourceLen + Math.floor(sourceLen / 6);
    };
    SnappyCompressor.prototype.compressToBuffer = function(outBuffer) {
      var array = this.array;
      var length = array.length;
      var pos = 0;
      var outPos = 0;
      var fragmentSize;
      outPos = putVarint(length, outBuffer, outPos);
      while (pos < length) {
        fragmentSize = Math.min(length - pos, BLOCK_SIZE);
        outPos = compressFragment(array, pos, fragmentSize, outBuffer, outPos);
        pos += fragmentSize;
      }
      return outPos;
    };
    exports.SnappyCompressor = SnappyCompressor;
  }
});

// ../../../../../home/sid/repos/dotfiles-ai/node_modules/.pnpm/snappyjs@0.7.0/node_modules/snappyjs/index.js
var require_snappyjs = __commonJS({
  "../../../../../home/sid/repos/dotfiles-ai/node_modules/.pnpm/snappyjs@0.7.0/node_modules/snappyjs/index.js"(exports) {
    "use strict";
    function isNode() {
      if (typeof process === "object") {
        if (typeof process.versions === "object") {
          if (typeof process.versions.node !== "undefined") {
            return true;
          }
        }
      }
      return false;
    }
    function isUint8Array(object) {
      return object instanceof Uint8Array && (!isNode() || !Buffer.isBuffer(object));
    }
    function isArrayBuffer(object) {
      return object instanceof ArrayBuffer;
    }
    function isBuffer(object) {
      if (!isNode()) {
        return false;
      }
      return Buffer.isBuffer(object);
    }
    var SnappyDecompressor = require_snappy_decompressor().SnappyDecompressor;
    var SnappyCompressor = require_snappy_compressor().SnappyCompressor;
    var TYPE_ERROR_MSG = "Argument compressed must be type of ArrayBuffer, Buffer, or Uint8Array";
    function uncompress2(compressed, maxLength) {
      if (!isUint8Array(compressed) && !isArrayBuffer(compressed) && !isBuffer(compressed)) {
        throw new TypeError(TYPE_ERROR_MSG);
      }
      var uint8Mode = false;
      var arrayBufferMode = false;
      if (isUint8Array(compressed)) {
        uint8Mode = true;
      } else if (isArrayBuffer(compressed)) {
        arrayBufferMode = true;
        compressed = new Uint8Array(compressed);
      }
      var decompressor = new SnappyDecompressor(compressed);
      var length = decompressor.readUncompressedLength();
      if (length === -1) {
        throw new Error("Invalid Snappy bitstream");
      }
      if (length > maxLength) {
        throw new Error(`The uncompressed length of ${length} is too big, expect at most ${maxLength}`);
      }
      var uncompressed, uncompressedView;
      if (uint8Mode) {
        uncompressed = new Uint8Array(length);
        if (!decompressor.uncompressToBuffer(uncompressed)) {
          throw new Error("Invalid Snappy bitstream");
        }
      } else if (arrayBufferMode) {
        uncompressed = new ArrayBuffer(length);
        uncompressedView = new Uint8Array(uncompressed);
        if (!decompressor.uncompressToBuffer(uncompressedView)) {
          throw new Error("Invalid Snappy bitstream");
        }
      } else {
        uncompressed = Buffer.alloc(length);
        if (!decompressor.uncompressToBuffer(uncompressed)) {
          throw new Error("Invalid Snappy bitstream");
        }
      }
      return uncompressed;
    }
    function compress(uncompressed) {
      if (!isUint8Array(uncompressed) && !isArrayBuffer(uncompressed) && !isBuffer(uncompressed)) {
        throw new TypeError(TYPE_ERROR_MSG);
      }
      var uint8Mode = false;
      var arrayBufferMode = false;
      if (isUint8Array(uncompressed)) {
        uint8Mode = true;
      } else if (isArrayBuffer(uncompressed)) {
        arrayBufferMode = true;
        uncompressed = new Uint8Array(uncompressed);
      }
      var compressor = new SnappyCompressor(uncompressed);
      var maxLength = compressor.maxCompressedLength();
      var compressed, compressedView;
      var length;
      if (uint8Mode) {
        compressed = new Uint8Array(maxLength);
        length = compressor.compressToBuffer(compressed);
      } else if (arrayBufferMode) {
        compressed = new ArrayBuffer(maxLength);
        compressedView = new Uint8Array(compressed);
        length = compressor.compressToBuffer(compressedView);
      } else {
        compressed = Buffer.alloc(maxLength);
        length = compressor.compressToBuffer(compressed);
      }
      if (!compressed.slice) {
        var compressedArray = new Uint8Array(Array.prototype.slice.call(compressed, 0, length));
        if (uint8Mode) {
          return compressedArray;
        } else if (arrayBufferMode) {
          return compressedArray.buffer;
        } else {
          throw new Error("Not implemented");
        }
      }
      return compressed.slice(0, length);
    }
    exports.uncompress = uncompress2;
    exports.compress = compress;
  }
});

// plugins/subscriptions/src/index.ts
var import_snappyjs = __toESM(require_snappyjs(), 1);
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { execFile, execFileSync, spawn } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import z from "@deepseek-ai/schemastery";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";

// plugins/shared/http.ts
var DEFAULT_MAX_BODY_BYTES = 64 * 1024;
function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}
async function readBody(req, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  const declared = req.headers["content-length"];
  if (declared !== void 0 && Number(declared) > maxBytes) {
    throw new Error("request body too large");
  }
  const chunks = [];
  let received = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.byteLength;
    if (received > maxBytes) throw new Error("request body too large");
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("body is not valid JSON");
  }
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// plugins/subscriptions/src/opencode-console.ts
var OPENCODE_USD_SCALE = 1e8;
var OPENCODE_CONSOLE = "https://opencode.ai";
var OPENCODE_UA = "Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0";
function microCentsToUsd(value) {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return n / OPENCODE_USD_SCALE;
}
function parseConsoleOrgs(data) {
  if (!Array.isArray(data)) return null;
  for (const entry of data) {
    if (entry !== null && typeof entry === "object" && typeof entry.id === "string" && entry.id.length > 0) {
      return entry.id;
    }
  }
  return null;
}
function parseConsoleMeter(data) {
  if (data === null || typeof data !== "object") return null;
  const record = data;
  const used = microCentsToUsd(record.usedMicroCents);
  const cap = microCentsToUsd(record.limitMicroCents);
  if (used === null || cap === null) return null;
  const resetsAt = typeof record.resetsAt === "string" ? record.resetsAt : null;
  return {
    used,
    cap,
    percent: cap > 0 ? Math.max(0, Math.min(100, used / cap * 100)) : 0,
    resetsAt
  };
}
function parseGoStatus(data) {
  if (data === null || typeof data !== "object") return null;
  const access = data.access;
  if (access === null || typeof access !== "object") return null;
  const meters = access.meters;
  if (meters === null || typeof meters !== "object") return null;
  const record = meters;
  return {
    rolling: parseConsoleMeter(record.fiveHour),
    weekly: parseConsoleMeter(record.week),
    monthly: parseConsoleMeter(record.month)
  };
}
function parseBillingStatus(data) {
  if (data === null || typeof data !== "object") return null;
  const record = data;
  const balance = microCentsToUsd(record.balanceMicroCents);
  const available = microCentsToUsd(record.availableMicroCents);
  if (balance === null && available === null) return null;
  return { balance, available };
}
function shapeConsoleBalance(go, billing) {
  const meters = parseGoStatus(go);
  const money = parseBillingStatus(billing);
  const balance = money !== null ? money.available ?? money.balance : null;
  const monthlyUsage = meters?.monthly?.used ?? null;
  const monthlyLimit = meters?.monthly?.cap ?? null;
  const usage = meters ?? { rolling: null, weekly: null, monthly: null };
  if (balance === null && monthlyUsage === null) return null;
  return { balance, monthlyUsage, monthlyLimit, usage };
}
function consoleStatusIsStale(status) {
  return status === 401 || status === 403;
}
function buildConsoleCookie(auth, session) {
  if (typeof auth !== "string" || auth === "") return null;
  if (typeof session !== "string" || session === "") return null;
  return `auth=${auth}; __Host-console_session=${session}`;
}

// plugins/subscriptions/src/eh-session-model.ts
var EH_FIREFOX_COOKIE_HOST = "api.electronhub.ai";
var EH_FIREFOX_COOKIE_NAME = "refresh_token";
var EH_REFRESH_PATH = "/auth/refresh";
var EH_SESSION_ENDPOINT_PATHS = [
  "/v1/auth/subscription",
  "/v1/auth/permanent-credits/info",
  "/v1/flex-credits/info"
];
var EH_SESSION_NO_COOKIE = "no ElectronHub browser session in any Firefox profile \u2014 open app.electronhub.ai in Firefox and sign in, then fetch the session again";
var EH_SESSION_EXPIRED = "ElectronHub browser session expired \u2014 log in to ElectronHub in Firefox again, then fetch the session again";
function ehIniProfiles(text) {
  var out = [];
  var current = null;
  var lines = String(text).split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    var section = /^\[([^\]]+)\]$/.exec(line);
    if (section !== null) {
      current = { section: section[1], fields: {} };
      out.push(current);
      continue;
    }
    if (current === null) continue;
    var eq = line.indexOf("=");
    if (eq === -1) continue;
    current.fields[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}
function ehResolveFirefoxProfiles(iniText, homeDir) {
  var sections = ehIniProfiles(iniText);
  var base = String(homeDir).replace(/\/+$/, "") + "/.mozilla/firefox";
  var profiles = [];
  var installDefaults = [];
  for (var i = 0; i < sections.length; i++) {
    var s = sections[i];
    if (/^Profile\d+$/.test(s.section)) {
      var rawPath = s.fields.Path || "";
      if (rawPath === "") continue;
      var dir = s.fields.IsRelative === "0" ? rawPath : base + "/" + rawPath.replace(/^\/+/, "");
      profiles.push({ name: s.fields.Name || s.section, dir, def: s.fields.Default === "1" });
    } else if (/^Install/i.test(s.section)) {
      if (s.fields.Default) installDefaults.push(s.fields.Default);
    }
  }
  var ordered = [];
  var pushDir = function(dir2) {
    if (dir2 && ordered.indexOf(dir2) === -1) ordered.push(dir2);
  };
  var d;
  for (var a = 0; a < installDefaults.length; a++) {
    var inst = installDefaults[a];
    var abs = inst.indexOf("/") === -1 ? base + "/" + inst : inst;
    pushDir(abs);
  }
  for (var b = 0; b < profiles.length; b++) if (profiles[b].def) pushDir(profiles[b].dir);
  var rest = profiles.slice().sort(function(x, y) {
    return x.name < y.name ? -1 : x.name > y.name ? 1 : 0;
  });
  for (var c = 0; c < rest.length; c++) pushDir(rest[c].dir);
  return ordered;
}
function ehSessionCookieHeader(refreshValue) {
  return EH_FIREFOX_COOKIE_NAME + "=" + refreshValue;
}
function ehParseRefreshBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  var token = body.access_token;
  if (typeof token !== "string" || token === "") return null;
  var ttl = body.expires_in;
  return {
    accessToken: token,
    expiresIn: typeof ttl === "number" && Number.isFinite(ttl) && ttl > 0 ? ttl : null
  };
}
function ehParseRefreshSuccessor(setCookie) {
  var headers = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (var i = 0; i < headers.length; i++) {
    var header = headers[i];
    if (typeof header !== "string") continue;
    var semi = header.indexOf(";");
    var first = (semi === -1 ? header : header.slice(0, semi)).trim();
    var eq = first.indexOf("=");
    if (eq === -1) continue;
    var name2 = first.slice(0, eq).trim();
    var value = first.slice(eq + 1).trim();
    if (name2 === EH_FIREFOX_COOKIE_NAME && value !== "") return value;
  }
  return null;
}
function ehIsPlausibleTokenChars(value) {
  return typeof value === "string" && value !== "" && /^[A-Za-z0-9._~+/-]+=*$/.test(value);
}
function ehBase64UrlDecode(segment) {
  var padded = String(segment).replace(/-/g, "+").replace(/_/g, "/");
  var remainder = padded.length % 4;
  if (remainder === 2) padded += "==";
  else if (remainder === 3) padded += "=";
  else if (remainder !== 0) return null;
  try {
    if (typeof Buffer !== "undefined") return Buffer.from(padded, "base64").toString("utf8");
    if (typeof atob !== "undefined") {
      var binary = atob(padded);
      var out = "";
      for (var i = 0; i < binary.length; i++) {
        out += "%" + ("00" + binary.charCodeAt(i).toString(16)).slice(-2);
      }
      return decodeURIComponent(out);
    }
  } catch {
    return null;
  }
  return null;
}
function ehDecodeJwtPayload(token) {
  if (typeof token !== "string") return null;
  var segments = token.split(".");
  if (segments.length !== 3) return null;
  var text = ehBase64UrlDecode(segments[1]);
  if (text === null) return null;
  try {
    var claims = JSON.parse(text);
    return claims !== null && typeof claims === "object" && !Array.isArray(claims) ? claims : null;
  } catch {
    return null;
  }
}
function ehJwtSecondsLeft(claims, nowSec) {
  if (!claims || typeof claims !== "object") return null;
  var exp = claims.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  return exp - nowSec;
}
function ehJwtIsExpired(claims, nowSec) {
  var left = ehJwtSecondsLeft(claims, nowSec);
  if (left === null) return true;
  return left <= 0;
}
function ehNum(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
function ehStr(value) {
  return typeof value === "string" ? value : null;
}
function ehBool(value) {
  return typeof value === "boolean" ? value : null;
}
function ehParseSessionSubscription(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  var manage = data.manage !== null && typeof data.manage === "object" ? data.manage : {};
  return {
    tier: ehNum(data.tier),
    tier_label: ehStr(data.tier_label),
    active: ehBool(data.active),
    subscription_status: ehStr(data.subscription_status),
    cancel_at_period_end: ehBool(data.cancel_at_period_end),
    current_period_end: ehStr(data.current_period_end),
    payment_provider: ehStr(data.payment_provider),
    period: ehStr(data.period),
    premium_expiry: ehNum(data.premium_expiry),
    expires_in_days: ehNum(data.expires_in_days),
    amount: ehNum(data.amount),
    email: ehStr(data.email),
    email_verified: ehBool(data.email_verified),
    last_tier_change: ehNum(data.last_tier_change),
    manage: {
      method: ehStr(manage.method),
      has_portal: ehBool(manage.has_portal),
      can_cancel: ehBool(manage.can_cancel),
      portal_endpoint: ehStr(manage.portal_endpoint)
    }
  };
}
function ehParseSessionPermanentCredits(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  return {
    balance: ehNum(data.balance),
    enabled: ehBool(data.enabled),
    total_purchased_usd: ehNum(data.total_purchased_usd),
    current_bonus_percentage: ehNum(data.current_bonus_percentage),
    next_discount_threshold: ehNum(data.next_discount_threshold),
    rate_limit_scale_tier: ehNum(data.rate_limit_scale_tier),
    rate_limit_scale_name: ehStr(data.rate_limit_scale_name),
    rate_limit_scale_next: ehStr(data.rate_limit_scale_next),
    monthly_limit: ehNum(data.monthly_limit),
    monthly_spent: ehNum(data.monthly_spent),
    monthly_remaining: ehNum(data.monthly_remaining),
    monthly_reset: ehStr(data.monthly_reset)
  };
}
function ehParseSessionFlexCredits(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  return {
    flex_credits: ehNum(data.flex_credits),
    flex_credits_enabled: ehBool(data.flex_credits_enabled),
    weekly_save_limit: ehNum(data.weekly_save_limit),
    weekly_saved: ehNum(data.weekly_saved),
    weekly_save_remaining: ehNum(data.weekly_save_remaining),
    total_cap: ehNum(data.total_cap)
  };
}

// plugins/subscriptions/src/eh-ws.ts
var EH_WS_URLS = [
  "wss://api.electronhub.ai/v1/ws/auth",
  "wss://ws.electronhub.ai/v1/ws/auth"
];
var EH_WS_ERROR = 5;
var EH_WS_PING = 6;
var EH_WS_PONG = 7;
var EH_WS_DEVPASS_STATUS_REQ = 41;
var EH_WS_DEVPASS_STATUS_RES = 42;
var EH_WS_DEVPASS_ACTIVITY_REQ = 47;
var EH_WS_DEVPASS_ACTIVITY_RES = 48;
var EH_WS_MAX_FRAME = 1024 * 1024;
var EH_DEVPASS_ACTIVITY_DAYS = 14;
var ehTextEncoder = new TextEncoder();
var ehTextDecoder = new TextDecoder();
function ehWsEncode(type, payload) {
  var body = ehTextEncoder.encode(JSON.stringify(payload));
  var out = new Uint8Array(5 + body.length);
  out[0] = type & 255;
  out[1] = body.length >>> 24 & 255;
  out[2] = body.length >>> 16 & 255;
  out[3] = body.length >>> 8 & 255;
  out[4] = body.length & 255;
  out.set(body, 5);
  return out;
}
function ehWsReader() {
  var buffered = new Uint8Array(0);
  var join2 = function(chunk) {
    var next = new Uint8Array(buffered.length + chunk.length);
    next.set(buffered, 0);
    next.set(chunk, buffered.length);
    buffered = next;
    var frames = [];
    for (; ; ) {
      if (buffered.length < 5) return frames;
      var length = buffered[1] * 16777216 + buffered[2] * 65536 + buffered[3] * 256 + buffered[4];
      if (length > EH_WS_MAX_FRAME) throw new Error("electronhub ws frame exceeds 1MB cap");
      if (buffered.length < 5 + length) return frames;
      var text = ehTextDecoder.decode(buffered.slice(5, 5 + length));
      var payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error("electronhub ws frame is not JSON");
      }
      frames.push({ type: buffered[0], payload });
      buffered = buffered.slice(5 + length);
    }
  };
  return { push: join2 };
}
function wsNum(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
function wsStr(value) {
  return typeof value === "string" && value !== "" ? value : null;
}
function wsBool(value) {
  return typeof value === "boolean" ? value : null;
}
function ehDevpassPercent(used, limit) {
  if (used === null || limit === null || limit <= 0) return null;
  return Math.round(Math.min(100, used / limit * 100));
}
function ehParseDevpassStatus(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  var source = data;
  var todayTokens = wsNum(source.tokens_used_today);
  var dailyLimit = wsNum(source.daily_limit);
  var weekTokens = wsNum(source.tokens_week);
  var weeklyCap = wsNum(source.weekly_cap);
  return {
    subscribed: wsBool(source.subscribed),
    tier: wsStr(source.tier),
    status: wsStr(source.status),
    todayTokens,
    dailyLimit,
    todayPercent: ehDevpassPercent(todayTokens, dailyLimit),
    weekTokens,
    weeklyCap,
    weekPercent: ehDevpassPercent(weekTokens, weeklyCap),
    activeRequests: wsNum(source.active_requests),
    concurrencyLimit: wsNum(source.concurrency_limit),
    serviceMode: wsStr(source.service_mode),
    periodEnd: wsStr(source.period_end)
  };
}
function ehDevpassHasContent(status) {
  if (!status || typeof status !== "object") return false;
  var s = status;
  return s.subscribed != null || s.tier != null || s.status != null || s.todayTokens != null || s.dailyLimit != null || s.weekTokens != null || s.weeklyCap != null || s.activeRequests != null || s.concurrencyLimit != null || s.serviceMode != null;
}
function wsDayEntry(item) {
  if (item === null || typeof item !== "object") return null;
  var entry = item;
  if (typeof entry.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.day)) return null;
  return { day: entry.day, tokens: wsNum(entry.tokens) };
}
function utcDayString(nowMs, deltaDays) {
  return new Date(nowMs + deltaDays * 864e5).toISOString().slice(0, 10);
}
function ehParseDevpassActivity(data, nowMs = null) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  var now = typeof nowMs === "number" ? nowMs : Date.now();
  var days = [];
  var raw = data.days;
  if (Array.isArray(raw)) {
    for (var i = 0; i < raw.length; i++) {
      var entry = wsDayEntry(raw[i]);
      if (entry !== null) days.push(entry);
    }
  }
  var leavingDay = utcDayString(now, -7);
  var leavingTokens = null;
  for (var j = 0; j < days.length; j++) {
    if (days[j].day === leavingDay) {
      leavingTokens = days[j].tokens;
      break;
    }
  }
  return {
    days,
    weekStart: utcDayString(now, -6),
    leavingDay,
    leavingTokens
  };
}
function ehJwtCache(mint, opts = null) {
  var options = opts !== null && typeof opts === "object" ? opts : {};
  var marginSec = typeof options.refreshMarginSec === "number" ? options.refreshMarginSec : 300;
  var cooldownMs = typeof options.failCooldownMs === "number" ? options.failCooldownMs : 3e5;
  var defaultTtlSec = typeof options.defaultTtlSec === "number" ? options.defaultTtlSec : 3300;
  var nowFn = typeof options.now === "function" ? options.now : Date.now;
  var cached = null;
  var inFlight = null;
  var failedAt = 0;
  var lastError = null;
  var get = function() {
    var now = nowFn();
    if (cached !== null && cached.expMs - now >= marginSec * 1e3) {
      return Promise.resolve({ accessToken: cached.token, expiresIn: cached.ttl });
    }
    if (inFlight !== null) return inFlight;
    if (lastError !== null && now - failedAt < cooldownMs) return Promise.reject(lastError);
    inFlight = Promise.resolve().then(function() {
      return mint();
    }).then(function(minted) {
      var ttl = minted !== null && typeof minted === "object" && typeof minted.expiresIn === "number" && Number.isFinite(minted.expiresIn) && minted.expiresIn > 0 ? minted.expiresIn : defaultTtlSec;
      cached = { token: minted.accessToken, expMs: nowFn() + ttl * 1e3, ttl };
      lastError = null;
      return { accessToken: cached.token, expiresIn: ttl };
    }).catch(function(error) {
      failedAt = nowFn();
      lastError = error;
      throw error;
    }).finally(function() {
      inFlight = null;
    });
    return inFlight;
  };
  return { get };
}
async function ehWsDevpassFetch(jwt, opts = null) {
  var options = opts !== null && typeof opts === "object" ? opts : {};
  var urls = Array.isArray(options.urls) && options.urls.length > 0 ? options.urls : EH_WS_URLS;
  var timeoutMs = typeof options.timeoutMs === "number" && options.timeoutMs > 0 ? options.timeoutMs : 15e3;
  var Socket = typeof globalThis.WebSocket === "function" ? globalThis.WebSocket : null;
  if (Socket === null) throw new Error("electronhub ws fetch needs a global WebSocket");
  if (typeof jwt !== "string" || jwt === "") throw new Error("electronhub ws fetch needs a JWT");
  var lastError = null;
  for (var u = 0; u < urls.length; u++) {
    try {
      return await ehWsRoundTrip(Socket, urls[u], jwt, timeoutMs);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
function ehWsRoundTrip(Socket, url, jwt, timeoutMs) {
  return new Promise(function(resolve, reject) {
    var settled = false;
    var socket = null;
    var reader = ehWsReader();
    var statusPayload = null;
    var finish = function(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (socket !== null) socket.close();
      } catch {
      }
      if (error !== null) reject(error);
      else resolve(result);
    };
    var timer = setTimeout(function() {
      finish(new Error("electronhub ws fetch timed out"), null);
    }, timeoutMs);
    if (timer !== null && typeof timer.unref === "function") timer.unref();
    var send = function(type, payload) {
      socket.send(ehWsEncode(type, payload));
    };
    var connected = false;
    try {
      socket = new Socket(url);
    } catch (error) {
      finish(error, null);
      return;
    }
    socket.addEventListener("error", function() {
      if (!connected) finish(new Error("electronhub ws connect failed for " + url), null);
      else finish(new Error("electronhub ws socket error"), null);
    });
    socket.addEventListener("open", function() {
      connected = true;
      try {
        send(EH_WS_DEVPASS_STATUS_REQ, { access_token: jwt });
      } catch (error) {
        finish(error, null);
      }
    });
    socket.addEventListener("message", function(event) {
      try {
        if (typeof event.data === "string") return;
        var chunk = event.data instanceof Uint8Array ? event.data : new Uint8Array(event.data);
        var frames = reader.push(chunk);
        for (var i = 0; i < frames.length; i++) {
          var frame = frames[i];
          if (frame.type === EH_WS_PING) {
            send(EH_WS_PONG, frame.payload);
          } else if (frame.type === EH_WS_ERROR) {
            var detail = frame.payload !== null && typeof frame.payload === "object" ? JSON.stringify(frame.payload).slice(0, 200) : String(frame.payload).slice(0, 200);
            finish(new Error("electronhub ws error: " + detail), null);
          } else if (frame.type === EH_WS_DEVPASS_STATUS_RES && statusPayload === null) {
            statusPayload = frame.payload;
            send(EH_WS_DEVPASS_ACTIVITY_REQ, {
              access_token: jwt,
              days: EH_DEVPASS_ACTIVITY_DAYS
            });
          } else if (frame.type === EH_WS_DEVPASS_ACTIVITY_RES && statusPayload !== null) {
            finish(null, { status: statusPayload, activity: frame.payload });
          }
        }
      } catch (error) {
        finish(error, null);
      }
    });
  });
}

// plugins/subscriptions/src/eh-section-model.ts
var ELECTRONHUB_DEV_PREFIX = "ek-dev-";
var ELECTRONHUB_DEV_NOTE = "usage endpoints are unavailable to dev keys: the 2026-09-17 probe showed this key class answers HTTP 401 on /user/me and /user/models, so account usage is unreachable for it \u2014 the key is valid for inference only";
function ehIsDevKey(key) {
  return typeof key === "string" && key.slice(0, ELECTRONHUB_DEV_PREFIX.length) === ELECTRONHUB_DEV_PREFIX;
}
function ehCodingPlanName(source) {
  if (!source || typeof source !== "object") return null;
  var candidates = [source.subscription, source.tier, source.plan];
  if (source.subscription && typeof source.subscription === "object") {
    candidates = [source.subscription.tier, source.subscription.name].concat(candidates);
  }
  for (var i = 0; i < candidates.length; i++) {
    var value = candidates[i];
    if (typeof value === "string" && /coding/i.test(value)) return value;
  }
  return null;
}
function ehNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
function ehHistoryEntry(item) {
  if (item === null || typeof item !== "object") return null;
  const entry = item;
  if (typeof entry.date !== "string" || entry.date === "") return null;
  return { date: entry.date, requests: ehNumber(entry.requests) ?? 0 };
}
function ehFormatTimestamp(value) {
  if (value === null || value === void 0) return null;
  if (typeof value === "string" && value !== "") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  }
  const num = ehNumber(value);
  if (num === null) return null;
  const ms = Math.abs(num) >= 1e11 ? num : num * 1e3;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
function ehPercent(used, limit) {
  const u = ehNumber(used);
  const l = ehNumber(limit);
  if (u === null || l === null || l <= 0) return null;
  return Math.round(Math.min(100, u / l * 100));
}
function ehMonthlyBox(value) {
  if (value === null || typeof value !== "object") return null;
  const entry = value;
  const used = ehNumber(entry.used);
  const limit = ehNumber(entry.limit);
  if (used === null && limit === null && ehNumber(entry.remaining) === null) return null;
  return {
    used,
    limit,
    remaining: ehNumber(entry.remaining),
    reset: ehFormatTimestamp(entry.reset),
    percent: ehPercent(used, limit)
  };
}
function parseElectronHubUsage(data) {
  const source = data !== null && typeof data === "object" ? data : {};
  const usageSrc = source.usage !== null && typeof source.usage === "object" ? source.usage : {};
  const history = [];
  if (Array.isArray(source.history)) {
    for (const item of source.history) {
      const entry = ehHistoryEntry(item);
      if (entry !== null) history.push(entry);
    }
  }
  const endpoints = [];
  const endpointsSrc = source.endpoints !== null && typeof source.endpoints === "object" && !Array.isArray(source.endpoints) ? source.endpoints : {};
  for (const name2 of Object.keys(endpointsSrc)) {
    const value = endpointsSrc[name2];
    const requests = ehNumber(value) ?? (value === true ? 1 : 0);
    endpoints.push({ name: name2, requests });
  }
  const codingPlanName = ehCodingPlanName(source);
  let subscription = null;
  if (typeof source.subscription === "string" && source.subscription !== "") {
    subscription = source.subscription;
  } else if (source.subscription && typeof source.subscription === "object") {
    const named = [source.subscription.tier, source.subscription.name].find(
      (candidate) => typeof candidate === "string" && candidate !== ""
    );
    if (typeof named === "string") subscription = named;
  }
  if (subscription === null && typeof source.tier === "string" && source.tier !== "") {
    subscription = source.tier;
  }
  return {
    subscription,
    codingPlan: codingPlanName !== null,
    credits: ehNumber(source.credits),
    weeklyCredits: ehNumber(source.weekly_credits),
    studioCredits: ehNumber(source.studio_credits),
    usage: {
      inputTokens: ehNumber(usageSrc.input_tokens) ?? 0,
      outputTokens: ehNumber(usageSrc.output_tokens) ?? 0
    },
    monthly: {
      claude: ehMonthlyBox(source.claude_monthly_tokens),
      openai: ehMonthlyBox(source.openai_monthly_tokens)
    },
    history,
    endpoints
  };
}
function ehAccountModel(id, entry) {
  const src = entry !== null && typeof entry === "object" ? entry : {};
  return {
    id: String(id),
    requests: ehNumber(src.requests) ?? 0,
    inputTokens: ehNumber(src.input_tokens),
    outputTokens: ehNumber(src.output_tokens),
    totalCost: ehNumber(src.total_cost),
    ownedBy: typeof src.owned_by === "string" && src.owned_by !== "" ? src.owned_by : null
  };
}
function parseElectronHubAccountModels(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const source = data;
  const modelsSrc = source.models;
  if (modelsSrc === null || typeof modelsSrc !== "object" || Array.isArray(modelsSrc)) return null;
  const ids = Object.keys(modelsSrc);
  if (ids.length === 0) return null;
  const entries = ids.map((id) => ehAccountModel(id, modelsSrc[id]));
  entries.sort((a, b) => b.requests - a.requests);
  return {
    entries,
    totalConsumption: ehNumber(source.total_consumption),
    lastUpdated: ehFormatTimestamp(source.last_updated)
  };
}
function parseElectronHubModels(data) {
  let items = data;
  if (items !== null && typeof items === "object" && !Array.isArray(items)) {
    const wrapper = items;
    if (Array.isArray(wrapper.data)) items = wrapper.data;
    else if (Array.isArray(wrapper.models)) items = wrapper.models;
    else return [];
  }
  if (!Array.isArray(items)) return [];
  const models = [];
  for (const item of items) {
    if (typeof item === "string") {
      if (item !== "") models.push(item);
      continue;
    }
    if (item === null || typeof item !== "object") continue;
    const entry = item;
    const name2 = [entry.id, entry.name, entry.slug, entry.model].find(
      (candidate) => typeof candidate === "string" && candidate !== ""
    );
    if (typeof name2 === "string") models.push(name2);
  }
  return models;
}

// plugins/subscriptions/src/index.ts
var name = "subscriptions";
var inject = ["webServer", "credentials"];
var Config = z.object({
  providers: z.dict(z.boolean()).default({})
});
var CONFIG_NS = settingsNamespace("subscriptions");
function service(ctx, name2) {
  return ctx.get(name2);
}
var USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
var BALANCE_CACHE_MS = 3e4;
var MERIDIAN_TIMEOUT_MS = 1e4;
var OPENCODE_TIMEOUT_MS = 15e3;
function cachedOnce(fn, ttlMs) {
  let cache = null;
  return (...args) => {
    const now = Date.now();
    const key = JSON.stringify(args);
    if (cache !== null && now - cache.at < ttlMs && cache.key === key) return cache.promise;
    const promise = Promise.resolve().then(() => fn(...args));
    cache = { at: now, promise, key };
    promise.catch(() => {
      if (cache?.promise === promise) cache = null;
    });
    return promise;
  };
}
function loginWindowHandler(url) {
  return async (_req, res) => {
    try {
      const child = spawn("firefox", ["--new-window", url], {
        detached: true,
        stdio: "ignore"
      });
      child.unref();
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  };
}
function consoleHeaders(cookie, orgId) {
  const headers = {
    cookie,
    "user-agent": OPENCODE_UA,
    origin: OPENCODE_CONSOLE,
    referer: `${OPENCODE_CONSOLE}/console`,
    accept: "application/json"
  };
  if (orgId !== null && orgId !== void 0) headers["x-org-id"] = orgId;
  return headers;
}
async function fetchConsoleJson(path, cookie, orgId) {
  const res = await fetch(`${OPENCODE_CONSOLE}${path}`, {
    headers: consoleHeaders(cookie, orgId),
    signal: AbortSignal.timeout(OPENCODE_TIMEOUT_MS)
  });
  if (consoleStatusIsStale(res.status)) throw new Error("opencode session stale");
  if (!res.ok) throw new Error(`opencode HTTP ${res.status}`);
  return res.json();
}
async function validateConsoleSession(cookie) {
  await fetchConsoleJson("/console/auth/session", cookie, null);
}
async function resolveConsoleOrgId(cookie) {
  const id = parseConsoleOrgs(await fetchConsoleJson("/console/api/orgs", cookie, null));
  if (id === null) throw new Error("no org id");
  return id;
}
async function fetchConsoleBalance(cookie) {
  const orgId = await resolveConsoleOrgId(cookie);
  const [go, billing] = await Promise.all([
    fetchConsoleJson("/console/api/go/status", cookie, orgId),
    fetchConsoleJson("/console/api/billing/status", cookie, orgId)
  ]);
  const shaped = shapeConsoleBalance(go, billing);
  if (shaped === null) throw new Error("parse failed");
  return shaped;
}
function unwrapData(json) {
  if (json !== null && typeof json === "object" && !Array.isArray(json) && "data" in json)
    return json.data;
  return json;
}
function commandCodeStatusError(status) {
  if (status === 401 || status === 403) return "Command Code API key invalid or expired";
  if (status === 408 || status === 429) return "Command Code API rate limited; will retry";
  return `Command Code API HTTP ${status}`;
}
async function commandCodeGet(key, base, path, orgId) {
  const sep = path.includes("?") ? "&" : "?";
  const url = orgId === null || orgId === void 0 ? `${base}${path}` : `${base}${path}${sep}orgId=${encodeURIComponent(orgId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(OPENCODE_TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(commandCodeStatusError(res.status));
  return unwrapData(await res.json());
}
function parseCommandCodeCredits(json) {
  const data = unwrapData(json);
  const credits = data !== null && typeof data === "object" ? data.credits || {} : {};
  const windows = data !== null && typeof data === "object" ? data.windowLimits || {} : {};
  const fiveHour = windows.fiveHour || {};
  const weekly = windows.weekly || {};
  return {
    credits: {
      monthly: credits.monthlyCredits ?? null,
      purchased: credits.purchasedCredits ?? null,
      free: credits.freeCredits ?? null
    },
    windows: {
      fiveHour: {
        used: fiveHour.used ?? null,
        cap: fiveHour.cap ?? null,
        resetAt: fiveHour.resetAt ?? null
      },
      weekly: {
        used: weekly.used ?? null,
        cap: weekly.cap ?? null,
        resetAt: weekly.resetAt ?? null
      }
    }
  };
}
function parseCommandCodeUsage(subJson, usageJson) {
  const sub = unwrapData(subJson);
  const usage = unwrapData(usageJson);
  const out = {};
  if (sub !== null && typeof sub === "object") {
    if (typeof sub.planId === "string") out.plan = sub.planId;
    if (typeof sub.currentPeriodStart === "string") out.periodStart = sub.currentPeriodStart;
    if (typeof sub.currentPeriodEnd === "string") out.periodEnd = sub.currentPeriodEnd;
  }
  if (usage !== null && typeof usage === "object" && typeof usage.totalCost === "number") {
    out.totalCost = usage.totalCost;
  }
  return out;
}
var ZAI_MONITOR_BASE = "https://api.z.ai";
var ZAI_TIMEOUT_MS = 15e3;
var ELECTRONHUB_API_BASE = "https://api.electronhub.ai/v1";
var ELECTRONHUB_TIMEOUT_MS = 15e3;
var ELECTRONHUB_USAGE_CACHE_MS = 6e4;
var ELECTRONHUB_MODELS_CACHE_MS = 3e5;
var ELECTRONHUB_KEY_NAMES = ["ELECTRONHUB_API_KEY", "ELECTRONHUB_DEVPASS_API_KEY"];
var ELECTRONHUB_KEY_MISSING = `${ELECTRONHUB_KEY_NAMES.join(" or ")} credential not configured`;
function parseZaiQuota(data) {
  const source = data !== null && typeof data === "object" ? data : {};
  const limits = Array.isArray(source.limits) ? source.limits : [];
  const level = typeof source.level === "string" ? source.level : null;
  const toWindow = (entry) => {
    const used = Number(entry.currentValue) || 0;
    const cap = Number(entry.usage) || 0;
    const percent = typeof entry.percentage === "number" ? entry.percentage : cap > 0 ? used / cap * 100 : 0;
    return {
      used,
      cap,
      percent: Math.max(0, Math.min(100, percent)),
      resetsAt: typeof entry.nextResetTime === "number" ? entry.nextResetTime : null
    };
  };
  let fiveHour = null;
  let weekly = null;
  for (const item of limits) {
    if (item === null || typeof item !== "object") continue;
    const entry = item;
    if (entry.unit === 3 && fiveHour === null) fiveHour = toWindow(entry);
    if (entry.unit === 6 && weekly === null) weekly = toWindow(entry);
  }
  return { level, fiveHour, weekly };
}
function zaiTimestamp(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${day} ${time}`;
}
function parseZaiUsage(data) {
  const source = data !== null && typeof data === "object" ? data : {};
  const totals = source.totalUsage !== null && typeof source.totalUsage === "object" ? source.totalUsage : {};
  const modelSummary = [];
  const items = Array.isArray(source.modelSummaryList) ? source.modelSummaryList : [];
  for (const item of items) {
    if (item === null || typeof item !== "object") continue;
    const entry = item;
    const model = typeof entry.modelCode === "string" ? entry.modelCode : typeof entry.model === "string" ? entry.model : "?";
    const calls = Number(entry.modelCallCount ?? entry.calls ?? 0) || 0;
    const tokens = Number(entry.modelTokensUsage ?? entry.tokens ?? 0) || 0;
    if (calls === 0 && tokens === 0) continue;
    modelSummary.push({ model, calls, tokens });
  }
  return {
    totalCalls: Number(totals.totalModelCallCount) || 0,
    totalTokens: Number(totals.totalTokensUsage) || 0,
    modelSummary
  };
}
async function zaiMonitorGet(path, key) {
  const res = await fetch(`${ZAI_MONITOR_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(ZAI_TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`zai monitor HTTP ${res.status}`);
  const body = await res.json();
  if (body === null || typeof body !== "object" || body.success !== true) {
    const envelope = body;
    throw new Error(
      `zai monitor error ${envelope && typeof envelope.code !== "undefined" ? envelope.code : "?"}: ${envelope && typeof envelope.msg === "string" ? envelope.msg : "malformed envelope"}`
    );
  }
  return body.data;
}
function apply(ctx, config) {
  const credentials = ctx.get("credentials");
  installSettingsSection(ctx, CONFIG_NS, Config, config ?? {}, {
    setSource: () => {
    },
    onChange: () => {
    }
  });
  const meridianProxies = [
    // quota, all profiles
    {
      route: "/subscriptions/meridian-quota",
      upstream: "http://localhost:9000/v1/usage/quota/all",
      label: "quota",
      ttl: 3e4
    },
    // telemetry summary
    {
      route: "/subscriptions/meridian-telemetry",
      upstream: "http://localhost:9000/telemetry/summary?window=86400000",
      label: "telemetry",
      ttl: 6e4
    },
    // quota, single profile with enriched buckets
    {
      route: "/subscriptions/meridian-quota-single",
      upstream: "http://localhost:9000/v1/usage/quota",
      label: "quota",
      ttl: 3e4
    },
    // telemetry, recent requests
    {
      route: "/subscriptions/meridian-telemetry-requests",
      upstream: "http://localhost:9000/telemetry/requests?limit=20",
      label: "requests",
      ttl: 6e4
    },
    // meridian recent logs
    {
      route: "/subscriptions/meridian-logs",
      upstream: "http://localhost:9000/telemetry/logs?limit=10",
      label: "logs",
      ttl: 15e3
    },
    // meridian health / auth
    {
      route: "/subscriptions/meridian-health",
      upstream: "http://localhost:9000/health",
      label: "health",
      ttl: 6e4
    }
  ];
  for (const proxy of meridianProxies) {
    const once = cachedOnce(async () => {
      const res = await fetch(proxy.upstream, {
        signal: AbortSignal.timeout(MERIDIAN_TIMEOUT_MS)
      });
      if (!res.ok) throw new Error(`meridian ${proxy.label} HTTP ${res.status}`);
      return res.json();
    }, proxy.ttl);
    ctx.webServer.register({
      kind: "exact",
      path: proxy.route,
      handler: async (_req, res) => {
        try {
          sendJson(res, 200, await once());
        } catch (error) {
          sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
        }
      }
    });
  }
  let balanceCache = null;
  const cachedBalance = (cookie) => {
    const now = Date.now();
    if (balanceCache !== null && now - balanceCache.at < BALANCE_CACHE_MS && balanceCache.cookie === cookie)
      return balanceCache.promise;
    const promise = (async () => fetchConsoleBalance(cookie))();
    balanceCache = { at: now, promise, cookie };
    promise.catch(() => {
      if (balanceCache?.promise === promise) balanceCache = null;
    });
    return promise;
  };
  const handleBalance = async (_req, res) => {
    let cookie = null;
    try {
      const hit = credentials === void 0 ? null : await credentials.resolve("OPENCODE_SESSION_COOKIE");
      cookie = hit?.value ?? null;
    } catch {
      cookie = null;
    }
    if (cookie === null || cookie === "") {
      sendJson(res, 200, { error: "OPENCODE_SESSION_COOKIE credential not configured" });
      return;
    }
    try {
      const data = await cachedBalance(cookie);
      sendJson(res, 200, {
        ok: true,
        balance: data.balance,
        monthlyUsage: data.monthlyUsage,
        monthlyLimit: data.monthlyLimit,
        currency: "USD",
        usage: data.usage
      });
    } catch {
      sendJson(res, 200, { ok: false, error: "cookie invalid or expired" });
    }
  };
  const handleOzBalance = handleBalance;
  const goUsageOnce = cachedOnce(async () => {
    const key = credentials === void 0 ? null : (await credentials.resolve("OPENCODE_GO_API_KEY"))?.value;
    if (!key) throw new Error("OPENCODE_GO_API_KEY credential not configured");
    const res = await fetch("https://opencode.ai/zen/go/v1/usage", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(OPENCODE_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`go usage HTTP ${res.status}`);
    return res.json();
  }, 3e4);
  const handleGoUsage = async (_req, res) => {
    try {
      sendJson(res, 200, await goUsageOnce());
    } catch (error) {
      sendJson(res, 200, { error: error instanceof Error ? error.message : String(error) });
    }
  };
  const dsBalanceOnce = cachedOnce(async () => {
    const key = credentials === void 0 ? null : (await credentials.resolve("DEEPSEEK_API_KEY"))?.value;
    if (!key) throw new Error("DEEPSEEK_API_KEY credential not configured");
    const res = await fetch("https://api.deepseek.com/user/balance", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(OPENCODE_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`deepseek balance HTTP ${res.status}`);
    return res.json();
  }, 3e4);
  const handleDsBalance = async (_req, res) => {
    try {
      sendJson(res, 200, await dsBalanceOnce());
    } catch (error) {
      sendJson(res, 200, { error: error instanceof Error ? error.message : String(error) });
    }
  };
  const DS_PLATFORM_BASE = "https://platform.deepseek.com/api/v0";
  const dsUsageAmountOnce = cachedOnce(async (token, month, year) => {
    const res = await fetch(`${DS_PLATFORM_BASE}/usage/amount?month=${month}&year=${year}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(OPENCODE_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`deepseek usage amount HTTP ${res.status}`);
    return res.json();
  }, 6e4);
  const dsUsageCostOnce = cachedOnce(async (token, month, year) => {
    const res = await fetch(`${DS_PLATFORM_BASE}/usage/cost?month=${month}&year=${year}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(OPENCODE_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`deepseek usage cost HTTP ${res.status}`);
    return res.json();
  }, 6e4);
  const handleDsUsageAmount = async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost`);
      const month = url.searchParams.get("month");
      const year = url.searchParams.get("year");
      if (!month || !year) {
        sendJson(res, 400, { error: "month and year query params required" });
        return;
      }
      const token = credentials === void 0 ? null : (await credentials.resolve("DEEPSEEK_PLATFORM_TOKEN"))?.value;
      if (!token) {
        sendJson(res, 200, {
          error: "DEEPSEEK_PLATFORM_TOKEN not configured; sign in to platform.deepseek.com"
        });
        return;
      }
      const raw = await dsUsageAmountOnce(token, month, year);
      const biz = raw?.data?.biz_data || {};
      const total = Array.isArray(biz.total) ? biz.total : [];
      const transformed = total.map((m) => {
        const usage = Array.isArray(m.usage) ? m.usage : [];
        let input = 0, output = 0, cacheRead = 0, cacheWrite = 0;
        for (const item of usage) {
          const n = Number(item.amount) || 0;
          switch (item.type) {
            case "PROMPT_CACHE_HIT_TOKEN":
              cacheRead += n;
              break;
            case "PROMPT_CACHE_MISS_TOKEN":
              input += n;
              break;
            case "RESPONSE_TOKEN":
              output += n;
              break;
            case "PROMPT_TOKEN":
              break;
          }
        }
        return {
          model: m.model || "(unknown)",
          input_tokens: input,
          output_tokens: output,
          cache_read_tokens: cacheRead,
          cache_write_tokens: cacheWrite
        };
      });
      sendJson(res, 200, transformed);
    } catch (error) {
      sendJson(res, 200, { error: error instanceof Error ? error.message : String(error) });
    }
  };
  const handleDsUsageCost = async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost`);
      const month = url.searchParams.get("month");
      const year = url.searchParams.get("year");
      if (!month || !year) {
        sendJson(res, 400, { error: "month and year query params required" });
        return;
      }
      const token = credentials === void 0 ? null : (await credentials.resolve("DEEPSEEK_PLATFORM_TOKEN"))?.value;
      if (!token) {
        sendJson(res, 200, {
          error: "DEEPSEEK_PLATFORM_TOKEN not configured; sign in to platform.deepseek.com"
        });
        return;
      }
      const raw = await dsUsageCostOnce(token, month, year);
      const bizRaw = raw?.data?.biz_data;
      const biz = Array.isArray(bizRaw) ? bizRaw[0] || {} : bizRaw || {};
      const total = Array.isArray(biz.total) ? biz.total : [];
      const transformed = total.map((m) => {
        const usage = Array.isArray(m.usage) ? m.usage : [];
        let cost = 0;
        for (const item of usage) {
          if (item.type !== "REQUEST") cost += Number(item.amount) || 0;
        }
        return { model: m.model || "(unknown)", cost };
      }).filter((m) => m.cost > 0);
      sendJson(res, 200, transformed);
    } catch (error) {
      sendJson(res, 200, { error: error instanceof Error ? error.message : String(error) });
    }
  };
  const resolveZaiKey = async () => credentials === void 0 ? null : (await credentials.resolve("ZAI_API_KEY"))?.value;
  const zaiQuotaOnce = cachedOnce(
    async (key) => parseZaiQuota(await zaiMonitorGet("/api/monitor/usage/quota/limit", key)),
    3e4
  );
  const zaiUsageOnce = cachedOnce(async (key) => {
    const end = /* @__PURE__ */ new Date();
    const start = new Date(end.getTime() - 7 * 24 * 3600 * 1e3);
    const query = `startTime=${encodeURIComponent(
      zaiTimestamp(start)
    )}&endTime=${encodeURIComponent(zaiTimestamp(end))}`;
    return parseZaiUsage(await zaiMonitorGet(`/api/monitor/usage/model-usage?${query}`, key));
  }, 6e4);
  const handleZaiQuota = async (_req, res) => {
    try {
      const key = await resolveZaiKey();
      if (!key) {
        sendJson(res, 200, { ok: false, error: "ZAI_API_KEY credential not configured" });
        return;
      }
      sendJson(res, 200, { ok: true, ...await zaiQuotaOnce(key) });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
  const handleZaiUsage = async (_req, res) => {
    try {
      const key = await resolveZaiKey();
      if (!key) {
        sendJson(res, 200, { ok: false, error: "ZAI_API_KEY credential not configured" });
        return;
      }
      sendJson(res, 200, { ok: true, ...await zaiUsageOnce(key) });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
  const resolveElectronHubKey = async () => {
    if (credentials === void 0) return null;
    for (const name2 of ELECTRONHUB_KEY_NAMES) {
      try {
        const value = (await credentials.resolve(name2))?.value;
        if (typeof value === "string" && value !== "") return value;
      } catch (error) {
        ctx.logger.warn(
          `electronhub credential "${name2}" failed to resolve: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    return null;
  };
  const electronhubGet = (path, key) => fetch(`${ELECTRONHUB_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(ELECTRONHUB_TIMEOUT_MS)
  });
  const electronhubUsageOnce = cachedOnce(async (key) => {
    if (ehIsDevKey(key)) {
      try {
        return {
          ...parseElectronHubUsage(null),
          devKey: true,
          devpass: await devpassUsageOnce()
        };
      } catch (error) {
        if (error instanceof Error && error.message === EH_SESSION_NO_COOKIE) {
          return { ...parseElectronHubUsage(null), devKey: true, note: ELECTRONHUB_DEV_NOTE };
        }
        throw error;
      }
    }
    const res = await electronhubGet("/user/me", key);
    if (res.status === 403) {
      return {
        ...parseElectronHubUsage(null),
        note: "account usage is not available for this API key (HTTP 403)"
      };
    }
    if (res.status === 401) {
      return {
        ...parseElectronHubUsage(null),
        unverified: true,
        note: "this API key could not be verified (HTTP 401 on /user/me) \u2014 it may be capability-limited or invalid; any model list below is the PUBLIC catalog, which answers without a key"
      };
    }
    if (!res.ok) throw new Error(`electronhub usage HTTP ${res.status}`);
    return parseElectronHubUsage(await res.json());
  }, ELECTRONHUB_USAGE_CACHE_MS);
  const electronhubModelsOnce = cachedOnce(async (key) => {
    if (ehIsDevKey(key)) {
      const res = await fetch(`${ELECTRONHUB_API_BASE}/models`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(ELECTRONHUB_TIMEOUT_MS)
      });
      if (!res.ok) {
        throw new Error(
          `electronhub models unavailable: public catalog HTTP ${res.status} (dev key cannot request account usage)`
        );
      }
      return { models: parseElectronHubModels(await res.json()), source: "catalog" };
    }
    const attempt = async (path) => {
      const res = await electronhubGet(path, key);
      if (!res.ok) return { ok: false, status: res.status, models: [], body: null };
      const body = await res.json();
      return {
        ok: true,
        status: res.status,
        models: parseElectronHubModels(body),
        body
      };
    };
    const scoped = await attempt("/user/models");
    const scopedAccount = scoped.ok === true ? parseElectronHubAccountModels(scoped.body) : null;
    if (scoped.ok === true && (scoped.models.length > 0 || scopedAccount !== null)) {
      const names = scoped.models.length > 0 ? scoped.models : scopedAccount.entries.map((entry) => entry.id);
      const result = { models: names, source: "account" };
      if (scopedAccount !== null) {
        return {
          ...result,
          accountUsage: scopedAccount.entries,
          totalConsumption: scopedAccount.totalConsumption,
          lastUpdated: scopedAccount.lastUpdated
        };
      }
      return result;
    }
    const catalog = await attempt("/models");
    if (catalog.ok === true) return { models: catalog.models, source: "catalog" };
    if (scoped.ok === true) return { models: scoped.models, source: "account" };
    throw new Error(
      `electronhub models unavailable: /user/models HTTP ${scoped.status}, /models HTTP ${catalog.status}`
    );
  }, ELECTRONHUB_MODELS_CACHE_MS);
  const handleElectronhubUsage = async (_req, res) => {
    try {
      const key = await resolveElectronHubKey();
      if (!key) {
        try {
          sendJson(res, 200, {
            ok: true,
            ...parseElectronHubUsage(null),
            devpass: await devpassUsageOnce()
          });
          return;
        } catch (error) {
          if (!(error instanceof Error && error.message === EH_SESSION_NO_COOKIE)) throw error;
        }
        sendJson(res, 200, { ok: false, error: ELECTRONHUB_KEY_MISSING });
        return;
      }
      sendJson(res, 200, { ok: true, ...await electronhubUsageOnce(key) });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
  const handleElectronhubModels = async (_req, res) => {
    try {
      const key = await resolveElectronHubKey();
      if (!key) {
        const catalog = await fetch(`${ELECTRONHUB_API_BASE}/models`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(ELECTRONHUB_TIMEOUT_MS)
        });
        if (!catalog.ok) {
          throw new Error(
            `electronhub models unavailable: public catalog HTTP ${catalog.status} (no API key configured)`
          );
        }
        sendJson(res, 200, {
          ok: true,
          models: parseElectronHubModels(await catalog.json()),
          source: "catalog",
          note: "no ELECTRONHUB_API_KEY or ELECTRONHUB_DEVPASS_API_KEY configured \u2014 showing the public model catalog"
        });
        return;
      }
      sendJson(res, 200, { ok: true, ...await electronhubModelsOnce(key) });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
  const firefoxProfileDirs = () => {
    const root = join(homedir(), ".mozilla", "firefox");
    if (!existsSync(root)) return [];
    try {
      return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => join(root, entry.name));
    } catch {
      return [];
    }
  };
  const firefoxDeepSeekProfileDirs = firefoxProfileDirs;
  async function sqliteSnapshotAndQuery(dbPath, sql, timeoutMs = 1e4) {
    const scratch = mkdtempSync(join(tmpdir(), "ff-sqlite-"));
    const dest = join(scratch, "data.sqlite");
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try {
        rmSync(scratch, { recursive: true, force: true });
      } catch {
      }
    };
    try {
      execFileSync("sqlite3", [`file:${dbPath}?mode=ro&immutable=1`, ".backup " + dest], {
        timeout: 15e3,
        killSignal: "SIGKILL"
      });
    } catch {
      cleanup();
      return null;
    }
    return new Promise((resolve) => {
      execFile(
        "sqlite3",
        ["-readonly", "-noheader", dest, sql],
        { timeout: timeoutMs },
        (error, stdout) => {
          try {
            if (error) return resolve(null);
            const raw = String(stdout).trim();
            if (!raw) return resolve(null);
            resolve(raw);
          } finally {
            cleanup();
          }
        }
      );
    });
  }
  const readDeepSeekToken = async (profileDir) => {
    const storeDir = join(profileDir, "storage", "default", "https+++platform.deepseek.com", "ls");
    const dbPath = join(storeDir, "data.sqlite");
    if (!existsSync(dbPath)) return null;
    const sql = "SELECT hex(value), compression_type FROM data WHERE key = 'userToken' LIMIT 1";
    const raw = await sqliteSnapshotAndQuery(dbPath, sql);
    if (raw === null) return null;
    const [hex, compressionType] = String(raw).split("|");
    if (compressionType !== "0" && compressionType !== "1") return null;
    let token;
    try {
      token = compressionType === "1" ? (0, import_snappyjs.uncompress)(Buffer.from(hex, "hex")).toString("utf8") : Buffer.from(hex, "hex").toString("utf8");
    } catch {
      return null;
    }
    try {
      const parsed = JSON.parse(token);
      if (parsed !== null && typeof parsed === "object" && typeof parsed.value === "string")
        token = parsed.value;
    } catch {
    }
    return token;
  };
  const extractDeepSeekToken = async () => {
    for (const dir of firefoxDeepSeekProfileDirs()) {
      if (!existsSync(
        join(dir, "storage", "default", "https+++platform.deepseek.com", "ls", "data.sqlite")
      ))
        continue;
      const token = await readDeepSeekToken(dir);
      if (token === null) continue;
      return { token };
    }
    return null;
  };
  const handleDeepSeekTokenExtract = async (_req, res) => {
    const found = await extractDeepSeekToken();
    if (found === null) {
      sendJson(res, 200, {
        ok: false,
        error: "no platform.deepseek.com session found in any Firefox profile"
      });
      return;
    }
    try {
      if (credentials !== void 0) await credentials.set("DEEPSEEK_PLATFORM_TOKEN", found.token);
      ctx.logger.info("wrote DEEPSEEK_PLATFORM_TOKEN credential");
      sendJson(res, 200, { ok: true, saved: true });
    } catch (error) {
      ctx.logger.warn("failed to write DEEPSEEK_PLATFORM_TOKEN credential");
      sendJson(res, 200, {
        ok: false,
        error: "token valid but save failed: " + (error instanceof Error ? error.message : String(error))
      });
    }
  };
  const handleDeepSeekTokenLogin = loginWindowHandler("https://platform.deepseek.com");
  const readCookieString = async (dbDir) => {
    const src = join(dbDir, "cookies.sqlite");
    if (!existsSync(src)) return null;
    const sql = "SELECT name || char(9) || value FROM moz_cookies WHERE host = 'opencode.ai' AND name IN ('auth', '__Host-console_session')";
    const raw = await sqliteWalValue(src, sql);
    if (raw === null) return null;
    const jar = {};
    for (const line of String(raw).split("\n")) {
      const tab = String(line).indexOf("	");
      if (tab === -1) continue;
      jar[String(line).slice(0, tab)] = String(line).slice(tab + 1);
    }
    return buildConsoleCookie(jar.auth, jar["__Host-console_session"]);
  };
  const extractCookie = async () => {
    for (const dir of firefoxProfileDirs()) {
      if (!existsSync(join(dir, "cookies.sqlite"))) continue;
      const cookieString = await readCookieString(dir);
      if (cookieString === null) continue;
      try {
        await validateConsoleSession(cookieString);
        return { cookie: cookieString };
      } catch {
        return { cookie: cookieString, stale: true };
      }
    }
    return null;
  };
  const handleCookieExtract = async (_req, res) => {
    const found = await extractCookie();
    if (found === null) {
      sendJson(res, 200, {
        ok: false,
        error: "no opencode.ai session cookie found in any Firefox profile"
      });
      return;
    }
    if (found.stale) {
      sendJson(res, 200, {
        ok: false,
        invalid: true,
        error: "firefox cookie is stale; sign in and retry"
      });
      return;
    }
    try {
      if (credentials !== void 0) await credentials.set("OPENCODE_SESSION_COOKIE", found.cookie);
      ctx.logger.info("wrote OPENCODE_SESSION_COOKIE credential");
      sendJson(res, 200, { ok: true, saved: true });
    } catch (error) {
      ctx.logger.warn("failed to write OPENCODE_SESSION_COOKIE credential");
      sendJson(res, 200, {
        ok: false,
        error: "cookie valid but save failed: " + (error instanceof Error ? error.message : String(error))
      });
    }
  };
  const handleCookieLogin = loginWindowHandler("https://opencode.ai");
  const firefoxElectronHubProfileDirs = () => {
    try {
      const iniPath = join(homedir(), ".mozilla", "firefox", "profiles.ini");
      if (existsSync(iniPath)) {
        const ordered = ehResolveFirefoxProfiles(readFileSync(iniPath, "utf8"), homedir());
        if (ordered.length > 0) return ordered;
      }
    } catch {
    }
    return firefoxProfileDirs();
  };
  const sqliteWalValue = async (dbPath, sql, timeoutMs = 1e4) => {
    const scratch = mkdtempSync(join(tmpdir(), "ff-cookie-"));
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try {
        rmSync(scratch, { recursive: true, force: true });
      } catch {
      }
    };
    try {
      copyFileSync(dbPath, join(scratch, "cookies.sqlite"));
      for (const ext of ["-wal", "-shm"]) {
        const peer = dbPath + ext;
        if (existsSync(peer)) copyFileSync(peer, join(scratch, "cookies.sqlite" + ext));
      }
    } catch {
      cleanup();
      return null;
    }
    return new Promise((resolve) => {
      execFile(
        "sqlite3",
        ["-readonly", "-noheader", join(scratch, "cookies.sqlite"), sql],
        { timeout: timeoutMs },
        (error, stdout) => {
          try {
            if (error) return resolve(null);
            const raw = String(stdout).replace(/\r?\n$/, "");
            return resolve(raw === "" ? null : raw);
          } finally {
            cleanup();
          }
        }
      );
    });
  };
  const readElectronHubRefreshCookie = async (profileDir) => {
    const dbPath = join(profileDir, "cookies.sqlite");
    if (!existsSync(dbPath)) return null;
    const sql = `SELECT value FROM moz_cookies WHERE host = '${EH_FIREFOX_COOKIE_HOST}' AND name = '${EH_FIREFOX_COOKIE_NAME}' LIMIT 1`;
    const raw = await sqliteWalValue(dbPath, sql);
    if (raw === null) return null;
    return ehIsPlausibleTokenChars(raw) ? raw : null;
  };
  const mintElectronHubSessionJwt = async (refreshValue) => {
    const res = await fetch(`${ELECTRONHUB_API_BASE}${EH_REFRESH_PATH}`, {
      method: "POST",
      headers: {
        Cookie: ehSessionCookieHeader(refreshValue),
        Accept: "application/json",
        Origin: "https://app.electronhub.ai",
        "user-agent": USER_AGENT
      },
      signal: AbortSignal.timeout(ELECTRONHUB_TIMEOUT_MS)
    });
    if (res.status === 401) throw new Error(EH_SESSION_EXPIRED);
    if (!res.ok) throw new Error(`electronhub session refresh HTTP ${res.status}`);
    let body = null;
    try {
      body = await res.json();
    } catch {
      throw new Error("electronhub session refresh returned no JSON");
    }
    const parsed = ehParseRefreshBody(body);
    if (parsed === null)
      throw new Error("electronhub session refresh returned an unrecognised payload");
    const claims = ehDecodeJwtPayload(parsed.accessToken);
    if (claims === null) throw new Error("electronhub session mint is not a decodable JWT");
    if (ehJwtIsExpired(claims, Math.floor(Date.now() / 1e3))) throw new Error(EH_SESSION_EXPIRED);
    const rawSetCookie = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : res.headers.get("set-cookie");
    return { ...parsed, successor: ehParseRefreshSuccessor(rawSetCookie) };
  };
  const reflectElectronHubRefreshCookie = async (profileDir, successor) => {
    if (!ehIsPlausibleTokenChars(successor)) return false;
    const dbPath = join(profileDir, "cookies.sqlite");
    if (!existsSync(dbPath)) return false;
    const escaped = String(successor).replace(/'/g, "''");
    const where = `WHERE host = '${EH_FIREFOX_COOKIE_HOST}' AND name = '${EH_FIREFOX_COOKIE_NAME}'`;
    const script = `UPDATE moz_cookies SET value = '${escaped}' ${where};
SELECT value FROM moz_cookies ${where} LIMIT 1;`;
    return new Promise((resolve) => {
      execFile("sqlite3", [dbPath, ".timeout 5000", script], { timeout: 1e4 }, (error, stdout) => {
        if (error) return resolve(false);
        resolve(String(stdout).trim() === successor);
      });
    });
  };
  const electronhubSessionGet = async (path, jwt) => {
    const res = await fetch(`${ELECTRONHUB_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${jwt}`, Accept: "application/json" },
      signal: AbortSignal.timeout(ELECTRONHUB_TIMEOUT_MS)
    });
    if (res.status === 401) throw new Error(EH_SESSION_EXPIRED);
    if (!res.ok) throw new Error(`electronhub session HTTP ${res.status} on ${path}`);
    try {
      return await res.json();
    } catch {
      throw new Error(`electronhub session ${path} returned no JSON`);
    }
  };
  const fetchElectronHubSession = async (jwt) => {
    const fetchedAt = (/* @__PURE__ */ new Date()).toISOString();
    const blocks = [
      ["subscription", EH_SESSION_ENDPOINT_PATHS[0], ehParseSessionSubscription],
      ["permanentCredits", EH_SESSION_ENDPOINT_PATHS[1], ehParseSessionPermanentCredits],
      ["flexCredits", EH_SESSION_ENDPOINT_PATHS[2], ehParseSessionFlexCredits]
    ];
    const session = { fetchedAt };
    let partial = false;
    for (const [key, path, parse] of blocks) {
      try {
        session[key] = parse(await electronhubSessionGet(path, jwt));
      } catch (error) {
        if (error instanceof Error && error.message === EH_SESSION_EXPIRED) throw error;
        session[key] = null;
        partial = true;
      }
      if (session[key] === null) partial = true;
    }
    session.partial = partial;
    return session;
  };
  const mintHarvestedJwt = async () => {
    let sawCookie = false;
    for (const dir of firefoxElectronHubProfileDirs()) {
      if (!existsSync(join(dir, "cookies.sqlite"))) continue;
      const refreshValue = await readElectronHubRefreshCookie(dir);
      if (refreshValue === null) continue;
      sawCookie = true;
      let minted = null;
      try {
        minted = await mintElectronHubSessionJwt(refreshValue);
      } catch (error) {
        if (error instanceof Error && error.message === EH_SESSION_EXPIRED) continue;
        throw error;
      }
      let reflected = false;
      if (minted.successor !== null && minted.successor !== refreshValue) {
        try {
          reflected = await reflectElectronHubRefreshCookie(dir, minted.successor);
        } catch {
          reflected = false;
        }
      }
      return {
        accessToken: minted.accessToken,
        expiresIn: minted.expiresIn,
        reflected
      };
    }
    if (sawCookie) throw new Error(EH_SESSION_EXPIRED);
    return null;
  };
  const harvestElectronHubSession = async () => {
    let minted = null;
    try {
      minted = await mintHarvestedJwt();
    } catch (error) {
      if (error instanceof Error && error.message === EH_SESSION_EXPIRED) return null;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    if (minted === null) return null;
    try {
      const session = await fetchElectronHubSession(minted.accessToken);
      return {
        ok: true,
        session: { ...session, reflected: minted.reflected, sessionExpiresIn: minted.expiresIn }
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };
  const devpassJwt = ehJwtCache(async () => {
    const minted = await mintHarvestedJwt();
    if (minted === null) throw new Error(EH_SESSION_NO_COOKIE);
    return minted;
  });
  const fetchDevpassUsage = async () => {
    const jwt = await devpassJwt.get();
    const raw = await ehWsDevpassFetch(jwt.accessToken, { timeoutMs: ELECTRONHUB_TIMEOUT_MS });
    const status = ehParseDevpassStatus(raw.status);
    if (!ehDevpassHasContent(status))
      throw new Error("electronhub devpass WS returned an unrecognised payload");
    return { ...status, activity: ehParseDevpassActivity(raw.activity) };
  };
  const devpassUsageOnce = cachedOnce(fetchDevpassUsage, ELECTRONHUB_USAGE_CACHE_MS);
  const handleElectronhubSessionExtract = async (_req, res) => {
    const found = await harvestElectronHubSession();
    if (found === null) {
      sendJson(res, 200, { ok: false, error: EH_SESSION_NO_COOKIE });
      return;
    }
    if (!found.ok) {
      sendJson(res, 200, { ok: false, error: found.error });
      return;
    }
    ctx.logger.info("harvested ElectronHub browser session from Firefox profile");
    sendJson(res, 200, { ok: true, session: found.session });
  };
  const handleElectronhubSessionLogin = loginWindowHandler("https://app.electronhub.ai");
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/opencode-balance",
    handler: handleBalance
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/opencode-zen-balance",
    handler: handleOzBalance
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/opencode-usage",
    handler: handleGoUsage
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/deepseek-balance",
    handler: handleDsBalance
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/deepseek-usage/amount",
    handler: handleDsUsageAmount
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/deepseek-usage/cost",
    handler: handleDsUsageCost
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/zai-quota",
    handler: handleZaiQuota
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/zai-usage",
    handler: handleZaiUsage
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/electronhub-usage",
    handler: handleElectronhubUsage
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/electronhub-models",
    handler: handleElectronhubModels
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/electronhub-session/extract",
    handler: handleElectronhubSessionExtract
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/electronhub-session/login",
    handler: handleElectronhubSessionLogin
  });
  const CMD_API_BASE = "https://api.commandcode.ai/alpha";
  const commandCodeOrgOnce = cachedOnce(async (key) => {
    const whoami = await commandCodeGet(key, CMD_API_BASE, "/whoami", null);
    const org = whoami !== null && typeof whoami === "object" ? whoami.org : null;
    return org !== null && typeof org === "object" && typeof org.id === "string" && org.id.length > 0 ? org.id : null;
  }, 3e4);
  const commandCodeCreditsOnce = cachedOnce(async (key) => {
    const orgId = await commandCodeOrgOnce(key);
    return parseCommandCodeCredits(
      await commandCodeGet(key, CMD_API_BASE, "/billing/credits", orgId)
    );
  }, 3e4);
  const commandCodeUsageOnce = cachedOnce(async (key) => {
    const orgId = await commandCodeOrgOnce(key);
    const sub = await commandCodeGet(key, CMD_API_BASE, "/billing/subscriptions", orgId);
    const periodStart = sub !== null && typeof sub === "object" && typeof sub.currentPeriodStart === "string" ? sub.currentPeriodStart : null;
    let usage = {};
    if (periodStart !== null) {
      usage = await commandCodeGet(
        key,
        CMD_API_BASE,
        `/usage/summary?since=${encodeURIComponent(periodStart)}`,
        null
      );
    }
    return parseCommandCodeUsage(sub, usage);
  }, 3e4);
  const resolveCommandCodeKey = async (req) => {
    const authHeader = req.headers && typeof req.headers.authorization === "string" ? req.headers.authorization : "";
    if (authHeader.startsWith("Bearer ")) return authHeader.slice(7).trim();
    return credentials === void 0 ? null : (await credentials.resolve("CMD_API_KEY"))?.value;
  };
  const handleCommandCodeCredits = async (req, res) => {
    try {
      const key = await resolveCommandCodeKey(req);
      if (!key) {
        sendJson(res, 200, { ok: false, error: "CMD_API_KEY credential not configured" });
        return;
      }
      sendJson(res, 200, { ok: true, ...await commandCodeCreditsOnce(key) });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
  const handleCommandCodeUsage = async (req, res) => {
    try {
      const key = await resolveCommandCodeKey(req);
      if (!key) {
        sendJson(res, 200, { ok: false, error: "CMD_API_KEY credential not configured" });
        return;
      }
      sendJson(res, 200, { ok: true, ...await commandCodeUsageOnce(key) });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/commandcode-credits",
    handler: handleCommandCodeCredits
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/commandcode-usage",
    handler: handleCommandCodeUsage
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/opencode-cookie/extract",
    handler: handleCookieExtract
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/opencode-cookie/login",
    handler: handleCookieLogin
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/deepseek-token/extract",
    handler: handleDeepSeekTokenExtract
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/deepseek-token/login",
    handler: handleDeepSeekTokenLogin
  });
  function validateProviders(value) {
    if (!isPlainObject(value)) return { ok: false, error: "providers must be an object" };
    const out = {};
    for (const key of Object.keys(value)) {
      if (typeof value[key] !== "boolean") {
        return { ok: false, error: `providers.${key} must be a boolean` };
      }
      out[key] = value[key];
    }
    return { ok: true, value: out };
  }
  function canonicalConfig(raw) {
    const map = isPlainObject(raw) && isPlainObject(raw.providers) ? raw.providers : {};
    return { providers: map };
  }
  const handleConfig = async (req, res) => {
    const sendJsonRes = sendJson;
    if (req.method === "GET") {
      const settings = service(ctx, "settings");
      const raw = settings?.get(CONFIG_NS);
      sendJsonRes(res, 200, { ok: true, config: canonicalConfig(raw) });
      return;
    }
    if (req.method === "PUT") {
      const settings = service(ctx, "settings");
      if (settings === void 0) {
        sendJsonRes(res, 503, { ok: false, error: "settings service unavailable" });
        return;
      }
      let body;
      try {
        body = await readBody(req);
      } catch (error) {
        sendJsonRes(res, 400, {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
        return;
      }
      const rawProviders = isPlainObject(body) ? body.providers : void 0;
      const validated = validateProviders(rawProviders);
      if (validated.ok === false) {
        sendJsonRes(res, 400, { ok: false, error: validated.error });
        return;
      }
      try {
        await settings.replace(CONFIG_NS, { providers: validated.value });
      } catch (error) {
        sendJsonRes(res, 400, {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
        return;
      }
      const after = settings.get(CONFIG_NS);
      sendJsonRes(res, 200, { ok: true, config: canonicalConfig(after) });
      return;
    }
    sendJsonRes(res, 405, { ok: false, error: "method not allowed" });
  };
  ctx.webServer.register({ kind: "exact", path: "/subscriptions/config", handler: handleConfig });
}
export {
  Config,
  apply,
  inject,
  name,
  parseCommandCodeCredits,
  parseCommandCodeUsage,
  parseZaiQuota,
  parseZaiUsage
};
