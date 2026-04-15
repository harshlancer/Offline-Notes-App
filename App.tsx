import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Platform, StatusBar, StyleSheet, View} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import type {LinkingOptions} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {DatabaseProvider} from '@nozbe/watermelondb/react';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {database} from './src/database';
import {migrateLegacyNotes} from './src/database/legacyImport';
import {HomeScreen} from './src/screens/HomeScreen';
import {EditorScreen} from './src/screens/EditorScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import PrivacyPolicyScreen from './src/screens/PrivacyPolicyScreen';
import {AppLockProvider} from './src/biometrics/AppLockContext';
import {firebaseConfig} from './src/sync/firebaseConfig';
import {initFirebase} from './src/sync/firebaseClient';
import {enableSyncForUser} from './src/sync/syncEngine';
import {ThemeProvider, useAppTheme} from './src/theme/ThemeContext';
import type {AppColors} from './src/theme/colors';

export type RootStack = {
  Home: undefined;
  Editor:
    | {noteId?: string; defaultColor?: string; allowLockedAccess?: boolean}
    | undefined;
  Settings: undefined;
  PrivacyPolicy: undefined;
};

const Stack = createNativeStackNavigator<RootStack>();

const linking: LinkingOptions<RootStack> = {
  prefixes: ['goodnote://'],
  config: {
    screens: {
      Home: 'home',
      Editor: 'editor',
    },
  },
};

const AppShell = () => {
  const {colors, navigationTheme, statusBarStyle} = useAppTheme();
  const styles = createStyles(colors);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const bootstrapDatabase = async () => {
      try {
        await migrateLegacyNotes(database);
        if (firebaseConfig) {
          try {
            initFirebase(firebaseConfig as any);
            const anyCfg = firebaseConfig as any;
            if (anyCfg.autoEnable && anyCfg.userId) {
              await enableSyncForUser(database, anyCfg.userId);
            }
          } catch (e) {
            console.warn('Failed to initialize Firebase sync', e);
          }
        }
      } catch (error) {
        console.warn('Failed to initialize WatermelonDB notes store.', error);
      } finally {
        if (isMounted) {
          setIsReady(true);
        }
      }
    };

    bootstrapDatabase();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <DatabaseProvider database={database}>
      {isReady ? (
        <AppLockProvider>
          <NavigationContainer theme={navigationTheme} linking={linking}>
            <Stack.Navigator
              screenOptions={{
                headerShown: false,
                animation: 'slide_from_bottom',
                contentStyle: {backgroundColor: colors.bg},
              }}>
              <Stack.Screen name="Home" component={HomeScreen} />
              <Stack.Screen
                name="Editor"
                component={EditorScreen}
                initialParams={{}}
              />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </AppLockProvider>
      ) : (
        <View style={styles.bootstrapScreen}>
          <StatusBar
            translucent
            backgroundColor="transparent"
            barStyle={statusBarStyle}
          />
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}
    </DatabaseProvider>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <GestureHandlerRootView style={rootStyles.gestureRoot}>
        <AppShell />
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}

const rootStyles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
});

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    bootstrapScreen: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
    },
  });
