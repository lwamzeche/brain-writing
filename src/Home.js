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

function PrintableIdeas({ screens, topic, onAfterPrint }) {
  // 1. Normalize the prop so we never get `undefined`
  const safeScreens = Array.isArray(screens) ? screens : [];

  // 2. Compute how many images to wait for
  const imgCount = safeScreens.reduce((sum, { rowItems }) => {
    if (!Array.isArray(rowItems)) return sum;
    return sum + rowItems.filter((cell) => cell.image).length;
  }, 0);

  // 3. Hooks are always called, no matter what:
  const [loaded, setLoaded] = useState(0);
  const doneRef = useRef(false);
  useEffect(() => {
    if (imgCount > 0 && loaded === imgCount && !doneRef.current) {
      window.print();
      doneRef.current = true;
      window.addEventListener("afterprint", onAfterPrint, { once: true });
    }
  }, [loaded, imgCount, onAfterPrint]);

  // 4. Now we can bail out early if there’s nothing to render yet
  if (safeScreens.length === 0) {
    return <div>Loading print preview…</div>;
  }

  // 5. Finally, render your full grid
  return (
    <div className="print-container">
      <div className="row header-row">
        <div className="header-cell" style={{ gridColumn: `1 / -1` }}>
          <h1 className="print-topic">{topic}</h1>
        </div>
      </div>

      {safeScreens.map(({ participant, cardIdx, rowItems }, rowIdx) => (
        <div key={`${participant}-${cardIdx}`} className="row image-row">
          <div className="row-number">{rowIdx + 1}.</div>

          {Array.isArray(rowItems) &&
            rowItems.map(({ image, idea }, colIdx) => (
              <React.Fragment key={colIdx}>
                <div className="image-cell">
                  {image ? (
                    <>
                      <img
                        src={image}
                        className="print-thumb"
                        alt=""
                        onLoad={() => setLoaded((n) => n + 1)}
                      />
                      <div className="idea-text">{idea}</div>
                    </>
                  ) : (
                    <div className="print-thumb placeholder" />
                  )}
                </div>
                {colIdx < rowItems.length - 1 && (
                  <div className="arrow-cell">→</div>
                )}
              </React.Fragment>
            ))}
        </div>
      ))}
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

  // gather ideas & images, then show print view
  const handleDownloadPDF = async () => {
    const writers = participants.filter((p) => p !== hostName);
    const R = writers.length;
    const screens = []; // will hold one entry per card per participant

    // 1) for each final participant p…
    for (const p of writers) {
      const myIndex = writers.indexOf(p);
      const originalOwner = (myIndex + (R - 1)) % R;

      // 2) for each of their 3 cards…
      for (let cardIdx = 0; cardIdx < 3; cardIdx++) {
        // build the 3 images/texts they saw, in left→right order
        const rowItems = await Promise.all(
          Array.from({ length: R }, async (_, k) => {
            // writer of round k+1:
            const writerIndex =
              k < R - 1 ? (originalOwner - k + R) % R : myIndex;
            const writer = writers[writerIndex];
            const docId = `${sessionId}_${writer}_round_${k + 1}`;
            const snap = await getDoc(doc(db, "brainwritingRounds", docId));
            const data = snap.exists() ? snap.data() : {};
            const idea = (data.ideas || [
              "(No idea)",
              "(No idea)",
              "(No idea)",
            ])[cardIdx];
            const image = (data.cardImages || {})[cardIdx] || "";
            return { idea, image };
          })
        );

        screens.push({
          participant: p,
          cardIdx,
          rowItems, // an array of length R, in exactly the order they saw it
        });
      }
    }

    setPrintData({ screens, topic: sessionTopic });
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
  // after
  if (printData) {
    return (
      <PrintableIdeas
        screens={printData.screens}
        topic={printData.topic}
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
