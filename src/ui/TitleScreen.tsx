import { useState } from 'preact/hooks';
import type { PlayerRecord } from '../core';
import type { AppProps } from './App';

export function TitleScreen({ state, dispatch }: AppProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleting = state.players.find((p) => p.id === deletingId);

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
                {player.name}
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
      <button
        class="big-button"
        data-testid="new-hero"
        onClick={() => dispatch({ type: 'HERO_CREATION_OPENED' })}
      >
        {state.players.length === 0 ? 'Make your hero!' : 'New hero'}
      </button>

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
