import React, { useState, useEffect, useRef } from "react";
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

function PrintableIdeas({
  participants,
  rounds,
  ideasWithImages,
  onAfterPrint,
}) {
  const hasPrinted = useRef(false);
  useEffect(() => {
    if (!hasPrinted.current) {
      window.print();
      hasPrinted.current = true;
      onAfterPrint();
    }
  }, [onAfterPrint]);

  // build a lookup: grid[round][participant] = Array of { idx, imageUrl }
  const grid = {};
  for (let r = 1; r <= rounds; r++) {
    grid[r] = {};
    participants.forEach((p) => {
      grid[r][p] = [];
    });
  }
  ideasWithImages.forEach(({ round, participant, idx, imageUrl }) => {
    if (grid[round] && grid[round][participant]) {
      grid[round][participant].push({ idx, imageUrl });
    }
  });
  // sort each small array by idx
  for (let r = 1; r <= rounds; r++) {
    participants.forEach((p) => {
      grid[r][p].sort((a, b) => a.idx - b.idx);
    });
  }

  return (
    <div className="print-container">
      {/* Header row */}
      <div className="row header-row">
        {participants.map((_, i) => (
          <div key={i} className="header-cell">
            Idea{i + 1}
          </div>
        ))}
      </div>

      {/* loop over each original participant & each of their 3 cards,
          and for each row pull that card through all rounds via cyclic shift */}
      {participants.map((_, origIdx) =>
        [0, 1, 2].map((cardIdx) => (
          <div key={`${origIdx}-${cardIdx}`} className="row image-row">
            {participants.map((__, roundOffset) => {
              const participantAtThisRound =
                participants[(origIdx + roundOffset) % participants.length];
              const roundNumber = roundOffset + 1;
              const cell = grid[roundNumber][participantAtThisRound][cardIdx];
              return (
                <div key={roundOffset} className="image-cell">
                  {cell?.imageUrl && (
                    <img src={cell.imageUrl} className="print-thumb" alt="" />
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState("");
  const [hostName, setHostName] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [participants, setParticipants] = useState([]);
  const [sessionTopic, setSessionTopic] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionActive, setSessionActive] = useState(true);
  const [hostSessionStarted, setHostSessionStarted] = useState(false);
  const [printData, setPrintData] = useState(null);

  // Load session info and redirect participants
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
        setHostName(data.host || "");
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
      setHostName(data.host || "");
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

  // Gather ideas & images, then show print view
  const handleDownloadPDF = async () => {
    // always exclude the host from columns
    const targetParticipants = participants.filter((p) => p !== hostName);
    // number of rounds = number of writers
    const rounds = targetParticipants.length;
    const ideasWithImages = [];

    for (const p of targetParticipants) {
      for (let r = 1; r <= rounds; r++) {
        const docId = `${sessionId}_${p}_round_${r}`;
        try {
          const snap = await getDoc(doc(db, "brainwritingRounds", docId));
          if (!snap.exists()) continue;
          const data = snap.data();
          const cardImagesObj = data.cardImages || {};
          // cardImagesObj is an object { "0": url0, "1": url1, "2": url2 }
          Object.entries(cardImagesObj).forEach(([idxStr, imageUrl]) => {
            const idx = parseInt(idxStr, 10);
            if (imageUrl) {
              ideasWithImages.push({
                idx,
                imageUrl,
                participant: p,
                round: r,
              });
            }
          });
        } catch {}
      }
    }

    // if (!ideasWithImages.length) return alert("No ideas collected.");
    setPrintData({ participants: targetParticipants, rounds, ideasWithImages });
  };

  const handleAfterPrint = () => {
    setPrintData(null);
    navigate("/home");
  };

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

  // Print preview
  if (printData) {
    return (
      <PrintableIdeas
        participants={printData.participants}
        rounds={printData.rounds}
        ideasWithImages={printData.ideasWithImages}
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
