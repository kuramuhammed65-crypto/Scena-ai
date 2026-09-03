import type { SceneFrame } from '@workspace/api-client-react';

type StoryPanelProps = {
  scenes: SceneFrame[];
  selectedScene: SceneFrame | null;
  onSelect: (scene: SceneFrame) => void;
};

export function StoryPanel({ scenes, selectedScene, onSelect }: StoryPanelProps) {
  const orderedScenes = [...scenes].sort((left, right) => left.index - right.index);

  return (
    <div className="story-panel" data-testid="story-panel">
      <div className="story-panel-grid">
        {orderedScenes.map((scene) => (
          <button
            type="button"
            key={scene.id}
            className={`story-panel-card ${selectedScene?.id === scene.id ? 'is-selected' : ''}`}
            onClick={() => onSelect(scene)}
            aria-label={`Scene ${scene.index}`}
            aria-pressed={selectedScene?.id === scene.id}
            data-testid={`button-story-panel-scene-${scene.id}`}
          >
            <img
              src={scene.imageUrl}
              alt={`Scene ${scene.index}`}
              draggable={false}
              data-testid={`img-story-panel-scene-${scene.id}`}
            />
            <span className="story-panel-number">{scene.index}</span>
          </button>
        ))}
      </div>
    </div>
  );
}