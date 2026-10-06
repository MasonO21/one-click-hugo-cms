import type { AlertKind, StepId } from './types';

export interface LadderStep {
  id: StepId;
  /** Minutes after the alert triggered. */
  offset: number;
  who: 'you' | 'circle';
  label: string;
  detail: string;
}

export const GRACE_OPTIONS = [15, 30, 60] as const;
export const DEFAULT_GRACE = 30;
/** Minutes between a moment timer running out and the circle hearing about it. */
export const MOMENT_GRACE = 10;

/** The escalation steps for an alert, in firing order. */
export function ladderFor(kind: AlertKind, premium: boolean, grace: number): LadderStep[] {
  if (kind === 'sos') {
    const steps: LadderStep[] = [
      { id: 'circle', offset: 0, who: 'circle', label: 'Alert your circle', detail: 'Everyone gets an urgent alert, with your location if you shared it.' },
    ];
    if (premium) steps.push({ id: 'call_circle', offset: 0, who: 'circle', label: 'Call your circle', detail: 'Sunup phones everyone with a number.' });
    return steps;
  }

  if (kind === 'moment') {
    const steps: LadderStep[] = [
      { id: 'nudge', offset: 0, who: 'you', label: 'Are you safe?', detail: 'Your timer ran out. Tap "I\'m safe" or add time.' },
      { id: 'circle', offset: MOMENT_GRACE, who: 'circle', label: 'Alert your circle', detail: 'They get the details you saved: who, where and the link.' },
    ];
    if (premium) steps.push({ id: 'call_circle', offset: MOMENT_GRACE + 15, who: 'circle', label: 'Call your circle', detail: 'Sunup phones everyone with a number.' });
    return steps;
  }

  const half = Math.round(grace / 2);
  if (!premium) {
    return [
      { id: 'nudge', offset: 0, who: 'you', label: 'Reminder', detail: 'A notification: "Still with us?"' },
      { id: 'alarm', offset: half, who: 'you', label: 'Alarm', detail: 'An urgent alert and a text to you.' },
      { id: 'circle', offset: grace, who: 'circle', label: 'Alert your circle', detail: 'Everyone watching over you is told to reach you.' },
    ];
  }
  return [
    { id: 'nudge', offset: 0, who: 'you', label: 'Reminder', detail: 'A notification: "Still with us?"' },
    { id: 'alarm', offset: half, who: 'you', label: 'Alarm', detail: 'An urgent alert and a text to you.' },
    { id: 'call_you', offset: grace, who: 'you', label: 'We call you', detail: 'An automated phone call asking you to check in.' },
    { id: 'circle', offset: grace + 10, who: 'circle', label: 'Alert your circle', detail: 'Everyone watching over you is told to reach you.' },
    { id: 'call_circle', offset: grace + 30, who: 'circle', label: 'Call your circle', detail: 'Sunup phones everyone with a number.' },
    { id: 'packet', offset: grace + 30, who: 'circle', label: 'Release your packet', detail: 'Pet care, home access and health info go to the people you chose.' },
    { id: 'wellness', offset: grace + 60, who: 'circle', label: 'Wellness check', detail: 'If nobody has reached you, your circle is told how to request an in-person wellness check.' },
  ];
}
