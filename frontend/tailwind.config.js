// frontend/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Sora', 'sans-serif'],
      },
      colors: {
        'primary': '#0F0F1A',
        'secondary': '#1E1E2D',
        'accent-cyan': '#00BFFF',
        'accent-magenta': '#FF00FF',
        
        // ADD THESE NEW COLORS FOR OUR GRADIENTS
        'dark-grad-start': '#0F0F1A',
        'dark-grad-end': '#3B1A5A',
        'light-grad-start': '#E0F2FE',
        'light-grad-end': '#BFDBFE',
      },
    },
  },
  plugins: [],
}