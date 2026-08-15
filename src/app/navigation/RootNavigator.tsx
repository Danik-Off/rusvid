import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DarkTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { Platform, StyleSheet } from 'react-native';

import { AuthScreen } from '../../features/auth/AuthScreen';
import { DiagnosticsScreen } from '../../features/diagnostics/DiagnosticsScreen';
import { FeedScreen } from '../../features/feed/FeedScreen';
import { LibraryScreen } from '../../features/library/LibraryScreen';
import { PlayerScreen } from '../../features/player/PlayerScreen';
import { SearchScreen } from '../../features/search/SearchScreen';
import { SettingsScreen } from '../../features/settings/SettingsScreen';
import { Icon, type IconName } from '../../ui/components/Icon';
import { colors, typography } from '../../ui/theme';
import type { RootStackParamList, TabParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TAB_ICONS: Record<keyof TabParamList, IconName> = {
  Feed: 'play',
  Search: 'search',
  Library: 'library',
  Settings: 'settings',
};

const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.surfaceSunken,
    text: colors.textPrimary,
    border: colors.border,
  },
};

const TabIcon: React.FC<{ readonly name: keyof TabParamList; readonly color: string }> = ({
  name,
  color,
}) => <Icon name={TAB_ICONS[name]} size={22} color={color} />;

const TabsNavigator: React.FC = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: colors.accent,
      tabBarInactiveTintColor: colors.textMuted,
      tabBarStyle: styles.tabBar,
      tabBarLabelStyle: styles.tabLabel,
      tabBarIcon: ({ color }) => <TabIcon name={route.name} color={color} />,
    })}>
    <Tab.Screen name="Feed" component={FeedScreen} options={{ title: 'Лента' }} />
    <Tab.Screen name="Search" component={SearchScreen} options={{ title: 'Поиск' }} />
    <Tab.Screen name="Library" component={LibraryScreen} options={{ title: 'Библиотека' }} />
    <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Настройки' }} />
  </Tab.Navigator>
);

export const RootNavigator: React.FC = () => (
  <NavigationContainer theme={navigationTheme}>
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surfaceSunken },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: styles.headerTitle,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
        // Нативная анимация «снизу вверх» ощущается как открытие плеера.
        animation: Platform.OS === 'android' ? 'slide_from_right' : 'default',
      }}>
      <Stack.Screen name="Tabs" component={TabsNavigator} options={{ headerShown: false }} />
      <Stack.Screen
        name="Player"
        component={PlayerScreen}
        options={({ route }) => ({ title: route.params.video.title })}
      />
      <Stack.Screen name="Auth" component={AuthScreen} options={{ title: 'Вход' }} />
      <Stack.Screen
        name="Diagnostics"
        component={DiagnosticsScreen}
        options={{ title: 'Проверка платформ' }}
      />
    </Stack.Navigator>
  </NavigationContainer>
);

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surfaceSunken,
    borderTopColor: colors.border,
    height: 62,
    paddingBottom: 8,
    paddingTop: 6,
  },
  tabLabel: {
    ...typography.caption,
    fontSize: 11,
  },
  headerTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
});
