import { useEffect, useState } from 'react';
import { BadgeCheck, Bell, ChevronRight, Crown, MessageSquare, Pause, Phone, Plus, Smartphone, Sparkles, Trash2 } from 'lucide-react';
import type { Schedule, Slot } from '../../shared/types';
import type { AlertView } from '../../shared/snapshot';
import { GRACE_OPTIONS, ladderFor } from '../../shared/ladder';
import { formatPhone } from '../../shared/util';
import { useNow, useStore } from '../store/StoreContext';
import { Avatar, PremiumBadge, Sheet, Toggle } from '../components/ui';
import { Ladder } from '../components/Ladder';
import { CodeInput } from '../components/CodeInput';
import type { CodeSent } from '../store/api';
import { HAS_SITE, ago, when } from '../lib/format';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function You() {
  const { snap, run, api, attempt, openPaywall, toast, ask } = useStore();
  const now = useNow(10_000);
  const { me, limits } = snap;
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [notifications, setNotifications] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const paused = me.pause && me.pause.until > now;
  const trialLeft = me.trialEndsAt && me.trialEndsAt > now && me.plan !== 'premium' ? me.trialEndsAt - now : 0;

  function planLine(): string {
    const b = me.billing;
    const date = b?.periodEnd ? new Date(b.periodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    if (b?.status === 'past_due') return 'Your last payment didn\'t go through. Update your card to stay covered.';
    if (b?.status === 'trialing') return date ? `Free trial until ${date}${b.cancelAtPeriodEnd ? ', then it ends' : ''}` : 'Free trial';
    if (me.plan === 'premium') return b?.cancelAtPeriodEnd && date ? `Ends ${date}` : date ? `Renews ${date}` : 'Full safety net active';
    if (trialLeft) return `Free trial: ${Math.ceil(trialLeft / 86_400_000)} days left`;
    return 'Daily check-in, SOS and 2 people. Upgrade for the full safety net.';
  }

  function setSchedule(next: Partial<Schedule>) {
    return run({ type: 'setSchedule', schedule: { ...me.schedule, ...next } });
  }

  function setSlot(i: number, patch: Partial<Slot>) {
    const slots = me.schedule.slots.map((s, j) => (j === i ? { ...s, ...patch } : s));
    return setSchedule({ slots });
  }

  function addSlot() {
    if (me.schedule.slots.length >= limits.maxSlots) {
      openPaywall('Add an evening "home safe" check-in with Premium: up to 3 windows a day.');
      return;
    }
    const last = me.schedule.slots.at(-1)!;
    const [h] = last.deadline.split(':').map(Number);
    const start = Math.min(h + 8, 21);
    return setSchedule({ slots: [...me.schedule.slots, { start: `${String(start).padStart(2, '0')}:00`, deadline: `${String(start + 2).padStart(2, '0')}:00` }] });
  }

  async function enableNotifications() {
    const result = await api.enablePush();
    setNotifications(result === 'granted' ? 'granted' : result === 'denied' ? 'denied' : 'unsupported');
    if (result === 'granted') toast({ title: 'Alerts are on', tone: 'ok' });
    else if (result === 'denied') toast({ title: 'Notifications are blocked', body: 'Turn them on in your browser or phone settings.', tone: 'error' });
    else toast({ title: 'This browser can\'t receive alerts', body: 'On iPhone, add Sunup to your Home Screen first.', tone: 'info' });
  }

  const previewView: AlertView = {
    alert: { id: 'preview', userId: me.id, kind: 'missed', triggeredAt: now, steps: {} },
    subject: { id: me.id, kind: 'user', name: me.name, color: me.color },
    ladder: ladderFor('missed', limits.premium, me.graceMinutes).map((s) => ({ ...s, at: now + s.offset * 60_000 })),
  };

  return (
    <div className="screen">
      <header className="screen-head">
        <h1 className="display">You</h1>
      </header>

      <button className="card profile" onClick={() => setEditing(true)}>
        <Avatar name={me.name} color={me.color} size={52} />
        <div>
          <strong>{me.name}</strong>
          <span>{me.phone ? formatPhone(me.phone) : 'Add your number for alarm texts and calls'}</span>
        </div>
        <ChevronRight size={20} />
      </button>

      <button className={`card plan${limits.premium ? ' premium' : ''}`} onClick={() => (limits.premium ? undefined : openPaywall())}>
        <Crown size={22} />
        <div>
          <strong>{limits.premium ? 'Sunup Premium' : 'Free plan'}</strong>
          <span>{planLine()}</span>
        </div>
        {!limits.premium && <span className="btn primary sm">Upgrade</span>}
      </button>

      <section className="section">
        <div className="section-head">
          <h3>Check-in windows</h3>
        </div>
        <div className="card pad stack">
          {me.schedule.slots.map((slot, i) => (
            <div className="slot-row" key={i}>
              <label>
                <span>From</span>
                <TimeField value={slot.start} onCommit={(v) => setSlot(i, { start: v })} />
              </label>
              <label>
                <span>Check in by</span>
                <TimeField value={slot.deadline} onCommit={(v) => setSlot(i, { deadline: v })} />
              </label>
              {i > 0 && (
                <button className="icon-btn" aria-label="Remove window" onClick={() => setSchedule({ slots: me.schedule.slots.filter((_, j) => j !== i) })}>
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          ))}
          <button className="btn ghost sm" onClick={addSlot}>
            <Plus size={16} /> Add a check-in {!limits.premium && <PremiumBadge />}
          </button>
          <div>
            <span className="label">Days</span>
            <div className="days">
              {DAYS.map((d, i) => {
                const on = me.schedule.days.includes(i);
                return (
                  <button
                    key={i}
                    className={on ? 'on' : ''}
                    aria-pressed={on}
                    aria-label={DAY_NAMES[i]}
                    onClick={() => setSchedule({ days: on ? me.schedule.days.filter((x) => x !== i) : [...me.schedule.days, i] })}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="row-toggle">
            <span>
              <strong>
                <Smartphone size={16} /> Smart check-in {!limits.smartCheckIn && <PremiumBadge />}
              </strong>
              <small>Opening Sunup during your window counts as checking in.</small>
            </span>
            <Toggle
              checked={me.schedule.smart}
              label="Smart check-in"
              onChange={(v) => (limits.smartCheckIn ? setSchedule({ smart: v }) : openPaywall('Smart check-in is part of Premium.'))}
            />
          </label>
          <p className="fine">A check-in up to 2 hours before a window opens still counts.</p>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h3>If you miss one</h3>
          <button className="link" onClick={() => setPreview(true)}>
            See every step
          </button>
        </div>
        <div className="card pad stack">
          <span className="label">Alert my circle after</span>
          <div className="choice-row">
            {GRACE_OPTIONS.map((m) => (
              <button key={m} className={`choice${me.graceMinutes === m ? ' on' : ''}`} onClick={() => run({ type: 'setGrace', minutes: m })}>
                {m} min
              </button>
            ))}
          </div>
          <p className="fine">You get a reminder and an alarm first{limits.calls ? ', then a phone call' : ''}.</p>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h3>Away mode</h3>
        </div>
        <div className="card pad stack">
          {paused ? (
            <>
              <p>
                <Pause size={16} /> Paused until {when(me.pause!.until, now)}.
              </p>
              <button className="btn" onClick={() => run({ type: 'pause', until: null })}>
                Resume now
              </button>
            </>
          ) : (
            <>
              <p className="muted">Staying with family or traveling with friends? Pause check-ins. SOS keeps working.</p>
              <div className="choice-row">
                {[
                  ['Until tomorrow', 1],
                  ['3 days', 3],
                  ['1 week', 7],
                  ['2 weeks', 14],
                ].map(([label, days]) => (
                  <button key={label} className="choice" onClick={() => run({ type: 'pause', until: Date.now() + Number(days) * 86_400_000 })}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h3>Notifications</h3>
        </div>
        <div className="card pad stack">
          {notifications === 'granted' ? (
            <p>
              <Bell size={16} /> Alerts are on for this device.
            </p>
          ) : (
            <>
              <p className="muted">Sunup needs notifications to remind you and to tell you when someone in your circle needs you.</p>
              <button className="btn primary" onClick={enableNotifications}>
                <Bell size={18} /> Turn on alerts
              </button>
            </>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h3>Activity</h3>
        </div>
        {snap.outbox.length === 0 ? (
          <p className="muted card pad">Every reminder, text and call Sunup sends about you shows up here.</p>
        ) : (
          <ul className="activity card">
            {snap.outbox.slice(0, 25).map((o) => (
              <li key={o.id}>
                <span className={`activity-icon ch-${o.channel}`}>
                  {o.channel === 'call' ? <Phone size={14} /> : o.channel === 'sms' ? <MessageSquare size={14} /> : <Bell size={14} />}
                </span>
                <div>
                  <strong>
                    {o.channel === 'call' ? 'Called' : o.channel === 'sms' ? 'Texted' : 'Notified'} {o.to.id === me.id ? 'you' : o.to.name}
                  </strong>
                  <span>{o.channel === 'call' ? `"${o.body}"` : o.body}</span>
                </div>
                <time>{ago(o.at, now)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>

      {api.demo && (
        <section className="section demo-box">
          <div className="section-head">
            <h3>
              <Sparkles size={16} /> Demo controls
            </h3>
          </div>
          <p className="muted">This demo runs on your device. Nothing is texted or called for real.</p>
          <div className="stack">
            <button className="btn block" onClick={() => attempt(() => api.demo!.simulateMyMiss())}>
              Simulate me missing a check-in
            </button>
            {limits.premium && me.plan === 'premium' && (
              <button className="btn block" onClick={() => attempt(() => api.demo!.setPlan('free'))}>
                Switch back to the free plan
              </button>
            )}
            <button className="btn ghost block" onClick={async () => (await ask({ title: 'Reset the demo?', body: 'This erases everything in the demo on this device.', confirm: 'Reset', danger: true })) && api.demo!.reset()}>
              Reset demo
            </button>
          </div>
        </section>
      )}

      {api.mode === 'server' && (
        <button className="btn ghost block" onClick={async () =>
            (await ask({
              title: 'Sign out?',
              body: me.phoneVerified
                ? `Sign back in any time with ${formatPhone(me.phone!)}.`
                : 'Your number isn\'t confirmed, so you won\'t be able to sign back in. Confirm it in Your details first.',
              confirm: 'Sign out',
              cancel: 'Stay signed in',
              danger: true,
            })) && api.signOut()
          }>
          Sign out
        </button>
      )}
      {api.billing && me.billing?.customerId && (
        <button
          className="btn block"
          onClick={() => api.billing!.portal().catch((e: Error) => toast({ title: e.message, tone: 'error' }))}
        >
          Manage subscription
        </button>
      )}
      {me.plan === 'premium' && api.mode === 'server' && !me.billing?.customerId && (
        <button className="btn ghost block" onClick={async () => (await ask({ title: 'Cancel Premium?', body: 'Your circle goes back to 2 people and the full escalation ladder turns off.', confirm: 'Cancel Premium', cancel: 'Keep Premium', danger: true })) && run({ type: 'cancelPremium' })}>
          Cancel Premium
        </button>
      )}

      <p className="fine center legal">
        Sunup is not an emergency service and can't guarantee a message is delivered. If you're in danger, call 911.
        {HAS_SITE && (
          <>
            <br />
            <a href="terms.html">Terms</a> · <a href="privacy.html">Privacy</a>
          </>
        )}
      </p>

      <ProfileSheet open={editing} onClose={() => setEditing(false)} />
      <Sheet open={preview} onClose={() => setPreview(false)} title="If you miss a check-in">
        <p className="muted">Times are counted from your deadline. Checking in at any point stops everything and tells anyone already alerted that you're okay.</p>
        <Ladder view={previewView} now={now - 1} perspective="self" />
        {!limits.premium && (
          <button className="btn primary block" onClick={() => openPaywall()}>
            Get the full ladder with Premium
          </button>
        )}
      </Sheet>
    </div>
  );
}

/** A time input that saves on blur and snaps back if the change is rejected. */
function TimeField({ value, onCommit }: { value: string; onCommit: (v: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="input"
      type="time"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={async () => {
        if (draft && draft !== value && !(await onCommit(draft))) setDraft(value);
      }}
    />
  );
}

function ProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { snap, run, api, attempt } = useStore();
  const [name, setName] = useState(snap.me.name);
  const [phone, setPhone] = useState(snap.me.phone ? formatPhone(snap.me.phone) : '');
  const [sent, setSent] = useState<CodeSent | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const auth = api.auth;
  const savedPhone = snap.me.phone;
  const needsVerify = !!auth && !!savedPhone && !snap.me.phoneVerified;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!(await run({ type: 'updateProfile', name, phone }))) return;
    // A new number has to be confirmed before it can be used to sign in, so stay open for that.
    const digits = phone.replace(/\D/g, '');
    const newNumber = !!digits && !savedPhone?.endsWith(digits.slice(-10));
    if (!auth || !newNumber) onClose();
  }

  async function sendCode() {
    setError('');
    try {
      setSent(await auth!.start(savedPhone!));
      setCode('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const ok = await attempt(async () => (await auth!.verify({ phone: savedPhone!, code })).snapshot!);
    if (ok) {
      setSent(null);
      onClose();
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Your details">
      {sent ? (
        <form className="form" onSubmit={verify}>
          <CodeInput sent={sent} value={code} onChange={setCode} onResend={sendCode} />
          <button className="btn primary block" type="submit" disabled={code.length !== 6}>
            Confirm number
          </button>
        </form>
      ) : (
        <form className="form" onSubmit={save}>
          <label>
            <span>Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
          </label>
          <label>
            <span>Mobile number</span>
            <input className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
            <small className="fine">For alarm texts and the escalation call, and so your circle can call you.</small>
          </label>
          {auth && savedPhone && (
            <div className={`verify-row ${snap.me.phoneVerified ? 'ok' : ''}`}>
              {snap.me.phoneVerified ? (
                <span>
                  <BadgeCheck size={16} /> {formatPhone(savedPhone)} is confirmed. Use it to sign in on a new phone.
                </span>
              ) : (
                <>
                  <span>{formatPhone(savedPhone)} isn't confirmed yet, so you can't sign in with it.</span>
                  <button type="button" className="btn sm" onClick={sendCode}>
                    Text me a code
                  </button>
                </>
              )}
            </div>
          )}
          {error && <p className="error-text">{error}</p>}
          <p className="fine">Time zone: {snap.me.timezone.replace(/_/g, ' ')}</p>
          <button className="btn primary block" type="submit">
            Save
          </button>
          {needsVerify && <p className="fine">Saving a new number keeps this sheet open so you can confirm it.</p>}
        </form>
      )}
    </Sheet>
  );
}
