import { useState } from 'react';
import { Check, Copy, KeyRound, MapPin, MessageSquare, Phone, Share2, Sparkles, Trash2, UserPlus } from 'lucide-react';
import type { AlertView, WatcherView, WatchedView } from '../../shared/snapshot';
import { packetSections } from '../../shared/service';
import { firstName, formatPhone } from '../../shared/util';
import { useNow, useStore } from '../store/StoreContext';
import { Avatar, Sheet, Toggle } from '../components/ui';
import { Ladder } from '../components/Ladder';
import { MOOD_INFO, ago, clock } from '../lib/format';
import { statusLine } from '../lib/status';
import { SPOT_ART } from '../art';

export function Circle() {
  const { snap, run, api, attempt, toast, openPaywall, ask } = useStore();
  const now = useNow();
  const [adding, setAdding] = useState(false);
  const [inviting, setInviting] = useState(false);
  const limit = snap.limits.maxWatchers;
  const full = snap.watchers.length >= limit;
  const alerting = new Set(snap.circleAlerts.filter((a) => !a.alert.resolvedAt).map((a) => a.subject.id));

  async function removeWatcher(w: WatcherView) {
    const yes = await ask({ title: `Remove ${firstName(w.name)}?`, body: `${firstName(w.name)} won't be alerted if you go quiet.`, confirm: 'Remove', danger: true });
    if (!yes) return;
    if (w.kind === 'contact') await run({ type: 'removeContact', id: w.id });
    else if (w.watchId) await run({ type: 'removeWatch', id: w.watchId });
  }

  async function stopWatching(w: WatchedView) {
    const yes = await ask({ title: `Stop watching ${firstName(w.person.name)}?`, body: `You won't hear about it if ${firstName(w.person.name)} goes quiet.`, confirm: 'Stop watching', danger: true });
    if (!yes) return;
    await run({ type: 'removeWatch', id: w.watchId });
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <h1 className="display">Your circle</h1>
        <p className="muted">The people who hear about it if you go quiet, and the people you look out for.</p>
      </header>

      {snap.circleAlerts.map((a) => (
        <WatcherAlert key={a.alert.id} view={a} now={now} />
      ))}

      <section className="section">
        <div className="section-head">
          <h3>Watching over you</h3>
          <span className="count">{limit > 10 ? snap.watchers.length : `${snap.watchers.length} of ${limit}`}</span>
        </div>
        {snap.watchers.length === 0 && (
          <div className="card empty-art">
            <img className="spot-art lg" src={SPOT_ART.circle} alt="" width={132} height={132} />
            <strong>No one is watching over you yet</strong>
            <p className="muted">Add someone by phone or send them your invite link. They only hear from Sunup if you go quiet.</p>
          </div>
        )}
        {snap.watchers.length > 0 && (
          <ul className="people card">
            {snap.watchers.map((w) => (
              <li key={w.id}>
                <Avatar name={w.name} color={w.color} size={40} />
                <div className="people-text">
                  <strong>{w.name}</strong>
                  {w.kind === 'contact' ? (
                    <span className={w.consent === 'stopped' ? 'tone-danger' : w.consent === 'confirmed' ? '' : 'tone-warn'}>
                      {w.consent === 'stopped'
                        ? 'Replied STOP: won\'t be texted or called'
                        : w.consent === 'confirmed'
                          ? `Confirmed · texts and calls · ${formatPhone(w.phone!)}`
                          : `Waiting for a YES reply · ${formatPhone(w.phone!)}`}
                    </span>
                  ) : (
                    <span>On Sunup · push, texts and calls</span>
                  )}
                </div>
                <button
                  className={`icon-btn${w.receivesPacket ? ' on' : ''}`}
                  aria-label={w.receivesPacket ? `${w.name} can see your emergency info` : `${w.name} can't see your emergency info`}
                  title="Can see your 'If I go dark' packet"
                  onClick={() => run({ type: 'setPacketRecipient', ref: { type: w.kind, id: w.id }, value: !w.receivesPacket })}
                >
                  <KeyRound size={18} />
                </button>
                <button className="icon-btn" aria-label={`Remove ${w.name}`} onClick={() => removeWatcher(w)}>
                  <Trash2 size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="row-btns">
          <button className="btn" onClick={() => (full ? openFull() : setAdding(true))}>
            <UserPlus size={18} /> Add by phone
          </button>
          <button className="btn" onClick={() => (full ? openFull() : setInviting(true))}>
            <Share2 size={18} /> Invite link
          </button>
        </div>
        <p className="fine">
          <KeyRound size={12} /> marks who receives your "If I go dark" packet. People added by phone don't need the app. They get a text asking them to reply YES, then texts and calls if you go quiet.
        </p>
      </section>

      <section className="section">
        <div className="section-head">
          <h3>You're watching</h3>
        </div>
        {snap.watching.length === 0 ? (
          <p className="muted card pad">When someone shares their invite link with you, you'll see their check-ins here.</p>
        ) : (
          <ul className="people card">
            {snap.watching.map((w) => (
              <li key={w.watchId}>
                <Avatar name={w.person.name} color={w.person.color} size={40} />
                <div className="people-text">
                  <strong>
                    {w.person.name} {w.lastCheckIn?.mood && MOOD_INFO[w.lastCheckIn.mood].emoji}
                  </strong>
                  <span className={`tone-${statusLine(w, now, alerting.has(w.person.id)).tone}`}>{statusLine(w, now, alerting.has(w.person.id)).text}</span>
                </div>
                {w.person.phone && (
                  <a className="icon-btn" href={`tel:${w.person.phone}`} aria-label={`Call ${w.person.name}`}>
                    <Phone size={18} />
                  </a>
                )}
                <button className="icon-btn" aria-label={`Stop watching ${w.person.name}`} onClick={() => stopWatching(w)}>
                  <Trash2 size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {api.demo && (
        <section className="section demo-box">
          <div className="section-head">
            <h3>
              <Sparkles size={16} /> Demo
            </h3>
          </div>
          {!api.demo.hasSampleCircle() ? (
            <>
              <p className="muted">Add Mom and Jordan, two simulated people who check in every morning, so you can see both sides of Sunup.</p>
              <button className="btn primary block" onClick={() => attempt(() => api.demo!.addSampleCircle())}>
                Add sample circle
              </button>
            </>
          ) : (
            <>
              <p className="muted">See what you'd get if someone you watch goes quiet. The demo plays an hour of escalation in about 90 seconds.</p>
              <div className="row-btns wrap">
                {snap.watching.map((w) => (
                  <button key={w.watchId} className="btn" onClick={() => attempt(() => api.demo!.simulateFriendMiss(w.person.id))}>
                    {firstName(w.person.name)} goes quiet
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      <AddContactSheet open={adding} onClose={() => setAdding(false)} />
      <InviteSheet open={inviting} onClose={() => setInviting(false)} />
    </div>
  );

  function openFull() {
    if (snap.limits.premium) toast({ title: 'Your circle is full.', tone: 'info' });
    else openPaywall(`The free plan covers ${limit} people in your circle. Go Premium to add everyone who cares.`);
  }
}

function WatcherAlert({ view, now }: { view: AlertView; now: number }) {
  const { run } = useStore();
  const { alert, subject, moment, packet } = view;
  const name = firstName(subject.name);
  const resolved = !!alert.resolvedAt;
  const title = alert.kind === 'sos' ? `SOS from ${name}` : alert.kind === 'moment' ? `${name}'s timer ran out` : `${name} hasn't checked in`;
  const sections = packet ? packetSections(packet) : [];

  if (resolved) {
    return (
      <section className="card resolved-card">
        <Check size={20} />
        <div>
          <strong>{name} is okay</strong>
          <span>
            {alert.resolution === 'reached' && view.resolverName ? `${firstName(view.resolverName)} reached ${name}` : `${name} checked in`} at {clock(alert.resolvedAt!)}.
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="card alert-card watcher">
      <div className="alert-head">
        <Avatar name={subject.name} color={subject.color} size={44} ring="danger" />
        <div>
          <h2>{title}</h2>
          <p>
            {alert.kind === 'missed' ? `Was due ${ago(alert.triggeredAt, now)}` : `${ago(alert.triggeredAt, now)}`} · try to reach {name}
          </p>
        </div>
      </div>
      {moment && (
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
              <dd>
                <a href={moment.details.link} target="_blank" rel="noreferrer">
                  {moment.details.link}
                </a>
              </dd>
            </>
          )}
          {moment.details.notes && (
            <>
              <dt>Notes</dt>
              <dd>{moment.details.notes}</dd>
            </>
          )}
        </dl>
      )}
      {alert.location && (
        <a className="btn block" href={`https://maps.google.com/?q=${alert.location.lat},${alert.location.lng}`} target="_blank" rel="noreferrer">
          <MapPin size={18} /> See {name}'s location
        </a>
      )}
      {subject.phone && (
        <p className="reach">
          {name}'s number: <strong>{formatPhone(subject.phone)}</strong>
        </p>
      )}
      <div className="row-btns">
        {subject.phone && (
          <a className="btn primary" href={`tel:${subject.phone}`}>
            <Phone size={18} /> Call
          </a>
        )}
        {subject.phone && (
          <a className="btn" href={`sms:${subject.phone}`}>
            <MessageSquare size={18} /> Text
          </a>
        )}
      </div>
      <button className="btn ok block" onClick={() => run({ type: 'resolveAlert', id: alert.id })}>
        <Check size={18} /> I reached {name}, they're okay
      </button>
      {sections.length > 0 && (
        <div className="packet-view">
          <h4>
            <KeyRound size={16} /> {name}'s emergency info
          </h4>
          {sections.map((s) => (
            <div key={s.key}>
              <strong>{s.label}</strong>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      )}
      <Ladder view={view} now={now} perspective="watcher" />
    </section>
  );
}

function AddContactSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { run, toast } = useStore();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [packet, setPacket] = useState(true);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (await run({ type: 'addContact', name, phone, receivesPacket: packet })) {
      toast({ title: `${name} is in your circle`, body: 'We texted them to confirm. They just need to reply YES.', tone: 'ok' });
      setName('');
      setPhone('');
      onClose();
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add by phone">
      <form className="form" onSubmit={save}>
        <p className="muted">They don't need the app. If you miss a check-in, Sunup texts them, then calls.</p>
        <label>
          <span>Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mom" maxLength={40} required autoFocus />
        </label>
        <label>
          <span>Mobile number</span>
          <input className="input" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" required />
        </label>
        <label className="row-toggle">
          <span>Can see my emergency info if I go dark</span>
          <Toggle checked={packet} onChange={setPacket} label="Can see my emergency info" />
        </label>
        <button className="btn primary block" type="submit">
          Add to circle
        </button>
      </form>
    </Sheet>
  );
}

function InviteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { snap, api, toast, ask, run } = useStore();
  const url = api.inviteUrl(snap.me.inviteCode);
  const text = `I'm using Sunup: one tap each morning so the people I trust know I'm okay. Join my circle: ${url}`;

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join my Sunup circle', text, url });
        return;
      }
    } catch (e) {
      // Dismissing the share sheet is fine; anything else (e.g. sharing blocked) falls back to copying.
      if ((e as Error).name === 'AbortError') return;
    }
    copy();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Invite link copied', tone: 'ok' });
    } catch {
      toast({ title: 'Copy this link', body: url, tone: 'info' });
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Invite to your circle">
      <div className="form">
        <p className="muted">Send this link to someone with a smartphone. They'll see your daily check-ins and get push alerts. You can also watch over each other.</p>
        <div className="invite-link">
          <code>{url}</code>
          <button className="icon-btn" onClick={copy} aria-label="Copy invite link">
            <Copy size={18} />
          </button>
        </div>
        <button className="btn primary block" onClick={share}>
          <Share2 size={18} /> Share invite
        </button>
        <button
          className="btn ghost block"
          onClick={async () =>
            (await ask({ title: 'Make a new link?', body: 'Your current link stops working. People already in your circle stay.', confirm: 'Make a new link', cancel: 'Keep this link' })) &&
            (await run({ type: 'newInviteCode' })) &&
            toast({ title: 'New invite link ready', tone: 'ok' })
          }
        >
          Make a new link
        </button>
        {api.mode === 'demo' && <p className="fine">In the demo, everything lives on this device, so links won't connect two phones. Try the sample circle instead.</p>}
      </div>
    </Sheet>
  );
}
