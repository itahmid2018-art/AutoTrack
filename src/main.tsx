import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {registerWorkshopServiceWorker} from './utils/offlineCache';

createRoot(document.getElementById('root')!).render(<App />);
void registerWorkshopServiceWorker();
