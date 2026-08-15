import { useState } from 'preact/hooks';
import {
  backupReminderDue,
  factKey,
  familyLeaderboard,
  levelForXp,
  masteryOf,
  parseSaveFile,
  tierFor,
} from '../core';
import type { PlayerRecord } from '../core';
import type { AppProps } from './App';

const TABLE_RANGE = Array.from({ length: 12 }, (_, i) => i + 1);

function MasteryGrid({ player, onClose }: { player: PlayerRecord; onClose: () => void }) {
  return (
    <div class="confirm-overlay" data-testid="mastery-grid">
      <div class="grid-box">
        <div class="grid-title">{player.name}'s times tables</div>
        <div class="mastery-table">
          <div class="mastery-corner">×</div>
          {TABLE_RANGE.map((c) => (
            <div class="mastery-header" key={`h${c}`}>
              {c}
            </div>
          ))}
          {TABLE_RANGE.map((r) => (
            <>
              <div class="mastery-header" key={`r${r}`}>
                {r}
              </div>
              {TABLE_RANGE.map((c) => (
                <div
                  key={`${r}-${c}`}
                  class={`mastery-cell mastery-${masteryOf(player.factStats[factKey(r, c)])}`}
                  data-testid={`cell-${r}-${c}`}
                  title={`${r} × ${c}`}
                />
              ))}
            </>
          ))}
        </div>
        <div class="grid-legend">
          <span class="legend-item legend-mastered">Mastered</span>
          <span class="legend-item legend-learning">Practicing</span>
          <span class="legend-item legend-struggling">Tricky</span>
          <span class="legend-item legend-unseen">Not tried</span>
        </div>
        <button class="big-button" data-testid="close-grid" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function Leaderboard({ state }: Pick<AppProps, 'state'>) {
  const entries = familyLeaderboard(state.players);
  if (entries.length === 0 || entries.every((e) => e.topScore === 0)) return null;
  return (
    <div class="leaderboard" data-testid="leaderboard">
      <div class="leaderboard-title">🏆 Family Leaderboard</div>
      {entries.map((entry, rank) => (
        <div class="leaderboard-row" key={entry.id} data-testid={`leaderboard-${entry.id}`}>
          <span class="leaderboard-name">
            {rank === 0 ? '👑 ' : ''}
            {entry.name}
          </span>
          {(['easy', 'medium', 'hard'] as const).map((d) => (
            <span class="leaderboard-best" key={d}>
              {tierFor(d).label}: {entry.bests[d] ?? '—'}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function TitleScreen({ state, dispatch }: AppProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [gridId, setGridId] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<string | null>(null);
  const [importError, setImportError] = useState(false);

  const deleting = state.players.find((p) => p.id === deletingId);
  const gridPlayer = state.players.find((p) => p.id === gridId);

  // The file-upload edge: read the chosen file, pre-check it with the same
  // core pipeline the import event uses, then ask before overwriting.
  const onImportFile = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const text = await file.text();
    if (parseSaveFile(text) === null) {
      setImportError(true);
    } else {
      setPendingImport(text);
    }
  };

  return (
    <div class="hud screen-center">
      <h1 class="game-title">MathHero</h1>
      {state.players.length > 0 && <p class="subtitle">Who's training today?</p>}
      <div class="player-list">
        {state.players.map((player: PlayerRecord) =>
          renamingId === player.id ? (
            <div class="player-row" key={player.id}>
              <input
                class="name-input"
                data-testid={`rename-input-${player.id}`}
                value={renameText}
                onInput={(e) => setRenameText((e.target as HTMLInputElement).value)}
              />
              <button
                class="pad-key row-button"
                data-testid={`rename-save-${player.id}`}
                onClick={() => {
                  dispatch({ type: 'PLAYER_RENAMED', id: player.id, name: renameText });
                  setRenamingId(null);
                }}
              >
                ✓
              </button>
            </div>
          ) : (
            <div class="player-row" key={player.id}>
              <button
                class="player-button"
                data-testid={`player-${player.id}`}
                onClick={() => dispatch({ type: 'PLAYER_SELECTED', id: player.id })}
              >
                {player.name} <span class="player-level">Lv {levelForXp(player.xp)}</span>
              </button>
              <button
                class="pad-key row-button"
                aria-label={`Times tables for ${player.name}`}
                data-testid={`grid-${player.id}`}
                onClick={() => setGridId(player.id)}
              >
                📊
              </button>
              <button
                class="pad-key row-button"
                aria-label={`Rename ${player.name}`}
                data-testid={`rename-${player.id}`}
                onClick={() => {
                  setRenamingId(player.id);
                  setRenameText(player.name);
                }}
              >
                ✏️
              </button>
              <button
                class="pad-key row-button"
                aria-label={`Delete ${player.name}`}
                data-testid={`delete-${player.id}`}
                onClick={() => setDeletingId(player.id)}
              >
                🗑
              </button>
            </div>
          ),
        )}
      </div>
      <Leaderboard state={state} />
      <button
        class="big-button"
        data-testid="new-hero"
        onClick={() => dispatch({ type: 'HERO_CREATION_OPENED' })}
      >
        {state.players.length === 0 ? 'Make your hero!' : 'New hero'}
      </button>

      {backupReminderDue(state) && (
        <div class="backup-reminder" data-testid="backup-reminder">
          💾 It's been a while — back up your heroes!
        </div>
      )}
      <div class="save-actions">
        <button
          class="pad-key save-button"
          data-testid="mute-toggle"
          aria-label={state.muted ? 'Unmute sounds' : 'Mute sounds'}
          onClick={() => dispatch({ type: 'MUTE_TOGGLED' })}
        >
          {state.muted ? '🔇' : '🔊'}
        </button>
        <button
          class="pad-key save-button"
          data-testid="export-save"
          onClick={() => dispatch({ type: 'SAVE_EXPORTED' })}
        >
          💾 Save backup
        </button>
        <label class="pad-key save-button import-label">
          📥 Load backup
          <input
            type="file"
            accept="application/json,.json"
            data-testid="import-file"
            class="import-input"
            onChange={onImportFile}
          />
        </label>
      </div>

      {pendingImport !== null && (
        <div class="confirm-overlay" data-testid="import-confirm">
          <div class="confirm-box">
            <p class="confirm-text">Load this backup?</p>
            <p class="confirm-warning">Your current heroes will be replaced by the backup!</p>
            <div class="confirm-actions">
              <button
                class="big-button"
                data-testid="cancel-import"
                onClick={() => setPendingImport(null)}
              >
                Keep current
              </button>
              <button
                class="big-button danger-button"
                data-testid="confirm-import"
                onClick={() => {
                  dispatch({ type: 'SAVE_IMPORTED', text: pendingImport });
                  setPendingImport(null);
                }}
              >
                Load backup
              </button>
            </div>
          </div>
        </div>
      )}

      {importError && (
        <div class="confirm-overlay" data-testid="import-error">
          <div class="confirm-box">
            <p class="confirm-text">Hmm, that file isn't a MathHero backup.</p>
            <p class="confirm-warning">Nothing was changed — your heroes are safe!</p>
            <div class="confirm-actions">
              <button
                class="big-button"
                data-testid="dismiss-import-error"
                onClick={() => setImportError(false)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {gridPlayer && <MasteryGrid player={gridPlayer} onClose={() => setGridId(null)} />}
      {deleting && (
        <div class="confirm-overlay" data-testid="delete-confirm">
          <div class="confirm-box">
            <p class="confirm-text">
              Delete <strong>{deleting.name}</strong> forever?
            </p>
            <p class="confirm-warning">All their levels and scores will be gone for good!</p>
            <div class="confirm-actions">
              <button class="big-button" data-testid="cancel-delete" onClick={() => setDeletingId(null)}>
                Keep hero
              </button>
              <button
                class="big-button danger-button"
                data-testid="confirm-delete"
                onClick={() => {
                  dispatch({ type: 'PLAYER_DELETED', id: deleting.id });
                  setDeletingId(null);
                }}
              >
                Delete forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
