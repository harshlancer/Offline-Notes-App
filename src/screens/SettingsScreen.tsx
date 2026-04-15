import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Linking,
  Alert,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useAppTheme } from '../theme/ThemeContext';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStack } from '../../App';
import { useNavigation } from '@react-navigation/native';

type SettingsScreenNavigationProp = NativeStackNavigationProp<RootStack, 'Settings'>;

const SettingsScreen = () => {
  const { colors, isLight, statusBarStyle } = useAppTheme();
  const navigation = useNavigation<SettingsScreenNavigationProp>();

  const handleContactUs = () => {
    const email = 'harsh@example.com'; // Replace with real email
    const subject = 'Goodnote App Feedback';
    const body = 'Hello, I would like to share some feedback about your app...';
    
    Linking.openURL(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)
      .catch(() => {
        Alert.alert('Error', 'Could not open mail app. Please email us at ' + email);
      });
  };

  const handlePrivacyPolicy = () => {
    const url = 'https://www.termsfeed.com/live/32441474-99af-4cfb-8079-5acccab96c8e';
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open privacy policy link.');
    });
  };

  const SettingItem = ({ icon, label, onPress, sublabel }: any) => (
    <TouchableOpacity 
      style={[styles.item, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.itemLeft}>
        <View style={[styles.iconWrap, { backgroundColor: colors.surfaceUp }]}>
          <MaterialIcons name={icon} size={20} color={colors.accent} />
        </View>
        <View>
          <Text style={[styles.itemLabel, { color: colors.text }]}>{label}</Text>
          {sublabel && <Text style={[styles.itemSublabel, { color: colors.textFaint }]}>{sublabel}</Text>}
        </View>
      </View>
      <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle={statusBarStyle} />
      
      <View style={styles.header}>
        <TouchableOpacity 
          style={[styles.backBtn, { backgroundColor: colors.surfaceUp, borderColor: colors.border }]}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSec }]}>Support</Text>
          <SettingItem 
            icon="mail-outline" 
            label="Contact Us" 
            sublabel="Feedback, bugs, or feature requests"
            onPress={handleContactUs} 
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSec }]}>Legal</Text>
          <SettingItem 
            icon="security" 
            label="Privacy Policy" 
            onPress={handlePrivacyPolicy} 
          />
          <SettingItem 
            icon="description" 
            label="Terms of Service" 
            onPress={() => Alert.alert('Information', 'Terms of Service coming soon.')} 
          />
        </View>

        <View style={styles.footer}>
          <Text style={[styles.version, { color: colors.textMuted }]}>Goodnote Version 1.0.0</Text>
          <Text style={[styles.copyright, { color: colors.textFaint }]}>© 2026 Goodnote Team</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginLeft: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  itemLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  itemSublabel: {
    fontSize: 12,
    marginTop: 2,
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
  },
  version: {
    fontSize: 13,
    fontWeight: '600',
  },
  copyright: {
    fontSize: 11,
    marginTop: 4,
  },
});

export default SettingsScreen;
