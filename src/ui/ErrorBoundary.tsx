import { Component, type ReactNode } from 'react';
import { DRAFT_KEY, REJECTED_DRAFT_KEY, downloadJson } from './sessions';

/**
 * Last line of defense (D71): a plan the checks missed must not blank the page on every load. Offers to set the
 * unsaved draft aside and start again from the example plan.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  resetDraft = () => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) localStorage.setItem(REJECTED_DRAFT_KEY, raw);
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Storage unavailable: a reload is all we can do.
    }
    location.reload();
  };

  downloadDraft = () => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) downloadJson('unsaved plan.json', raw);
    } catch {
      // Storage unavailable: nothing to download.
    }
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page" style={{ display: 'grid', gap: 12, padding: 24 }}>
        <h2>Something went wrong</h2>
        <p className="text-2">{this.state.error.message}</p>
        <p>
          If this keeps happening, the unsaved plan in this browser may be damaged. Download it first if you want to keep
          it, then reset: that starts again from the example plan. Your session files are not touched.
        </p>
        <div className="row">
          <button className="btn" onClick={this.downloadDraft}>Download the unsaved plan</button>
          <button className="btn primary" onClick={this.resetDraft}>Reset the unsaved plan</button>
          <button className="btn" onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
