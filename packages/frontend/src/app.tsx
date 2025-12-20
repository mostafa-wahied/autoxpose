import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { useChangeDetection } from './hooks/use-change-detection';
import { Terminal } from './pages/Terminal';

export function App(): JSX.Element {
  useChangeDetection();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Terminal />} />
      </Routes>
    </BrowserRouter>
  );
}
