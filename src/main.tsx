import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts';
import './index.css';
import App from './App';
import { Welcome } from './components/Welcome';

function Root() {
  const [arrived, setArrived] = useState(() => !window.location.hash);
  useEffect(() => {
    const onChange = () => setArrived(!window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  if (arrived) return <Welcome onEnter={() => (window.location.hash = '#atlas')} />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
