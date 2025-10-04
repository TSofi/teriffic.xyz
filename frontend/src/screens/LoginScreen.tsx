import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  Image,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type LoginScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Login'>;

type Props = {
  navigation: LoginScreenNavigationProp;
};

const { width } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';
const MOBILE_WIDTH = 585; // iPhone 13 width * 1.5
const MOBILE_HEIGHT = 844; // iPhone 13 height

export default function LoginScreen({ navigation }: Props) {
  const handleGuestLogin = () => {
    navigation.navigate('Main');
  };

  return (
    <View style={[styles.webContainer, isWeb && styles.webCentered]}>
      <View style={[styles.container, isWeb && styles.mobileFrame]}>
        {/* Top section with logo/title */}
        <View style={styles.topSection}>
        <View style={styles.iconContainer}>
          <Image
            source={require('../../icon.png')}
            style={styles.iconImage}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.title}>Teriffic</Text>
        <Text style={styles.subtitle}>Traffic</Text>
      </View>

      {/* Bottom section with login button */}
      <View style={styles.bottomSection}>
        <TouchableOpacity
          style={styles.loginButton}
          onPress={handleGuestLogin}
          activeOpacity={0.8}
        >
          <Text style={styles.loginButtonText}>Login as Guest</Text>
          <View style={styles.arrow}>
            <Text style={styles.arrowText}>›</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.footerText}>
          Tap to continue without registration
        </Text>
      </View>
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
    height: MOBILE_HEIGHT,
    maxWidth: '100%',
    maxHeight: '100%',
    borderRadius: isWeb ? 40 : 0,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 60px rgba(255, 255, 255, 0.15)',
      },
    }),
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'space-between',
  },
  topSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
  },
  iconContainer: {
    marginBottom: 40,
  },
  iconImage: {
    width: 200,
    height: 200,
  },
  title: {
    fontSize: 48,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 2,
    marginBottom: 8,
    fontFamily: 'Inter, sans-serif',
  },
  subtitle: {
    fontSize: 24,
    fontWeight: '300',
    color: '#FFFFFF',
    letterSpacing: 8,
    textTransform: 'uppercase',
    fontFamily: 'Inter, sans-serif',
  },
  bottomSection: {
    paddingHorizontal: 30,
    paddingBottom: Platform.OS === 'ios' ? 60 : 40,
    alignItems: 'center',
  },
  loginButton: {
    width: isWeb ? MOBILE_WIDTH - 60 : width - 60,
    height: 70,
    backgroundColor: '#FFFFFF',
    borderRadius: 35,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 30,
    marginBottom: 20,
    elevation: 5,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  loginButtonText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000000',
    letterSpacing: 1,
    fontFamily: 'Inter, sans-serif',
  },
  arrow: {
    width: 40,
    height: 40,
    backgroundColor: '#000000',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: 'bold',
    marginLeft: 2,
  },
  footerText: {
    fontSize: 13,
    color: '#888888',
    letterSpacing: 0.5,
    textAlign: 'center',
    fontFamily: 'Inter, sans-serif',
  },
});
