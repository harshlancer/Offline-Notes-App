/**
 * LayoutPickerModal
 *
 * Shown on first launch (when no homescreen preference is stored) and whenever
 * the user long-presses the layout toggle button.
 *
 * Two choices:
 *   • Bubble Canvas  — organic, game-like, draggable bubbles (developer pick)
 *   • Classic List   — clean, sorted, minimalist card grid
 *
 * The choice is persisted to AsyncStorage under the key "homescreen-view-mode".
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useAppTheme} from '../theme/ThemeContext';
import {RADIUS} from '../theme/colors';

type ViewMode = 'bubble' | 'list';

interface Props {
  visible: boolean;
  currentMode: ViewMode;
  onSelect: (mode: ViewMode) => void;
  onClose: () => void;
}

export const LayoutPickerModal = ({
  visible,
  currentMode,
  onSelect,
  onClose,
}: Props) => {
  const {colors, mode} = useAppTheme();
  const isLight = mode === 'light';

  const [selected, setSelected] = useState<ViewMode>(currentMode);

  // Reset selection when modal opens
  useEffect(() => {
    if (visible) {setSelected(currentMode);}
  }, [visible, currentMode]);

  // Slide-up entrance
  const slideAnim = useRef(new Animated.Value(400)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0, useNativeDriver: true,
          tension: 100, friction: 16,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1, duration: 220, useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 400, duration: 220, useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0, duration: 180, useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, fadeAnim]);

  const handleConfirm = useCallback(() => {
    onSelect(selected);
    onClose();
  }, [onClose, onSelect, selected]);

  const cardBg     = isLight ? '#FFFFFF' : colors.surface;
  const mutedText  = isLight ? '#8A8490' : colors.textMuted;
  const titleColor = isLight ? '#1E1A28' : colors.text;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, {opacity: fadeAnim}]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: isLight ? '#F8F7F5' : colors.surfaceElevated,
              transform: [{translateY: slideAnim}],
            },
          ]}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Title area */}
          <View style={styles.header}>
            <View
              style={[
                styles.headerIconWrap,
                {backgroundColor: isLight ? '#ECEAF5' : colors.surfaceUp},
              ]}>
              <MaterialIcons name="dashboard-customize" size={20} color={colors.accent} />
            </View>
            <Text style={[styles.heading, {color: titleColor}]}>Home Layout</Text>
            <Text style={[styles.subheading, {color: mutedText}]}>
              Choose how your notes appear on the home screen
            </Text>
          </View>

          {/* Choice cards */}
          <View style={styles.cardsRow}>
            {/* Bubble Canvas */}
            <TouchableOpacity
              style={[
                styles.card,
                {backgroundColor: cardBg, borderColor: colors.border},
                selected === 'bubble' && {
                  borderColor: colors.accent,
                  borderWidth: 2,
                },
              ]}
              onPress={() => setSelected('bubble')}
              activeOpacity={0.88}>
              {/* Mini bubble preview */}
              <View style={styles.previewArea}>
                <View style={[styles.bubbleXL, {backgroundColor: '#BFCFE7'}]} />
                <View style={[styles.bubbleMD, {backgroundColor: '#C8E6C9', left: 62, top: 12}]} />
                <View style={[styles.bubbleSM, {backgroundColor: '#F8C8D4', left: 16, top: 66}]} />
                <View style={[styles.bubbleSM, {backgroundColor: '#FFE0B2', left: 80, top: 60}]} />
              </View>

              {selected === 'bubble' && (
                <View style={[styles.checkBadge, {backgroundColor: colors.accent}]}>
                  <MaterialIcons name="check" size={12} color="#fff" />
                </View>
              )}

              <Text style={[styles.cardTitle, {color: titleColor}]}>Bubble Canvas</Text>
              <Text style={[styles.cardDesc, {color: mutedText}]}>
                Organic, draggable bubbles. Fun and game-like.
              </Text>

              <View
                style={[
                  styles.devBadge,
                  {backgroundColor: isLight ? '#EAF0FA' : colors.surfaceUp},
                ]}>
                <MaterialIcons name="star" size={11} color={colors.accent} />
                <Text style={[styles.devBadgeText, {color: colors.accent}]}>
                  Developer's pick
                </Text>
              </View>
            </TouchableOpacity>

            {/* Classic List */}
            <TouchableOpacity
              style={[
                styles.card,
                {backgroundColor: cardBg, borderColor: colors.border},
                selected === 'list' && {
                  borderColor: colors.accent,
                  borderWidth: 2,
                },
              ]}
              onPress={() => setSelected('list')}
              activeOpacity={0.88}>
              {/* Mini list preview */}
              <View style={styles.previewArea}>
                {[0, 1, 2, 3].map(i => (
                  <View
                    key={i}
                    style={[
                      styles.listRow,
                      {
                        backgroundColor: isLight ? '#ECEAF5' : colors.surfaceUp,
                        top: 10 + i * 22,
                        width: i % 2 === 0 ? '90%' : '70%',
                      },
                    ]}
                  />
                ))}
              </View>

              {selected === 'list' && (
                <View style={[styles.checkBadge, {backgroundColor: colors.accent}]}>
                  <MaterialIcons name="check" size={12} color="#fff" />
                </View>
              )}

              <Text style={[styles.cardTitle, {color: titleColor}]}>Classic List</Text>
              <Text style={[styles.cardDesc, {color: mutedText}]}>
                Minimal cards sorted by last edit. Clean and focused.
              </Text>
            </TouchableOpacity>
          </View>

          {/* Confirm button */}
          <TouchableOpacity
            style={[styles.confirmBtn, {backgroundColor: colors.accent}]}
            onPress={handleConfirm}
            activeOpacity={0.85}>
            <Text style={styles.confirmText}>Set Layout</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dismissBtn}
            onPress={onClose}
            activeOpacity={0.65}>
            <Text style={[styles.dismissText, {color: mutedText}]}>Cancel</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -6},
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 20,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(150,150,150,0.35)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  header: {
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 18,
  },
  headerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  heading: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 5,
  },
  subheading: {
    fontSize: 13.5,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  card: {
    flex: 1,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    padding: 12,
    paddingBottom: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  previewArea: {
    height: 96,
    marginBottom: 10,
    overflow: 'hidden',
  },
  /* Bubble preview nodes */
  bubbleXL: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    top: 4,
    left: 8,
  },
  bubbleMD: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  bubbleSM: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  /* List preview rows */
  listRow: {
    position: 'absolute',
    height: 14,
    borderRadius: 6,
    left: 0,
  },
  checkBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  cardDesc: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8,
  },
  devBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  devBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  confirmBtn: {
    height: 52,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  dismissBtn: {
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
