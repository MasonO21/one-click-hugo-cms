// What actually lands on disk: packets encrypted, photos as separate files.

import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Store } from '../server/store';
import { zonedToUtc } from '../src/shared/time';

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
const NOW = zonedToUtc('2026-03-04', '08:00', 'America/New_York');

describe('storage', () => {
  it('encrypts packets at rest and reads them back with the same key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sunup-store-'));
    const key = randomBytes(32).toString('base64');
    try {
      const store = new Store(dir, 'https://sunup.test', key);
      const user = store.service.createUser({ name: 'Maya', timezone: 'America/New_York' }, NOW);
      store.service.dispatch(user.id, { type: 'savePacket', packet: { home: 'Door code 4417' } }, NOW);
      store.flush();

      const raw = readFileSync(join(dir, 'sunup.json'), 'utf8');
      expect(raw).not.toContain('4417');
      expect(JSON.parse(raw).sealedPackets.data).toBeTruthy();

      const reopened = new Store(dir, 'https://sunup.test', key);
      expect(reopened.service.state.packets[user.id].home).toBe('Door code 4417');
      expect(() => new Store(dir, 'https://sunup.test', randomBytes(32).toString('base64'))).toThrow(/data key/);
      expect(() => new Store(dir, 'https://sunup.test', 'short')).toThrow(/32 bytes/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('generates and reuses a key file when none is configured', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sunup-store-'));
    try {
      const store = new Store(dir, 'https://sunup.test');
      const user = store.service.createUser({ name: 'Ana', timezone: 'America/New_York' }, NOW);
      store.service.dispatch(user.id, { type: 'savePacket', packet: { pets: 'Feed Biscuit' } }, NOW);
      store.flush();
      expect(readdirSync(dir)).toContain('data.key');
      expect(new Store(dir, 'https://sunup.test').service.state.packets[user.id].pets).toBe('Feed Biscuit');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps photos as files and removes them when they are no longer used', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sunup-store-'));
    try {
      const store = new Store(dir, 'https://sunup.test');
      const svc = store.service;
      const user = svc.createUser({ name: 'Theo', timezone: 'America/New_York' }, NOW);
      svc.dispatch(user.id, { type: 'checkIn', photo: PHOTO }, NOW);
      store.externalizePhotos();
      const checkIn = svc.checkInsOf(user.id)[0];
      expect(checkIn.photo).toBe('file:jpg');
      expect(readdirSync(join(dir, 'photos'))).toEqual([`${checkIn.id}.jpg`]);
      expect(store.readPhoto(checkIn.id, checkIn.photo!)?.type).toBe('image/jpeg');
      store.flush();
      expect(readFileSync(join(dir, 'sunup.json'), 'utf8')).not.toContain('base64,');

      svc.dispatch(user.id, { type: 'updateCheckIn', id: checkIn.id, photo: '' }, NOW + 60_000);
      store.sweepPhotos();
      expect(readdirSync(join(dir, 'photos'))).toEqual([]);
      expect(store.readPhoto('../sunup', 'file:jpg')).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
