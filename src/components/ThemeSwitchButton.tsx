import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useAppTheme} from '../theme/ThemeContext';
import {AppColors, RADIUS} from '../theme/colors';

type Props = {
  compact?: boolean;
};

export const ThemeSwitchButton = ({compact = false}: Props) => {
  const {colors, mode, toggleTheme} = useAppTheme();
  const styles = createStyles(colors);
  const nextMode = mode === 'dark' ? 'Light' : 'Dark';
  const iconName = mode === 'dark' ? 'light-mode' : 'dark-mode';

  return (
    <TouchableOpacity
      style={[styles.button, compact && styles.buttonCompact]}
      onPress={toggleTheme}
      activeOpacity={0.75}
      accessibilityLabel={`Switch to ${nextMode.toLowerCase()} mode`}>
      <View style={styles.iconWrap}>
        <MaterialIcons name={iconName} size={18} color={colors.accentText} />
      </View>
      {!compact ? <Text style={styles.label}>{nextMode}</Text> : null}
    </TouchableOpacity>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    button: {
      height: 40,
      paddingHorizontal: 12,
      borderRadius: RADIUS.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
    },
    buttonCompact: {
      width: 38,
      height: 38,
      borderRadius: 19,
      justifyContent: 'center',
      paddingHorizontal: 0,
    },
    iconWrap: {
      width: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      marginLeft: 8,
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
  });
