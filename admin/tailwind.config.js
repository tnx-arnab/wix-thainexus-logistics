/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: '#272262',
                    hover: '#1e1a4d',
                },
                secondary: {
                    DEFAULT: '#bf1d2d',
                    hover: '#9f1824',
                },
            },
        },
    },
    plugins: [],
};
