import { describe, expect, it } from 'vitest';
import {
  buildSaveFile,
  initialState,
  parseSaveFile,
  SAVE_FILE_VERSION,
  serializeSaveFile,
  update,
} from './index';
import { dispatchAll, preRound, TEST_APPEARANCE, TEST_COLORS } from './test-helpers';

describe('hero creation', () => {
  it('creates a player with a stable id, makes them active, and heads to pre-round', () => {
    const state = initialState({ seed: 1 });
    const opened = update(state, { type: 'HERO_CREATION_OPENED' }).state;
    expect(opened.phase).toBe('hero-creation');

    const result = update(opened, { type: 'PLAYER_CREATED', name: '  Zara  ', colors: TEST_COLORS, appearance: TEST_APPEARANCE });
    expect(result.state.players).toEqual([
      { id: 'p1', name: 'Zara', colors: TEST_COLORS, appearance: TEST_APPEARANCE, roundsPlayed: 0, xp: 0, bests: {}, factStats: {} },
    ]);
    expect(result.state.activePlayerId).toBe('p1');
    expect(result.state.phase).toBe('pre-round');
    expect(result.effects).toEqual([{ type: 'SAVE_FILE_CHANGED' }]);
  });

  it('rejects an empty name and unknown color presets', () => {
    const opened = update(initialState({ seed: 1 }), { type: 'HERO_CREATION_OPENED' }).state;
    expect(update(opened, { type: 'PLAYER_CREATED', name: '   ', colors: TEST_COLORS, appearance: TEST_APPEARANCE }).state).toEqual(opened);
    expect(
      update(opened, {
        type: 'PLAYER_CREATED',
        name: 'Zara',
        colors: { ...TEST_COLORS, hair: 'nope' },
        appearance: TEST_APPEARANCE,
      }).state,
    ).toEqual(opened);
  });

  it('ids stay unique even after deletions', () => {
    let state = preRound(1, 'First');
    state = dispatchAll(state, [
      { type: 'TITLE_OPENED' },
      { type: 'PLAYER_DELETED', id: 'p1' },
      { type: 'HERO_CREATION_OPENED' },
      { type: 'PLAYER_CREATED', name: 'Second', colors: TEST_COLORS, appearance: TEST_APPEARANCE },
    ]);
    expect(state.players.map((p) => p.id)).toEqual(['p2']);
  });
});

describe('selection, rename, delete', () => {
  it('selecting a hero on the Title screen makes them active', () => {
    let state = dispatchAll(preRound(1, 'Zara'), [
      { type: 'TITLE_OPENED' },
      { type: 'HERO_CREATION_OPENED' },
      { type: 'PLAYER_CREATED', name: 'Milo', colors: TEST_COLORS, appearance: TEST_APPEARANCE },
      { type: 'TITLE_OPENED' },
    ]);
    state = update(state, { type: 'PLAYER_SELECTED', id: 'p1' }).state;
    expect(state.activePlayerId).toBe('p1');
    expect(state.phase).toBe('pre-round');
  });

  it('rename keeps the id and stats', () => {
    const state = preRound(1, 'Zara');
    const result = update(state, { type: 'PLAYER_RENAMED', id: 'p1', name: 'Super Zara' });
    expect(result.state.players[0]).toMatchObject({ id: 'p1', name: 'Super Zara' });
    expect(result.effects).toEqual([{ type: 'SAVE_FILE_CHANGED' }]);
  });

  it('deleting the active hero returns to the Title screen', () => {
    const state = preRound(1, 'Zara');
    const result = update(state, { type: 'PLAYER_DELETED', id: 'p1' });
    expect(result.state.players).toEqual([]);
    expect(result.state.activePlayerId).toBeNull();
    expect(result.state.phase).toBe('title');
    expect(result.effects).toEqual([{ type: 'SAVE_FILE_CHANGED' }]);
  });

  it('a Round cannot start without an active Player', () => {
    const state = initialState({ seed: 1 });
    expect(update(state, { type: 'ROUND_STARTED' }).state.phase).toBe('title');
  });
});

describe('Round attribution', () => {
  it('a finished Round is recorded against the active Player and saved', () => {
    const state = dispatchAll(preRound(3, 'Zara'), [
      { type: 'TICK', now: 0 },
      { type: 'ROUND_STARTED' },
    ]);
    const result = update(state, { type: 'TICK', now: 999_999 });
    expect(result.state.players[0]?.roundsPlayed).toBe(1);
    expect(result.effects).toEqual([
      { type: 'ROUND_ENDED', finalScore: 0 },
      { type: 'SAVE_FILE_CHANGED' },
    ]);
  });
});

describe('Save File serialization', () => {
  it('round-trips through serialize + parse, including the schema version', () => {
    const state = preRound(1, 'Zara');
    const save = buildSaveFile(state);
    expect(save.version).toBe(SAVE_FILE_VERSION);

    const parsed = parseSaveFile(serializeSaveFile(save));
    expect(parsed).toEqual(save);

    // A restart with this Save File restores the same players.
    const restored = initialState({ seed: 99, save: parsed });
    expect(restored.players).toEqual(state.players);
    expect(restored.phase).toBe('title');
    expect(restored.activePlayerId).toBeNull();
  });

  it('rejects malformed documents wholesale', () => {
    expect(parseSaveFile('not json {')).toBeNull();
    expect(parseSaveFile('42')).toBeNull();
    expect(parseSaveFile('{}')).toBeNull();
    expect(parseSaveFile(JSON.stringify({ version: 999, players: [], nextPlayerId: 1 }))).toBeNull();
    expect(parseSaveFile(JSON.stringify({ version: 1, players: [{ id: 'p1' }], nextPlayerId: 2 }))).toBeNull();
    expect(
      parseSaveFile(
        JSON.stringify({
          version: 1,
          players: [
            { id: 'p1', name: 'Zara', colors: { hair: 'bad', outfitPrimary: 'blue', outfitSecondary: 'blue' }, roundsPlayed: 0 },
          ],
          nextPlayerId: 2,
        }),
      ),
    ).toBeNull();
  });

  it('the Save File never contains Round-transient state', () => {
    const save = buildSaveFile(preRound(1, 'Zara'));
    const text = serializeSaveFile(save);
    for (const transient of [
      'streak',
      'bestStreak',
      'score',
      'question',
      'answerBuffer',
      'feedback',
      'prng',
      'practiceTable',
    ]) {
      expect(text).not.toContain(`"${transient}"`);
    }
  });
});
