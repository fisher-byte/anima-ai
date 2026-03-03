module.exports = {
  root: true,
  extends: [
    '@electron-toolkit/eslint-config-ts',
    'plugin:react/recommended',
    '@electron-toolkit/eslint-config-prettier'
  ],
  plugins: ['react-hooks'],
  settings: {
    react: { version: 'detect' }
  },
  rules: {
    // React 17+ 新 JSX Transform 不需要显式引入 React
    'react/react-in-jsx-scope': 'off',
    // 旧文案里常出现英文引号；不应阻断构建
    'react/no-unescaped-entities': 'off',
    // 本仓库历史代码大量使用 any；先不让 lint 阻断流程
    '@typescript-eslint/no-explicit-any': 'off',
    // 避免被历史代码“卡死”；先以告警为主
    '@typescript-eslint/no-unused-vars': 'warn',
    '@typescript-eslint/ban-ts-comment': 'warn',
    'prefer-const': 'warn',
    'react-hooks/rules-of-hooks': 'warn',
    'react-hooks/exhaustive-deps': 'off'
  },
  ignorePatterns: [
    'out/**',
    'dist/**',
    'node_modules/**',
    'data/**',
    'coverage/**',
    'docs/**'
  ]
}

