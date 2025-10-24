import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import StampPage from './features/stamping/pages/StampPage';
import LearnPage from '@/core/pages/Learn';
import TermsPage from '@/core/pages/Terms';
import PrivacyPage from '@/core/pages/Privacy';
import { Layout } from './core/layout';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<StampPage />} />
          <Route path="/stamp" element={<StampPage />} />
          <Route path="/learn" element={<LearnPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/r/*" element={<StampPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
