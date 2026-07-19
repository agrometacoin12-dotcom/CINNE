import { useState } from 'react';
import { useStudio } from '../lib/app-context';
import { DEFAULT_API_BASE, getApiBase, setApiBase } from '../lib/api-client';

export function SettingsScreen() {
  const { version, signOut, toast, flags } = useStudio();
  const [base, setBase] = useState(getApiBase());

  const save = () => {
    try {
      const url = new URL(base.trim());
      if (
        url.protocol !== 'https:' &&
        url.hostname !== 'localhost' &&
        url.hostname !== '127.0.0.1'
      ) {
        toast('API base must be https (or localhost for dev)', 'error');
        return;
      }
      setApiBase(base);
      toast('API base saved — restart the app to apply everywhere');
    } catch {
      toast('Enter a valid URL', 'error');
    }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginTop: 0 }}>
          API
        </div>
        <div className="field">
          <label>API base URL</label>
          <input className="input" value={base} onChange={(e) => setBase(e.target.value)} />
          <div className="hint">Default: {DEFAULT_API_BASE}</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-primary btn-sm" onClick={save}>
            Save
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setBase(DEFAULT_API_BASE);
              setApiBase(DEFAULT_API_BASE);
              toast('Reset to production API');
            }}
          >
            Reset to default
          </button>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginTop: 0 }}>
          About
        </div>
        <div className="field">
          <label>App version</label>
          <div>CinneTemple Studio v{version}</div>
        </div>
        {flags.mock ? (
          <div className="pill draft" style={{ marginTop: 4 }}>
            Running in mock mode — no real API calls
          </div>
        ) : null}
      </div>

      <div className="card card-pad">
        <div className="section-title" style={{ marginTop: 0 }}>
          Session
        </div>
        <button className="btn btn-danger btn-sm" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
