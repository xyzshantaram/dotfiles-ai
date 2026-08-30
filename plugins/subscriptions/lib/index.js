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

// node_modules/.pnpm/snappyjs@0.7.0/node_modules/snappyjs/snappy_decompressor.js
var require_snappy_decompressor = __commonJS({
  "node_modules/.pnpm/snappyjs@0.7.0/node_modules/snappyjs/snappy_decompressor.js"(exports) {
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

// node_modules/.pnpm/snappyjs@0.7.0/node_modules/snappyjs/snappy_compressor.js
var require_snappy_compressor = __commonJS({
  "node_modules/.pnpm/snappyjs@0.7.0/node_modules/snappyjs/snappy_compressor.js"(exports) {
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

// node_modules/.pnpm/snappyjs@0.7.0/node_modules/snappyjs/index.js
var require_snappyjs = __commonJS({
  "node_modules/.pnpm/snappyjs@0.7.0/node_modules/snappyjs/index.js"(exports) {
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
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
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
var USD_SCALE = 1e8;
var WORKSPACES_SERVER_ID = "def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f";
var BILLING_SERVER_ID = "c83b78a614689c38ebee981f9b39a8b377716db85c1fd7dbab604adc02d3313d";
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
function makeHeaders(cookie, serverId, referer) {
  return {
    cookie,
    "x-server-id": serverId,
    "x-server-instance": `server-fn:${randomUUID()}`,
    "user-agent": USER_AGENT,
    origin: "https://opencode.ai",
    referer,
    accept: "text/javascript, application/json;q=0.9, */*;q=0.8"
  };
}
async function fetchServerText(url, options) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(OPENCODE_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`opencode HTTP ${res.status}`);
  return res.text();
}
function looksSignedOut(text) {
  const lower = String(text).toLowerCase();
  return lower.includes("/login") || lower.includes("sign in") || lower.includes("/auth/authorize") || lower.includes("sign-in");
}
function parseWorkspaceId(text) {
  const match = /id\s*:\s*"(wrk_[^"]+)"/.exec(text);
  if (match !== null) return match[1];
  try {
    return findWorkspaceId(JSON.parse(text));
  } catch {
    return null;
  }
}
function findWorkspaceId(value) {
  if (typeof value === "string") return value.startsWith("wrk_") ? value : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findWorkspaceId(item);
      if (found !== null) return found;
    }
  } else if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      const found = findWorkspaceId(value[key]);
      if (found !== null) return found;
    }
  }
  return null;
}
async function resolveWorkspaceId(cookie) {
  const url = `https://opencode.ai/_server?id=${WORKSPACES_SERVER_ID}`;
  let text = await fetchServerText(url, {
    headers: makeHeaders(cookie, WORKSPACES_SERVER_ID, "https://opencode.ai")
  });
  let id = parseWorkspaceId(text);
  if (id !== null) return id;
  text = await fetchServerText(url, {
    method: "POST",
    headers: {
      ...makeHeaders(cookie, WORKSPACES_SERVER_ID, "https://opencode.ai"),
      "content-type": "application/json"
    },
    body: "[]"
  });
  id = parseWorkspaceId(text);
  if (id === null) throw new Error("no workspace id");
  return id;
}
async function fetchBillingPayload(cookie, workspaceId) {
  const args = encodeURIComponent(JSON.stringify([workspaceId]));
  const url = `https://opencode.ai/_server?id=${BILLING_SERVER_ID}&args=${args}`;
  return fetchServerText(url, {
    headers: makeHeaders(cookie, BILLING_SERVER_ID, `https://opencode.ai/workspace/${workspaceId}`)
  });
}
async function fetchBillingText(cookie, workspaceId) {
  return fetchServerText(`https://opencode.ai/workspace/${workspaceId}/billing`, {
    headers: {
      cookie,
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      origin: "https://opencode.ai",
      referer: "https://opencode.ai"
    }
  });
}
function findCustomer(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findCustomer(item);
      if (found !== null) return found;
    }
    return null;
  }
  if (value === null || typeof value !== "object") return null;
  if (typeof value.customerID === "string" && value.customerID.length > 0) return value;
  for (const key of Object.keys(value)) {
    const found = findCustomer(value[key]);
    if (found !== null) return found;
  }
  return null;
}
function numberField(text, field) {
  const regex = new RegExp(
    `(?:["']?${field}["']?\\s*:\\s*)(?:\\$R\\[\\d+\\]\\s*=\\s*)?(-?[0-9]+(?:\\.[0-9]+)?)`
  );
  const match = regex.exec(text);
  if (match === null) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}
function parseBilling(text) {
  try {
    const object = JSON.parse(text);
    const customer = findCustomer(object);
    if (customer !== null && typeof customer.monthlyUsage === "number") {
      return {
        monthlyUsage: customer.monthlyUsage / USD_SCALE,
        monthlyLimit: typeof customer.monthlyLimit === "number" ? customer.monthlyLimit : null,
        balance: typeof customer.balance === "number" ? customer.balance / USD_SCALE : null
      };
    }
  } catch {
  }
  if (!/customerID\s*:\s*"[^"]+"/.test(text)) return null;
  const usage = numberField(text, "monthlyUsage");
  if (usage === null) return null;
  const limit = numberField(text, "monthlyLimit");
  const balance = numberField(text, "balance");
  return {
    monthlyUsage: usage / USD_SCALE,
    monthlyLimit: limit,
    balance: balance === null ? null : balance / USD_SCALE
  };
}
function parseZenBalanceText(text) {
  text = String(text).replace(/<!--[\s\S]*?-->/g, "");
  const slot = /data-slot="balance-value"[^>]*>\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i.exec(text);
  if (slot !== null) {
    const v = Number(slot[1].replace(/,/g, ""));
    if (Number.isFinite(v) && v >= 0) return v;
  }
  try {
    const object = JSON.parse(text);
    const customer = findCustomer(object);
    if (customer !== null && typeof customer.balance === "number") {
      return customer.balance / USD_SCALE;
    }
  } catch {
  }
  const solid = /(?:^|[,{])\s*(?:"customerID"|customerID)\s*:\s*(?:\$R\[\d+\]\s*=\s*)?"[^"]+"[^{}]{0,512}?(?:"balance"|balance)\s*:\s*(?:\$R\[\d+\]\s*=\s*)?(-?[0-9]+(?:\.[0-9]+)?)/.exec(
    text
  );
  if (solid !== null && solid[1] !== void 0) {
    const raw = Number(solid[1]);
    if (Number.isFinite(raw)) return raw / USD_SCALE;
  }
  const after = /(?:current\s+balance|zen\s+balance)[\s\S]{0,160}?\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i.exec(text);
  if (after !== null && after[1] !== void 0) {
    const value = Number(after[1].replace(/,/g, ""));
    if (Number.isFinite(value) && value >= 0) return value;
  }
  const before = /\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)[\s\S]{0,160}?(?:current\s+balance|zen\s+balance)/i.exec(text);
  if (before !== null && before[1] !== void 0) {
    const value = Number(before[1].replace(/,/g, ""));
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
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
function apply(ctx, config) {
  const credentials = ctx.get("credentials");
  installSettingsSection(ctx, CONFIG_NS, Config, config ?? {}, {
    setSource: () => {
    },
    onChange: () => {
    }
  });
  const quotaOnce = cachedOnce(async () => {
    const res = await fetch("http://localhost:9000/v1/usage/quota/all", {
      signal: AbortSignal.timeout(MERIDIAN_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`meridian quota HTTP ${res.status}`);
    return res.json();
  }, 3e4);
  const handleQuota = async (_req, res) => {
    try {
      sendJson(res, 200, await quotaOnce());
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  };
  const telemetryOnce = cachedOnce(async () => {
    const res = await fetch("http://localhost:9000/telemetry/summary?window=86400000", {
      signal: AbortSignal.timeout(MERIDIAN_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`meridian telemetry HTTP ${res.status}`);
    return res.json();
  }, 6e4);
  const handleTelemetry = async (_req, res) => {
    try {
      sendJson(res, 200, await telemetryOnce());
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  };
  const quotaSingleOnce = cachedOnce(async () => {
    const res = await fetch("http://localhost:9000/v1/usage/quota", {
      signal: AbortSignal.timeout(MERIDIAN_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`meridian quota HTTP ${res.status}`);
    return res.json();
  }, 3e4);
  const handleQuotaSingle = async (_req, res) => {
    try {
      sendJson(res, 200, await quotaSingleOnce());
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  };
  const telemetryRequestsOnce = cachedOnce(async () => {
    const res = await fetch("http://localhost:9000/telemetry/requests?limit=20", {
      signal: AbortSignal.timeout(MERIDIAN_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`meridian requests HTTP ${res.status}`);
    return res.json();
  }, 6e4);
  const handleTelemetryRequests = async (_req, res) => {
    try {
      sendJson(res, 200, await telemetryRequestsOnce());
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  };
  const meridianLogsOnce = cachedOnce(async () => {
    const res = await fetch("http://localhost:9000/telemetry/logs?limit=10", {
      signal: AbortSignal.timeout(MERIDIAN_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`meridian logs HTTP ${res.status}`);
    return res.json();
  }, 15e3);
  const handleMeridianLogs = async (_req, res) => {
    try {
      sendJson(res, 200, await meridianLogsOnce());
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  };
  const meridianHealthOnce = cachedOnce(async () => {
    const res = await fetch("http://localhost:9000/health", {
      signal: AbortSignal.timeout(MERIDIAN_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`meridian health HTTP ${res.status}`);
    return res.json();
  }, 6e4);
  const handleMeridianHealth = async (_req, res) => {
    try {
      sendJson(res, 200, await meridianHealthOnce());
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  };
  let balanceCache = null;
  const cachedBalance = (cookie) => {
    const now = Date.now();
    if (balanceCache !== null && now - balanceCache.at < BALANCE_CACHE_MS && balanceCache.cookie === cookie)
      return balanceCache.promise;
    const promise = (async () => {
      const workspaceId = await resolveWorkspaceId(cookie);
      const text = await fetchBillingPayload(cookie, workspaceId);
      if (looksSignedOut(text)) throw new Error("signed out");
      const parsed = parseBilling(text);
      if (parsed === null) throw new Error("parse failed");
      try {
        const dashboard = await fetchBillingText(cookie, workspaceId);
        if (!looksSignedOut(dashboard)) {
          const dashBalance = parseZenBalanceText(dashboard);
          if (dashBalance !== null) parsed.balance = dashBalance;
        }
      } catch {
      }
      return parsed;
    })();
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
        currency: "USD"
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
  const handleDeepSeekTokenLogin = async (_req, res) => {
    try {
      const child = spawn("firefox", ["--new-window", "https://platform.deepseek.com"], {
        detached: true,
        stdio: "ignore"
      });
      child.unref();
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  };
  const readCookieString = async (dbDir) => {
    const src = join(dbDir, "cookies.sqlite");
    if (!existsSync(src)) return null;
    const sql = "SELECT name || char(9) || value FROM moz_cookies WHERE (host = 'opencode.ai' OR host LIKE '%.opencode.ai') AND name = 'auth'";
    const raw = await sqliteSnapshotAndQuery(src, sql);
    if (raw === null) return null;
    const parts = String(raw).split("\n").map((line) => {
      const tab = String(line).indexOf("	");
      return tab === -1 ? null : String(line).slice(0, tab) + "=" + String(line).slice(tab + 1);
    }).filter((part) => part !== null && String(part).includes("="));
    return parts.length > 0 ? parts.join("; ") : null;
  };
  const extractCookie = async () => {
    for (const dir of firefoxProfileDirs()) {
      if (!existsSync(join(dir, "cookies.sqlite"))) continue;
      const cookieString = await readCookieString(dir);
      if (cookieString === null) continue;
      try {
        await cachedBalance(cookieString);
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
  const handleCookieLogin = async (_req, res) => {
    try {
      const child = spawn("firefox", ["--new-window", "https://opencode.ai"], {
        detached: true,
        stdio: "ignore"
      });
      child.unref();
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  };
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/meridian-quota",
    handler: handleQuota
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/meridian-telemetry",
    handler: handleTelemetry
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/meridian-quota-single",
    handler: handleQuotaSingle
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/meridian-telemetry-requests",
    handler: handleTelemetryRequests
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/meridian-logs",
    handler: handleMeridianLogs
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/meridian-health",
    handler: handleMeridianHealth
  });
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
  parseCommandCodeUsage
};
