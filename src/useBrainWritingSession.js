// useBrainWritingSession.js
import { useState, useEffect, useRef, useCallback } from "react";
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { generateImage } from "./generateImage";

export function useBrainWritingSession(name, roundNumber, navigate) {
  // State declarations
  const [participants, setParticipants] = useState([]);
  const [sessionHost, setSessionHost] = useState("");
  const [topic, setTopic] = useState("");
  const [columns, setColumns] = useState([]);
  const [flipStates, setFlipStates] = useState([]);
  const [timeLeft, setTimeLeft] = useState(100);
  const [finished, setFinished] = useState(false);
  const [roundStartTime, setRoundStartTime] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [cardImages, setCardImages] = useState({});
  const [loading, setLoading] = useState(true);

  const columnsRef = useRef([]);
  const currentColumnRef = useRef(null);

  const isHost = sessionHost && name === sessionHost;

  // 1. Fetch session data
  useEffect(() => {
    async function fetchSessionData() {
      const sessionId = localStorage.getItem("brainwritingSessionId") || "";
      if (!sessionId) {
        navigate("/");
        return;
      }
      try {
        const sessionRef = doc(db, "brainwritingSessions", sessionId);
        const sessionDoc = await getDoc(sessionRef);
        if (!sessionDoc.exists()) {
          console.error("Session not found");
          navigate("/");
          return;
        }
        const sessionData = sessionDoc.data();
        setParticipants(sessionData.participants || []);
        setSessionHost(sessionData.host || "");
        setTopic(sessionData.topic || "No topic provided");

        if (
          sessionData.currentRoundStartTime &&
          sessionData.currentRound === roundNumber
        ) {
          setRoundStartTime(new Date(sessionData.currentRoundStartTime));
        } else {
          const now = new Date().toISOString();
          await updateDoc(sessionRef, {
            currentRoundStartTime: now,
            currentRound: roundNumber,
          });
          setRoundStartTime(new Date(now));
        }
        setLoading(false);
      } catch (error) {
        console.error("Error fetching session data:", error);
        setLoading(false);
      }
    }
    fetchSessionData();
  }, [roundNumber, navigate]);

  // 2. Build the chain for participants
  useEffect(() => {
    if (isHost || participants.length === 0) return;
    const myIndex = participants.indexOf(name);
    if (myIndex === -1) return;

    setColumns([]);
    setFlipStates([]);
    setFinished(false);

    const length = participants.length;
    const originalOwnerIndex = (myIndex + (roundNumber - 1)) % length;

    async function fetchChain() {
      let chain = [];
      const sessionId = localStorage.getItem("brainwritingSessionId") || "";

      // Gather columns for previous rounds
      for (let k = 1; k < roundNumber; k++) {
        const writerIndex = (originalOwnerIndex - (k - 1) + length) % length;
        const writer = participants[writerIndex];
        const docId = `${sessionId}_${writer}_round_${k}`;
        let fetchedIdeas = ["", "", ""];
        try {
          const docSnap = await getDoc(doc(db, "brainwritingRounds", docId));
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.ideas) {
              fetchedIdeas = data.ideas;
            }
          }
        } catch (err) {
          console.error("Error fetching doc:", docId, err);
        }
        chain.push({
          round: k,
          participant: writer,
          ideas: fetchedIdeas,
          isEditable: false,
        });
      }

      // Current round
      chain.push({
        round: roundNumber,
        participant: name,
        ideas: ["", "", ""],
        isEditable: true,
      });

      setColumns(chain);
      setFlipStates(
        chain.map((col) =>
          col.isEditable ? [true, true, true] : [false, false, false]
        )
      );
    }
    fetchChain();
  }, [isHost, participants, roundNumber, name]);

  // 3. Keep columnsRef in sync
  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);

  // 4. Scroll into view for the current (editable) column
  useEffect(() => {
    if (currentColumnRef.current && columns.length > 0) {
      const timeoutId = setTimeout(() => {
        if (currentColumnRef.current) {
          currentColumnRef.current.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [columns]);

  // 5. toggleFlip function (includes image generation for round 1, first card)
  const toggleFlip = (colIndex, cardIndex) => {
    setFlipStates((prev) => {
      const newArr = [...prev];
      newArr[colIndex] = [...newArr[colIndex]];
      const newFlipState = !newArr[colIndex][cardIndex];
      newArr[colIndex][cardIndex] = newFlipState;

      // When flipping to image side (newFlipState true),
      // generate image only if the idea exists and hasn't been generated yet.

      if (
        newFlipState &&
        columns[colIndex].ideas[cardIndex].trim() !== "" &&
        !cardImages[
          `${columns[colIndex].participant}-${columns[colIndex].round}-${cardIndex}`
        ]
      ) {
        const prompt = `Illustration representing "${columns[colIndex].ideas[cardIndex]}"`;
        generateImage(prompt).then((url) => {
          if (url) {
            setCardImages((prevImages) => ({
              ...prevImages,
              [`${columns[colIndex].participant}-${columns[colIndex].round}-${cardIndex}`]:
                url,
            }));
          }
        });
      }
      return newArr;
    });
  };

  // 6. Navigation and saving logic
  const navigateToNextRound = useCallback(async () => {
    if (isHost) return;
    if (roundNumber < participants.length) {
      navigate(`/participant/${name}/round/${roundNumber + 1}`);
    } else {
      try {
        const sessionId = localStorage.getItem("brainwritingSessionId") || "";
        const sessionRef = doc(db, "brainwritingSessions", sessionId);
        await updateDoc(sessionRef, {
          started: false,
          active: false,
          endedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error("Error updating session status:", err);
      }
      navigate("/home");
    }
  }, [isHost, roundNumber, participants, name, navigate]);

  const saveCurrentRound = useCallback(async () => {
    if (isHost) return;
    try {
      const currentColumns = columnsRef.current;
      if (currentColumns && currentColumns.length > 0) {
        const lastColIndex = currentColumns.length - 1;
        const currentRoundData = currentColumns[lastColIndex];
        if (currentRoundData && currentRoundData.participant) {
          const sessionId = localStorage.getItem("brainwritingSessionId") || "";
          const docId = `${sessionId}_${currentRoundData.participant}_round_${currentRoundData.round}`;
          const ideasToSave = currentRoundData.ideas.map((idea) =>
            idea.trim() === "" ? "(No idea)" : idea
          );
          await setDoc(doc(db, "brainwritingRounds", docId), {
            participant: currentRoundData.participant,
            round: currentRoundData.round,
            ideas: ideasToSave,
            // Save only the current round's first card image using key "0"
            cardImages: {
              0:
                cardImages[
                  `${currentRoundData.participant}-${currentRoundData.round}-0`
                ] || "",
            },
            timestamp: new Date().toISOString(),
          });
          setFinished(true);
          if (timeLeft === 0) {
            await navigateToNextRound();
          }
        }
      }
    } catch (error) {
      console.error("Error saving round data:", error);
      alert("There was an error saving your ideas. Please try again.");
      setFinished(false);
      setSubmitted(false);
    }
  }, [isHost, timeLeft, navigateToNextRound, cardImages]);

  // 7. Timer for participants
  useEffect(() => {
    if (isHost || !roundStartTime) return;
    const intervalId = setInterval(() => {
      const now = new Date();
      const elapsed = (now - roundStartTime) / 1000;
      const newTimeLeft = Math.max(100 - Math.floor(elapsed), 0);
      setTimeLeft(newTimeLeft);
      if (newTimeLeft === 0) {
        clearInterval(intervalId);
        (async () => {
          if (!submitted) {
            await saveCurrentRound();
          }
          await navigateToNextRound();
        })();
      }
    }, 1000);
    return () => clearInterval(intervalId);
  }, [
    isHost,
    roundStartTime,
    submitted,
    saveCurrentRound,
    navigateToNextRound,
  ]);

  // 8. Handler: triggerFinish
  const triggerFinish = async () => {
    if (finished || submitted || isHost) return;
    setSubmitted(true);
    setFlipStates((prev) => prev.map((col) => col.map(() => false)));
    await saveCurrentRound();
  };

  // 9. Handler: handleIdeaChange
  const handleIdeaChange = (colIndex, cardIndex, newValue) => {
    setColumns((prev) => {
      const newCols = [...prev];
      const col = { ...newCols[colIndex] };
      const newIdeas = [...col.ideas];
      newIdeas[cardIndex] = newValue;
      col.ideas = newIdeas;
      newCols[colIndex] = col;
      return newCols;
    });
  };

  //   // 10. Debounced effect to generate/update image for round 1, first card
  //   useEffect(() => {
  //     if (roundNumber === 1 && columns.length > 0) {
  //       const idea = columns[columns.length - 1].ideas[0]; // current round's idea
  //       if (idea && idea.trim() !== "") {
  //         if (debounceTimerRef.current) {
  //           clearTimeout(debounceTimerRef.current);
  //         }
  //         debounceTimerRef.current = setTimeout(() => {
  //           const prompt = `Illustration representing "${idea}"`;
  //           generateImage(prompt).then((url) => {
  //             if (url) {
  //               setCardImages((prev) => ({
  //                 ...prev,
  //                 [`${name}-${roundNumber}-0`]: url,
  //               }));
  //             }
  //           });
  //         }, 1000);
  //         return () => clearTimeout(debounceTimerRef.current);
  //       }
  //     }
  //   }, [columns, roundNumber, name]);

  // 11. Realtime listener for finished rounds (non‑editable columns)
  useEffect(() => {
    const sessionId = localStorage.getItem("brainwritingSessionId") || "";
    if (!sessionId) return;
    const unsubscribes = [];
    // For each finished round in the chain (all except the current editable round)
    columns.forEach((col, index) => {
      if (!col.isEditable) {
        const docId = `${sessionId}_${col.participant}_round_${col.round}`;
        const unsub = onSnapshot(
          doc(db, "brainwritingRounds", docId),
          (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              // Update ideas for this round
              setColumns((prevColumns) => {
                const newColumns = [...prevColumns];
                newColumns[index] = {
                  ...newColumns[index],
                  ideas: data.ideas || newColumns[index].ideas,
                };
                return newColumns;
              });
              // Update cardImages if available using composite key
              if (data.cardImages && data.cardImages["0"]) {
                setCardImages((prev) => ({
                  ...prev,
                  [`${col.participant}-${col.round}-0`]: data.cardImages["0"],
                }));
              }
            }
          }
        );
        unsubscribes.push(unsub);
      }
    });
    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [columns]);

  return {
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
  };
}
