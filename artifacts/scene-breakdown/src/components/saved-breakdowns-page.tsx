import { useEffect, useState } from 'react';
import { Bookmark, Clock3, LoaderCircle, Trash2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { AppHeader, BreakdownPage } from '@/components/scene-breakdown';
import {
  deleteSavedBreakdown,
  listSavedBreakdowns,
  loadSavedBreakdown,
  releaseSavedBreakdown,
  type SavedBreakdown,
  type SavedBreakdownSummary,
} from '@/lib/saved-breakdowns';

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp);
}

export function SavedBreakdownsPage() {
  const [, setLocation] = useLocation();
  const [saved, setSaved] = useState<SavedBreakdownSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    listSavedBreakdowns()
      .then(setSaved)
      .catch((error: unknown) => setErrorMessage(error instanceof Error ? error.message : 'Saved breakdowns could not be opened.'))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    await deleteSavedBreakdown(id);
    setSaved((current) => current.filter((item) => item.id !== id));
  };

  return (
    <div className="app-frame">
      <AppHeader compact />
      <main className="studio-shell breakdown-shell saved-shell">
        <div className="breakdown-heading">
          <div>
            <button type="button" className="back-link" onClick={() => setLocation('/')}><Bookmark size={15} /> New breakdown</button>
            <div className="eyebrow"><span className="eyebrow-line" /> PERSONAL LIBRARY</div>
            <h1 className="font-display breakdown-title">Saved breakdowns.</h1>
          </div>
        </div>
        {loading && <div className="saved-state"><LoaderCircle className="animate-spin" size={20} /> Loading saved breakdowns</div>}
        {!loading && errorMessage && <div className="error-message" role="alert"><span><Trash2 size={14} /></span>{errorMessage}</div>}
        {!loading && !errorMessage && saved.length === 0 && (
          <div className="saved-state"><Bookmark size={22} /><strong>No saved breakdowns yet.</strong><p>Save a completed breakdown and it will appear here on this browser.</p></div>
        )}
        {!loading && !errorMessage && saved.length > 0 && (
          <div className="saved-list">
            {saved.map((item) => (
              <article className="saved-item" key={item.id}>
                <button type="button" className="saved-item-open" onClick={() => setLocation(`/saved/${item.id}`)}>
                  <div className="saved-item-icon"><Bookmark size={18} /></div>
                  <div className="saved-item-copy">
                    <strong>{item.filename}</strong>
                    <span><Clock3 size={12} /> {formatDate(item.savedAt)} <i /> {item.sceneCount} frames</span>
                  </div>
                </button>
                <button type="button" className="icon-button" onClick={() => void handleDelete(item.id)} aria-label={`Delete saved breakdown ${item.filename}`}>
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export function SavedBreakdownPage({ savedId }: { savedId: string }) {
  const [saved, setSaved] = useState<SavedBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    loadSavedBreakdown(savedId)
      .then((breakdown) => {
        if (active && breakdown) {
          setSaved(breakdown);
        } else if (active) {
          setErrorMessage('That saved breakdown is no longer available in this browser.');
        }
      })
      .catch((error: unknown) => {
        if (active) setErrorMessage(error instanceof Error ? error.message : 'The saved breakdown could not be opened.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [savedId]);

  useEffect(() => () => {
    if (saved) releaseSavedBreakdown(saved);
  }, [saved]);

  if (loading) {
    return <div className="app-frame"><AppHeader compact /><main className="studio-shell state-shell"><div className="saved-state"><LoaderCircle className="animate-spin" size={20} /> Opening saved breakdown</div></main></div>;
  }
  if (errorMessage || !saved) {
    return (
      <div className="app-frame">
        <AppHeader compact />
        <main className="studio-shell state-shell">
          <div className="state-card state-card-error">
            <div className="state-icon"><Trash2 size={22} /></div>
            <div><div className="eyebrow">SAVED BREAKDOWN</div><h2 className="font-display">Could not open it.</h2><p>{errorMessage || 'That saved breakdown is not available.'}</p></div>
          </div>
        </main>
      </div>
    );
  }
  return <BreakdownPage videoId="" savedBreakdown={saved} />;
}