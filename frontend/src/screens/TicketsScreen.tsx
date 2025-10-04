import React, { useState } from 'react';
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

type TicketsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Tickets'>;

type Props = {
  navigation: TicketsScreenNavigationProp;
};

const isWeb = Platform.OS === 'web';
const MOBILE_WIDTH = 585;

interface Ticket {
  id: number;
  days: number;
  earnedDate: string;
  activatedDate?: string;
  expiryDate?: string;
  isActive: boolean;
}

// Mock tickets data
const initialTickets: Ticket[] = [
  { id: 1, days: 7, earnedDate: '2025-10-01', isActive: false },
  { id: 2, days: 5, earnedDate: '2025-09-25', isActive: false },
  { id: 3, days: 3, earnedDate: '2025-09-20', activatedDate: '2025-09-22', expiryDate: '2025-09-25', isActive: false },
];

export default function TicketsScreen({ navigation }: Props) {
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets);

  const handleActivateTicket = (ticketId: number) => {
    setTickets(prevTickets =>
      prevTickets.map(ticket => {
        if (ticket.id === ticketId && !ticket.isActive && !ticket.activatedDate) {
          const today = new Date();
          const activatedDate = today.toISOString().split('T')[0];
          const expiryDate = new Date(today.getTime() + ticket.days * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];

          return {
            ...ticket,
            isActive: true,
            activatedDate,
            expiryDate,
          };
        }
        return ticket;
      })
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  return (
    <View style={[styles.webContainer, isWeb && styles.webCentered]}>
      <View style={[styles.container, isWeb && styles.mobileFrame]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Tickets</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.ticketsContainer}>
            {tickets.map((ticket) => (
              <View key={ticket.id} style={styles.ticketCard}>
                {/* Ticket Header */}
                <View style={styles.ticketHeader}>
                  <Text style={styles.ticketTitle}>
                    {ticket.days} {ticket.days === 1 ? 'DAY' : ticket.days === 30 ? 'MONTH' : 'DAYS'} FREE PASS
                  </Text>
                  {ticket.isActive && (
                    <View style={styles.activeBadge}>
                      <Text style={styles.activeBadgeText}>ACTIVE</Text>
                    </View>
                  )}
                </View>

                {/* Ticket Body */}
                <View style={styles.ticketBody}>
                  <Text style={styles.ticketLabel}>Earned on:</Text>
                  <Text style={styles.ticketDate}>{formatDate(ticket.earnedDate)}</Text>

                  {ticket.activatedDate && (
                    <>
                      <View style={styles.dividerSmall} />
                      <Text style={styles.ticketLabel}>Valid period:</Text>
                      <Text style={styles.ticketDateRange}>
                        {formatDate(ticket.activatedDate)} - {formatDate(ticket.expiryDate!)}
                      </Text>
                    </>
                  )}
                </View>

                {/* Activate Button */}
                {!ticket.activatedDate && (
                  <TouchableOpacity
                    style={styles.activateButton}
                    onPress={() => handleActivateTicket(ticket.id)}
                  >
                    <Text style={styles.activateButtonText}>Activate Now</Text>
                  </TouchableOpacity>
                )}

                {ticket.activatedDate && !ticket.isActive && (
                  <View style={styles.expiredBadge}>
                    <Text style={styles.expiredText}>EXPIRED</Text>
                  </View>
                )}
              </View>
            ))}

            {tickets.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No tickets yet</Text>
                <Text style={styles.emptyStateSubtext}>
                  Earn tickets by submitting verified reports
                </Text>
              </View>
            )}
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
  ticketsContainer: {
    padding: 20,
  },
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
    elevation: 5,
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  ticketTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: 1.5,
    fontFamily: 'Inter, sans-serif',
  },
  activeBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
    fontFamily: 'Inter, sans-serif',
  },
  ticketBody: {
    marginBottom: 15,
  },
  ticketLabel: {
    fontSize: 12,
    color: '#888888',
    marginBottom: 4,
    fontFamily: 'Inter, sans-serif',
  },
  ticketDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Inter, sans-serif',
  },
  ticketDateRange: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Inter, sans-serif',
  },
  dividerSmall: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 12,
  },
  activateButton: {
    backgroundColor: '#000000',
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
  },
  activateButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: 'Inter, sans-serif',
  },
  expiredBadge: {
    backgroundColor: '#E0E0E0',
    paddingVertical: 10,
    borderRadius: 25,
    alignItems: 'center',
  },
  expiredText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888888',
    letterSpacing: 1,
    fontFamily: 'Inter, sans-serif',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    fontFamily: 'Inter, sans-serif',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
    fontFamily: 'Inter, sans-serif',
  },
});
