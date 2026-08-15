import { useState } from 'preact/hooks';
import { familyLeaderboard, levelForXp, tierFor } from '../core';
import type { PlayerRecord } from '../core';
import type { AppProps } from './App';

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
                {player.name} <span class="player-level">Lv {levelForXp(player.xp)}</span>
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
