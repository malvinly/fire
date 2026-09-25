import { useEffect, useRef, useState } from 'react';
import {
  downloadSession, ensurePermission, fileNameFor, folderSupported, listSessions, parseSession, pickFolder,
  rememberedFolder, writeSession, type DirHandle, type SessionFile, type SessionListing,
} from './sessions';

export interface SessionMeta {
  name: string;
  fileName: string;
  createdAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  meta: SessionMeta | null;
  makeFile: (name: string, createdAt?: string) => SessionFile;
  onSaved: (m: SessionMeta) => void;
  onOpen: (s: SessionFile, m: SessionMeta) => void;
  onNew: () => void;
}

export function SessionsDialog({ open, onClose, meta, makeFile, onSaved, onOpen, onNew }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [dir, setDir] = useState<DirHandle | null>(null);
  const [list, setList] = useState<SessionListing[]>([]);
  const [newName, setNewName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open || !folderSupported) return;
    setMsg(null);
    rememberedFolder().then((h) => h && setDir(h));
  }, [open]);

  const refresh = async (h: DirHandle) => {
    if (!(await ensurePermission(h))) {
      setMsg('Permission to the folder was not granted.');
      return;
    }
    setList(await listSessions(h));
  };

  useEffect(() => {
    if (open && dir) refresh(dir).catch((e) => setMsg(String(e)));
  }, [open, dir]);

  const choose = async () => {
    try {
      setDir(await pickFolder());
    } catch {
      // User cancelled the picker.
    }
  };

  const save = async (name: string, existing: SessionMeta | null) => {
    const createdAt = existing?.createdAt ?? new Date().toISOString();
    const fileName = existing?.fileName ?? fileNameFor(name, createdAt);
    const file = makeFile(name, createdAt);
    try {
      if (folderSupported) {
        if (!dir) return setMsg('Choose a folder first.');
        if (!(await ensurePermission(dir))) return setMsg('Permission to the folder was not granted.');
        await writeSession(dir, fileName, file);
        await refresh(dir);
      } else {
        downloadSession(fileName, file);
      }
      onSaved({ name, fileName, createdAt });
      setMsg(`Saved "${fileName}".`);
      setNewName('');
    } catch (e) {
      setMsg(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const openFile = async (f: File) => {
    try {
      const s = parseSession(await f.text());
      onOpen(s, { name: s.name, fileName: f.name, createdAt: s.createdAt });
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="sessions-title">
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="panel-head" style={{ marginBottom: 0 }}>
          <h2 id="sessions-title">Your plans</h2>
          <button className="btn small" onClick={onClose}>Close</button>
        </div>

        {folderSupported ? (
          <div className="row" style={{ alignItems: 'center' }}>
            <span className="text-2">Folder: <b>{dir ? dir.name : 'none chosen'}</b></span>
            <button className="btn small" onClick={choose}>{dir ? 'Change folder…' : 'Choose folder…'}</button>
          </div>
        ) : (
          <p className="text-2">This browser can't write to a folder (use Chrome or Edge for that). Plans download as files instead, and you open them from disk.</p>
        )}

        <div className="row">
          {meta && (
            <button className="btn primary" onClick={() => save(meta.name, meta)} disabled={folderSupported && !dir}>
              Save “{meta.name}”
            </button>
          )}
          <div className="field" style={{ flex: 2 }}>
            <label htmlFor="new-session-name">{meta ? 'Save as a new plan' : 'Save this plan as'}</label>
            <input id="new-session-name" value={newName} placeholder={`e.g. ${new Date().getFullYear()} checkup`} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <button className="btn" disabled={!newName.trim() || (folderSupported && !dir)} onClick={() => save(newName.trim(), null)}>Save as new</button>
        </div>

        {msg && <p className="text-2">{msg}</p>}

        {folderSupported ? (
          <div className="session-list">
            {list.length === 0 && <p className="muted">{dir ? 'No plans in this folder yet.' : 'Choose a folder to see saved plans.'}</p>}
            {list.map(({ fileName, session, problem }) => {
              if (!session) {
                return (
                  <div key={fileName} className="session-item" aria-disabled="true">
                    <span><b>{fileName}</b><br /><span className="muted">Can't be opened: {problem}</span></span>
                  </div>
                );
              }
              const trad = session.results?.tiers.find((t) => t.tier === 'traditional');
              return (
                <button key={fileName} className="session-item"
                  onClick={() => { onOpen(session, { name: session.name, fileName, createdAt: session.createdAt }); onClose(); }}>
                  <span>
                    <b>{session.name}</b>
                    <br />
                    <span className="muted">saved {new Date(session.savedAt).toLocaleString()}</span>
                  </span>
                  <span className="text-2">
                    {session.results ? `Traditional FIRE: ${trad?.earliest?.year ?? 'not reachable'}` : 'not calculated'}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="field">
            <label htmlFor="open-file">Open a plan file</label>
            <input id="open-file" type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && openFile(e.target.files[0])} />
          </div>
        )}

        <div style={{ display: 'grid', gap: 6 }}>
          <button className="btn small" style={{ justifySelf: 'start' }} onClick={() => { onNew(); onClose(); }}>Start over with the example numbers</button>
          <p className="text-2" style={{ fontSize: 12 }}>
            The plan on screen is kept in this browser between visits, not in a saved file. On a shared computer, start over when you're done so your numbers don't stay behind.
          </p>
        </div>
      </div>
    </dialog>
  );
}
