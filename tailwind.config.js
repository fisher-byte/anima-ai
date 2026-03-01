/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        'canvas-bg': '#ffffff',
        'dot-grid': 'rgba(0, 0, 0, 0.03)',
        'glass': 'rgba(255, 255, 255, 0.7)',
        'gray-hint': '#9ca3af'
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif']
      }
    }
  },
  plugins: [
    require('@tailwindcss/typography')
  ]
}
