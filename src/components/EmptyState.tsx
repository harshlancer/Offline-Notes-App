import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, Text, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {RADIUS} from '../theme/colors';
import {useAppTheme} from '../theme/ThemeContext';
import type {AppColors} from '../theme/colors';

interface Props {
  hasSearch?: boolean;
}

export const EmptyState = ({hasSearch = false}: Props) => {
  const {colors} = useAppTheme();
  const styles = createStyles(colors);
  const opacity = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, slide]);

  return (
    <Animated.View
      style={[styles.container, {opacity, transform: [{translateY: slide}]}]}>
      <View style={styles.iconWrap}>
        <MaterialIcons
          name={hasSearch ? 'search' : 'edit'}
          size={26}
          color={colors.accentText}
        />
      </View>
      <Text style={styles.title}>{hasSearch ? 'No results' : 'No notes yet'}</Text>
      <Text style={styles.body}>
        {hasSearch
          ? 'Nothing matches your search. Try different keywords.'
          : 'Tap the add button to create your first note.'}
      </Text>
    </Animated.View>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: 96,
      paddingHorizontal: 28,
    },
    iconWrap: {
      width: 72,
      height: 72,
      borderRadius: RADIUS.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 10,
      textAlign: 'center',
      letterSpacing: -0.3,
    },
    body: {
      fontSize: 14,
      color: colors.textFaint,
      lineHeight: 24,
      textAlign: 'center',
      maxWidth: 240,
    },
  });
