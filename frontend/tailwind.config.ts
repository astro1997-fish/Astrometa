import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#EEF2FF',
          100: '#C7D5FA',
          200: '#9FB8F4',
          400: '#3B7EF6',
          500: '#1A56DB',
          600: '#1440B5',
          700: '#0E3A8C',
          900: '#070D1F',
        },
        surface: {
          light: '#F0F4FF',
          dark:  '#0D1627',
          card:  '#111827',
        },
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #1A56DB 0%, #3B7EF6 100%)',
        'gradient-gold':  'linear-gradient(135deg, #F59E0B 0%, #FCD34D 100%)',
        'gradient-plat':  'linear-gradient(135deg, #6366F1 0%, #A78BFA 100%)',
        'gradient-bronze': 'linear-gradient(135deg, #92400E 0%, #D97706 100%)',
      },
      animation: {
        'float':          'float 6s ease-in-out infinite',
        'pulse-slow':     'pulse 4s cubic-bezier(0.4,0,0.6,1) infinite',
        'slide-up':       'slideUp 0.5s ease-out',
        'fade-in':        'fadeIn 0.4s ease-out',
        'shimmer':        'shimmer 1.5s infinite',
        'counter':        'counter 2s ease-out',
        'marquee-left':   'marqueeLeft 40s linear infinite',
        'marquee-right':  'marqueeRight 40s linear infinite',
      },
      keyframes: {
        float:        { '0%,100%': { transform: 'translateY(0px)' }, '50%': { transform: 'translateY(-12px)' } },
        slideUp:      { from: { opacity: '0', transform: 'translateY(20px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        fadeIn:       { from: { opacity: '0' }, to: { opacity: '1' } },
        shimmer:      { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        marqueeLeft:  { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        marqueeRight: { '0%': { transform: 'translateX(-50%)' }, '100%': { transform: 'translateX(0)' } },
      },
      boxShadow: {
        'glow-blue': '0 0 24px rgba(59,126,246,0.35)',
        'glow-gold': '0 0 24px rgba(245,158,11,0.35)',
        'glow-bronze': '0 0 24px rgba(180,83,9,0.35)',
        'card-dark': '0 4px 24px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
}

export default config
