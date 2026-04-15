import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Classes from './pages/Classes';
import Students from './pages/Students';
import Assignments from './pages/Assignments';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/classes" replace />} />
          <Route path="classes" element={<Classes />} />
          <Route path="students" element={<Students />} />
          <Route path="assignments" element={<Assignments />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
