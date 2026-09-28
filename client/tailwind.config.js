/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Tajawal', 'Cairo', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eefbf6', 100: '#d5f5e8', 200: '#aeead4', 300: '#78d9ba',
          400: '#42c09c', 500: '#1fa583', 600: '#12856b', 700: '#106a58',
          800: '#105547', 900: '#0f463c', 950: '#042721',
        },
        ink: {
          50: '#f6f7f9', 100: '#eceef2', 200: '#d5dae3', 300: '#b1bacb',
          400: '#8695ae', 500: '#667694', 600: '#515e7a', 700: '#434d63',
          800: '#3a4254', 900: '#343a48', 950: '#1e222c',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 4px 16px rgba(16,24,40,.06)',
        pop: '0 12px 40px rgba(16,24,40,.16)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: 0, transform: 'translateY(4px)' }, '100%': { opacity: 1, transform: 'none' } },
        'slide-up': { '0%': { opacity: 0, transform: 'translateY(14px)' }, '100%': { opacity: 1, transform: 'none' } },
      },
      animation: {
        'fade-in': 'fade-in .2s ease-out',
        'slide-up': 'slide-up .25s ease-out',
      },
    },
  },
  plugins: [],
};
