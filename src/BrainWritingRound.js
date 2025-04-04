// BrainWritingRound.js
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useBrainWritingSession } from "./useBrainWritingSession";
import "./css/BrainWritingRound.css";

function BrainWritingRound() {
  const { name, round } = useParams();
  const roundNumber = parseInt(round, 10);
  const navigate = useNavigate();

  const {
    loading,
    isHost,
    participants,
    topic,
    columns,
    flipStates,
    cardImages,
    timeLeft,
    finished,
    submitted,
    currentColumnRef,
    toggleFlip,
    triggerFinish,
    handleIdeaChange,
  } = useBrainWritingSession(name, roundNumber, navigate);

  if (loading) {
    return (
      <div className="brainwriting-container" style={{ textAlign: "center" }}>
        <h2>Loading session data...</h2>
        <p>Please wait while we set up your brainwriting session.</p>
      </div>
    );
  }

  if (isHost) {
    return (
      <div
        className="host-waiting"
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          textAlign: "center",
        }}
      >
        <h2>Brainwriting Session In Progress</h2>
        <p>
          You are the host. Participants are generating ideas. Once they finish,
          you can end the session or wait for the final round to end.
        </p>
        <button
          onClick={() => navigate("/home")}
          style={{
            padding: "10px 20px",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
          }}
        >
          Back to Home
        </button>
      </div>
    );
  }

  const myIndex = participants.indexOf(name);
  if (myIndex === -1) {
    return (
      <div
        className="brainwriting-container"
        style={{ textAlign: "center", marginTop: "50px" }}
      >
        <h2>Session Error</h2>
        <p>You are not registered as a participant in this session.</p>
        <button
          onClick={() => navigate("/")}
          style={{
            padding: "10px 20px",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            marginTop: "20px",
          }}
        >
          Back to Login
        </button>
      </div>
    );
  }

  function renderCard(colIndex, cardIndex) {
    const col = columns[colIndex];
    // Use a composite key for the image: participant-round-cardIndex
    const imageKey = `${col.participant}-${col.round}-${cardIndex}`;
    const isFlipped = flipStates[colIndex]?.[cardIndex] ?? false;
    const isEditable = col.isEditable;

    return (
      <div key={cardIndex} className="idea-card-wrapper">
        <div className={`idea-card ${isFlipped ? "flipped" : ""}`}>
          {/* Front Face: Show idea (or textarea) */}
          <div className="card-face card-front">
            <button
              className="flip-btn"
              onClick={(e) => {
                e.stopPropagation();
                toggleFlip(colIndex, cardIndex);
              }}
            >
              {isFlipped ? "Back" : "Flip"}
            </button>
            {isEditable ? (
              // For editable rounds, show the idea text input
              <textarea
                className="idea-textarea"
                rows={4}
                value={col.ideas[cardIndex]}
                onChange={(e) =>
                  handleIdeaChange(colIndex, cardIndex, e.target.value)
                }
                placeholder="Write idea..."
              />
            ) : (
              <div className="front-content">
                {col.ideas[cardIndex] ? col.ideas[cardIndex] : "No idea"}
              </div>
            )}
          </div>
          {/* Back Face: Show generated image */}
          <div className="card-face card-back">
            <button
              className="flip-btn"
              onClick={(e) => {
                e.stopPropagation();
                toggleFlip(colIndex, cardIndex);
              }}
            >
              {isFlipped ? "Back" : "Flip"}
            </button>
            {cardImages[imageKey] ? (
              <img
                src={cardImages[imageKey]}
                alt="AI generated"
                className="card-image"
              />
            ) : (
              "Loading image..."
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="brainwriting-container">
      <div className="topic-display">
        <h2>Topic: {topic || "No topic provided"}</h2>
      </div>
      <div className="timer-box">
        <div className="timer-label">
          {submitted ? "Round ends in" : "Time left"}
        </div>
        <div className="timer-value">{timeLeft}s</div>
      </div>
      <div
        className="grid-container"
        style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}
      >
        {columns.map((col, colIndex) => (
          <div
            key={colIndex}
            className={`column ${
              col.isEditable && !submitted ? "editable-column" : ""
            }`}
            ref={col.isEditable && !submitted ? currentColumnRef : null}
          >
            <div className="column-participant">
              Round {col.round} – {col.participant}
            </div>
            {[0, 1, 2].map((cardIndex) => renderCard(colIndex, cardIndex))}
          </div>
        ))}
      </div>
      {submitted ? (
        <div className="waiting-message">
          <h3>Your ideas have been submitted!</h3>
          <p>
            Waiting for the timer to end. Next round will start automatically in{" "}
            {timeLeft} seconds.
          </p>
        </div>
      ) : (
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <button
            className="finish-button"
            onClick={triggerFinish}
            disabled={finished}
          >
            Finish Round
          </button>
        </div>
      )}
    </div>
  );
}

export default BrainWritingRound;
