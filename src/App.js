// App.js
import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./Home";
import BrainWritingRound from "./BrainWritingRound";
import Login from "./Login";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/home" element={<Home />} />
        <Route
          path="/participant/:name/round/:round"
          element={<BrainWritingRound />}
        />
      </Routes>
    </Router>
  );
}

export default App;
