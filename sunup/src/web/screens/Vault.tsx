import { useEffect, useState } from 'react';
import { HeartPulse, House, Lock, LockOpen, NotebookPen, PawPrint, Phone } from 'lucide-react';
import type { Packet } from '../../shared/types';
import { PACKET_LABELS } from '../../shared/service';
import { firstName } from '../../shared/util';
import { useStore } from '../store/StoreContext';
import { Avatar, PremiumBadge, Toggle } from '../components/ui';

type Field = Exclude<keyof Packet, 'updatedAt'>;

const FIELDS: { key: Field; icon: typeof PawPrint; placeholder: string }[] = [
  { key: 'pets', icon: PawPrint, placeholder: 'Who needs feeding or walking? Food, amounts, schedule, vet.\ne.g. Biscuit (cat): 1 scoop at 8am and 6pm.' },
  { key: 'home', icon: House, placeholder: 'How to get in: door code, lockbox, who has a spare key, building manager.' },
  { key: 'health', icon: HeartPulse, placeholder: 'Medications, allergies, conditions, your doctor.\ne.g. Allergic to penicillin. Inhaler in the nightstand.' },
  { key: 'people', icon: Phone, placeholder: 'Who else should hear: family, your manager, your landlord. Names and numbers.' },
  { key: 'notes', icon: NotebookPen, placeholder: 'Anything else: plants, a car in a tow zone, a package to hold.' },
];

export function Vault() {
  const { snap, run, toast } = useStore();
  const [draft, setDraft] = useState<Packet>(snap.packet);
  const [dirty, setDirty] = useState(false);
  const recipients = snap.watchers.filter((w) => w.receivesPacket);
  const active = snap.myAlerts.find((a) => !a.alert.resolvedAt && a.alert.steps.packet);

  useEffect(() => {
    if (!dirty) setDraft(snap.packet);
  }, [snap.packet, dirty]);

  async function save() {
    if (await run({ type: 'savePacket', packet: draft })) {
      setDirty(false);
      toast({ title: 'Packet saved and sealed', tone: 'ok' });
    }
  }

  const filled = FIELDS.filter((f) => draft[f.key].trim()).length;

  return (
    <div className="screen">
      <header className="screen-head">
        <h1 className="display">If I go dark</h1>
        <p className="muted">
          What someone would need if you couldn't answer: your pet, your door, your meds. It stays sealed and is only released, to the people you pick, if an
          alert gets that far.
        </p>
      </header>

      <div className={`seal ${active ? 'open' : ''}`}>
        {active ? <LockOpen size={20} /> : <Lock size={20} />}
        <div>
          <strong>{active ? 'Released during your current alert' : 'Sealed'}</strong>
          <span>
            {recipients.length
              ? `Goes to ${recipients.map((r) => firstName(r.name)).join(', ')}`
              : 'No one is chosen to receive it yet'}
            {' · '}
            {filled} of {FIELDS.length} sections filled
          </span>
        </div>
      </div>

      {!snap.limits.packetRelease && (
        <p className="card pad upsell">
          <PremiumBadge /> You can fill this in for free. Releasing it during an alert is part of Premium.
        </p>
      )}

      <div className="packet-form">
        {FIELDS.map(({ key, icon: Icon, placeholder }) => (
          <label key={key} className="packet-field">
            <span className="packet-label">
              <Icon size={16} /> {PACKET_LABELS[key]}
            </span>
            <textarea
              className="input"
              rows={3}
              maxLength={1500}
              placeholder={placeholder}
              value={draft[key]}
              onChange={(e) => {
                setDraft({ ...draft, [key]: e.target.value });
                setDirty(true);
              }}
            />
          </label>
        ))}
      </div>

      <section className="section">
        <div className="section-head">
          <h3>Who receives it</h3>
        </div>
        {snap.watchers.length === 0 ? (
          <p className="muted card pad">Add people to your circle first.</p>
        ) : (
          <ul className="people card">
            {snap.watchers.map((w) => (
              <li key={w.id}>
                <Avatar name={w.name} color={w.color} size={36} />
                <div className="people-text">
                  <strong>{w.name}</strong>
                  <span>
                    {w.kind === 'user'
                      ? 'In the Sunup app'
                      : w.consent === 'stopped'
                        ? 'Opted out of Sunup texts'
                        : w.consent === 'confirmed'
                          ? 'By text message'
                          : 'By text, once they reply YES'}
                  </span>
                </div>
                <Toggle
                  checked={w.receivesPacket}
                  label={`${w.name} receives the packet`}
                  onChange={(v) => run({ type: 'setPacketRecipient', ref: { type: w.kind, id: w.id }, value: v })}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="sticky-save">
        <button className="btn primary block lg" onClick={save} disabled={!dirty}>
          {dirty ? 'Save and seal' : 'Saved'}
        </button>
      </div>
    </div>
  );
}
