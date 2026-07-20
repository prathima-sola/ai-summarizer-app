const isLocalPreview = ['localhost', '127.0.0.1'].includes(window.location.hostname);

export const API_URL = import.meta.env.VITE_API_URL
  || (isLocalPreview
    ? 'http://localhost:3001'
    : 'https://ai-summarizer-backend-pxyg.onrender.com');
