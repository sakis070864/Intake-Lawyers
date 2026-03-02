import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import InterviewRoom from './pages/InterviewRoom';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/interview/:id" element={<InterviewRoom />} />
      </Routes>
    </Router>
  );
}

export default App;
