import { useEffect, useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Check,
  Download,
  Film,
  FileVideo,
  Gauge,
  Grid2X2,
  Grid3X3,
  ImageDown,
  LoaderCircle,
  Play,
  RefreshCw,
  Rows3,
  ScanLine,
  Sparkles,
  Timer,
  X,
} from 'lucide-react';
import {
  getDownloadFramesQueryKey,
  getGetVideoBreakdownQueryKey,
  useDownloadFrames,
  useGetVideoBreakdown,
  useProcessVideo,
  type SceneFrame,
  type VideoBreakdown,
} from '@workspace/api-client-react';
import {
  isBreakdownSaved,
  saveBreakdown,
  type SavedBreakdown,
} from '@/lib/saved-breakdowns';
import { StoryPanel } from '@/components/story-panel';
import { downloadContactSheet } from '@/lib/storyboard-download';

type ProcessError = { error?: string };
type SceneViewMode = 'grid' | 'storyboard' | 'contact-sheet';

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'error' in error) {
    const response = error as ProcessError;
    if (response.error) return response.error;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3" data-testid="brand-scenebreakdown">
      <span className="brand-mark">
        <span />
        <span />
        <span />
      </span>
      <span className="font-display text-[15px] font-semibold tracking-[-0.03em]">
        Scene<span className="text-primary">Breakdown</span>
      </span>
    </div>
  );
}

export function AppHeader({ compact = false }: { compact?: boolean }) {
  const [, setLocation] = useLocation();
  return (
    <header className={`app-header ${compact ? 'app-header-compact' : ''}`}>
      <button
        type="button"
        className="cursor-pointer"
        onClick={() => setLocation('/')}
        data-testid="button-home"
        aria-label="Go to upload"
      >
        <BrandMark />
      </button>
      <div className="header-actions">
        <button type="button" className="saved-link" onClick={() => setLocation('/saved')}><Bookmark size={14} /> Saved</button>
        <div className="header-meta">
          <span className="status-dot" />
          <span>LOCAL STUDIO</span>
        </div>
      </div>
    </header>
  );
}

function UploadIllustration() {
  return (
    <div className="upload-illustration" aria-hidden="true">
      <div className="film-reel">
        <span className="reel-hole reel-hole-one" />
        <span className="reel-hole reel-hole-two" />
        <span className="reel-hole reel-hole-three" />
        <span className="reel-hole reel-hole-four" />
        <span className="reel-core" />
      </div>
      <div className="frame-corner frame-corner-tl" />
      <div className="frame-corner frame-corner-br" />
      <div className="scan-line" />
    </div>
  );
}

function ProcessingState({ file }: { file: File }) {
  return (
    <div className="processing-stage" data-testid="status-processing">
      <div className="processing-topline">
        <div className="eyebrow"><span className="eyebrow-line" /> PROCESSING SOURCE</div>
        <span className="mono-label">{formatFileSize(file.size)}</span>
      </div>
      <div className="processing-art">
        <div className="processing-orbit orbit-one" />
        <div className="processing-orbit orbit-two" />
        <div className="processing-core"><ScanLine size={36} strokeWidth={1.2} /></div>
      </div>
      <h1 className="font-display processing-title">Finding the<br /><em>moments</em> between.</h1>
      <p className="processing-copy">
        Reading the visual rhythm of <strong>{file.name}</strong>. We only keep frames where the story moves.
      </p>
      <div className="progress-track" aria-label="Processing video">
        <div className="progress-fill" />
      </div>
      <div className="processing-foot">
        <span>SHOT DETECTION</span>
        <span className="processing-pulse">WORKING</span>
      </div>
    </div>
  );
}

export function UploadPage() {
  const [, setLocation] = useLocation();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const processVideo = useProcessVideo();

  const chooseFile = (candidate?: File) => {
    if (!candidate) return;
    const supported = ['video/mp4', 'video/quicktime', 'video/webm'];
    const extensionSupported = /\.(mp4|mov|webm)$/i.test(candidate.name);
    if (!supported.includes(candidate.type) && !extensionSupported) {
      setErrorMessage('That format is not supported. Choose an MP4, MOV, or WebM file.');
      setFile(null);
      return;
    }
    setErrorMessage('');
    setFile(candidate);
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    chooseFile(event.target.files?.[0]);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0]);
  };

  const startProcessing = () => {
    if (!file || processVideo.isPending) return;
    setErrorMessage('');
    processVideo.mutate(
      { data: { video: file } },
      {
        onSuccess: (breakdown: VideoBreakdown) => setLocation(`/breakdown/${breakdown.id}`),
        onError: (error) => setErrorMessage(getErrorMessage(error, 'The video could not be processed. Try again.')),
      },
    );
  };

  if (processVideo.isPending && file) {
    return (
      <div className="app-frame">
        <AppHeader />
        <main className="studio-shell">
          <ProcessingState file={file} />
        </main>
        <footer className="studio-footer">
          <span>SCENEBREAKDOWN / ANALYZING VISUAL RHYTHM</span>
          <span>KEEPING THE REAL FRAMES</span>
        </footer>
      </div>
    );
  }

  return (
    <div className="app-frame">
      <AppHeader />
      <main className="studio-shell upload-shell">
        <section className="upload-intro">
          <div className="eyebrow"><span className="eyebrow-line" /> VISUAL EDITING TOOL / 01</div>
          <h1 className="font-display hero-title">See the cut<br /><em>clearly.</em></h1>
          <p className="hero-copy">Drop in a video. SceneBreakdown finds the visual turns and lays them out in order — a quiet map of what happened.</p>
          <div className="hero-details">
            <span><Timer size={14} /> FRAME-TRUE</span>
            <span><Gauge size={14} /> SHOT-AWARE</span>
          </div>
        </section>

        <section className="upload-panel-wrap">
          <div
            className={`upload-panel ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            data-testid="dropzone-video"
          >
            <input
              ref={inputRef}
              type="file"
              accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
              onChange={handleInput}
              className="sr-only"
              data-testid="input-video-file"
            />
            {file ? (
              <div className="selected-file" data-testid="status-selected-file">
                <div className="file-icon"><FileVideo size={25} strokeWidth={1.5} /></div>
                <div className="file-copy">
                  <strong>{file.name}</strong>
                  <span>{formatFileSize(file.size)} <i /> Ready to inspect</span>
                </div>
                <button type="button" className="icon-button" onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ''; }} data-testid="button-remove-file" aria-label="Remove selected video">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <>
                <UploadIllustration />
                <div className="upload-panel-copy">
                  <h2 className="font-display">Bring your footage.</h2>
                  <p>Drop a video here, or <button type="button" className="inline-link" onClick={() => inputRef.current?.click()} data-testid="button-browse-video">browse files</button></p>
                </div>
                <div className="format-note">MP4 <span /> MOV <span /> WEBM <small>up to 250 MB</small></div>
              </>
            )}
          </div>
          {file && (
            <button type="button" className="primary-action" onClick={startProcessing} data-testid="button-process-video">
              <span>{processVideo.isPending ? 'Reading footage' : 'Build breakdown'}</span>
              {processVideo.isPending ? <LoaderCircle className="animate-spin" size={17} /> : <ArrowUpRight size={18} />}
            </button>
          )}
          {errorMessage && (
            <div className="error-message" role="alert" data-testid="status-upload-error">
              <span><X size={14} /></span>{errorMessage}
              {file && <button type="button" onClick={startProcessing} data-testid="button-retry-process"><RefreshCw size={14} /> Retry</button>}
            </div>
          )}
        </section>
      </main>
      <footer className="studio-footer">
        <span>SCENEBREAKDOWN / A SMALL TOOL FOR BIG CUTS</span>
        <span>NO TIMELINE. JUST THE STORY.</span>
      </footer>
    </div>
  );
}

function LoadingBreakdown() {
  return (
    <div className="breakdown-loading" data-testid="status-breakdown-loading">
      <div className="skeleton skeleton-video" />
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton-grid">{[1, 2, 3, 4, 5].map((item) => <div className="skeleton skeleton-frame" key={item} />)}</div>
    </div>
  );
}

function BreakdownError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="state-card state-card-error" data-testid="status-breakdown-error">
      <div className="state-icon"><X size={22} /></div>
      <div>
        <div className="eyebrow">COULD NOT OPEN BREAKDOWN</div>
        <h2 className="font-display">The cut went quiet.</h2>
        <p>{message}</p>
        <button type="button" className="secondary-action" onClick={onRetry} data-testid="button-retry-breakdown"><RefreshCw size={15} /> Try again</button>
      </div>
    </div>
  );
}

function SceneCard({ scene, selected, onSelect }: { scene: SceneFrame; selected: boolean; onSelect: (scene: SceneFrame) => void }) {
  return (
    <button
      type="button"
      className={`scene-card ${selected ? 'is-selected' : ''}`}
      onClick={() => onSelect(scene)}
      data-testid={`button-scene-${scene.id}`}
      aria-label={`Scene ${scene.index} at ${scene.timestampLabel}`}
    >
      <div className="scene-image-wrap">
        <img src={scene.imageUrl} alt={`Frame from ${scene.timestampLabel}`} data-testid={`img-scene-${scene.id}`} />
        <span className="scene-index">{String(scene.index).padStart(2, '0')}</span>
        <span className="scene-play"><Play size={12} fill="currentColor" /></span>
      </div>
      <div className="scene-card-meta">
        <span className="scene-time">{scene.timestampLabel}</span>
        <span className="scene-file">{scene.filename ?? `frame_${String(scene.index).padStart(3, '0')}`}</span>
      </div>
    </button>
  );
}

function StoryboardSceneCard({
  scene,
  selected,
  onSelect,
  onDownload,
}: {
  scene: SceneFrame;
  selected: boolean;
  onSelect: (scene: SceneFrame) => void;
  onDownload: (scene: SceneFrame) => void;
}) {
  return (
    <article className={`scene-card storyboard-scene-card ${selected ? 'is-selected' : ''}`}>
      <button
        type="button"
        className="storyboard-scene-select"
        onClick={() => onSelect(scene)}
        data-testid={`button-storyboard-scene-${scene.id}`}
        aria-label={`Scene ${scene.index} at ${scene.timestampLabel}`}
      >
        <div className="scene-image-wrap">
          <img src={scene.imageUrl} alt={`Frame from ${scene.timestampLabel}`} data-testid={`img-storyboard-scene-${scene.id}`} />
          <span className="scene-index">{String(scene.index).padStart(2, '0')}</span>
          <span className="scene-play"><Play size={12} fill="currentColor" /></span>
        </div>
      </button>
      <div className="storyboard-scene-footer">
        <div className="scene-card-meta">
          <span className="scene-time">{scene.timestampLabel}</span>
          <span className="scene-file">{scene.filename ?? `frame_${String(scene.index).padStart(3, '0')}`}</span>
        </div>
        <button
          type="button"
          className="storyboard-scene-download"
          onClick={() => onDownload(scene)}
          aria-label={`Download scene ${scene.index}`}
          data-testid={`button-download-scene-${scene.id}`}
        >
          <Download size={13} /> Download
        </button>
      </div>
    </article>
  );
}

function VideoStage({ breakdown, selectedScene, storyboardUrl }: { breakdown: VideoBreakdown; selectedScene: SceneFrame | null; storyboardUrl?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekToScene = (scene: SceneFrame) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = scene.timestamp;
    void videoRef.current.play();
  };
  return (
    <div className="video-stage-wrap">
      <div className="video-stage">
        {storyboardUrl ? (
          <img className="saved-storyboard-preview" src={storyboardUrl} alt={`Saved storyboard for ${breakdown.filename}`} data-testid="img-saved-storyboard" />
        ) : (
          <video ref={videoRef} src={breakdown.originalVideoUrl} controls playsInline poster={selectedScene?.imageUrl} data-testid="video-original-footage">
            Your browser does not support video playback.
          </video>
        )}
        <div className="video-stage-label"><span className="status-dot" /> {storyboardUrl ? 'SAVED / STORYBOARD' : 'SOURCE / ORIGINAL'}</div>
        {selectedScene && !storyboardUrl && (
          <button type="button" className="jump-to-frame" onClick={() => seekToScene(selectedScene)} data-testid="button-jump-to-scene">
            <Play size={13} fill="currentColor" /> Jump to {selectedScene.timestampLabel}
          </button>
        )}
      </div>
      <div className="video-caption">
        <span><Film size={15} /> {breakdown.width} × {breakdown.height}</span>
        <span><Timer size={15} /> {formatDuration(breakdown.duration)}</span>
      </div>
    </div>
  );
}

export function BreakdownPage({ videoId, savedBreakdown }: { videoId: string; savedBreakdown?: SavedBreakdown }) {
  const [, setLocation] = useLocation();
  const [selectedScene, setSelectedScene] = useState<SceneFrame | null>(null);
  const [viewMode, setViewMode] = useState<SceneViewMode>('grid');
  const [downloadError, setDownloadError] = useState('');
  const [storyboardDownloadState, setStoryboardDownloadState] = useState<'idle' | 'downloading'>('idle');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(savedBreakdown ? 'saved' : 'idle');
  const [saveMessage, setSaveMessage] = useState('');
  const breakdownQuery = useGetVideoBreakdown(videoId, {
    query: { enabled: Boolean(videoId) && !savedBreakdown, queryKey: getGetVideoBreakdownQueryKey(videoId) },
  });
  const framesQuery = useDownloadFrames(videoId, {
    query: { enabled: false, queryKey: getDownloadFramesQueryKey(videoId) },
  });
  const breakdown = savedBreakdown ?? breakdownQuery.data;

  useEffect(() => {
    if (!breakdown || savedBreakdown) return;
    isBreakdownSaved(breakdown.id)
      .then((saved) => setSaveState(saved ? 'saved' : 'idle'))
      .catch(() => undefined);
  }, [breakdown, savedBreakdown]);

  const handleSceneSelect = (scene: SceneFrame) => setSelectedScene(scene);
  const handleDownloadFrames = async () => {
    setDownloadError('');
    try {
      if (savedBreakdown) {
        setDownloadError('Frame archives are not included in saved breakdowns.');
        return;
      }
      const result = await framesQuery.refetch();
      if (result.data) downloadBlob(result.data, `${breakdown?.filename ?? 'scene-breakdown'}-frames.zip`);
    } catch {
      setDownloadError('Frames could not be prepared right now.');
    }
  };
  const handleDownloadScene = async (scene: SceneFrame) => {
    setDownloadError('');
    try {
      const result = await fetch(new URL(scene.imageUrl, window.location.origin));
      if (!result.ok) throw new Error('The scene image could not be downloaded.');
      downloadBlob(await result.blob(), `${breakdown?.filename ?? 'scene-breakdown'}-scene-${scene.index}.jpg`);
    } catch {
      setDownloadError('The scene image could not be downloaded right now.');
    }
  };
  const handleDownloadStoryboard = async () => {
    setDownloadError('');
    if (!breakdown) return;
    setStoryboardDownloadState('downloading');
    try {
      const filename = `${breakdown.filename.replace(/\.[^.]+$/, '') || 'scene-breakdown'}-storyboard.png`;
      await downloadContactSheet(breakdown.scenes, filename);
    } catch {
      setDownloadError('The storyboard could not be downloaded right now.');
    } finally {
      setStoryboardDownloadState('idle');
    }
  };

  const handleSave = async () => {
    if (!breakdown || savedBreakdown || saveState === 'saving' || saveState === 'saved') return;
    setSaveState('saving');
    setSaveMessage('');
    try {
      await saveBreakdown(breakdown);
      setSaveState('saved');
    } catch (error) {
      setSaveState('error');
      setSaveMessage(error instanceof Error ? error.message : 'The breakdown could not be saved.');
    }
  };

  if (breakdownQuery.isLoading) {
    return <div className="app-frame"><AppHeader compact /><main className="studio-shell"><LoadingBreakdown /></main></div>;
  }
  if (breakdownQuery.isError || !breakdown) {
    return (
      <div className="app-frame">
        <AppHeader compact />
        <main className="studio-shell state-shell">
          <BreakdownError message={getErrorMessage(breakdownQuery.error, 'This breakdown is no longer available.')} onRetry={() => breakdownQuery.refetch()} />
        </main>
      </div>
    );
  }

  const scenes = breakdown.scenes ?? [];
  const orderedScenes = [...scenes].sort((left, right) => left.index - right.index);
  const activeScene = selectedScene ?? orderedScenes[0] ?? null;

  return (
    <div className="app-frame">
      <AppHeader compact />
      <main className="studio-shell breakdown-shell">
        <div className="breakdown-heading">
          <div>
            <button type="button" className="back-link" onClick={() => setLocation('/')} data-testid="button-back-upload"><ArrowLeft size={15} /> New breakdown</button>
            <div className="eyebrow"><span className="eyebrow-line" /> BREAKDOWN / {breakdown.id.slice(0, 8).toUpperCase()}</div>
            <h1 className="font-display breakdown-title" data-testid="text-breakdown-filename">{breakdown.filename}</h1>
          </div>
          <div className="breakdown-actions">
            {!savedBreakdown && <button type="button" className="secondary-action" onClick={() => void handleSave()} disabled={saveState === 'saving'} data-testid="button-save-breakdown">
              {saveState === 'saving' ? <LoaderCircle className="animate-spin" size={15} /> : <Bookmark size={15} />} {saveState === 'saved' ? 'Saved' : 'Save'}
            </button>}
            <button type="button" className="secondary-action" onClick={handleDownloadStoryboard} disabled={storyboardDownloadState === 'downloading'} data-testid="button-download-storyboard">
              {storyboardDownloadState === 'downloading' ? <LoaderCircle className="animate-spin" size={15} /> : <ImageDown size={15} />} Download Storyboard
            </button>
            {!savedBreakdown && <button type="button" className="primary-action small-action" onClick={handleDownloadFrames} disabled={framesQuery.isFetching} data-testid="button-download-frames">
              {framesQuery.isFetching ? <LoaderCircle className="animate-spin" size={15} /> : <Download size={15} />} Export frames
            </button>}
          </div>
        </div>
        {saveMessage && <div className="error-message" role="alert" data-testid="status-save-error"><span><X size={14} /></span>{saveMessage}</div>}

        <div className="breakdown-overview">
          <div className="overview-stat"><span className="stat-label">DURATION</span><strong data-testid="text-breakdown-duration">{formatDuration(breakdown.duration)}</strong></div>
          <div className="overview-stat"><span className="stat-label">SOURCE</span><strong data-testid="text-breakdown-resolution">{breakdown.width} × {breakdown.height}</strong></div>
          <div className="overview-stat"><span className="stat-label">SCENE CHANGES</span><strong data-testid="text-breakdown-scene-count">{scenes.length}</strong></div>
          <div className="overview-note"><Sparkles size={16} /> Every frame is pulled directly from your original footage.</div>
        </div>
        {downloadError && <div className="error-message" role="alert" data-testid="status-download-error"><span><X size={14} /></span>{downloadError}</div>}

        <div className={`review-layout ${viewMode === 'contact-sheet' ? 'review-layout-contact-sheet' : ''}`}>
          <VideoStage breakdown={breakdown} selectedScene={activeScene} storyboardUrl={savedBreakdown?.storyboardUrl} />
          <aside className="inspector-panel">
            <div className="inspector-heading">
              <div><span className="eyebrow"><span className="eyebrow-line" /> SCENE MAP</span><h2 className="font-display">The visual rhythm</h2></div>
              <div className="inspector-tools">
                <div className="view-toggle" role="group" aria-label="Scene view">
                  <button
                    type="button"
                    className={viewMode === 'grid' ? 'is-active' : ''}
                    onClick={() => setViewMode('grid')}
                    aria-label="Grid view"
                    aria-pressed={viewMode === 'grid'}
                    data-testid="button-grid-view"
                  >
                    <Grid2X2 size={13} /> Grid
                  </button>
                  <button
                    type="button"
                    className={viewMode === 'storyboard' ? 'is-active' : ''}
                    onClick={() => setViewMode('storyboard')}
                    aria-label="Storyboard view"
                    aria-pressed={viewMode === 'storyboard'}
                    data-testid="button-storyboard-view"
                  >
                    <Rows3 size={13} /> Storyboard
                  </button>
                  <button
                    type="button"
                    className={viewMode === 'contact-sheet' ? 'is-active' : ''}
                    onClick={() => setViewMode('contact-sheet')}
                    aria-label="Story panel grid contact sheet view"
                    aria-pressed={viewMode === 'contact-sheet'}
                    data-testid="button-contact-sheet-view"
                  >
                    <Grid3X3 size={13} /> Story panel
                  </button>
                </div>
                <span className="scene-count-badge" data-testid="text-scene-count-badge">{scenes.length}</span>
              </div>
            </div>
            {scenes.length === 0 ? (
              <div className="empty-scenes" data-testid="status-empty-scenes">
                <Grid2X2 size={22} />
                <strong>No scene changes found</strong>
                <p>This footage reads as one continuous visual moment.</p>
              </div>
            ) : viewMode === 'contact-sheet' ? (
              <StoryPanel scenes={orderedScenes} selectedScene={activeScene} onSelect={handleSceneSelect} />
            ) : (
              <div className={`scene-list scene-list-${viewMode}`} data-testid="list-scenes">
                {viewMode === 'storyboard'
                  ? orderedScenes.map((scene) => (
                    <StoryboardSceneCard
                      key={scene.id}
                      scene={scene}
                      selected={activeScene?.id === scene.id}
                      onSelect={handleSceneSelect}
                      onDownload={(selected) => void handleDownloadScene(selected)}
                    />
                  ))
                  : orderedScenes.map((scene) => (
                    <SceneCard key={scene.id} scene={scene} selected={activeScene?.id === scene.id} onSelect={handleSceneSelect} />
                  ))}
              </div>
            )}
          </aside>
        </div>

        {activeScene && (
          <section className="selected-frame-strip" data-testid="status-selected-scene">
            <div className="selected-frame-copy">
              <span className="eyebrow"><span className="eyebrow-line" /> SELECTED FRAME</span>
              <h2 className="font-display">{activeScene.timestampLabel}</h2>
              <p>Scene {String(activeScene.index).padStart(2, '0')} <i /> {activeScene.filename ?? 'Extracted frame'}</p>
            </div>
            <img src={activeScene.imageUrl} alt={`Selected scene at ${activeScene.timestampLabel}`} data-testid="img-selected-scene" />
            <div className="selected-frame-check"><Check size={16} /> Source frame</div>
          </section>
        )}
      </main>
      <footer className="studio-footer">
        <span>{scenes.length} FRAMES / {formatDuration(breakdown.duration)} OF SOURCE</span>
        <span>REVIEW MODE / CHRONOLOGICAL</span>
      </footer>
    </div>
  );
}