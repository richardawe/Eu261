/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0a0e1a',
          raised: '#0f1629',
          overlay: '#162038',
          border: '#1e2d4a',
        },
        ink: {
          DEFAULT: '#e2e8f0',
          muted: '#94a3b8',
          faint: '#475569',
        },
        accent: {
          DEFAULT: '#3b82f6',
          dim: '#1d4ed8',
        },
        party: {
          labour: '#E4003B',
          conservative: '#0087DC',
          reform: '#12B6CF',
          libdem: '#FAA61A',
          green: '#02A95B',
          snp: '#FDF38E',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
