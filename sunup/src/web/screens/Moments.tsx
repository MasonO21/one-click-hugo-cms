import { useState } from 'react';
import { Check, Footprints, Heart, Moon, PhoneIncoming, Plane, Timer, type LucideIcon } from 'lucide-react';
import type { MomentKind } from '../../shared/types';
import { MOMENT_KINDS, MOMENT_TITLES } from '../../shared/service';
import { MOMENT_GRACE } from '../../shared/ladder';
import { firstName } from '../../shared/util';
import { useNow, useStore } from '../store/StoreContext';
import { PremiumBadge, Sheet } from '../components/ui';
import { FakeCall } from '../components/overlays';
import { clock, countdown } from '../lib/format';

interface KindInfo {
  icon: LucideIcon;
  blurb: string;
  minutes: number;
  who: [string, string];
  where: [string, string];
  link: [string, string];
  notes: [string, string];
}

const KINDS: Record<MomentKind, KindInfo> = {
  date: {
    icon: Heart,
    blurb: 'Meeting someone new',
    minutes: 120,
    who: ['Who are you meeting?', 'Alex, from Hinge'],
    where: ['Where?', "Lucia's, 5th Ave"],
    link: ['Their profile or photo link', 'https://'],
    notes: ['Anything else', 'Driving myself, home by 11'],
  },
  run: {
    icon: Footprints,
    blurb: 'Run, hike or ride',
    minutes: 90,
    who: ['Going with anyone?', 'Solo'],
    where: ['Route or trailhead', 'Bear Creek loop, north lot'],
    link: ['Map link', 'https://'],
    notes: ['Anything else', 'Grey Civic in the lot'],
  },
  night: {
    icon: Moon,
    blurb: 'Out late',
    minutes: 240,
    who: ['Who are you with?', 'Sam and Priya'],
    where: ['Where are you going?', 'The Velvet Room, downtown'],
    link: ['Link', 'https://'],
    notes: ['How are you getting home?', 'Uber, home by 1'],
  },
  travel: {
    icon: Plane,
    blurb: 'On the road',
    minutes: 240,
    who: ['Traveling with', 'Solo'],
    where: ['From and to', 'Denver to Chicago'],
    link: ['Flight or booking link', 'https://'],
    notes: ['Anything else', 'Staying at the Hyatt Centric'],
  },
  custom: {
    icon: Timer,
    blurb: 'Anything else',
    minutes: 60,
    who: ['Who', ''],
    where: ['Where', ''],
    link: ['Link', 'https://'],
    notes: ['Notes', ''],
  },
};

const DURATIONS = [30, 60, 90, 120, 180, 240, 360];

function durationLabel(m: number): string {
  return m < 60 ? `${m}m` : m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`;
}

export function Moments() {
  const { snap, run, openPaywall } = useStore();
  const now = useNow();
  const [kind, setKind] = useState<MomentKind | null>(null);
  const [fakeCall, setFakeCall] = useState(false);
  const moment = snap.moment;
  const alert = moment && snap.myAlerts.find((a) => a.alert.momentId === moment.id && !a.alert.resolvedAt);
  const caller = snap.watchers[0] ? firstName(snap.watchers[0].name) : 'Mom';

  function choose(k: MomentKind) {
    if (!snap.limits.moments) openPaywall('Moments are part of Premium: safety timers for dates, runs, nights out and travel.');
    else setKind(k);
  }

  if (moment) {
    const total = moment.endsAt - moment.startedAt;
    const left = moment.endsAt - now;
    const progress = Math.max(0, Math.min(1, left / total));
    const Icon = KINDS[moment.kind].icon;
    const shared = moment.shareWith.length ? snap.watchers.filter((w) => moment.shareWith.includes(w.id)) : snap.watchers;
    const names = shared.map((w) => firstName(w.name)).join(', ') || 'your circle';
    return (
      <div className="screen">
        <header className="screen-head">
          <p className="eyebrow">
            <Icon size={14} /> Timer running
          </p>
          <h1 className="display">{moment.title}</h1>
        </header>

        {alert && (
          <section className="card alert-card">
            <h2>Your timer is up. Are you safe?</h2>
            <p>If we don't hear from you, {names} get your details.</p>
          </section>
        )}

        <div className={`ring${left <= 0 ? ' over' : ''}`}>
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="52" className="ring-track" />
            <circle cx="60" cy="60" r="52" className="ring-fill" strokeDasharray={`${progress * 326.7} 326.7`} />
          </svg>
          <div className="ring-text">
            <strong>{left > 0 ? countdown(left) : 'Time\'s up'}</strong>
            <span>ends {clock(moment.endsAt)}</span>
          </div>
        </div>

        <button className="btn ok block lg" onClick={() => run({ type: 'endMoment', id: moment.id })}>
          <Check size={20} /> I'm safe, end timer
        </button>
        <div className="row-btns">
          {[15, 30, 60].map((m) => (
            <button key={m} className="btn" onClick={() => run({ type: 'extendMoment', id: moment.id, minutes: m })}>
              +{m} min
            </button>
          ))}
        </div>
        <button className="btn ghost block" onClick={() => setFakeCall(true)}>
          <PhoneIncoming size={18} /> Get me out: fake call from {caller}
        </button>

        <section className="card pad">
          <p className="muted">
            When the timer ends we'll ask if you're safe. If you don't answer within {MOMENT_GRACE} minutes, <strong>{names}</strong> get these details:
          </p>
          <dl className="facts">
            {moment.details.who && (
              <>
                <dt>With</dt>
                <dd>{moment.details.who}</dd>
              </>
            )}
            {moment.details.where && (
              <>
                <dt>Where</dt>
                <dd>{moment.details.where}</dd>
              </>
            )}
            {moment.details.link && (
              <>
                <dt>Link</dt>
                <dd>{moment.details.link}</dd>
              </>
            )}
            {moment.details.notes && (
              <>
                <dt>Notes</dt>
                <dd>{moment.details.notes}</dd>
              </>
            )}
            {!moment.details.who && !moment.details.where && !moment.details.link && !moment.details.notes && <dd className="muted">No details added.</dd>}
          </dl>
        </section>
        {fakeCall && <FakeCall caller={caller} onClose={() => setFakeCall(false)} />}
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <h1 className="display">Moments</h1>
        <p className="muted">Safety timers for when you're out. If the timer runs out and you don't answer, your circle gets the details.</p>
      </header>
      <div className="kind-grid">
        {MOMENT_KINDS.map((k) => {
          const Icon = KINDS[k].icon;
          return (
            <button key={k} className={`kind kind-${k}`} onClick={() => choose(k)}>
              <span className="kind-icon">
                <Icon size={22} />
              </span>
              <strong>{MOMENT_TITLES[k]}</strong>
              <span>{KINDS[k].blurb}</span>
            </button>
          );
        })}
        <button className="kind kind-fake" onClick={() => (snap.limits.moments ? setFakeCall(true) : openPaywall('The fake-call escape is part of Premium.'))}>
          <span className="kind-icon">
            <PhoneIncoming size={22} />
          </span>
          <strong>Fake call</strong>
          <span>An instant excuse to leave</span>
        </button>
      </div>
      {!snap.limits.moments && (
        <p className="fine center">
          <PremiumBadge /> Moments come with Premium. Try it free for 7 days.
        </p>
      )}
      {kind && <StartMoment kind={kind} onClose={() => setKind(null)} />}
      {fakeCall && <FakeCall caller={caller} onClose={() => setFakeCall(false)} />}
    </div>
  );
}

function StartMoment({ kind, onClose }: { kind: MomentKind; onClose: () => void }) {
  const { snap, run } = useStore();
  const info = KINDS[kind];
  const [minutes, setMinutes] = useState(info.minutes);
  const [who, setWho] = useState('');
  const [where, setWhere] = useState('');
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');
  const [share, setShare] = useState<string[]>(snap.watchers.map((w) => w.id));

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run({
      type: 'startMoment',
      kind,
      minutes,
      details: { who, where, link: link === 'https://' ? '' : link, notes },
      shareWith: share.length === snap.watchers.length ? [] : share,
    });
    if (ok) onClose();
  }

  return (
    <Sheet open onClose={onClose} title={MOMENT_TITLES[kind]} tall>
      <form className="form" onSubmit={start}>
        <div>
          <span className="label">How long?</span>
          <div className="choice-row">
            {DURATIONS.map((m) => (
              <button type="button" key={m} className={`choice${minutes === m ? ' on' : ''}`} onClick={() => setMinutes(m)}>
                {durationLabel(m)}
              </button>
            ))}
          </div>
        </div>
        <label>
          <span>{info.who[0]}</span>
          <input className="input" value={who} onChange={(e) => setWho(e.target.value)} placeholder={info.who[1]} maxLength={80} />
        </label>
        <label>
          <span>{info.where[0]}</span>
          <input className="input" value={where} onChange={(e) => setWhere(e.target.value)} placeholder={info.where[1]} maxLength={120} />
        </label>
        <label>
          <span>{info.link[0]}</span>
          <input className="input" type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder={info.link[1]} maxLength={300} />
        </label>
        <label>
          <span>{info.notes[0]}</span>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={info.notes[1]} maxLength={300} />
        </label>
        {snap.watchers.length > 0 ? (
          <div>
            <span className="label">Who gets the details if you don't check in</span>
            <div className="choice-row">
              {snap.watchers.map((w) => {
                const on = share.includes(w.id);
                return (
                  <button
                    type="button"
                    key={w.id}
                    className={`choice${on ? ' on' : ''}`}
                    onClick={() => setShare(on ? share.filter((id) => id !== w.id) : [...share, w.id])}
                  >
                    {firstName(w.name)}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="warn-text">Your circle is empty, so nobody would be alerted. Add someone first.</p>
        )}
        <button className="btn primary block lg" type="submit" disabled={snap.watchers.length > 0 && share.length === 0}>
          Start {durationLabel(minutes)} timer
        </button>
      </form>
    </Sheet>
  );
}
