import { Progress, ProgressIndicator, ProgressLabel, ProgressTrack } from "@ui-sdk/react/progress";

const GHOST_COLUMNS = [
  { id: "a", cards: 3 },
  { id: "b", cards: 2 },
  { id: "c", cards: 4 },
  { id: "d", cards: 1 },
];

// Rendered on the server, so it shows at once while stories load from Storyblok.
export function LoadingBoard() {
  return (
    <main className="loading">
      <div className="loading-ghost" aria-hidden="true">
        {GHOST_COLUMNS.map((column) => (
          <div key={column.id} className="ghost-column">
            <span className="ghost-title" />
            {Array.from({ length: column.cards }, (_, i) => (
              <span key={`${column.id}-${i}`} className="ghost-card" />
            ))}
          </div>
        ))}
      </div>
      <div className="loading-center">
        <Progress value={null} className="loading-progress">
          <ProgressLabel>Loading the workflow board</ProgressLabel>
          <ProgressTrack>
            <ProgressIndicator />
          </ProgressTrack>
        </Progress>
        <p>Fetching workflow stages and stories from Storyblok…</p>
      </div>
    </main>
  );
}
