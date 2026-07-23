import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/globals.css';
import '@/lib/dayjs'; // Initialize dayjs plugins
import App from './App';
import { GoogleOAuthProvider } from "@react-oauth/google";

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Root element not found. Ensure your index.html has a <div id="root">.');
}

createRoot(rootElement).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>
);
