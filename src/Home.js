import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  deleteDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { jsPDF } from "jspdf";
import "./css/Home.css";

function Home() {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [participants, setParticipants] = useState([]);
  const [sessionTopic, setSessionTopic] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionActive, setSessionActive] = useState(true);
  const [hostSessionStarted, setHostSessionStarted] = useState(false);

  useEffect(() => {
    const storedName = localStorage.getItem("brainwritingName");
    const storedSessionId = localStorage.getItem("brainwritingSessionId");
    if (!storedName || !storedSessionId) {
      navigate("/");
      return;
    }
    setPlayerName(storedName);
    setSessionId(storedSessionId);

    const sessionRef = doc(db, "brainwritingSessions", storedSessionId);
    getDoc(sessionRef)
      .then((docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setParticipants(data.participants || []);
          setIsHost(data.host === storedName);
          setSessionTopic(data.topic || "No topic provided");
          setSessionStarted(!!data.started);
          setSessionActive(data.active !== undefined ? data.active : true);
          // Navigate non-host users to the participant round when session starts
          if (data.started && data.host !== storedName) {
            navigate(`/participant/${storedName}/round/1`);
          }
          setIsLoading(false);
        } else {
          navigate("/");
        }
      })
      .catch((error) => {
        console.error("Error fetching session:", error);
        setIsLoading(false);
      });

    const unsubscribe = onSnapshot(sessionRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setParticipants(data.participants || []);
        setSessionTopic(data.topic || "No topic provided");
        setSessionStarted(!!data.started);
        setSessionActive(data.active !== undefined ? data.active : true);
        // Navigate non-host users when session starts
        if (data.started && data.host !== storedName) {
          navigate(`/participant/${storedName}/round/1`);
        }
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleStartSession = async () => {
    if (!isHost) return;
    if (!sessionActive) {
      alert("This session has ended and cannot be restarted.");
      return;
    }
    try {
      await updateDoc(doc(db, "brainwritingSessions", sessionId), {
        started: true,
      });
      setHostSessionStarted(true);
    } catch (error) {
      console.error("Error starting session:", error);
      alert("Failed to start session. Please try again.");
    }
  };

  const handleClick = (name) => {
    if (!sessionStarted) {
      alert(
        "The session hasn't started yet. Please wait for the host to start the session."
      );
      return;
    }
    if (name === playerName) {
      navigate(`/participant/${name}/round/1`);
    } else {
      alert("Please click on your own name card!");
    }
  };

  const handleDownloadPDF = async () => {
    const ideasList = [];
    const imagesList = []; // Array to hold image data objects

    const totalRounds = participants.length;
    for (const participant of participants) {
      for (let round = 1; round <= totalRounds; round++) {
        const docId = `${sessionId}_${participant}_round_${round}`;
        try {
          const roundDoc = await getDoc(doc(db, "brainwritingRounds", docId));
          if (roundDoc.exists()) {
            const data = roundDoc.data();
            // Collect text ideas
            if (data.ideas && Array.isArray(data.ideas)) {
              data.ideas.forEach((idea) => {
                if (idea.trim() !== "" && idea.trim() !== "(No idea)") {
                  ideasList.push(idea);
                }
              });
            }
            // Collect images from this round (assuming cardImages is an object with keys "0", "1", "2")
            if (data.cardImages) {
              Object.keys(data.cardImages).forEach((key) => {
                const imageUrl = data.cardImages[key];
                if (imageUrl) {
                  imagesList.push(imageUrl);
                }
              });
            }
          }
        } catch (err) {
          console.error("Error fetching round doc:", docId, err);
        }
      }
    }

    if (ideasList.length === 0 && imagesList.length === 0) {
      alert("No ideas or images were collected.");
      return;
    }

    const pdfDoc = new jsPDF();
    let y = 10;
    pdfDoc.setFontSize(12);

    // Add ideas text to the PDF
    ideasList.forEach((idea) => {
      pdfDoc.text(10, y, idea);
      y += 10;
      if (y > 280) {
        pdfDoc.addPage();
        y = 10;
      }
    });

    // Add a new page for images or append them as you see fit.
    // This example adds each image on a separate page.
    imagesList.forEach((imgData, index) => {
      pdfDoc.addPage();
      // Adjust the parameters as needed.
      // Note: if imgData is not a data URL, you'll need to convert it to base64 first.
      pdfDoc.addImage(imgData, "JPEG", 10, 10, 180, 160);
    });

    pdfDoc.save("brainwriting_ideas.pdf");
  };

  const handleCloseSession = async () => {
    if (!isHost) return;
    const confirmed = window.confirm(
      "Are you sure you want to close the session? This will permanently delete all session data."
    );
    if (!confirmed) return;
    try {
      // Assume total rounds equals the number of participants
      const totalRounds = participants.length;
      // Delete all round documents for this session.
      for (const participant of participants) {
        for (let round = 1; round <= totalRounds; round++) {
          const roundDocId = `${sessionId}_${participant}_round_${round}`;
          await deleteDoc(doc(db, "brainwritingRounds", roundDocId));
        }
      }
      // Delete the session document.
      await deleteDoc(doc(db, "brainwritingSessions", sessionId));
      alert("Session closed and all data deleted.");
      localStorage.removeItem("brainwritingName");
      localStorage.removeItem("brainwritingSessionId");
      navigate("/");
    } catch (error) {
      console.error("Error deleting session data:", error);
      alert("Failed to close session. Please try again.");
    }
  };

  if (isLoading) {
    return (
      <div className="home-container">
        <h1>Loading Session...</h1>
      </div>
    );
  }

  return (
    <div className="home-container">
      <h1>Brainwriting Deck</h1>
      <h2>Session Code: {sessionId}</h2>
      <h3>Topic: {sessionTopic}</h3>
      <div className="cards-container">
        {participants.map((name) => (
          <div
            key={name}
            className={`card ${name === playerName ? "your-card" : ""}`}
            onClick={() => handleClick(name)}
          >
            <h3>{name}</h3>
            {name === playerName && <span className="you-label">(You)</span>}
          </div>
        ))}
      </div>
      {isHost ? (
        <div className="host-controls">
          <p>You are the host of this session.</p>
          {(() => {
            const nonHostCount = participants.filter(
              (p) => p !== playerName
            ).length;
            return (
              <button
                className="start-button"
                onClick={handleStartSession}
                disabled={
                  hostSessionStarted || nonHostCount < 2 || !sessionActive
                }
              >
                {hostSessionStarted
                  ? "Session Started"
                  : nonHostCount < 2
                  ? "Need at least 2 participants"
                  : "Start Brainwriting Session"}
              </button>
            );
          })()}
        </div>
      ) : (
        <div className="waiting-message">
          <p>Waiting for the host to start the session...</p>
        </div>
      )}
      <div className="session-info">
        <p>
          Share this code with others to join: <strong>{sessionId}</strong>
        </p>
      </div>
      {!sessionActive && (
        <div className="pdf-download">
          <h3>Session Ended</h3>
          <button onClick={handleDownloadPDF}>Download Ideas PDF</button>
          {isHost && (
            <button onClick={handleCloseSession} style={{ marginTop: "10px" }}>
              Close Session
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default Home;
