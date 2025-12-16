import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Terminal } from './pages/Terminal';

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Terminal />} />
      </Routes>
    </BrowserRouter>
  );
}
