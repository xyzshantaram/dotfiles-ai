# profiles-client

W6 client plugin. It replaces the shipped model seat in the composer with a
profile-aware one, and adds three small extras.

## What it mounts

- A seat over the `conversation.input.model` slot at priority `-100`. The
  shipped entry stays registered at default `0`; the renderer renders the
  lowest-priority live entry of the `single` slot, so this seat wins without
  any shipped entry being patched out.
- The seat menu lists the `work` and `personal` profile entries from the
  `profile` settings namespace. Picking one applies its chain head through
  the same `sessions.selectModel` wire call the shipped selector uses.
- A green dot next to the trigger shows when the live session selection
  equals the active profile's head. Any manual override hides it.
- A small cost figure on the `conversation.input.right` list slot, beside
  the context ring in the composer trailing row. It folds settled assistant
  usage per model and prices it with the `prices` namespace this package
  owns. Any used model without a rate row hides the figure. The ring's own
  hover tooltip is a bare string prop with no extension seam, so the figure
  sits next to the ring instead of inside its tooltip.

## Settings example

```yaml
prices:
  rates:
    meridian/claude-opus-5:
      input: 3
      output: 15
```

Rates are USD per million tokens.

## Mount

```
dsh plugin --profile web add ./plugins/profiles-client
```

Then restart `dsh web`.

## Rebuild

The browser half is bundled from `src/client.js` into `dist/client.js`:

```
esbuild plugins/profiles-client/src/client.js --bundle --platform=browser --format=iife --outfile=plugins/profiles-client/dist/client.js --log-level=info
```
