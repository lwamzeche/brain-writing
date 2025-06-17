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
  const [timeLeft, setTimeLeft] = useState(300);
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

      // gather columns for previous rounds
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

      // current round
      chain.push({
        round: roundNumber,
        participant: name,
        ideas: ["", "", ""],
        isEditable: true,
      });

      setColumns(chain);
      setFlipStates(
        chain.map(
          (col) =>
            col.isEditable
              ? [false, false, false] // editable cards: text-side up
              : [true, true, true] // others’ cards: image-side up
        )
      );
    }
    fetchChain();
  }, [isHost, participants, roundNumber, name]);

  // 3. Keep columnsRef in sync
  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);

  // 4. scroll into view for the current (editable) column
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

  // 5. toggleFlip function
  const toggleFlip = useCallback(
    (colIndex, cardIndex) => {
      setFlipStates((prev) => {
        const newArr = [...prev];
        newArr[colIndex] = [...newArr[colIndex]];
        const newFlipState = !newArr[colIndex][cardIndex];
        newArr[colIndex][cardIndex] = newFlipState;

        if (columns[colIndex].ideas[cardIndex].trim() !== "") {
          const key = `${columns[colIndex].participant}-${columns[colIndex].round}-${cardIndex}`;

          if (!cardImages[key]) {
            const sessionId =
              localStorage.getItem("brainwritingSessionId") || "";
            const isViewOnlyCard = !columns[colIndex].isEditable;

            if (isViewOnlyCard) {
              setCardImages((prevImages) => ({
                ...prevImages,
                [key]: "loading",
              }));

              const docId = `${sessionId}_${columns[colIndex].participant}_round_${columns[colIndex].round}`;
              getDoc(doc(db, "brainwritingRounds", docId))
                .then((docSnap) => {
                  if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.cardImages && data.cardImages[cardIndex]) {
                      setCardImages((prevImages) => ({
                        ...prevImages,
                        [key]: data.cardImages[cardIndex],
                      }));
                      return; 
                    }
                  }

                  generateImageForCard(key, columns[colIndex].ideas[cardIndex]);
                })
                .catch((err) => {
                  console.error("Error checking for existing image:", err);
                  generateImageForCard(key, columns[colIndex].ideas[cardIndex]);
                });
            } else {
              // It's the user's own editable card, generate image directly
              setCardImages((prevImages) => ({
                ...prevImages,
                [key]: "loading",
              }));
              generateImageForCard(key, columns[colIndex].ideas[cardIndex]);
            }
          }
        }
        return newArr;
      });
    },
    [columns, cardImages]
  );

  // Helper function to generate images
  const generateImageForCard = useCallback((key, ideaText) => {
    const prompt = `A clear, high-quality illustration visually representing "${ideaText}", do not write text or any lettering, use only pure visual elements.`;
    generateImage(prompt)
      .then((imageUrl) => {
        setCardImages((prevImages) => ({
          ...prevImages,
          [key]: imageUrl,
        }));
      })
      .catch((err) => {
        console.error("Error generating image:", err);
        setCardImages((prevImages) => ({
          ...prevImages,
          [key]: "",
        }));
      });
  }, []);

  useEffect(() => {
    const sessionId = localStorage.getItem("brainwritingSessionId") || "";
    if (!sessionId) return;

    columns.forEach((col) => {
      if (col.isEditable) return;

      col.ideas.forEach((ideaText, cardIndex) => {
        if (!ideaText.trim()) return;

        const key = `${col.participant}-${col.round}-${cardIndex}`;
        // already have it?
        if (cardImages[key]) return;

        // mark it as loading in state
        setCardImages((prev) => ({ ...prev, [key]: "loading" }));

        // reference to this round’s Firestore doc
        const docRef = doc(
          db,
          "brainwritingRounds",
          `${sessionId}_${col.participant}_round_${col.round}`
        );

        // look in Firestore first
        getDoc(docRef)
          .then((snap) => {
            const existingUrl =
              snap.exists() && snap.data().cardImages?.[cardIndex];
            if (existingUrl) {
              // use the saved image
              setCardImages((prev) => ({ ...prev, [key]: existingUrl }));
            } else {
              // none in Firestore ⇒ generate & persist
              const prompt = `A clear, high-quality illustration visually representing "${ideaText}", with no text or lettering—only pure visual elements.`;
              generateImage(prompt)
                .then((url) => {
                  // update React state
                  setCardImages((prev) => ({ ...prev, [key]: url }));
                  // merge into Firestore doc
                  return updateDoc(docRef, {
                    [`cardImages.${cardIndex}`]: url,
                  });
                })
                .catch((err) =>
                  console.error("DALL·E generation failed:", err)
                );
            }
          })
          .catch((err) => {
            // Firestore read failed ⇒ still generate & persist
            console.error("Error reading Firestore:", err);
            const prompt = `A clear, high-quality illustration visually representing "${ideaText}", with no text or lettering—only pure visual elements.`;
            generateImage(prompt)
              .then((url) => {
                setCardImages((prev) => ({ ...prev, [key]: url }));
                return updateDoc(docRef, {
                  [`cardImages.${cardIndex}`]: url,
                });
              })
              .catch((err) => console.error("DALL·E generation failed:", err));
          });
      });
    });
  }, [columns, cardImages, generateImageForCard]);

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
      if (!currentColumns.length) return;
      const lastCol = currentColumns[currentColumns.length - 1];
      const { participant, round, ideas } = lastCol;

      const sessionId = localStorage.getItem("brainwritingSessionId");
      if (!sessionId) return;
      const docId = `${sessionId}_${participant}_round_${round}`;
      const docRef = doc(db, "brainwritingRounds", docId);

      const ideasToSave = ideas.map((i) => i.trim() || "(No idea)");
      await setDoc(docRef, {
        participant,
        round,
        ideas: ideasToSave,
       
        cardImages: {},
        timestamp: new Date().toISOString(),
      });

      ideasToSave.forEach((ideaText, idx) => {
        const prompt =
          `A clear, high-quality illustration visually representing ` +
          `"${ideaText}", with no text or lettering—only pure visuals.`;

        generateImage(prompt)
          .then((url) =>
            updateDoc(docRef, { [`cardImages.${idx}`]: url })
          )
          .catch((err) => {
            console.error("Image gen failed for last round:", err);
            return updateDoc(docRef, { [`cardImages.${idx}`]: "" });
          });
      });

      setFinished(true);

      if (timeLeft === 0) {
        await navigateToNextRound();
      }
    } catch (error) {
      console.error("Error saving round data:", error);
      alert("There was an error saving your ideas. Please try again.");
      setFinished(false);
      setSubmitted(false);
    }
  }, [isHost, timeLeft, navigateToNextRound]);

  // 7. Timer for participants
  useEffect(() => {
    if (isHost || !roundStartTime) return;
    const intervalId = setInterval(() => {
      const now = new Date();
      const elapsed = (now - roundStartTime) / 1000;
      const newTimeLeft = Math.max(300 - Math.floor(elapsed), 0);
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

  // 8. Trigger finish
  const triggerFinish = async () => {
    if (finished || submitted || isHost) return;
    setSubmitted(true);
    setFlipStates((prev) => prev.map((col) => col.map(() => false)));
    await saveCurrentRound();
  };

  const handleIdeaChange = (colIndex, cardIndex, newValue) => {
    setColumns((prev) => {
      const newCols = [...prev];
      const col = { ...newCols[colIndex] };
      const newIdeas = [...col.ideas];
      newIdeas[cardIndex] = newValue;
      col.ideas = newIdeas;
      newCols[colIndex] = col;

      // Immediately update Firestore
      if (col.isEditable && col.participant === name) {
        const sessionId = localStorage.getItem("brainwritingSessionId") || "";
        if (!sessionId) return newCols; // safeguard
        const docId = `${sessionId}_${col.participant}_round_${col.round}`;
        setDoc(
          doc(db, "brainwritingRounds", docId),
          {
            ideas: newIdeas.map((idea) =>
              idea.trim() === "" ? "(No idea)" : idea
            ),
            timestamp: new Date().toISOString(),
          },
          { merge: true }
        ).catch((error) => {
          console.error("Error saving idea in real time:", error);
        });
      }

      return newCols;
    });
  };



  useEffect(() => {
    const sessionId = localStorage.getItem("brainwritingSessionId") || "";
    if (!sessionId) return;
    const unsubscribes = [];

    for (let k = 1; k < roundNumber; k++) {
      const writer = columns.find((c) => c.round === k);
      if (!writer || writer.isEditable) continue;
      const docId = `${sessionId}_${writer.participant}_round_${k}`;
      const unsub = onSnapshot(doc(db, "brainwritingRounds", docId), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        setColumns((prev) => {
          // find the same column
          const idx = prev.findIndex(
            (c) => c.round === k && c.participant === writer.participant
          );
          if (idx === -1) return prev;
          const oldIdeas = prev[idx].ideas;
          const newIdeas = data.ideas || oldIdeas;
          // only update if changed
          if (JSON.stringify(oldIdeas) === JSON.stringify(newIdeas)) {
            return prev;
          }
          const next = [...prev];
          next[idx] = { ...next[idx], ideas: newIdeas };
          return next;
        });
      });
      unsubscribes.push(unsub);
    }
    return () => unsubscribes.forEach((u) => u());
  }, [roundNumber]);

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
