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
      <div className="brainwriting-container">
        <h2>Loading session data...</h2>
      </div>
    );
  }

  if (isHost) {
    return (
      <div className="host-waiting">
        <h2>Brainwriting Session In Progress</h2>
        <p>
          You are the host. Participants are generating ideas. Once they finish,
          you can end the session or wait for the final round to end.
        </p>
        <button onClick={() => navigate("/home")}>Back to Home</button>
      </div>
    );
  }

  const myIndex = participants.indexOf(name);
  if (myIndex === -1) {
    return (
      <div style={{ textAlign: "center", marginTop: "50px" }}>
        <h2>Session Error</h2>
        <p>You are not registered as a participant in this session.</p>
        <button onClick={() => navigate("/")}>Back to Login</button>
      </div>
    );
  }

  function renderCard(colIndex, cardIndex) {
    const col = columns[colIndex];
    const imageKey = `${col.participant}-${col.round}-${cardIndex}`;
    const isFlipped = flipStates[colIndex]?.[cardIndex] ?? false;
    const isEditable = col.isEditable;
    const ideaText = col.ideas[cardIndex];

    return (
      <div key={cardIndex} className="idea-card-wrapper">
        <div className={`idea-card ${isFlipped ? "flipped" : ""}`}>
          {/* Front Face */}
          <div className="card-face card-front">
            <button
              className="flip-btn"
              onClick={() => toggleFlip(colIndex, cardIndex)}
            >
              {isFlipped ? "Back" : "Flip"}
            </button>
            {isEditable ? (
              <textarea
                value={ideaText}
                rows={3}
                onChange={(e) =>
                  handleIdeaChange(colIndex, cardIndex, e.target.value)
                }
              />
            ) : (
              <div>{ideaText || "No idea"}</div>
            )}
          </div>

          {/* Back Face */}
          <div className="card-face card-back">
            <button
              className="flip-btn"
              onClick={() => toggleFlip(colIndex, cardIndex)}
            >
              Back
            </button>
            {cardImages[imageKey] && cardImages[imageKey] !== "loading" ? (
              <img src={cardImages[imageKey]} alt="" className="card-image" />
            ) : cardImages[imageKey] === "loading" ? (
              <div>Generating image...</div>
            ) : (
              <div>No image</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    // <div className="brainwriting-container">
    //   <h2>Topic: {topic}</h2>
    //   <div className="timer-box">
    //     <span>Time left: {timeLeft}s</span>
    //   </div>
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

      <div className="grid-container" style={{ display: "flex", gap: "20px" }}>
        {columns.map((col, colIndex) => (
          <div
            key={colIndex}
            className={col.isEditable ? "editable-column" : "column"}
            ref={col.isEditable ? currentColumnRef : null}
          >
            <h3>
              Round {col.round} – {col.participant}
            </h3>
            {[0, 1, 2].map((cardIndex) => renderCard(colIndex, cardIndex))}
          </div>
        ))}
      </div>

      {!submitted ? (
        <button onClick={triggerFinish} disabled={finished}>
          Finish Round
        </button>
      ) : (
        <p style={{ marginTop: "20px", color: "green" }}>
          Your ideas have been submitted!
        </p>
      )}
    </div>
  );
}

export default BrainWritingRound;
