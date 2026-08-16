import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DarkTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthScreen } from '../../features/auth/AuthScreen';
import { DiagnosticsScreen } from '../../features/diagnostics/DiagnosticsScreen';
import { FeedScreen } from '../../features/feed/FeedScreen';
import { LegalScreen } from '../../features/legal/LegalScreen';
import { LibraryScreen } from '../../features/library/LibraryScreen';
import { SearchScreen } from '../../features/search/SearchScreen';
import { SettingsScreen } from '../../features/settings/SettingsScreen';
import { Icon, type IconName } from '../../ui/components/Icon';
import { TAB_BAR_BASE_HEIGHT } from '../../ui/layout';
import { colors, spacing, typography } from '../../ui/theme';
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

const TabsNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        /**
         * Высота и нижний отступ считаются от системного inset, а не задаются
         * числом. С `edgeToEdgeEnabled=true` приложение рисуется под системной
         * навигацией, и прежняя жёсткая `height: 62` отменяла отступ, который
         * react-navigation берёт из safe-area: на устройствах с тремя
         * клавишами подписи вкладок оказывались прямо под ними.
         */
        tabBarStyle: [
          styles.tabBar,
          { height: TAB_BAR_BASE_HEIGHT + insets.bottom, paddingBottom: insets.bottom + spacing.xs },
        ],
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color }) => <TabIcon name={route.name} color={color} />,
      })}>
      <Tab.Screen name="Feed" component={FeedScreen} options={{ title: 'Лента' }} />
      <Tab.Screen name="Search" component={SearchScreen} options={{ title: 'Поиск' }} />
      <Tab.Screen name="Library" component={LibraryScreen} options={{ title: 'Библиотека' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Настройки' }} />
    </Tab.Navigator>
  );
};

export const RootNavigator: React.FC = () => (
  <NavigationContainer theme={navigationTheme}>
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surfaceSunken },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: styles.headerTitle,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
        animation: Platform.OS === 'android' ? 'slide_from_right' : 'default',
      }}>
      <Stack.Screen name="Tabs" component={TabsNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="Auth" component={AuthScreen} options={{ title: 'Вход' }} />
      <Stack.Screen
        name="Diagnostics"
        component={DiagnosticsScreen}
        options={{ title: 'Проверка платформ' }}
      />
      <Stack.Screen
        name="Legal"
        component={LegalScreen}
        options={{ title: 'Правовая информация' }}
      />
    </Stack.Navigator>
  </NavigationContainer>
);

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surfaceSunken,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
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
