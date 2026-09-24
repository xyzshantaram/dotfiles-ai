/**
 * ElectronHub DevPass usage over the private WebSocket (ticket #68).
 *
 * The dev key (ek-dev-…) answers 401 on every REST account endpoint, so the
 * section could never render real usage for it — until the private protocol
 * (reverse-engineered from the site frontend by the ElectronHub-Monitor
 * reference project) gave us a second road in: mint a session JWT from the
 * Firefox `refresh_token` cookie exactly as ./eh-session-model.ts documents,
 * then ask the usage WebSocket instead of REST.
 *
 * The protocol, in brief:
 * - Mint: POST https://api.electronhub.ai/v1/auth/refresh with the refresh
 *   cookie (owned by index.ts — this module never sees a cookie value).
 * - Usage: wss://api.electronhub.ai/v1/ws/auth (fallback
 *   wss://ws.electronhub.ai/v1/ws/auth). Frames are 1 byte message type |
 *   4 bytes BIG-ENDIAN JSON length | JSON payload. The handshake accepts a
 *   HEADERLESS connection (proven live 2026-09-22), so the global WebSocket
 *   is used with no Origin/UA/cookies — and no dependency, no hand-rolled
 *   client. Cookies stay off the socket: the reference warns browser
 *   cf_clearance cookies trigger a Cloudflare cutoff.
 * - Status: binary frame type 41 carrying {access_token}; the answer is type
 *   42 with the usage payload. Activity: type 47 with {access_token,
 *   days: 14}; the answer is type 48 with {days: [{day, tokens}, …]}.
 * - The server sends Ping (6) frames; we reply Pong (7). TEXT frames are
 *   skipped. A type-5 frame is an error naming the failure.
 * - The daily window resets at 21:00 UTC; the week is a rolling 7-day window
 *   with no fixed reset instant.
 *
 * This module is deliberately dependency-free (no react, no CSS, no node
 * builtins — TextEncoder/TextDecoder are universal): the codec, the
 * response parsers, the JWT-reuse cache and the reset helper are pure, so
 * vitest pins them byte-exactly without importing the host half. A
 * short-lived connection per fetch is enough (connect → 41/42 → 47/48 →
 * close); the reference's long-lived keepalive architecture is not needed
 * because our panel has its own cache cadence.
 *
 * Nothing credential-shaped is ever logged, rendered, or persisted here:
 * the JWT crosses only inside the 41/47 request frames on the wire, and the
 * route payload the host answers carries the NUMBERS, never the tokens.
 */

// ── Endpoints + message types ─────────────────────────────────────────────

export var EH_WS_URLS = [
  "wss://api.electronhub.ai/v1/ws/auth",
  "wss://ws.electronhub.ai/v1/ws/auth",
];
/** The 42 answer to our 41 request. */
export var EH_WS_AUTH_RES = 2;
/** A type-5 frame names the failure in its payload. */
export var EH_WS_ERROR = 5;
export var EH_WS_PING = 6;
export var EH_WS_PONG = 7;
export var EH_WS_DEVPASS_STATUS_REQ = 41;
export var EH_WS_DEVPASS_STATUS_RES = 42;
export var EH_WS_DEVPASS_ACTIVITY_REQ = 47;
export var EH_WS_DEVPASS_ACTIVITY_RES = 48;
/** Defensive cap: a codec frame larger than this is refused, not buffered. */
export var EH_WS_MAX_FRAME = 1024 * 1024;
/** The daily window resets at this UTC hour; the week has no fixed reset. */
export var EH_DEVPASS_RESET_UTC_HOUR = 21;
/** Activity history depth requested on every fetch (the week needs today-7). */
export var EH_DEVPASS_ACTIVITY_DAYS = 14;

// ── Display copy (the reference's tone, verbatim) ──────────────────────────

/** Chip shown when the account is on full-speed headroom. */
export var EH_DEVPASS_UNLIMITED = "Unlimited tokens";
/** Chip shown when the account has dropped to lower priority. */
export var EH_DEVPASS_REDUCED = "Reduced speed";
/** The headroom line under the chips: what happens past full speed + reset. */
export var EH_DEVPASS_HEADROOM_NOTE =
  "Beyond your full-speed headroom, requests continue at lower priority. Resets 21:00 UTC.";

// ── Codec: type byte | big-endian length | JSON ─────────────────────────────

var ehTextEncoder = new TextEncoder();
var ehTextDecoder = new TextDecoder();

/**
 * Encode one frame: a single type byte, the JSON body's length as 4 bytes
 * big-endian, then the UTF-8 JSON itself.
 */
export function ehWsEncode(type, payload) {
  var body = ehTextEncoder.encode(JSON.stringify(payload));
  var out = new Uint8Array(5 + body.length);
  out[0] = type & 0xff;
  out[1] = (body.length >>> 24) & 0xff;
  out[2] = (body.length >>> 16) & 0xff;
  out[3] = (body.length >>> 8) & 0xff;
  out[4] = body.length & 0xff;
  out.set(body, 5);
  return out;
}

/**
 * A codec-frame reassembler: feed it binary chunks (one per WebSocket
 * message, or split finer — the socket layer's own fragmentation is already
 * joined by the runtime, but a message may still carry a partial frame or
 * several frames at once) and it answers the complete {type, payload} pairs
 * available so far. Oversized frames and malformed JSON throw — the caller
 * closes the socket on either, because both mean the peer is not speaking
 * this protocol.
 */
export function ehWsReader() {
  var buffered = new Uint8Array(0);
  var join = function (chunk) {
    var next = new Uint8Array(buffered.length + chunk.length);
    next.set(buffered, 0);
    next.set(chunk, buffered.length);
    buffered = next;
    var frames = [];
    for (;;) {
      if (buffered.length < 5) return frames;
      var length =
        buffered[1] * 16777216 + buffered[2] * 65536 + buffered[3] * 256 + buffered[4];
      if (length > EH_WS_MAX_FRAME) throw new Error("electronhub ws frame exceeds 1MB cap");
      if (buffered.length < 5 + length) return frames;
      var text = ehTextDecoder.decode(buffered.slice(5, 5 + length));
      var payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error("electronhub ws frame is not JSON");
      }
      frames.push({ type: buffered[0], payload: payload });
      buffered = buffered.slice(5 + length);
    }
  };
  return { push: join };
}

// ── Tolerant field coercion (local: this module stays dependency-free) ──────

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

/** The reference's page-accurate percentage: round(min(100, used/limit*100)). */
export function ehDevpassPercent(used, limit) {
  if (used === null || limit === null || limit <= 0) return null;
  return Math.round(Math.min(100, (used / limit) * 100));
}

/**
 * The service-mode chip: the two known full-speed-or-not modes read as the
 * reference's chips, anything else renders as its raw wire string (never
 * guessed into a chip), absence renders nothing.
 */
export function ehDevpassServiceChip(mode) {
  if (mode === null || mode === undefined) return null;
  if (mode === "interactive") return EH_DEVPASS_UNLIMITED;
  if (mode === "slowed") return EH_DEVPASS_REDUCED;
  return String(mode);
}

// ── Status (42) parser ──────────────────────────────────────────────────────

/**
 * The type-42 usage payload -> the panel shape. Every known field is picked
 * by its exact wire name; anything absent degrades to null and never to 0,
 * so the client can tell "no headroom figure" from "headroom exhausted".
 * Returns null when the payload is not an object at all.
 */
export function ehParseDevpassStatus(data) {
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
    todayTokens: todayTokens,
    dailyLimit: dailyLimit,
    todayPercent: ehDevpassPercent(todayTokens, dailyLimit),
    weekTokens: weekTokens,
    weeklyCap: weeklyCap,
    weekPercent: ehDevpassPercent(weekTokens, weeklyCap),
    activeRequests: wsNum(source.active_requests),
    concurrencyLimit: wsNum(source.concurrency_limit),
    serviceMode: wsStr(source.service_mode),
    periodEnd: wsStr(source.period_end),
  };
}

/** Does this status carry anything the section can draw? Null AND undefined both read as absent. */
export function ehDevpassHasContent(status) {
  if (!status || typeof status !== "object") return false;
  var s = status;
  return (
    s.subscribed != null ||
    s.tier != null ||
    s.status != null ||
    s.todayTokens != null ||
    s.dailyLimit != null ||
    s.weekTokens != null ||
    s.weeklyCap != null ||
    s.activeRequests != null ||
    s.concurrencyLimit != null ||
    s.serviceMode != null
  );
}

// ── Activity (48) parser: the rolling 7-day window ──────────────────────────

function wsDayEntry(item) {
  if (item === null || typeof item !== "object") return null;
  var entry = item;
  if (typeof entry.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.day)) return null;
  return { day: entry.day, tokens: wsNum(entry.tokens) };
}

function utcDayString(nowMs, deltaDays) {
  return new Date(nowMs + deltaDays * 86400000).toISOString().slice(0, 10);
}

/**
 * The type-48 activity payload -> the rolling-week shape. weekStart is
 * today-6 (the window covers today plus the six days before it); the leaving
 * day is today-7 with its token count — the day about to roll OUT of the
 * window. nowMs is injectable so tests pin the window edges; production
 * passes Date.now(). Returns null when the payload is not an object.
 */
export function ehParseDevpassActivity(data, nowMs = null) {
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
    days: days,
    weekStart: utcDayString(now, -6),
    leavingDay: leavingDay,
    leavingTokens: leavingTokens,
  };
}

// ── Reset countdown: next 21:00 UTC ─────────────────────────────────────────

/**
 * Milliseconds from nowMs until the next 21:00 UTC daily reset. nowMs is
 * injectable so tests pin the boundary; production passes Date.now().
 */
export function ehDevpassResetMs(nowMs) {
  var now = typeof nowMs === "number" ? nowMs : Date.now();
  var at = new Date(now);
  var reset = Date.UTC(
    at.getUTCFullYear(),
    at.getUTCMonth(),
    at.getUTCDate(),
    EH_DEVPASS_RESET_UTC_HOUR,
    0,
    0,
    0,
  );
  if (reset <= now) reset += 86400000;
  return reset - now;
}

// ── JWT reuse cache: mint at most once per TTL, never per request ───────────

/**
 * A minted-JWT cache with single-flight and a failure cooldown.
 *
 * Each successful mint ROTATES the refresh token, so the WS poll must reuse
 * a cached JWT until it is near expiry — never mint per request. mint is the
 * host's mint function (profile loop + rotation reflection included); it
 * resolves {accessToken, expiresIn} with expiresIn in seconds or null.
 *
 * - While the cached token has more than refreshMarginSec of life left, get()
 *   answers it without calling mint.
 * - Concurrent get() calls share one in-flight mint (single-flight).
 * - A failed mint records its error and cools down for failCooldownMs: get()
 *   during the cooldown rethrows the SAME error without minting again, so a
 *   dead session cannot retry-storm the rotation chain.
 */
export function ehJwtCache(mint, opts = null) {
  var options = opts !== null && typeof opts === "object" ? opts : {};
  var marginSec =
    typeof options.refreshMarginSec === "number" ? options.refreshMarginSec : 300;
  var cooldownMs =
    typeof options.failCooldownMs === "number" ? options.failCooldownMs : 300000;
  var defaultTtlSec =
    typeof options.defaultTtlSec === "number" ? options.defaultTtlSec : 3300;
  var nowFn = typeof options.now === "function" ? options.now : Date.now;
  var cached = null;
  var inFlight = null;
  var failedAt = 0;
  var lastError = null;
  var get = function () {
    var now = nowFn();
    if (cached !== null && cached.expMs - now >= marginSec * 1000) {
      return Promise.resolve({ accessToken: cached.token, expiresIn: cached.ttl });
    }
    if (inFlight !== null) return inFlight;
    if (lastError !== null && now - failedAt < cooldownMs) return Promise.reject(lastError);
    inFlight = Promise.resolve()
      .then(function () {
        return mint();
      })
      .then(function (minted) {
        var ttl =
          minted !== null &&
          typeof minted === "object" &&
          typeof minted.expiresIn === "number" &&
          Number.isFinite(minted.expiresIn) &&
          minted.expiresIn > 0
            ? minted.expiresIn
            : defaultTtlSec;
        cached = { token: minted.accessToken, expMs: nowFn() + ttl * 1000, ttl: ttl };
        lastError = null;
        return { accessToken: cached.token, expiresIn: ttl };
      })
      .catch(function (error) {
        failedAt = nowFn();
        lastError = error;
        throw error;
      })
      .finally(function () {
        inFlight = null;
      });
    return inFlight;
  };
  return { get: get };
}

// ── Short-lived status+activity round-trip ──────────────────────────────────

/**
 * Open the usage socket, request status (41) then activity (47), and close.
 * urls default to the api host plus the ws-host fallback; a connection
 * refusal moves to the next URL, anything else throws. timeoutMs bounds the
 * whole round-trip. Answers the RAW {status, activity} payload pair — the
 * host parses them with ehParseDevpassStatus/ehParseDevpassActivity, which
 * pick numbers only, so the route payload never carries a token. The JWT
 * rides only inside the 41/47 request frames on the wire: never logged,
 * never returned, never stored.
 *
 * This is the one impure function in the module (it touches globalThis
 * WebSocket); the codec/parsers/cache above carry the unit-test weight, and
 * any live-token verification stays pending-orchestrator because minting
 * burns a rotation.
 */
export async function ehWsDevpassFetch(jwt, opts = null): Promise<{ status: unknown; activity: unknown }> {
  var options = opts !== null && typeof opts === "object" ? opts : {};
  var urls = Array.isArray(options.urls) && options.urls.length > 0 ? options.urls : EH_WS_URLS;
  var timeoutMs =
    typeof options.timeoutMs === "number" && options.timeoutMs > 0 ? options.timeoutMs : 15000;
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

function ehWsRoundTrip(Socket, url, jwt, timeoutMs): Promise<{ status: unknown; activity: unknown }> {
  return new Promise(function (resolve, reject) {
    var settled = false;
    var socket = null;
    var reader = ehWsReader();
    var statusPayload = null;
    var finish = function (error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (socket !== null) socket.close();
      } catch {}
      if (error !== null) reject(error);
      else resolve(result);
    };
    var timer = setTimeout(function () {
      finish(new Error("electronhub ws fetch timed out"), null);
    }, timeoutMs);
    // The timer must not pin the host process open on its own.
    if (timer !== null && typeof timer.unref === "function") timer.unref();
    var send = function (type, payload) {
      socket.send(ehWsEncode(type, payload));
    };
    var connected = false;
    try {
      socket = new Socket(url);
    } catch (error) {
      finish(error, null);
      return;
    }
    // A connection refusal moves the caller to the fallback host; a
    // mid-session failure after connect is a genuine fetch error.
    socket.addEventListener("error", function () {
      if (!connected) finish(new Error("electronhub ws connect failed for " + url), null);
      else finish(new Error("electronhub ws socket error"), null);
    });
    socket.addEventListener("open", function () {
      connected = true;
      try {
        send(EH_WS_DEVPASS_STATUS_REQ, { access_token: jwt });
      } catch (error) {
        finish(error, null);
      }
    });
    socket.addEventListener("message", function (event) {
      try {
        // TEXT frames carry nothing in this protocol — skip them entirely.
        if (typeof event.data === "string") return;
        var chunk =
          event.data instanceof Uint8Array ? event.data : new Uint8Array(event.data);
        var frames = reader.push(chunk);
        for (var i = 0; i < frames.length; i++) {
          var frame = frames[i];
          if (frame.type === EH_WS_PING) {
            send(EH_WS_PONG, frame.payload);
          } else if (frame.type === EH_WS_ERROR) {
            var detail =
              frame.payload !== null && typeof frame.payload === "object"
                ? JSON.stringify(frame.payload).slice(0, 200)
                : String(frame.payload).slice(0, 200);
            finish(new Error("electronhub ws error: " + detail), null);
          } else if (frame.type === EH_WS_DEVPASS_STATUS_RES && statusPayload === null) {
            statusPayload = frame.payload;
            send(EH_WS_DEVPASS_ACTIVITY_REQ, {
              access_token: jwt,
              days: EH_DEVPASS_ACTIVITY_DAYS,
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
