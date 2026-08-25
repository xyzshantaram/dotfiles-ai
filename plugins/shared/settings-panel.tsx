/**
 * Shared settings-section header: title, optional refresh button, body.
 *
 * Presentational only. Used by the session-archive, subscriptions, and
 * profiles settings panels. The import stays named `react` so the classic
 * JSX factory expansion (`react.createElement`) keeps a binding in scope.
 */
import react from "react";

/** One titled section of a settings page, with an optional refresh action. */
export function SettingsSection(props: {
  title: any;
  onRefresh?: () => void;
  refreshLabel?: string;
  children?: any;
}) {
  return (
    <div className="dsp-root">
      <div className="dsp-head">
        <h3 className="dsp-title">{props.title}</h3>
        {props.onRefresh ? (
          <button className="dsp-refresh" onClick={props.onRefresh}>
            {props.refreshLabel === undefined ? "Refresh" : props.refreshLabel}
          </button>
        ) : null}
      </div>
      {props.children}
    </div>
  );
}
