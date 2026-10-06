import { useRef, useState } from 'react';
import { Camera, Check, Flame, Pause, Plus, Timer, TriangleAlert, Users } from 'lucide-react';
import type { CheckIn, Mood } from '../../shared/types';
import type { Postcard, SlotView, WatchedView } from '../../shared/snapshot';
import { MOODS } from '../../shared/service';
import { formatHM } from '../../shared/util';
import { useNow, useStore } from '../store/StoreContext';
import { Avatar, Photo, Sheet } from '../components/ui';
import { Ladder } from '../components/Ladder';
import { MOOD_INFO, ago, clock, countdown, dayName, dayWord, greeting, when } from '../lib/format';
import { statusLine } from '../lib/status';
import { photoToDataUrl } from '../lib/media';
import { hapticTap } from '../native';

export function Today({ onSos }: { onSos: () => void }) {
  const { snap, run } = useStore();
  const now = useNow();
  const [composing, setComposing] = useState<CheckIn | null>(null);
  const { me } = snap;

  const alert = snap.myAlerts.find((a) => !a.alert.resolvedAt && a.alert.kind !== 'sos');
  const sos = snap.myAlerts.find((a) => !a.alert.resolvedAt && a.alert.kind === 'sos');
  const reached = snap.myAlerts.find((a) => a.alert.resolution === 'reached' && now - a.alert.resolvedAt! < 60 * 60_000);
  const open = snap.slots.find((s) => s.status === 'open');
  const upcoming = snap.slots.find((s) => s.status === 'upcoming');
  const paused = me.pause && me.pause.from <= now && now <= me.pause.until;
  const latest = snap.history[0];
  const checkedToday = latest && new Date(latest.at).toDateString() === new Date(now).toDateString();

  async function checkIn() {
    if (await run({ type: 'checkIn' })) {
      void hapticTap();
      setComposing({ id: '', userId: me.id, at: Date.now(), source: 'tap' });
    }
  }

  return (
    <div className="screen today">
      <header className="today-head">
        <div>
          <p className="eyebrow">{dayName(now)}</p>
          <h1 className="display">
            {greeting(now)}, {me.name.split(' ')[0]}
          </h1>
        </div>
        <button className="sos-pill" onClick={onSos} aria-label="SOS">
          SOS
        </button>
      </header>

      <div className="chips">
        <span className="chip">
          <Flame size={14} /> {snap.streak > 0 ? `${snap.streak}-day streak` : 'Start your streak'}
        </span>
        {me.schedule.slots.map((s) => (
          <span className="chip" key={s.deadline}>
            {formatHM(s.start)}–{formatHM(s.deadline)}
          </span>
        ))}
      </div>

      {sos && (
        <button className="card sos-card" onClick={onSos}>
          <TriangleAlert size={20} />
          <div>
            <strong>SOS sent {ago(sos.alert.triggeredAt, now)}</strong>
            <span>Your circle was alerted. Tap when you're safe.</span>
          </div>
        </button>
      )}

      {reached && !alert && !sos && (
        <section className="card resolved-card">
          <Check size={20} />
          <div>
            <strong>{reached.resolverName?.split(' ')[0] ?? 'Your circle'} reached you</strong>
            <span>Your circle stood down at {clock(reached.alert.resolvedAt!)}.</span>
          </div>
        </section>
      )}

      {alert ? (
        <section className="card alert-card">
          <div className="alert-head">
            <TriangleAlert size={22} />
            <div>
              <h2>{alert.alert.kind === 'moment' ? 'Your timer ran out' : 'You missed your check-in'}</h2>
              <p>Tap below so your circle knows you're okay.</p>
            </div>
          </div>
          <button className="okay-btn" onClick={() => run({ type: 'resolveAlert', id: alert.alert.id })}>
            <Check size={28} strokeWidth={3} /> I'm okay
          </button>
          <Ladder view={alert} now={now} perspective="self" />
        </section>
      ) : paused ? (
        <section className="card hero-card paused">
          <Pause size={36} />
          <h2>Away mode</h2>
          <p className="muted">Check-ins are paused until {when(me.pause!.until, now)}. SOS still works.</p>
          <button className="btn" onClick={() => run({ type: 'pause', until: null })}>
            Resume check-ins
          </button>
        </section>
      ) : open ? (
        <section className="hero">
          <button className="sun-btn" onClick={checkIn}>
            <span className="sun-rays" aria-hidden="true" />
            <span className="sun-face">
              <span className="sun-label">I'm up</span>
              <span className="sun-sub">tap to check in</span>
            </span>
          </button>
          <p className="hero-caption">
            Check in by <strong>{formatHM(open.deadline)}</strong> · {countdown(open.deadlineAt - now)} left
          </p>
        </section>
      ) : checkedToday ? (
        <DoneHero latest={latest} upcoming={upcoming} onEdit={() => setComposing(latest)} />
      ) : (
        <section className="hero">
          <button className="sun-btn early" onClick={checkIn}>
            <span className="sun-face">
              <span className="sun-label">Say hi</span>
              <span className="sun-sub">post a hello</span>
            </span>
          </button>
          {upcoming && (
            <p className="hero-caption">
              Next check-in: <strong>{windowLabel(upcoming, now)}</strong>
            </p>
          )}
        </section>
      )}

      {snap.watchers.length === 0 && (
        <a className="card warn-card" href="#circle">
          <Users size={20} />
          <div>
            <strong>Nobody will be alerted yet</strong>
            <span>Add someone to your circle so a missed check-in reaches a real person.</span>
          </div>
        </a>
      )}

      {snap.moment && (
        <a className="card moment-mini" href="#moments">
          <Timer size={20} />
          <div>
            <strong>{snap.moment.title}</strong>
            <span>{countdown(snap.moment.endsAt - now)} left on your timer</span>
          </div>
        </a>
      )}

      <CircleToday watching={snap.watching} feed={snap.feed} now={now} />

      <CheckInSheet key={composing ? composing.id || composing.at : 'closed'} checkIn={composing} onClose={() => setComposing(null)} />
    </div>
  );
}

function DoneHero({ latest, upcoming, onEdit }: { latest: CheckIn; upcoming?: SlotView; onEdit: () => void }) {
  const now = useNow(30_000);
  const mood = latest.mood ? MOOD_INFO[latest.mood] : null;
  return (
    <section className="card hero-card done">
      <div className="done-badge">
        <Check size={34} strokeWidth={3} />
      </div>
      <h2>You're checked in</h2>
      <p className="muted">
        {clock(latest.at)}
        {latest.source === 'smart' ? ' (smart check-in)' : ''} · your circle knows you're okay
      </p>
      {(mood || latest.note) && (
        <p className="done-note">
          {mood && <span className="mood-emoji">{mood.emoji}</span>} {latest.note}
        </p>
      )}
      <button className="btn ghost sm" onClick={onEdit}>
        {mood || latest.note || latest.photo ? 'Edit postcard' : 'Add how you feel'}
      </button>
      {upcoming && <p className="fine">Next check-in: {windowLabel(upcoming, now)}</p>}
    </section>
  );
}

/** "Tomorrow, 7 AM to 10 AM" */
function windowLabel(slot: SlotView, now: number): string {
  return `${dayWord(slot.openAt, now)}, ${formatHM(slot.start)} to ${formatHM(slot.deadline)}`;
}

function CircleToday({ watching, feed, now }: { watching: WatchedView[]; feed: Postcard[]; now: number }) {
  const { snap } = useStore();
  const alerting = new Set(snap.circleAlerts.filter((a) => !a.alert.resolvedAt).map((a) => a.subject.id));
  return (
    <section className="section">
      <div className="section-head">
        <h3>Your circle today</h3>
        <a href="#circle" className="link">
          Manage
        </a>
      </div>
      {watching.length === 0 && feed.length === 0 ? (
        <a className="card add-card" href="#circle">
          <Plus size={18} /> Invite someone to share mornings with
        </a>
      ) : (
        <>
          {watching.length > 0 && (
            <ul className="status-list card">
              {watching.map((w) => {
                const s = statusLine(w, now, alerting.has(w.person.id));
                return (
                  <li key={w.watchId}>
                    <Avatar name={w.person.name} color={w.person.color} size={36} ring={s.tone === 'muted' ? undefined : s.tone} />
                    <div>
                      <strong>{w.person.name}</strong>
                      <span className={`tone-${s.tone}`}>{s.text}</span>
                    </div>
                    {w.slot?.checkIn?.mood && <span className="mood-emoji">{MOOD_INFO[w.slot.checkIn.mood].emoji}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="feed">
            {feed.map((p) => (
              <article className="postcard" key={p.checkIn.id}>
                <header>
                  <Avatar name={p.person.name} color={p.person.color} size={32} />
                  <div>
                    <strong>{p.mine ? 'You' : p.person.name}</strong>
                    <span>{ago(p.checkIn.at, now)}</span>
                  </div>
                  {p.checkIn.mood && (
                    <span className="mood-tag">
                      {MOOD_INFO[p.checkIn.mood].emoji} {MOOD_INFO[p.checkIn.mood].label}
                    </span>
                  )}
                </header>
                {p.checkIn.note && <p>{p.checkIn.note}</p>}
                {p.checkIn.photo && <Photo src={p.checkIn.photo} alt={`${p.person.name}'s check-in photo`} />}
                {!p.checkIn.note && !p.checkIn.photo && !p.checkIn.mood && <p className="muted">Checked in{p.checkIn.source === 'smart' ? ' automatically' : ''}.</p>}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function CheckInSheet({ checkIn, onClose }: { checkIn: CheckIn | null; onClose: () => void }) {
  const { run, snap, toast } = useStore();
  const [mood, setMood] = useState<Mood | undefined>(checkIn?.mood);
  const [note, setNote] = useState(checkIn?.note ?? '');
  const [photo, setPhoto] = useState<string | undefined>(checkIn?.photo);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      setPhoto(await photoToDataUrl(file));
    } catch (e) {
      toast({ title: (e as Error).message, tone: 'error' });
    }
  }

  async function save() {
    const target = checkIn?.id || snap.history[0]?.id;
    if (!target) return onClose();
    setBusy(true);
    const photoChanged = photo !== checkIn?.photo;
    const ok = await run({ type: 'updateCheckIn', id: target, mood, note, ...(photoChanged ? { photo: photo ?? '' } : {}) });
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet open={!!checkIn} onClose={onClose}>
      <div className="compose">
        {!checkIn?.id && (
          <div className="compose-done">
            <span className="done-badge sm">
              <Check size={22} strokeWidth={3} />
            </span>
            <div>
              <strong>You're checked in</strong>
              <span>Your circle can see you're okay.</span>
            </div>
          </div>
        )}
        <h2 className="compose-title">How's your morning?</h2>
        <div className="moods" role="radiogroup" aria-label="Mood">
          {MOODS.map((m) => (
            <button key={m} role="radio" aria-checked={mood === m} className={mood === m ? 'on' : ''} onClick={() => setMood(mood === m ? undefined : m)}>
              <span>{MOOD_INFO[m].emoji}</span>
              {MOOD_INFO[m].label}
            </button>
          ))}
        </div>
        <textarea
          className="input"
          rows={2}
          maxLength={140}
          placeholder="A line for your circle (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {photo ? (
          <div className="compose-photo">
            <Photo src={photo} alt="Your check-in photo" />
            <button className="btn ghost sm" onClick={() => setPhoto(undefined)}>
              Remove photo
            </button>
          </div>
        ) : (
          <button className="btn ghost block" onClick={() => fileRef.current?.click()}>
            <Camera size={18} /> Add a photo
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="user" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <div className="row-btns">
          <button className="btn" onClick={onClose}>
            Skip
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            Share with circle
          </button>
        </div>
      </div>
    </Sheet>
  );
}
