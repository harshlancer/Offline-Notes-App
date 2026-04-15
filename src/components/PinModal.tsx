import React, {useEffect, useRef, useState} from 'react';
import {
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
import {verifyPin, setPin, hasPin} from '../biometrics/keychain';
import {RADIUS} from '../theme/colors';
import {useAppTheme} from '../theme/ThemeContext';
import type {AppColors} from '../theme/colors';

type Props = {
  visible: boolean;
  mode?: 'auto' | 'verify' | 'setup';
  title?: string;
  description?: string;
  confirmLabel?: string;
  onRequestClose: () => void;
  onSuccess: () => void;
};

const PinDots = ({
  colors,
  count,
  filled,
}: {
  colors: AppColors;
  count: number;
  filled: number;
}) => {
  const styles = createDotStyles(colors);
  return (
    <View style={styles.row}>
      {Array.from({length: count}).map((_, i) => (
        <View key={i} style={[styles.dot, i < filled && styles.dotFilled]} />
      ))}
    </View>
  );
};

export const PinModal = ({
  visible,
  mode = 'auto',
  title,
  description,
  confirmLabel,
  onRequestClose,
  onSuccess,
}: Props) => {
  const {colors} = useAppTheme();
  const styles = createStyles(colors);
  const [pin, setLocalPin] = useState('');
  const [activeMode, setActiveMode] = useState<'verify' | 'setup'>('verify');
  const [error, setError] = useState('');
  const inputRef = useRef<TextInput>(null);

  const slide = useRef(new Animated.Value(24)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      (async () => {
        const hasSavedPin = await hasPin();
        const nextMode =
          mode === 'auto' ? (hasSavedPin ? 'verify' : 'setup') : mode;
        setActiveMode(nextMode);
        setLocalPin('');
        setError('');
        setTimeout(() => inputRef.current?.focus(), 200);
      })();
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.spring(slide, {
          toValue: 0,
          tension: 100,
          friction: 12,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      opacity.setValue(0);
      slide.setValue(24);
    }
  }, [mode, opacity, slide, visible]);

  const doShake = () => {
    Animated.sequence([
      Animated.timing(shake, {toValue: 8, duration: 55, useNativeDriver: true}),
      Animated.timing(shake, {
        toValue: -8,
        duration: 55,
        useNativeDriver: true,
      }),
      Animated.timing(shake, {toValue: 6, duration: 55, useNativeDriver: true}),
      Animated.timing(shake, {
        toValue: -6,
        duration: 55,
        useNativeDriver: true,
      }),
      Animated.timing(shake, {toValue: 0, duration: 55, useNativeDriver: true}),
    ]).start();
  };

  const handleSubmit = async () => {
    setError('');
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits.');
      doShake();
      return;
    }
    if (activeMode === 'setup') {
      const ok = await setPin(pin);
      if (ok) {
        onSuccess();
      } else {
        setError('Could not save PIN. Try again.');
        doShake();
        setLocalPin('');
      }
      return;
    }
    const ok = await verifyPin(pin);
    if (ok) {
      onSuccess();
    } else {
      setError('Incorrect PIN.');
      doShake();
      setLocalPin('');
    }
  };

  return (
    <Modal
      animationType="none"
      visible={visible}
      transparent
      onRequestClose={onRequestClose}>
      <Animated.View style={[styles.backdrop, {opacity}]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.center}>
          <Animated.View
            style={[
              styles.sheet,
              {transform: [{translateY: slide}, {translateX: shake}]},
            ]}>
            <Text style={styles.heading}>
              {title ?? (activeMode === 'setup' ? 'Set a PIN' : 'Unlock note')}
            </Text>
            <Text style={styles.subheading}>
              {description ??
                (activeMode === 'setup'
                  ? 'Choose a 4-6 digit PIN to protect locked content.'
                  : 'Enter your PIN to continue.')}
            </Text>

            <View style={styles.heroIcon}>
              <MaterialIcons
                name={activeMode === 'setup' ? 'lock' : 'lock-open'}
                size={24}
                color={colors.accentText}
              />
            </View>

            <PinDots colors={colors} count={6} filled={pin.length} />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TextInput
              ref={inputRef}
              style={styles.hiddenInput}
              value={pin}
              onChangeText={value => {
                if (value.length <= 6) {
                  setLocalPin(value);
                }
                if (value.length === 6) {
                  setTimeout(handleSubmit, 80);
                }
              }}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
            />

            <TouchableOpacity
              style={styles.keyboardHint}
              onPress={() => inputRef.current?.focus()}
              activeOpacity={0.6}>
              <Text style={styles.keyboardHintText}>Tap to enter PIN</Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onRequestClose}
                activeOpacity={0.65}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmBtn,
                  pin.length < 4 && styles.confirmDisabled,
                ]}
                onPress={handleSubmit}
                disabled={pin.length < 4}
                activeOpacity={0.7}>
                <Text style={styles.confirmText}>
                  {confirmLabel ??
                    (activeMode === 'setup' ? 'Set PIN' : 'Unlock')}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
};

const createDotStyles = (colors: AppColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'center',
      paddingVertical: 22,
    },
    dot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: colors.borderMed,
      backgroundColor: 'transparent',
    },
    dotFilled: {
      backgroundColor: colors.accent,
      borderColor: colors.accentText,
    },
  });

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      alignItems: 'center',
      justifyContent: 'flex-end',
    },
    center: {width: '100%'},
    sheet: {
      backgroundColor: colors.surfaceElevated,
      borderTopLeftRadius: RADIUS.lg,
      borderTopRightRadius: RADIUS.lg,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: colors.border,
      paddingHorizontal: 24,
      paddingTop: 28,
      paddingBottom: 36,
    },
    heading: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 6,
      letterSpacing: -0.4,
    },
    subheading: {
      fontSize: 14,
      color: colors.textFaint,
      lineHeight: 22,
      marginBottom: 6,
    },
    heroIcon: {
      width: 48,
      height: 48,
      borderRadius: RADIUS.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 18,
      alignSelf: 'center',
    },
    errorText: {
      fontSize: 13,
      color: colors.dangerText,
      textAlign: 'center',
      marginBottom: 4,
    },
    hiddenInput: {
      height: 0,
      width: 0,
      opacity: 0,
      position: 'absolute',
    },
    keyboardHint: {
      alignSelf: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.borderMed,
      backgroundColor: colors.surface,
    },
    keyboardHintText: {
      fontSize: 13,
      color: colors.text,
      fontWeight: '500',
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 20,
    },
    btnRow: {
      flexDirection: 'row',
      gap: 12,
    },
    cancelBtn: {
      flex: 1,
      height: 46,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    confirmBtn: {
      flex: 1,
      height: 46,
      borderRadius: RADIUS.md,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    confirmDisabled: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    confirmText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.white,
    },
  });
