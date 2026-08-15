/**
 * Нативные модули недоступны в node-окружении Jest — подменяем их заглушками.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
