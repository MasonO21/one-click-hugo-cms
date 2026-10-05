import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { ModalTop } from '../components/ModalTop';
import { FadeIn, stagger } from '../components/motion';
import { Screen } from '../components/Screen';
import { Emoji, Text } from '../components/Text';
import { isDemoMode, type HouseholdMember } from '../lib/api';
import { confirm } from '../lib/dialogs';
import { HOUSEHOLD_MAX_PEOPLE } from '../billing/trial';
import { isCovered, sponsorName, useHousehold } from '../store/household';
import { radius, useTheme } from '../theme';

/** "3 weeks", for someone whose phone has not synced in a while. */
function away(days: number): string {
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.floor(days / 7)} weeks`;
  return `${Math.floor(days / 30)} months`;
}

function ago(ms: number | null): string {
  if (!ms) return 'not yet';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/** Share one fridge and shopping list with the people you live with. */
export default function Household() {
  const { c } = useTheme();
  const household = useHousehold((s) => s.household);
  const memberName = useHousehold((s) => s.memberName);
  const lastSyncAt = useHousehold((s) => s.lastSyncAt);
  const syncing = useHousehold((s) => s.syncing);
  const error = useHousehold((s) => s.error);
  const [name, setName] = useState(memberName);
  const [homeName, setHomeName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);

  const you = name.trim();
  const create = async () => {
    setBusy('create');
    await useHousehold.getState().create(homeName.trim() || 'Our kitchen', you);
    setBusy(null);
  };
  const join = async () => {
    setBusy('join');
    await useHousehold.getState().join(code.trim(), you);
    setBusy(null);
  };
  const leave = async () => {
    const ok = await confirm({
      title: 'Leave the household?',
      message: 'This phone keeps its copy of the lists, but stops sharing. The others keep theirs.',
      confirmLabel: 'Leave',
      destructive: true,
    });
    if (ok) await useHousehold.getState().leave();
  };
  const remove = async (member: HouseholdMember) => {
    if (!member.ref) return;
    const ok = await confirm({
      title: `Remove ${member.name}?`,
      message: `${member.name} stops seeing the shared lists${member.sponsor ? ', and their household plan stops covering everyone here' : ''}. They can join again with the invite code, so make a new code if you do not want that.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (ok) await useHousehold.getState().removeMember(member.ref);
  };
  const share = async () => {
    if (!household) return;
    try {
      await Share.share({ message: `Join our Fridge Pulse household "${household.name}" with the code ${household.code}. Open Settings > Household in the app.` });
    } catch {
      // Nothing to do: the code is on screen.
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ModalTop title="Household" subtitle="One fridge, one shopping list, everyone in the know." />

      {isDemoMode ? (
        <Text variant="caption" faint>
          Preview: sharing needs the Fridge Pulse server, so this household and its housemate are samples.
        </Text>
      ) : null}

      {household ? (
        <>
          <FadeIn>
            <Card glow="magenta" style={{ gap: 12 }} testID="household-card">
              <Text variant="label" color={c.primary}>
                {household.name}
              </Text>
              <View style={{ gap: 4 }}>
                <Text variant="caption" muted>
                  Invite code
                </Text>
                <Text variant="title" selectable testID="household-code" style={{ letterSpacing: 2 }}>
                  {household.code}
                </Text>
              </View>
              <View style={styles.row}>
                <Button testID="household-share" label="Invite someone" icon="share-outline" size="sm" onPress={() => void share()} />
                <Button label="New code" variant="ghost" size="sm" onPress={() => void useHousehold.getState().newCode()} />
              </View>
              <Text variant="caption" muted>
                {`Anyone with the code can join, up to ${HOUSEHOLD_MAX_PEOPLE} people. A new code stops the old one working. Someone whose phone has not synced for 2 months is taken out, so an old phone does not keep a place.`}
              </Text>
            </Card>
          </FadeIn>

          {isCovered(household) ? (
            <View style={[styles.plan, { backgroundColor: c.primaryTint }]} testID="household-covered">
              <Ionicons name="checkmark-circle" size={20} color={c.primary} />
              <Text variant="caption" style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
                {sponsorName(household)
                  ? `${sponsorName(household)}’s household plan covers everyone here.`
                  : 'Your household plan covers everyone here. Anyone who joins gets Fridge Pulse too.'}
              </Text>
            </View>
          ) : (
            <View style={[styles.plan, { backgroundColor: c.surfaceAlt }]} testID="household-upsell">
              <Text variant="caption" muted style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
                {`Right now everyone here needs their own plan. One person on the household plan covers up to ${HOUSEHOLD_MAX_PEOPLE} people.`}
              </Text>
              <Button label="See plans" size="sm" variant="ghost" onPress={() => router.push('/plans')} />
            </View>
          )}

          <View style={{ gap: 8 }}>
            <Text variant="label" muted>
              {`${household.members.length} ${household.members.length === 1 ? 'person' : 'people'}`}
            </Text>
            {household.members.map((m, i) => (
              <FadeIn key={`${m.name}-${i}`} delay={stagger(i, 50)}>
                <View style={[styles.member, { backgroundColor: c.surface, borderColor: c.border }]} testID={`member-${i}`}>
                  <View style={[styles.avatar, { backgroundColor: m.you ? c.primaryFill : c.surfaceAlt }]}>
                    <Text variant="bodyStrong" color={m.you ? c.onPrimary : c.ink}>
                      {m.name.trim()[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">
                      {m.name}
                      {m.you ? <Text muted>{' (you)'}</Text> : null}
                    </Text>
                    {m.sponsor ? (
                      <Text variant="caption" muted>
                        Pays for the household plan
                      </Text>
                    ) : null}
                    {m.idleDays ? (
                      <Text variant="caption" muted testID={`member-away-${i}`}>
                        {`Not seen for ${away(m.idleDays)}`}
                      </Text>
                    ) : null}
                  </View>
                  {!m.you && m.ref ? (
                    <Button testID={`member-remove-${i}`} label="Remove" size="sm" variant="ghost" onPress={() => void remove(m)} />
                  ) : null}
                </View>
              </FadeIn>
            ))}
          </View>

          <View style={styles.row}>
            <Ionicons name={syncing ? 'sync' : 'cloud-done-outline'} size={18} color={c.inkMuted} />
            <Text variant="caption" muted style={{ flex: 1 }} testID="household-synced">
              {syncing ? 'Syncing...' : `Synced ${ago(lastSyncAt)}`}
            </Text>
            <Button label="Sync now" variant="ghost" size="sm" onPress={() => void useHousehold.getState().sync()} />
          </View>

          <Button testID="household-leave" label="Leave household" variant="danger" size="sm" onPress={() => void leave()} style={{ alignSelf: 'flex-start' }} />
        </>
      ) : (
        <>
          <Card style={{ gap: 10, backgroundColor: c.primaryTint, borderColor: c.primaryTint }}>
            <View style={styles.row}>
              <Emoji size={26}>🏠</Emoji>
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                Share with the people you live with
              </Text>
            </View>
            <Text style={{ fontSize: 15, lineHeight: 22 }}>
              Everyone sees what is in the fridge, what needs using first and what is on the shopping list. Scan the shopping once
              and the whole house knows.
            </Text>
          </Card>

          <View style={{ gap: 6 }}>
            <Text variant="label" muted>
              Your name
            </Text>
            <Field testID="household-name" value={name} onChangeText={setName} placeholder="How your household sees you" maxLength={40} accessibilityLabel="Your name" />
          </View>

          <Card style={{ gap: 10 }}>
            <Text variant="heading">Start a household</Text>
            <Field testID="household-home" value={homeName} onChangeText={setHomeName} placeholder="Household name, like Our flat" maxLength={40} accessibilityLabel="Household name" />
            <Button testID="household-create" label="Start sharing" icon="people" disabled={!you || busy !== null} loading={busy === 'create'} onPress={() => void create()} />
          </Card>

          <Card style={{ gap: 10 }}>
            <Text variant="heading">Join with a code</Text>
            <Field
              testID="household-code-input"
              value={code}
              onChangeText={setCode}
              placeholder="ABCD-EF23"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
              accessibilityLabel="Invite code"
            />
            <Button
              testID="household-join"
              label="Join"
              variant="secondary"
              disabled={!you || (!isDemoMode && code.replace(/[^a-z0-9]/gi, '').length < 8) || busy !== null}
              loading={busy === 'join'}
              onPress={() => void join()}
            />
          </Card>

          <Text variant="caption" muted>
            Sharing stores your household&apos;s food list and shopping list on the Fridge Pulse server so the others can see them,
            and your phone&apos;s current lists join the household&apos;s. Your food log, goals and health data are never shared.
          </Text>
        </>
      )}

      {error ? (
        <Text variant="caption" color={c.danger} style={{ fontSize: 14 }} testID="household-error">
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1 },
  plan: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, flexWrap: 'wrap' },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
