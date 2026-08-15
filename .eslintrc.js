module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // `void promise()` — осознанная пометка «промис намеренно не ждём».
    // Это читается лучше, чем плавающий промис без маркера.
    'no-void': ['warn', { allowAsStatement: true }],
    // React Navigation принимает `tabBarIcon` только как render-prop —
    // это штатный API библиотеки, а не случайно вложенный компонент.
    'react/no-unstable-nested-components': ['warn', { allowAsProps: true }],
  },
};
