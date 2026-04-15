import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {RADIUS} from '../theme/colors';
import {useAppTheme} from '../theme/ThemeContext';
import type {AppColors} from '../theme/colors';

type AuthMode = 'signin' | 'signup';

type Props = {
  visible: boolean;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (params: {email: string; password: string; mode: AuthMode}) => void;
};

export const AuthModal = ({
  visible,
  busy = false,
  onClose,
  onSubmit,
}: Props) => {
  const {colors} = useAppTheme();
  const styles = createStyles(colors);
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const opacity = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      slide.setValue(24);
      return;
    }

    setError('');
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.spring(slide, {
        toValue: 0,
        tension: 110,
        friction: 13,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, slide, visible]);

  const handleSubmit = () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError('Enter email and password.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setError('');
    onSubmit({email: normalizedEmail, password, mode});
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, {opacity}]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.center}>
          <Animated.View
            style={[styles.sheet, {transform: [{translateY: slide}]}]}>
            <View style={styles.hero}>
              <MaterialIcons
                name="cloud-sync"
                size={22}
                color={colors.accentText}
              />
            </View>
            <Text style={styles.title}>
              {mode === 'signin' ? 'Sign in to sync' : 'Create sync account'}
            </Text>
            <Text style={styles.body}>
              {mode === 'signin'
                ? 'Sign in to keep notes synced across devices.'
                : 'Create an account to start cloud sync.'}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              selectionColor={colors.accent}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              selectionColor={colors.accent}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSubmit}
              disabled={busy}
              activeOpacity={0.75}>
              {busy ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.submitText}>
                  {mode === 'signin' ? 'Sign in' : 'Create account'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchBtn}
              onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              disabled={busy}
              activeOpacity={0.7}>
              <Text style={styles.switchText}>
                {mode === 'signin'
                  ? "Don't have an account? Create one"
                  : 'Already have an account? Sign in'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={busy}
              activeOpacity={0.65}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    center: {
      width: '100%',
    },
    sheet: {
      width: '100%',
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 18,
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 10},
      shadowOpacity: 0.24,
      shadowRadius: 16,
      elevation: 10,
    },
    hero: {
      width: 44,
      height: 44,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: 12,
    },
    title: {
      textAlign: 'center',
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.3,
      marginBottom: 8,
    },
    body: {
      textAlign: 'center',
      fontSize: 14,
      lineHeight: 21,
      color: colors.textFaint,
      marginBottom: 18,
    },
    input: {
      height: 46,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      color: colors.text,
      fontSize: 15,
      paddingHorizontal: 14,
      marginBottom: 10,
    },
    error: {
      color: colors.dangerText,
      fontSize: 13,
      marginTop: 2,
      marginBottom: 10,
      textAlign: 'center',
    },
    submitBtn: {
      height: 46,
      borderRadius: RADIUS.md,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    submitText: {
      color: colors.white,
      fontSize: 15,
      fontWeight: '700',
    },
    switchBtn: {
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    switchText: {
      fontSize: 13,
      color: colors.accentText,
      fontWeight: '600',
    },
    cancelBtn: {
      height: 42,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    cancelText: {
      color: colors.textSec,
      fontSize: 14,
      fontWeight: '600',
    },
  });
