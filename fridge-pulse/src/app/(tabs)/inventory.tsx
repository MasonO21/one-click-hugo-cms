import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, TextInput, View } from 'react-native';
import { LOCATIONS, LOCATION_LABEL } from '../../components/categories';
import { Chip } from '../../components/Chip';
import { EmptyState } from '../../components/EmptyState';
import { Header } from '../../components/Header';
import { ItemRow } from '../../components/ItemRow';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { useMarkUsed } from '../../components/Undo';
import { active, daysLeft, sortByExpiry, urgencyOf, URGENCY_ORDER, type Urgency } from '../../lib/expiry';
import type { PantryItem, StorageLocation } from '../../lib/types';
import { useInventory } from '../../store/inventory';
import { radius, useTheme } from '../../theme';

const SECTION_TITLE: Record<Urgency, string> = {
  expired: 'Expired',
  today: 'Use today',
  soon: 'Next 3 days',
  week: 'This week',
  ok: 'Later',
};

export default function Inventory() {
  const { c } = useTheme();
  const items = useInventory((s) => s.items);
  const [filter, setFilter] = useState<StorageLocation | 'all'>('all');
  const [query, setQuery] = useState('');
  const [markUsed, undo] = useMarkUsed();

  const now = new Date();
  const live = useMemo(() => active(items), [items]);
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = sortByExpiry(
      live.filter((i) => (filter === 'all' || i.location === filter) && (q === '' || i.name.toLowerCase().includes(q))),
    );
    const groups: Record<Urgency, PantryItem[]> = { expired: [], today: [], soon: [], week: [], ok: [] };
    for (const item of shown) groups[urgencyOf(daysLeft(item, now))].push(item);
    return URGENCY_ORDER.filter((u) => groups[u].length > 0).map((u) => ({ key: u, title: SECTION_TITLE[u], data: groups[u] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, filter, query]);

  const countFor = (loc: StorageLocation) => live.filter((i) => i.location === loc).length;

  return (
    <Screen scroll={false} contentStyle={{ paddingBottom: 0 }}>
      <Header
        title="Items"
        subtitle={`${live.length} tracked`}
        right={
          <Pressable
            testID="add-items"
            accessibilityRole="button"
            accessibilityLabel="Scan or add items"
            onPress={() => router.push('/scan')}
            style={[styles.add, { backgroundColor: c.primary }]}
          >
            <Ionicons name="add" size={26} color={c.onPrimary} />
          </Pressable>
        }
      />

      <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Ionicons name="search" size={18} color={c.inkFaint} />
        <TextInput
          testID="search"
          value={query}
          onChangeText={setQuery}
          placeholder="Search items"
          placeholderTextColor={c.inkFaint}
          style={[styles.input, { color: c.ink }]}
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      <View style={styles.chips}>
        <Chip label={`All ${live.length}`} selected={filter === 'all'} onPress={() => setFilter('all')} />
        {LOCATIONS.map((loc) => (
          <Chip key={loc} label={`${LOCATION_LABEL[loc]} ${countFor(loc)}`} selected={filter === loc} onPress={() => setFilter(loc)} />
        ))}
      </View>

      <SectionList
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 96 }}
        sections={sections}
        keyExtractor={(i) => i.id}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHead}>
            <View style={[styles.sectionDot, { backgroundColor: c.urgency[section.key].solid }]} />
            <Text variant="label" muted>
              {section.title} · {section.data.length}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={{ marginBottom: 10 }}>
            <ItemRow item={item} now={now} onPress={() => router.push(`/item/${item.id}`)} onUsed={() => markUsed(item)} />
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            emoji={live.length === 0 ? '🧺' : '🔍'}
            title={live.length === 0 ? 'Nothing here yet' : 'No matches'}
            message={live.length === 0 ? 'Scan a shelf or add items by hand to start tracking.' : 'Try a different filter or search.'}
            actionLabel={live.length === 0 ? 'Scan your fridge' : undefined}
            onAction={live.length === 0 ? () => router.push('/scan') : undefined}
          />
        }
      />
      {undo}
    </Screen>
  );
}

const styles = StyleSheet.create({
  add: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, height: 46 },
  input: { flex: 1, fontSize: 16, height: 46 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, paddingBottom: 8 },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
});
