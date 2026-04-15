import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {isSensorAvailable, promptBiometric} from '../biometrics/biometricAuth';
import {hasPin} from '../biometrics/keychain';
import {NoteModel} from '../database/model/NoteModel';
import {RADIUS} from '../theme/colors';
import {useAppTheme} from '../theme/ThemeContext';
import type {AppColors} from '../theme/colors';
import {formatRelativeTime, stripHtml} from '../utils/helpers';
import {PinModal} from './PinModal';

interface Props {
  note: NoteModel;
  onPress: () => void;
  onLongPress: () => void;
  index: number;
}

type UnlockMethod = 'biometric' | 'pin' | 'cancel';
type UnlockPromptType = 'method' | 'fallback' | null;

const {width} = Dimensions.get('window');
const CARD_WIDTH = (width - 52) / 2;

export const NoteCard = ({note, onPress, onLongPress, index}: Props) => {
  const {colors} = useAppTheme();
  const styles = createStyles(colors);
  const [showPin, setShowPin] = useState(false);
  const [unlockPrompt, setUnlockPrompt] = useState<UnlockPromptType>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const unlockResolver = useRef<((value: UnlockMethod) => void) | null>(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 240,
        delay: Math.min(index * 35, 280),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 240,
        delay: Math.min(index * 35, 280),
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacity, translateY]);

  const handlePressIn = () =>
    Animated.spring(scale, {toValue: 0.98, useNativeDriver: true}).start();
  const handlePressOut = () =>
    Animated.spring(scale, {toValue: 1, useNativeDriver: true}).start();

  const resolveUnlockPrompt = (value: UnlockMethod) => {
    const resolver = unlockResolver.current;
    unlockResolver.current = null;
    setUnlockPrompt(null);
    resolver?.(value);
  };

  const promptUnlockChoice = (type: Exclude<UnlockPromptType, null>) =>
    new Promise<UnlockMethod>(resolve => {
      unlockResolver.current = resolve;
      setUnlockPrompt(type);
    });

  const attemptOpen = async () => {
    if (!note.locked) {
      onPress();
      return;
    }

    const [canUseBiometric, canUsePin] = await Promise.all([
      isSensorAvailable(),
      hasPin(),
    ]);

    if (canUseBiometric && canUsePin) {
      const preferredMethod = await promptUnlockChoice('method');

      if (preferredMethod === 'pin') {
        setShowPin(true);
        return;
      }

      if (preferredMethod !== 'biometric') {
        return;
      }
    }

    if (canUseBiometric) {
      const biometricGranted = await promptBiometric('Unlock note');
      if (biometricGranted) {
        onPress();
        return;
      }

      if (canUsePin) {
        const fallbackMethod = await promptUnlockChoice('fallback');
        if (fallbackMethod === 'pin') {
          setShowPin(true);
        }
        return;
      }
    }

    if (canUsePin) {
      setShowPin(true);
      return;
    }

    await promptUnlockChoice('fallback');
  };

  const plain = stripHtml(note.content);
  const preview = plain.slice(0, 110);

  return (
    <Animated.View
      style={[styles.wrapper, {opacity, transform: [{translateY}, {scale}]}]}>
      <TouchableOpacity
        style={styles.card}
        onPress={attemptOpen}
        onLongPress={onLongPress}
        delayLongPress={280}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}>
        <View style={[styles.accentBar, {backgroundColor: note.color}]} />

        {note.locked ? (
          <View style={styles.lockBadge}>
            <MaterialIcons name="lock" size={13} color={colors.white} />
            <Text style={styles.lockBadgeText}>Locked</Text>
          </View>
        ) : null}

        <View style={styles.cardBody}>
          {note.title ? (
            <Text
              style={[styles.title, note.locked && styles.titleLocked]}
              numberOfLines={2}>
              {note.title}
            </Text>
          ) : null}
          {!note.locked && preview ? (
            <Text style={styles.preview} numberOfLines={4}>
              {preview}
              {plain.length > 110 ? '...' : ''}
            </Text>
          ) : null}
          {note.locked ? (
            <View style={styles.lockedPreview}>
              <View style={styles.lockedPreviewBarWide} />
              <View style={styles.lockedPreviewBar} />
              <View style={styles.lockedPreviewBarShort} />
              <Text style={styles.lockedBody}>
                Secured with biometrics or PIN.
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.timestamp}>
          {formatRelativeTime(note.updatedAt)}
        </Text>
      </TouchableOpacity>

      <PinModal
        visible={showPin}
        mode="verify"
        title="Unlock note"
        description="Enter your fallback PIN to open this note."
        onRequestClose={() => setShowPin(false)}
        onSuccess={() => {
          setShowPin(false);
          onPress();
        }}
      />

      <Modal
        visible={unlockPrompt !== null}
        transparent
        animationType="fade"
        onRequestClose={() => resolveUnlockPrompt('cancel')}>
        <View style={styles.unlockBackdrop}>
          <View style={styles.unlockDialog}>
            <View style={styles.unlockIconWrap}>
              <MaterialIcons
                name={
                  unlockPrompt === 'fallback' ? 'lock-reset' : 'fingerprint'
                }
                size={24}
                color={colors.accentText}
              />
            </View>
            <Text style={styles.unlockTitle}>
              {unlockPrompt === 'fallback'
                ? 'Biometric not completed'
                : 'Unlock note'}
            </Text>
            <Text style={styles.unlockBody}>
              {unlockPrompt === 'fallback'
                ? 'Use your fallback PIN to continue opening this note.'
                : 'Use biometrics by default, or choose PIN instead.'}
            </Text>
            <View style={styles.unlockBtnColumn}>
              {unlockPrompt === 'method' ? (
                <TouchableOpacity
                  style={styles.unlockPrimaryBtn}
                  onPress={() => resolveUnlockPrompt('biometric')}
                  activeOpacity={0.72}>
                  <MaterialIcons
                    name="fingerprint"
                    size={18}
                    color={colors.white}
                  />
                  <Text style={styles.unlockPrimaryText}>Use biometrics</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.unlockSecondaryBtn}
                onPress={() => resolveUnlockPrompt('pin')}
                activeOpacity={0.72}>
                <MaterialIcons name="pin" size={16} color={colors.text} />
                <Text style={styles.unlockSecondaryText}>Use PIN instead</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.unlockCancelBtn}
                onPress={() => resolveUnlockPrompt('cancel')}
                activeOpacity={0.62}>
                <Text style={styles.unlockCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    wrapper: {
      width: CARD_WIDTH,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      padding: 16,
      paddingTop: 26,
      minHeight: 150,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 6},
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 4,
      justifyContent: 'space-between',
      overflow: 'hidden',
    },
    accentBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 6,
    },
    lockBadge: {
      position: 'absolute',
      top: 14,
      right: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.accent,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    lockBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.white,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    cardBody: {
      flex: 1,
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      lineHeight: 22,
      letterSpacing: -0.25,
      paddingRight: 20,
      marginBottom: 10,
    },
    titleLocked: {
      opacity: 0.92,
    },
    preview: {
      fontSize: 13,
      color: colors.textFaint,
      lineHeight: 20,
      fontWeight: '400',
    },
    lockedPreview: {
      marginTop: 2,
      paddingTop: 4,
    },
    lockedPreviewBarWide: {
      height: 12,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.surfaceUp,
      marginBottom: 8,
      opacity: 0.92,
    },
    lockedPreviewBar: {
      width: '78%',
      height: 12,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.surfaceUp,
      marginBottom: 8,
      opacity: 0.82,
    },
    lockedPreviewBarShort: {
      width: '56%',
      height: 12,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.surfaceUp,
      marginBottom: 12,
      opacity: 0.72,
    },
    lockedBody: {
      fontSize: 13,
      color: colors.textSec,
      lineHeight: 20,
    },
    timestamp: {
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: '500',
      marginTop: 16,
      textTransform: 'uppercase',
      letterSpacing: 0.7,
    },
    unlockBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    unlockDialog: {
      width: '100%',
      maxWidth: 360,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: 22,
      paddingTop: 24,
      paddingBottom: 20,
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 8},
      shadowOpacity: 0.22,
      shadowRadius: 16,
      elevation: 12,
    },
    unlockIconWrap: {
      width: 50,
      height: 50,
      borderRadius: RADIUS.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: 14,
    },
    unlockTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 8,
      letterSpacing: -0.4,
    },
    unlockBody: {
      fontSize: 14,
      lineHeight: 22,
      color: colors.textFaint,
      textAlign: 'center',
      marginBottom: 18,
    },
    unlockBtnColumn: {
      gap: 10,
    },
    unlockPrimaryBtn: {
      height: 46,
      borderRadius: RADIUS.md,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    unlockPrimaryText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.white,
    },
    unlockSecondaryBtn: {
      height: 46,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    unlockSecondaryText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    unlockCancelBtn: {
      height: 42,
      borderRadius: RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceUp,
    },
    unlockCancelText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSec,
    },
  });
