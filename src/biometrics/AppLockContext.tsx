import React, {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useDatabase} from '@nozbe/watermelondb/react';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {hasPin} from './keychain';
import {isSensorAvailable, promptBiometric} from './biometricAuth';
import {PinModal} from '../components/PinModal';
import {RADIUS} from '../theme/colors';
import {useAppTheme} from '../theme/ThemeContext';
import type {AppColors} from '../theme/colors';

const APP_LOCK_KEY = 'app_lock_enabled_v1';

type PinMode = 'setup' | 'verify';

type AppLockContextValue = {
  enabled: boolean;
  isReady: boolean;
  setEnabled: (next: boolean) => Promise<boolean>;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

export const AppLockProvider = ({children}: {children: React.ReactNode}) => {
  const database = useDatabase();
  const {colors} = useAppTheme();
  const styles = createStyles(colors);
  const [enabled, setEnabledState] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [pinMode, setPinMode] = useState<PinMode | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const pinResolver = useRef<((value: boolean) => void) | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadState = async () => {
      try {
        const storedValue = await database.localStorage.get(APP_LOCK_KEY);
        if (!isMounted) {
          return;
        }

        const nextEnabled = storedValue === 'true';
        setEnabledState(nextEnabled);
        setIsLocked(nextEnabled);
      } catch (error) {
        console.warn('Failed to load app lock preference.', error);
      } finally {
        if (isMounted) {
          setIsReady(true);
        }
      }
    };

    loadState();

    return () => {
      isMounted = false;
    };
  }, [database]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const subscription = AppState.addEventListener('change', nextState => {
      const previousState = appState.current;
      appState.current = nextState;

      if (
        enabled &&
        /inactive|background/.test(previousState) &&
        nextState === 'active'
      ) {
        setIsLocked(true);
      }
    });

    return () => subscription.remove();
  }, [enabled, isReady]);

  const resolvePin = (value: boolean) => {
    const resolver = pinResolver.current;
    pinResolver.current = null;
    resolver?.(value);
  };

  const promptForPin = (mode: PinMode) =>
    new Promise<boolean>(resolve => {
      pinResolver.current = resolve;
      setPinMode(mode);
    });

  const ensureFallbackAccess = useCallback(async (): Promise<boolean> => {
    if (await hasPin()) {
      return true;
    }

    return promptForPin('setup');
  }, []);

  const attemptUnlock = useCallback(async (): Promise<boolean> => {
    if (!enabled) {
      return true;
    }

    setIsUnlocking(true);

    try {
      if (await isSensorAvailable()) {
        const biometricGranted = await promptBiometric('Unlock app');
        if (biometricGranted) {
          setIsLocked(false);
          return true;
        }
      }

      if (await hasPin()) {
        const pinGranted = await promptForPin('verify');
        if (pinGranted) {
          setIsLocked(false);
        }
        return pinGranted;
      }

      return false;
    } finally {
      setIsUnlocking(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!isReady || !enabled || !isLocked || isUnlocking || pinMode !== null) {
      return;
    }

    attemptUnlock().catch(error => {
      console.warn('Failed to unlock app.', error);
    });
  }, [attemptUnlock, enabled, isLocked, isReady, isUnlocking, pinMode]);

  const setEnabled = useCallback(
    async (next: boolean): Promise<boolean> => {
      if (next) {
        const canEnable = await ensureFallbackAccess();
        if (!canEnable) {
          return false;
        }
      }

      try {
        await database.localStorage.set(APP_LOCK_KEY, next ? 'true' : 'false');
        setEnabledState(next);
        setIsLocked(false);
        return true;
      } catch (error) {
        console.warn('Failed to update app lock preference.', error);
        return false;
      }
    },
    [database, ensureFallbackAccess],
  );

  const value = useMemo(
    () => ({
      enabled,
      isReady,
      setEnabled,
    }),
    [enabled, isReady, setEnabled],
  );

  return (
    <AppLockContext.Provider value={value}>
      {children}

      {enabled && isLocked ? (
        <View style={styles.overlay}>
          <View style={styles.lockCard}>
            <View style={styles.lockIconWrap}>
              <MaterialIcons name="lock" size={28} color={colors.accentText} />
            </View>
            <Text style={styles.lockTitle}>App locked</Text>
            <Text style={styles.lockBody}>
              Unlock with biometrics or your fallback PIN to continue.
            </Text>
            <TouchableOpacity
              style={styles.unlockButton}
              onPress={() => {
                attemptUnlock().catch(error => {
                  console.warn('Failed to unlock app.', error);
                });
              }}
              activeOpacity={0.75}
              disabled={isUnlocking}>
              {isUnlocking ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <MaterialIcons
                    name="fingerprint"
                    size={18}
                    color={colors.white}
                  />
                  <Text style={styles.unlockButtonText}>Unlock</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <PinModal
        visible={pinMode !== null}
        mode={pinMode ?? 'auto'}
        title={pinMode === 'setup' ? 'Set a fallback PIN' : 'Unlock app'}
        description={
          pinMode === 'setup'
            ? 'Choose a PIN so the app can still unlock when biometrics are unavailable.'
            : 'Enter your PIN to unlock the app.'
        }
        confirmLabel={pinMode === 'setup' ? 'Save PIN' : 'Unlock'}
        onRequestClose={() => {
          setPinMode(null);
          resolvePin(false);
        }}
        onSuccess={() => {
          const currentMode = pinMode;
          setPinMode(null);
          if (currentMode === 'verify') {
            setIsLocked(false);
          }
          resolvePin(true);
        }}
      />
    </AppLockContext.Provider>
  );
};

export const useAppLock = () => {
  const value = useContext(AppLockContext);
  if (!value) {
    throw new Error('useAppLock must be used inside AppLockProvider');
  }
  return value;
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      zIndex: 100,
    },
    lockCard: {
      width: '100%',
      maxWidth: 360,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: 24,
      paddingVertical: 28,
      alignItems: 'center',
    },
    lockIconWrap: {
      width: 64,
      height: 64,
      borderRadius: RADIUS.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },
    lockTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
      letterSpacing: -0.4,
    },
    lockBody: {
      fontSize: 14,
      lineHeight: 22,
      color: colors.textFaint,
      textAlign: 'center',
      marginBottom: 24,
    },
    unlockButton: {
      minWidth: 152,
      height: 48,
      borderRadius: RADIUS.md,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 18,
    },
    unlockButtonText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.white,
    },
  });
