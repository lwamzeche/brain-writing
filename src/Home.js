import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  deleteDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import "./css/Home.css";

// Printable view triggers print on mount, then calls onAfterPrint immediately
function PrintableIdeas({ ideasWithImages, onAfterPrint }) {
  useEffect(() => {
    window.print();
    onAfterPrint();
  }, [ideasWithImages, onAfterPrint]);

  return (
    <div className="print-container">
      {ideasWithImages.map((item, idx) => (
        <div key={idx} className="print-page">
          <h2>
            {idx + 1}. {item.idea}{" "}
            <small>
              ({item.participant}, round {item.round})
            </small>
          </h2>
          {item.imageUrl ? (
            <img src={item.imageUrl} alt="" className="print-thumb" />
          ) : (
            <div>(No image available)</div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Home() {
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
  const [ideasToPrint, setIdeasToPrint] = useState(null);

  // Load session info & redirect participants
  useEffect(() => {
    const storedName = localStorage.getItem("brainwritingName");
    const storedId = localStorage.getItem("brainwritingSessionId");
    if (!storedName || !storedId) return navigate("/");
    setPlayerName(storedName);
    setSessionId(storedId);

    const sessionRef = doc(db, "brainwritingSessions", storedId);
    getDoc(sessionRef)
      .then((snap) => {
        if (!snap.exists()) throw new Error("Session not found");
        const data = snap.data();
        setParticipants(data.participants || []);
        setIsHost(data.host === storedName);
        setSessionTopic(data.topic || "No topic provided");
        setSessionStarted(!!data.started);
        setSessionActive(data.active !== false);
        if (data.started && data.host !== storedName) {
          navigate(`/participant/${storedName}/round/1`);
        }
      })
      .catch(() => navigate("/"))
      .finally(() => setIsLoading(false));

    const unsub = onSnapshot(sessionRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setParticipants(data.participants || []);
      setSessionTopic(data.topic || "No topic provided");
      setSessionStarted(!!data.started);
      setSessionActive(data.active !== false);
      if (data.started && data.host !== storedName) {
        navigate(`/participant/${storedName}/round/1`);
      }
    });
    return () => unsub();
  }, [navigate]);

  const handleStartSession = async () => {
    if (!isHost || !sessionActive) return;
    try {
      await updateDoc(doc(db, "brainwritingSessions", sessionId), {
        started: true,
      });
      setHostSessionStarted(true);
    } catch {
      alert("Failed to start session.");
    }
  };

  const handleClick = (name) => {
    if (!sessionStarted) return alert("Waiting for host to start.");
    if (name === playerName) navigate(`/participant/${name}/round/1`);
    else alert("Click your own card.");
  };

  // Collect ideas & images into state, then show print view
  const handleDownloadPDF = async () => {
    const ideasWithImages = [];
    const rounds = participants.length;
    for (const p of participants) {
      for (let r = 1; r <= rounds; r++) {
        const docId = `${sessionId}_${p}_round_${r}`;
        try {
          const snap = await getDoc(doc(db, "brainwritingRounds", docId));
          if (!snap.exists()) continue;
          const data = snap.data();
          (data.ideas || []).forEach((idea, idx) => {
            if (idea.trim() && idea.trim() !== "(No idea)") {
              ideasWithImages.push({
                idea,
                imageUrl: data.cardImages?.[idx] || null,
                participant: p,
                round: r,
              });
            }
          });
        } catch {}
      }
    }
    if (!ideasWithImages.length) return alert("No ideas collected.");

    setIdeasToPrint(ideasWithImages);
  };

  const handleAfterPrint = () => setIdeasToPrint(null);

  const handleCloseSession = async () => {
    if (!isHost) return;
    if (!window.confirm("Close session and delete all data?")) return;
    const rounds = participants.length;
    try {
      for (const p of participants) {
        for (let r = 1; r <= rounds; r++) {
          await deleteDoc(
            doc(db, "brainwritingRounds", `${sessionId}_${p}_round_${r}`)
          );
        }
      }
      await deleteDoc(doc(db, "brainwritingSessions", sessionId));
      localStorage.removeItem("brainwritingName");
      localStorage.removeItem("brainwritingSessionId");
      navigate("/");
    } catch {
      alert("Failed to close session.");
    }
  };

  if (isLoading)
    return (
      <div className="home-container">
        <h1>Loading...</h1>
      </div>
    );

  // Show print preview if requested
  if (ideasToPrint) {
    return (
      <PrintableIdeas
        ideasWithImages={ideasToPrint}
        onAfterPrint={handleAfterPrint}
      />
    );
  }

  return (
    <div className="home-container">
      <h1>Brainwriting Deck</h1>
      <h2>Session Code: {sessionId}</h2>
      <h3>Topic: {sessionTopic}</h3>

      <div className="cards-container">
        {participants.map((n) => (
          <div
            key={n}
            className={`card ${n === playerName ? "your-card" : ""}`}
            onClick={() => handleClick(n)}
          >
            <h3>{n}</h3>
            {n === playerName && <span className="you-label">(You)</span>}
          </div>
        ))}
      </div>

      {isHost ? (
        <div className="host-controls">
          <button
            onClick={handleStartSession}
            disabled={
              hostSessionStarted ||
              participants.filter((p) => p !== playerName).length < 2 ||
              !sessionActive
            }
          >
            {hostSessionStarted
              ? "Session Started"
              : "Start Brainwriting Session"}
          </button>
        </div>
      ) : (
        <p>Waiting for host to start...</p>
      )}

      {!sessionActive && (
        <div className="pdf-download">
          <button onClick={handleDownloadPDF}>Download Ideas PDF</button>
          {isHost && (
            <button onClick={handleCloseSession}>Close Session</button>
          )}
        </div>
      )}
    </div>
  );
}
