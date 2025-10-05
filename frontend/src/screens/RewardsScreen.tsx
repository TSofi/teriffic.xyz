import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { rewardsService, Report, UserProgress } from '../services/rewardsService';
import { useUser } from '../context/UserContext';

type RewardsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Rewards'>;

type Props = {
  navigation: RewardsScreenNavigationProp;
};

const isWeb = Platform.OS === 'web';
const MOBILE_WIDTH = 585;

// Calculate level from total reports
const calculateLevel = (totalReports: number): number => {
  let level = 1;
  let reportsNeeded = 10;
  let totalNeeded = 0;

  while (totalReports >= totalNeeded + reportsNeeded) {
    totalNeeded += reportsNeeded;
    level++;
    reportsNeeded = 10 + (level - 1) * 2;
  }

  return level;
};

// Calculate reports needed for current level
const getReportsForLevel = (level: number): number => {
  return 10 + (level - 1) * 2;
};

// Calculate total reports needed up to a level
const getTotalReportsUpToLevel = (level: number): number => {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += getReportsForLevel(i);
  }
  return total;
};

// Get reward days for level
const getRewardDays = (level: number): number => {
  if (level <= 30) return level; // 1-30 days
  return 30; // Cap at 30 days (1 month)
};

// Confetti piece component
const ConfettiPiece = () => {
  const fallAnim = useRef(new Animated.Value(-20)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const leftPosition = Math.random() * 100; // Random horizontal position
  const duration = 2000 + Math.random() * 1000; // 2-3 seconds
  const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F'];
  const color = colors[Math.floor(Math.random() * colors.length)];

  // Mobile frame height is 844px (iOS) + some extra for web
  const screenHeight = Platform.OS === 'web' && isWeb ? 1250 : 1250;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fallAnim, {
        toValue: screenHeight,
        duration: duration,
        useNativeDriver: true,
      }),
      Animated.timing(rotateAnim, {
        toValue: 360 * (2 + Math.random() * 2),
        duration: duration,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: `${leftPosition}%`,
        top: 0,
        width: 10,
        height: 10,
        backgroundColor: color,
        transform: [
          { translateY: fallAnim },
          { rotate: rotateAnim.interpolate({
            inputRange: [0, 360],
            outputRange: ['0deg', '360deg']
          })}
        ],
      }}
    />
  );
};

export default function RewardsScreen({ navigation }: Props) {
  const { userId } = useUser();
  const [provenReports, setProvenReports] = useState<Report[]>([]);
  const [userProgress, setUserProgress] = useState<UserProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [showSpark, setShowSpark] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const notificationAnim = useRef(new Animated.Value(-100)).current;
  const sparkAnim = useRef(new Animated.Value(0)).current;
  const prevLevelRef = useRef(1);
  const prevTotalReportsRef = useRef(0);

  // Extract values from userProgress or use defaults
  const currentLevel = userProgress?.current_level || 1;
  const totalReports = userProgress?.total_verified_reports || 0;
  const rewardDays = userProgress?.reward_days || 1;
  const reportsNeededForTicket = userProgress?.reports_for_current_level || 10;
  const currentTicketProgress = userProgress?.current_progress || 0;
  const ticketProgressPercentage = userProgress?.progress_percentage || 0;

  // Fetch data on mount and when userId changes
  useEffect(() => {
    loadData();
  }, [userId]);

  // Animate progress bar and detect level up
  useEffect(() => {
    if (!userProgress) return;

    // Animate progress bar
    Animated.timing(progressAnim, {
      toValue: ticketProgressPercentage,
      duration: 500,
      useNativeDriver: false,
    }).start();

    // Check for level up (ticket earned)
    if (currentLevel > prevLevelRef.current && totalReports > prevTotalReportsRef.current) {
      // Show confetti
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);

      // Show spark animation
      setShowSpark(true);
      Animated.sequence([
        Animated.timing(sparkAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(sparkAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => setShowSpark(false));

      // Show notification
      setShowNotification(true);
      Animated.timing(notificationAnim, {
        toValue: 20,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }

    prevLevelRef.current = currentLevel;
    prevTotalReportsRef.current = totalReports;
  }, [totalReports, ticketProgressPercentage, currentLevel]);

  const loadData = async () => {
    if (!userId) {
      console.log('No userId, skipping rewards data load');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const [reports, progress] = await Promise.all([
        rewardsService.getUserReports(userId, 'verified'),
        rewardsService.getUserProgress(userId),
      ]);

      setProvenReports(reports);
      setUserProgress(progress);
      prevLevelRef.current = progress.current_level;
      prevTotalReportsRef.current = progress.total_verified_reports;
    } catch (error) {
      console.error('Failed to load rewards data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddReport = async () => {
    if (!userId) {
      console.log('No userId, cannot add report');
      return;
    }

    try {
      // Create a new report
      const newReport = await rewardsService.createReport({
        user_id: userId,
        bus_number: '999',
        issue: 'Test report',
        status: 'pending',
      });

      // Auto-verify it for testing (in production, this would be done by admin)
      await rewardsService.verifyReport(newReport.id);

      // Reload data to get updated progress
      await loadData();
    } catch (error) {
      console.error('Failed to add report:', error);
    }
  };

  const handleClaimTicket = () => {
    // Hide notification
    Animated.timing(notificationAnim, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowNotification(false);
      // Navigate to tickets page
      navigation.navigate('Tickets' as any);
    });
  };

  const handleDismissNotification = () => {
    Animated.timing(notificationAnim, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setShowNotification(false));
  };

  return (
    <View style={[styles.webContainer, isWeb && styles.webCentered]}>
      <View style={[styles.container, isWeb && styles.mobileFrame]}>
        {/* Confetti */}
        {showConfetti && (
          <View style={styles.confettiContainer}>
            {[...Array(50)].map((_, i) => (
              <ConfettiPiece key={i} />
            ))}
          </View>
        )}

        {/* Claim Ticket Notification */}
        {showNotification && (
          <Animated.View
            style={[
              styles.notification,
              { transform: [{ translateY: notificationAnim }] }
            ]}
          >
            <View style={styles.notificationContent}>
              <Text style={styles.notificationTitle}>🎉 Ticket Earned!</Text>
              <Text style={styles.notificationText}>
                You've earned a {rewardDays} {rewardDays === 1 ? 'day' : rewardDays === 30 ? 'month' : 'days'} free pass!
              </Text>
              <View style={styles.notificationButtons}>
                <TouchableOpacity onPress={handleClaimTicket} style={styles.claimButton}>
                  <Text style={styles.claimButtonText}>Claim Ticket</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDismissNotification} style={styles.dismissButton}>
                  <Text style={styles.dismissButtonText}>Later</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        )}

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Rewards</Text>
          <TouchableOpacity onPress={handleAddReport} style={styles.addButton}>
            <Text style={styles.addIcon}>+</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Level Badge */}
          <View style={styles.levelSection}>
            <View style={styles.levelBadge}>
              <Text style={styles.levelLabel}>LEVEL</Text>
              <Text style={styles.levelNumber}>{currentLevel}</Text>
            </View>
            <Text style={styles.levelDescription}>
              {rewardDays} {rewardDays === 1 ? 'Day' : rewardDays === 30 ? 'Month' : 'Days'} Free Pass
            </Text>
          </View>

          {/* Ticket Progress */}
          <View style={styles.ticketSection}>
            <Text style={styles.progressLabel}>
              {currentTicketProgress} / {reportsNeededForTicket} Reports
            </Text>
            <Text style={styles.progressSubtitle}>Next Free Pass Ticket</Text>

            {/* Minimalistic Ticket */}
            <View style={styles.ticket}>
              <View style={styles.ticketHole} />
              <View style={styles.ticketContent}>
                <View style={styles.ticketTop}>
                  <Text style={styles.ticketTitle}>
                    {rewardDays} {rewardDays === 1 ? 'DAY' : rewardDays === 30 ? 'MONTH' : 'DAYS'}
                  </Text>
                  <Text style={styles.ticketSubtitle}>FREE PASS</Text>
                </View>

                {/* Progress Bar */}
                <View style={styles.progressBarContainer}>
                  <Animated.View
                    style={[
                      styles.progressBarFill,
                      {
                        width: progressAnim.interpolate({
                          inputRange: [0, 100],
                          outputRange: ['0%', '100%'],
                        })
                      }
                    ]}
                  />
                  {/* Spark effect at end of progress bar */}
                  {showSpark && (
                    <Animated.View
                      style={[
                        styles.sparkEffect,
                        {
                          left: progressAnim.interpolate({
                            inputRange: [0, 100],
                            outputRange: ['0%', '100%'],
                          }),
                          opacity: sparkAnim,
                          transform: [
                            {
                              scale: sparkAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.5, 1.5],
                              })
                            }
                          ]
                        }
                      ]}
                    />
                  )}
                </View>

                <Text style={styles.ticketProgress}>
                  {reportsNeededForTicket - currentTicketProgress} reports to go
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

            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#FFFFFF" />
              </View>
            ) : provenReports.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No reports yet</Text>
              </View>
            ) : (
              provenReports.map((report) => (
                <View key={report.id} style={styles.reportRow}>
                  <View style={styles.reportLeft}>
                    <Text style={styles.reportDate}>
                      {new Date(report.reported_time).toISOString().split('T')[0]}
                    </Text>
                    <Text style={styles.reportBus}>#{report.bus_number}</Text>
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
              ))
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  confettiContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    pointerEvents: 'none',
  },
  notification: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    zIndex: 10000,
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  notificationContent: {
    alignItems: 'center',
  },
  notificationTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 8,
    fontFamily: 'Inter, sans-serif',
  },
  notificationText: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 15,
    fontFamily: 'Inter, sans-serif',
  },
  notificationButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  claimButton: {
    backgroundColor: '#000000',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
  },
  claimButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Inter, sans-serif',
  },
  dismissButton: {
    backgroundColor: '#E0E0E0',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
  },
  dismissButtonText: {
    color: '#666666',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Inter, sans-serif',
  },
  sparkEffect: {
    position: 'absolute',
    top: '50%',
    width: 20,
    height: 20,
    marginTop: -10,
    marginLeft: -10,
    backgroundColor: '#FFD700',
    borderRadius: 10,
    zIndex: 10,
  },
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
  addButton: {
    width: 40,
    height: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addIcon: {
    fontSize: 28,
    color: '#000000',
    fontWeight: '300',
    fontFamily: 'Inter, sans-serif',
  },
  scrollView: {
    flex: 1,
  },
  levelSection: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 15,
  },
  levelBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 50,
    width: 100,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    elevation: 5,
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  levelLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#666666',
    letterSpacing: 1,
    fontFamily: 'Inter, sans-serif',
  },
  levelNumber: {
    fontSize: 36,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Inter, sans-serif',
  },
  levelDescription: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    fontFamily: 'Inter, sans-serif',
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
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#888888',
    fontFamily: 'Inter, sans-serif',
  },
});
