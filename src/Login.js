import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "./firebase";
import { doc, getDoc, setDoc, updateDoc, arrayUnion } from "firebase/firestore";

function Login() {
  const [playerName, setPlayerName] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [sessionTopic, setSessionTopic] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleJoin = async () => {
    setError("");
    if (!playerName.trim()) {
      setError("Please enter your name");
      return;
    }

    if (!sessionId.trim()) {
      setError("Please enter a session ID");
      return;
    }

    try {
      const sessionRef = doc(db, "brainwritingSessions", sessionId);
      const sessionDoc = await getDoc(sessionRef);

      if (!sessionDoc.exists()) {
        setError("Session not found. Please check the code.");
        return;
      }

      const sessionData = sessionDoc.data();
      // Check if session is still active
      if (!sessionData.active) {
        setError("Session has ended.");
        return;
      }

      // If this user is the host, skip adding to participants
      if (sessionData.host === playerName) {
        // They are the host, so do nothing except navigate to home
      } else {
        // Otherwise, add them to participants array
        await updateDoc(sessionRef, {
          participants: arrayUnion(playerName),
        });
      }

      // Save user info to localStorage
      localStorage.setItem("brainwritingName", playerName);
      localStorage.setItem("brainwritingSessionId", sessionId);

      // Navigate to home
      navigate(`/home`);
    } catch (error) {
      console.error("Error joining session:", error);
      setError("Failed to join. Try again.");
    }
  };

  const handleCreate = async () => {
    setError("");
    if (!playerName.trim()) {
      setError("Please enter your name");
      return;
    }

    if (!sessionTopic.trim()) {
      setError("Please enter a session topic");
      return;
    }

    try {
      // Generate a random 6-character session ID
      const newSessionId = Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

      // Create session document in Firebase
      // We do NOT add the host to participants
      await setDoc(doc(db, "brainwritingSessions", newSessionId), {
        createdAt: new Date().toISOString(),
        host: playerName, // The host's name
        participants: [], // Keep empty so host is NOT in participants
        active: true,
        topic: sessionTopic,
      });

      // Save user info to localStorage
      localStorage.setItem("brainwritingName", playerName);
      localStorage.setItem("brainwritingSessionId", newSessionId);

      // Show session code to user (optional)
      alert(`Session created! Share this code with others: ${newSessionId}`);

      // Navigate to home
      navigate(`/home`);
    } catch (error) {
      console.error("Error creating session:", error);
      setError("Failed to create session. Try again.");
    }
  };

  return (
    <div
      style={{
        backgroundColor: "#2973B2",
        color: "#fff",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <h1>Brain Writing Session</h1>

      {error && (
        <div
          style={{
            backgroundColor: "#ff6b6b",
            color: "white",
            padding: "10px",
            borderRadius: "4px",
            marginBottom: "15px",
            width: "300px",
          }}
        >
          {error}
        </div>
      )}

      <input
        type="text"
        placeholder="Enter your name..."
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
        style={{
          fontSize: "1rem",
          padding: "0.5rem",
          width: "300px",
          marginBottom: "1rem",
          borderRadius: "4px",
          border: "none",
        }}
      />

      {!isCreating ? (
        <>
          <input
            type="text"
            placeholder="Enter session code..."
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value.toUpperCase())}
            style={{
              fontSize: "1rem",
              padding: "0.5rem",
              width: "300px",
              marginBottom: "1rem",
              borderRadius: "4px",
              border: "none",
            }}
          />

          <button
            onClick={handleJoin}
            style={{
              fontSize: "1rem",
              padding: "0.5rem",
              backgroundColor: "#fff",
              color: "#004191",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              width: "320px",
              marginBottom: "10px",
            }}
          >
            Join Session
          </button>

          <button
            onClick={() => setIsCreating(true)}
            style={{
              fontSize: "1rem",
              padding: "0.5rem",
              backgroundColor: "#28a745",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              width: "320px",
            }}
          >
            Create New Session
          </button>
        </>
      ) : (
        <>
          <p>Create a new session as {playerName}</p>
          <input
            type="text"
            placeholder="Enter session topic..."
            value={sessionTopic}
            onChange={(e) => setSessionTopic(e.target.value)}
            style={{
              fontSize: "1rem",
              padding: "0.5rem",
              width: "300px",
              marginBottom: "1rem",
              borderRadius: "4px",
              border: "none",
            }}
          />
          <button
            onClick={handleCreate}
            style={{
              fontSize: "1rem",
              padding: "0.5rem",
              backgroundColor: "#28a745",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              width: "320px",
              marginBottom: "10px",
            }}
          >
            Create Session
          </button>

          <button
            onClick={() => setIsCreating(false)}
            style={{
              fontSize: "1rem",
              padding: "0.5rem",
              backgroundColor: "#6c757d",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              width: "320px",
            }}
          >
            Back
          </button>
        </>
      )}
    </div>
  );
}

export default Login;
