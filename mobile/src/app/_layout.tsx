import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { useFonts } from 'expo-font';
import { NunitoSans_400Regular } from '@expo-google-fonts/nunito-sans/400Regular';
import { NunitoSans_700Bold } from '@expo-google-fonts/nunito-sans/700Bold';
import { migrate } from '@/db/migrations';
import type { Database } from '@/db/types';
import { OutingProvider } from '@/providers/OutingProvider';
import { SettingsProvider, useSettings } from '@/providers/SettingsProvider';
import { fonts, usePalette } from '@/ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

// SQLiteProvider closes and reopens the database whenever this function changes, so it
// must be the same function on every render.
async function initDatabase(db: SQLiteDatabase) {
  await migrate(db as unknown as Database);
}

function AppStack() {
  const palette = usePalette();
  const { loaded } = useSettings();

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded]);

  if (!loaded) return null;

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.primary,
          headerTitleStyle: { fontFamily: fonts.bold, color: palette.text },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: palette.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Trail Notes' }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="record" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="write" options={{ title: 'Write a note', presentation: 'modal' }} />
        <Stack.Screen name="entry/[id]" options={{ title: 'Entry' }} />
        <Stack.Screen name="outing/[id]" options={{ title: 'Outing' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ NunitoSans_400Regular, NunitoSans_700Bold });

  // A missing font should never keep the app from opening: fall back to the system font.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SQLiteProvider databaseName="trailnotes.db" onInit={initDatabase}>
      <SettingsProvider>
        <OutingProvider>
          <AppStack />
        </OutingProvider>
      </SettingsProvider>
    </SQLiteProvider>
  );
}
