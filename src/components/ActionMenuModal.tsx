import React from 'react';
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useAppTheme} from '../theme/ThemeContext';
import {RADIUS} from '../theme/colors';

export interface ActionMenuItem {
  id: string;
  label: string;
  icon: string;
  destructive?: boolean;
  /** Optional vibration duration/pattern fired before the action handler runs. */
  hapticMs?: number | number[];
  onPress: () => void;
}

interface Props {
  visible: boolean;
  title: string;
  subtitle?: string;
  actions: ActionMenuItem[];
  onClose: () => void;
}

export const ActionMenuModal = ({
  visible,
  title,
  subtitle,
  actions,
  onClose,
}: Props) => {
  const {colors} = useAppTheme();

  const handleActionPress = (action: ActionMenuItem) => {
    onClose();
    if (action.hapticMs !== undefined) {
      const isHeavy = Array.isArray(action.hapticMs) || action.hapticMs > 20;
      ReactNativeHapticFeedback.trigger(
        isHeavy ? 'impactHeavy' : 'impactLight',
        {
          enableVibrateFallback: true,
          ignoreAndroidSystemSettings: false,
        },
      );

      if (Platform.OS === 'android') {
        Vibration.vibrate(action.hapticMs, false);
      }
    }
    // Short delay lets the modal fade begin before the side-effect fires
    setTimeout(action.onPress, 60);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}>
        <TouchableOpacity
          style={[styles.dialog, {backgroundColor: colors.surface}]}
          activeOpacity={1}>
          {/* ── Header ─────────────────────────────────────────────────── */}
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={[styles.title, {color: colors.text}]}>{title}</Text>
            {subtitle ? (
              <Text style={[styles.subtitle, {color: colors.textSec}]}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          {/* ── Actions ────────────────────────────────────────────────── */}
          <View style={styles.actionList}>
            {actions.map((action, index) => {
              const isDestructive = action.destructive;
              const textColor  = isDestructive ? colors.dangerText : colors.text;
              const iconColor  = isDestructive ? colors.dangerText : colors.textSec;
              const rowBg      = isDestructive
                ? 'rgba(220,50,50,0.06)'
                : 'transparent';

              return (
                <TouchableOpacity
                  key={action.id}
                  style={[
                    styles.actionRow,
                    index === 0 && styles.firstActionRow,
                    {borderTopColor: colors.border, backgroundColor: rowBg},
                  ]}
                  onPress={() => handleActionPress(action)}
                  activeOpacity={0.72}>
                  <View
                    style={[
                      styles.iconCircle,
                      {
                        backgroundColor: isDestructive
                          ? 'rgba(220,50,50,0.12)'
                          : colors.surfaceUp,
                      },
                    ]}>
                    <MaterialIcons name={action.icon} size={19} color={iconColor} />
                  </View>
                  <Text style={[styles.actionLabel, {color: textColor}]}>
                    {action.label}
                  </Text>
                  <MaterialIcons name="chevron-right" size={18} color={colors.border} />
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Cancel ─────────────────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.cancelBtn, {backgroundColor: colors.surfaceUp}]}
            onPress={onClose}
            activeOpacity={0.72}>
            <Text style={[styles.cancelText, {color: colors.text}]}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    padding: 12,
    paddingBottom: 36,
  },
  dialog: {
    width: '100%',
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    // Subtle sheet shadow
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -4},
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 12,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(150,150,150,0.35)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 2,
  },
  header: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150,150,150,0.2)',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  actionList: {
    width: '100%',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  firstActionRow: {
    borderTopWidth: 0,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 16,
    flex: 1,
    fontWeight: '500',
  },
  cancelBtn: {
    margin: 12,
    height: 52,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
