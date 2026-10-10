/**
 * The four-week economy's longer waits, said kindly (ui/logic/awayNews.ts): Welcome Back lists what kept going on its
 * own clock, the recruitment board points to the other roads in when the next survivor is far off, and the tier-up
 * card says when its goals outgrow the stores. Real save: tests/fixtures/save-alloy-retuned.txt.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { unwrapSave } from '../src/platform/saveCodec';
import { migrateState } from '../src/platform/saveMigrate';
import type { GameState } from '../src/core/state';
import { awayNews, awayNewsText, recruitCountdownText, recruitWaitNote, tierRoomNote, LONG_RECRUIT_WAIT_S } from '../src/ui/logic/awayNews';
import { fmtHMS } from '../src/ui/logic/time';

function fixture(): GameState {
  const u = unwrapSave(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-alloy-retuned.txt'), 'utf8'));
  if ('error' in u) throw new Error(u.error);
  return migrateState(JSON.parse(u.json));
}

function boot(hoursAway: number): Game {
  const s = fixture();
  const at = s.lastTickAt + hoursAway * 3_600_000;
  const game = new Game({ state: s, services: createMockServices(), clock: () => at });
  game.start();
  return game;
}

describe('Welcome Back: what kept going while away', () => {
  it('words the news warmly, one part per clock, singular and plural', () => {
    expect(awayNewsText({ survivors: 0, squads: 0, caches: 0 })).toBeNull();
    expect(awayNewsText({ survivors: 1, squads: 1, caches: 1 })).toBe('Waiting for you: a survivor at the board · a squad home with its haul · a cache restocked');
    expect(awayNewsText({ survivors: 2, squads: 0, caches: 6 })).toBe('Waiting for you: 2 survivors at the board · 6 caches restocked');
  });

  it('a real Alloy colony after five hours away: squads home and caches full again', () => {
    const game = boot(5);
    const before = boot(0);
    const n = awayNews(game);
    expect(n.squads).toBe(2); // the 15-minute and the 4-hour trip are both back
    expect(awayNews(before).squads).toBe(0);
    expect(n.caches).toBeGreaterThan(awayNews(before).caches);
    expect(n.survivors).toBe(game.state.colonists.candidates.length);
    expect(awayNewsText(n)).toMatch(/^Waiting for you: .*2 squads home with hauls/);
  });
});

describe('recruitment board: a long wait points to the other roads in', () => {
  it('only for a wait over an hour (never for a full board)', () => {
    expect(recruitWaitNote(null)).toBeNull();
    expect(recruitWaitNote(20 * 60)).toBeNull();
    expect(recruitWaitNote(LONG_RECRUIT_WAIT_S)).toBeNull();
    expect(recruitWaitNote(7 * 86400)).toMatch(/daily supplies, region surveys, rescue camps and caches/);
  });

  it('counts down to the second within a day, then in days (a week is not clock-watching)', () => {
    expect(recruitCountdownText(null, fmtHMS)).toBe('Full');
    expect(recruitCountdownText(0, fmtHMS)).toBe('Any moment');
    expect(recruitCountdownText(761, fmtHMS)).toBe('12:41');
    expect(recruitCountdownText(3 * 3600 + 5, fmtHMS)).toBe('3:00:05');
    expect(recruitCountdownText(28 * 3600, fmtHMS)).toBe('1d 4h');
    expect(recruitCountdownText(6 * 86400 + 23 * 3600, fmtHMS)).toBe('7 days');
    expect(recruitCountdownText(13.6 * 86400, fmtHMS)).toBe('14 days');
  });

  it('the Alloy board (a week between survivors) shows it', () => {
    const game = boot(0);
    const next = game.sys.colonists.nextArrivalIn();
    expect(next).not.toBeNull();
    expect(next!).toBeGreaterThan(LONG_RECRUIT_WAIT_S);
    expect(recruitWaitNote(next)).not.toBeNull();
  });
});

describe('tier-up card: goals that outgrow the stores', () => {
  it('names the stores that are too small for the next tier, up to three', () => {
    const game = boot(0);
    const nx = game.sys.progression.next()!;
    const note = tierRoomNote(game, nx.cost)!;
    expect(note).toMatch(/^📦 Your stores hold .*: build or upgrade storage to fit the next tier\.$/);
    // the Nano tier-up asks 93K energy cells: an Alloy colony stores a few dozen
    expect(note).toContain('Energy Cell');
    expect(tierRoomNote(game, { wood: 1 })).toBeNull();
  });
});
