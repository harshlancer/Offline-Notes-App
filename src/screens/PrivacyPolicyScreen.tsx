import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useAppTheme } from '../theme/ThemeContext';
import { useNavigation } from '@react-navigation/native';

const PrivacyPolicyScreen = () => {
  const { colors, statusBarStyle } = useAppTheme();
  const navigation = useNavigation();

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
        <Text style={[styles.title, { color: colors.text }]}>Privacy Policy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.date, { color: colors.textFaint }]}>Last Updated: April 11, 2026</Text>
        
        <Text style={[styles.paragraph, { color: colors.textSec }]}>
          At <Text style={{ fontWeight: '700', color: colors.text }}>Goodnote</Text>, accessible from our mobile application, one of our main priorities is the privacy of our visitors. This Privacy Policy document contains types of information that is collected and recorded by Goodnote and how we use it.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>1. Information We Collect</Text>
        <Text style={[styles.paragraph, { color: colors.textSec }]}>
          Goodnote is designed as an offline-first application. Most of your notes and data are stored locally on your device. If you choose to enable cloud sync, we collection your email address and authentication data via Firebase.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>2. How We Use Your Information</Text>
        <Text style={[styles.paragraph, { color: colors.textSec }]}>
          We use the information we collect to:
          {"\n"}• Provide, operate, and maintain our application.
          {"\n"}• Improve and personalize the app experience.
          {"\n"}• Sync your notes across your devices (if enabled).
          {"\n"}• Protect the security and integrity of our service.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>3. Data Storage</Text>
        <Text style={[styles.paragraph, { color: colors.textSec }]}>
          Your notes are stored on your device using a secure local database. If sync is enabled, data is encrypted and stored on Firebase servers. We do not sell or share your personal data with third parties.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>4. Third-Party Services</Text>
        <Text style={[styles.paragraph, { color: colors.textSec }]}>
          We use the following third-party services:
          {"\n"}• Firebase (Authentication and Cloud Storage)
          {"\n"}• Google Play Services
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>5. Your Rights</Text>
        <Text style={[styles.paragraph, { color: colors.textSec }]}>
          You have the right to access, update, or delete your data at any time. Since most data is local, you can delete it by clearing the app data or uninstalling the app.
        </Text>

        <View style={styles.footer}>
          <Text style={[styles.contactText, { color: colors.textMuted }]}>
            If you have any questions about this Privacy Policy, please contact us at support@goodnote.com.
          </Text>
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
    paddingHorizontal: 22,
    paddingBottom: 60,
  },
  date: {
    fontSize: 13,
    marginBottom: 20,
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 24,
    marginBottom: 10,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  footer: {
    marginTop: 40,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  contactText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default PrivacyPolicyScreen;
