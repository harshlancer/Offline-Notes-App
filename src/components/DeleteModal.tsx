import React, {useEffect, useRef} from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {RADIUS} from '../theme/colors';
import {useAppTheme} from '../theme/ThemeContext';
import type {AppColors} from '../theme/colors';

const {width} = Dimensions.get('window');

interface Props {
  visible: boolean;
  noteTitle?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DeleteModal = ({visible, noteTitle, onCancel, onConfirm}: Props) => {
  const {colors} = useAppTheme();
  const styles = createStyles(colors);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          tension: 120,
          friction: 14,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      opacity.setValue(0);
      scale.setValue(0.96);
    }
  }, [visible, opacity, scale]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onCancel}>
      <Animated.View style={[styles.backdrop, {opacity}]}> 
        <Animated.View style={[styles.dialog, {transform: [{scale}]}]}>
          <Text style={styles.title}>Delete note?</Text>
          <Text style={styles.body}>
            {noteTitle
              ? `"${noteTitle}" will be permanently deleted.`
              : 'This note will be permanently deleted.'}{' '}
            This cannot be undone.
          </Text>
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
              activeOpacity={0.65}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={onConfirm}
              activeOpacity={0.7}>
              <Text style={styles.deleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dialog: {
      width: width * 0.84,
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.lg,
      paddingHorizontal: 22,
      paddingTop: 24,
      paddingBottom: 20,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 8},
      shadowOpacity: 0.22,
      shadowRadius: 16,
      elevation: 12,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 10,
      letterSpacing: -0.3,
    },
    body: {
      fontSize: 14,
      color: colors.textFaint,
      lineHeight: 22,
      marginBottom: 24,
    },
    btnRow: {
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'flex-end',
    },
    cancelBtn: {
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    cancelText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    deleteBtn: {
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: RADIUS.md,
      backgroundColor: colors.danger,
    },
    deleteText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.white,
    },
  });
