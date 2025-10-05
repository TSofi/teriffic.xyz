import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/LoginScreen';
import MainScreen from '../screens/MainScreen';
import RewardsScreen from '../screens/RewardsScreen';
import TicketsScreen from '../screens/TicketsScreen';
import { useUser } from '../context/UserContext';

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Rewards: undefined;
  Tickets: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { userId } = useUser();

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={userId ? "Main" : "Login"}
        screenOptions={{
          headerShown: false,
          animation: 'fade',
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Main" component={MainScreen} />
        <Stack.Screen name="Rewards" component={RewardsScreen} />
        <Stack.Screen name="Tickets" component={TicketsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
