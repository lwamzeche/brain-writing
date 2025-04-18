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
          // navigate non-host users to the participant round when session starts
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
        // navigate non-host users when session starts
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

  // helper function using Image and Canvas
  const getBase64FromUrl = (url) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        try {
          const dataURL = canvas.toDataURL("image/jpeg");
          resolve(dataURL);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => {
        reject(new Error("Could not load image at " + url));
      };
      img.src = url;
    });
  };

  const handleDownloadPDF = async () => {
    const ideasWithImages = []; // We'll store paired ideas and images
    const sessionId = localStorage.getItem("brainwritingSessionId");

    const totalRounds = participants.length;
    for (const participant of participants) {
      for (let round = 1; round <= totalRounds; round++) {
        const docId = `${sessionId}_${participant}_round_${round}`;
        try {
          const roundDoc = await getDoc(doc(db, "brainwritingRounds", docId));
          if (roundDoc.exists()) {
            const data = roundDoc.data();
            // Match ideas with their images
            if (data.ideas && Array.isArray(data.ideas)) {
              data.ideas.forEach((idea, idx) => {
                if (idea.trim() !== "" && idea.trim() !== "(No idea)") {
                  // Get the corresponding image if available
                  let imageUrl = null;
                  if (data.cardImages && data.cardImages[idx]) {
                    imageUrl = data.cardImages[idx];
                  }

                  // Add to our collection
                  ideasWithImages.push({
                    idea,
                    imageUrl,
                    participant,
                    round,
                  });
                }
              });
            }
          }
        } catch (err) {
          console.error("Error fetching round doc:", docId, err);
        }
      }
    }

    if (ideasWithImages.length === 0) {
      alert("No ideas were collected.");
      return;
    }

    // Convert each image URL to a data URL
    const processedPairs = await Promise.all(
      ideasWithImages.map(async (pair) => {
        if (pair.imageUrl && !pair.imageUrl.startsWith("data:")) {
          try {
            pair.imageUrl = await getBase64FromUrl(pair.imageUrl);
          } catch (error) {
            console.error("Error converting image to base64:", error);
            pair.imageUrl = null;
          }
        }
        return pair;
      })
    );

    // Create PDF
    const pdfDoc = new jsPDF();
    let y = 20;
    pdfDoc.setFontSize(16);
    pdfDoc.text("Brainwriting Session Ideas", 10, 10);
    pdfDoc.setFontSize(12);

    // Add each idea with its image
    processedPairs.forEach((pair, index) => {
      // Reset y position if we're near the bottom or starting a new entry
      if (y > 250 || index > 0) {
        pdfDoc.addPage();
        y = 20;
      }

      // Add idea text with number
      const ideaText = `${index + 1}. ${pair.idea} (by ${
        pair.participant
      }, round ${pair.round})`;
      pdfDoc.text(ideaText, 10, y);
      y += 10;

      // Add image if available
      if (pair.imageUrl) {
        try {
          pdfDoc.addImage(pair.imageUrl, "JPEG", 10, y, 80, 60);
          y += 70; // Move down to account for image height
        } catch (e) {
          console.error("Error adding image to PDF:", e);
          pdfDoc.text("(Image could not be displayed)", 10, y);
          y += 10;
        }
      } else {
        pdfDoc.text("(No image available)", 10, y);
        y += 10;
      }
      y += 10;
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
