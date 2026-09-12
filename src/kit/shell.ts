// SplitKit app shell: status bar on row 1, caller content in the middle,
// key help pinned to the last row, plus one-shot process guards.
import {
  type Action,
  type Command,
  Computed,
  createTerminalApp,
  type Signal,
  StatusBar,
  type TerminalApp,
} from "exotui/app";
import { KeyHelp, type LabelRectangle } from "exotui";
import { SplitKit } from "./theme.ts";

/** Options for a SplitKit screen. */
export interface KitAppOptions<TAction extends Action = Action> {
  title: string | Signal<string>;
  progress?: Signal<string>;
  commands: Command<TAction>[];
  onAction: (action: TAction) => void | Promise<void>;
}

/** Guards are global so repeated screens never stack duplicate listeners. */
let guardsInstalled = false;

function installGuards(app: { destroy(): void }): void {
  if (guardsInstalled) return;
  guardsInstalled = true;
  // exotui already handles SIGINT itself, so only rejections need a guard.
  globalThis.addEventListener("unhandledrejection", () => {
    app.destroy();
    console.error("SplitKit screen failed with an unhandled rejection.");
    console.error("Run the wizard again to resume.");
    Deno.exit(1);
  });
}

/** Rectangle for caller content: rows 2 through height minus 1. */
export function contentRect<TAction extends Action>(
  app: TerminalApp<TAction>,
): Computed<LabelRectangle> {
  return new Computed<LabelRectangle>(() => ({
    column: 1,
    row: 2,
    width: app.tui.rectangle.value.width,
    height: Math.max(1, app.tui.rectangle.value.height - 2),
  }));
}

/** Opens a SplitKit screen: status top, content middle, key help bottom. */
export function createKitApp<TAction extends Action = Action>(
  opts: KitAppOptions<TAction>,
): TerminalApp<TAction> {
  const app = createTerminalApp<TAction>({
    commands: opts.commands,
    onAction: opts.onAction,
    setup(app) {
      const width = () => app.tui.rectangle.value.width;
      const height = () => app.tui.rectangle.value.height;

      const bar = new StatusBar({
        parent: app.tui,
        theme: SplitKit,
        zIndex: 2,
        rectangle: new Computed(() => ({
          column: 1,
          row: 1,
          width: width(),
          height: 1,
        })),
        left: opts.title,
        right: opts.progress ?? "",
      });
      app.registerComponent(bar);

      const keys = new KeyHelp({
        parent: app.tui,
        theme: SplitKit,
        zIndex: 2,
        rectangle: new Computed(() => ({
          column: 1,
          row: height(),
          width: width(),
          height: 1,
        })),
        bindings: opts.commands
          .filter((command) => command.binding !== undefined)
          .map((command) => ({
            key: command.binding!.key,
            description: command.description ?? command.label,
          })),
      });
      app.registerComponent(keys);
    },
  });
  installGuards(app);
  return app;
}
