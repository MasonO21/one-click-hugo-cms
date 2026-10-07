import { AccessibilityInfo, Platform } from 'react-native';
import { create } from 'zustand';

/** The latest message for screen readers on the web, where announceForAccessibility does nothing. */
export const useAnnouncer = create<{ message: string; seq: number }>(() => ({ message: '', seq: 0 }));

/**
 * Reads a message out to screen reader users without moving their focus: VoiceOver and TalkBack on
 * phones, and the live region `Announcer` keeps on the page on the web.
 */
export function announce(message: string): void {
  if (!message) return;
  if (Platform.OS !== 'web') {
    AccessibilityInfo.announceForAccessibility(message);
    return;
  }
  useAnnouncer.setState((s) => ({ message, seq: s.seq + 1 }));
}
