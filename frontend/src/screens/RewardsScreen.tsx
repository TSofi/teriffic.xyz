import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type RewardsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Rewards'>;

type Props = {
  navigation: RewardsScreenNavigationProp;
};

const isWeb = Platform.OS === 'web';
const MOBILE_WIDTH = 585;

// Mock data
const provenReports = [
  { id: 1, date: '2025-01-10', bus: '#999', issue: 'Traffic jam on Main St', status: 'Verified' },
  { id: 2, date: '2025-01-09', bus: '#704', issue: 'Road closure', status: 'Verified' },
  { id: 3, date: '2025-01-08', bus: '#111', issue: 'Accident reported', status: 'Verified' },
  { id: 4, date: '2025-01-07', bus: '#999', issue: 'Bus delay', status: 'Verified' },
  { id: 5, date: '2025-01-06', bus: '#704', issue: 'Construction zone', status: 'Verified' },
  { id: 6, date: '2025-01-05', bus: '#111', issue: 'Heavy traffic', status: 'Verified' },
  { id: 7, date: '2025-01-04', bus: '#999', issue: 'Weather delay', status: 'Verified' },
];

const REPORTS_FOR_REWARD = 10;

export default function RewardsScreen({ navigation }: Props) {
  const currentProgress = provenReports.length;
  const progressPercentage = (currentProgress / REPORTS_FOR_REWARD) * 100;

  return (
    <View style={[styles.webContainer, isWeb && styles.webCentered]}>
      <View style={[styles.container, isWeb && styles.mobileFrame]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Rewards</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Ticket Progress */}
          <View style={styles.ticketSection}>
            <Text style={styles.progressLabel}>
              {currentProgress} / {REPORTS_FOR_REWARD} Reports
            </Text>
            <Text style={styles.progressSubtitle}>Complete for 1 Day Free Ticket</Text>

            {/* Minimalistic Ticket */}
            <View style={styles.ticket}>
              <View style={styles.ticketHole} />
              <View style={styles.ticketContent}>
                <View style={styles.ticketTop}>
                  <Text style={styles.ticketTitle}>1 DAY</Text>
                  <Text style={styles.ticketSubtitle}>FREE PASS</Text>
                </View>

                {/* Progress Bar */}
                <View style={styles.progressBarContainer}>
                  <View style={[styles.progressBarFill, { width: `${progressPercentage}%` }]} />
                </View>

                <Text style={styles.ticketProgress}>
                  {REPORTS_FOR_REWARD - currentProgress} reports to go
                </Text>
              </View>
              <View style={[styles.ticketHole, styles.ticketHoleRight]} />
            </View>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Reports Table */}
          <View style={styles.reportsSection}>
            <Text style={styles.reportsTitle}>PROVEN REPORTS</Text>

            {provenReports.map((report) => (
              <View key={report.id} style={styles.reportRow}>
                <View style={styles.reportLeft}>
                  <Text style={styles.reportDate}>{report.date}</Text>
                  <Text style={styles.reportBus}>{report.bus}</Text>
                </View>
                <View style={styles.reportMiddle}>
                  <Text style={styles.reportIssue}>{report.issue}</Text>
                </View>
                <View style={styles.reportRight}>
                  <View style={styles.verifiedBadge}>
                    <Text style={styles.verifiedText}>✓</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  webContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  webCentered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  mobileFrame: {
    width: MOBILE_WIDTH,
    height: 844,
    maxWidth: '100%',
    maxHeight: '100%',
    borderRadius: isWeb ? 40 : 0,
    overflow: 'hidden',
    boxShadow: isWeb ? '0 20px 60px rgba(255, 255, 255, 0.15)' : undefined,
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#000000',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    fontSize: 32,
    color: '#FFFFFF',
    fontWeight: '300',
    fontFamily: 'Inter, sans-serif',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
    fontFamily: 'Inter, sans-serif',
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  ticketSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
  },
  progressLabel: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 5,
    fontFamily: 'Inter, sans-serif',
  },
  progressSubtitle: {
    fontSize: 13,
    color: '#888888',
    textAlign: 'center',
    marginBottom: 25,
    letterSpacing: 0.5,
    fontFamily: 'Inter, sans-serif',
  },
  ticket: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 25,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    elevation: 5,
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  ticketHole: {
    width: 20,
    height: 20,
    backgroundColor: '#000000',
    borderRadius: 10,
    position: 'absolute',
    left: -10,
    top: '50%',
    marginTop: -10,
  },
  ticketHoleRight: {
    left: 'auto',
    right: -10,
  },
  ticketContent: {
    flex: 1,
  },
  ticketTop: {
    marginBottom: 15,
  },
  ticketTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: 2,
    fontFamily: 'Inter, sans-serif',
  },
  ticketSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
    letterSpacing: 3,
    fontFamily: 'Inter, sans-serif',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#000000',
    borderRadius: 4,
  },
  ticketProgress: {
    fontSize: 12,
    color: '#666666',
    fontWeight: '500',
    fontFamily: 'Inter, sans-serif',
  },
  divider: {
    height: 1,
    backgroundColor: '#333333',
    marginHorizontal: 20,
    marginBottom: 20,
  },
  reportsSection: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  reportsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
    marginBottom: 15,
    fontFamily: 'Inter, sans-serif',
  },
  reportRow: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    alignItems: 'center',
  },
  reportLeft: {
    width: 80,
  },
  reportDate: {
    fontSize: 11,
    color: '#888888',
    marginBottom: 3,
    fontFamily: 'Inter, sans-serif',
  },
  reportBus: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Inter, sans-serif',
  },
  reportMiddle: {
    flex: 1,
    paddingHorizontal: 10,
  },
  reportIssue: {
    fontSize: 13,
    color: '#CCCCCC',
    fontFamily: 'Inter, sans-serif',
  },
  reportRight: {
    width: 30,
  },
  verifiedBadge: {
    width: 24,
    height: 24,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifiedText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontFamily: 'Inter, sans-serif',
  },
});
