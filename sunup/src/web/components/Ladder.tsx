import { Bell, BellRing, Check, KeyRound, Phone, PhoneCall, ShieldAlert, Users } from 'lucide-react';
import type { AlertView } from '../../shared/snapshot';
import type { StepId } from '../../shared/types';
import { firstName } from '../../shared/util';
import { clock, countdown } from '../lib/format';

const ICONS: Record<StepId, typeof Bell> = {
  nudge: Bell,
  alarm: BellRing,
  call_you: Phone,
  circle: Users,
  call_circle: PhoneCall,
  packet: KeyRound,
  wellness: ShieldAlert,
};

function watcherLabel(step: StepId, name: string): string {
  switch (step) {
    case 'nudge':
      return `Reminder to ${name}`;
    case 'alarm':
      return `Alarm to ${name}`;
    case 'call_you':
      return `Phone call to ${name}`;
    case 'circle':
      return 'Circle alerted';
    case 'call_circle':
      return 'Circle called';
    case 'packet':
      return 'Emergency info released';
    case 'wellness':
      return 'Wellness check advice';
  }
}

export function Ladder({ view, now, perspective }: { view: AlertView; now: number; perspective: 'self' | 'watcher' }) {
  const resolved = !!view.alert.resolvedAt;
  const next = view.ladder.find((s) => !s.firedAt);
  const name = firstName(view.subject.name);
  return (
    <ol className="ladder">
      {view.ladder.map((step) => {
        const Icon = step.firedAt ? Check : ICONS[step.id];
        const state = step.firedAt ? 'done' : resolved ? 'skipped' : step === next ? 'next' : 'later';
        return (
          <li key={step.id} className={`ladder-step ${state} who-${step.who}`}>
            <span className="ladder-dot">
              <Icon size={14} strokeWidth={2.5} />
            </span>
            <div className="ladder-text">
              <strong>{perspective === 'self' ? step.label : watcherLabel(step.id, name)}</strong>
              {perspective === 'self' && state !== 'done' && <span>{step.detail}</span>}
            </div>
            <time>
              {step.firedAt
                ? clock(step.firedAt)
                : resolved
                  ? 'Not needed'
                  : state === 'next'
                    ? `in ${countdown(step.at - now)}`
                    : clock(step.at)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
