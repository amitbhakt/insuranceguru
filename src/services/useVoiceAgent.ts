import { useCallback, useEffect, useRef, useState } from "react";
import {
  createPolicyAnswer,
  openingMessages,
  type AgentState,
  type ConnectionStatus,
  type VoiceMessage,
  type VoiceMetrics,
} from "./voiceAgentService";

type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechEvent = { results: ArrayLike<SpeechResult> };
type SpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};
type BrowserSpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognition;
  webkitSpeechRecognition?: new () => SpeechRecognition;
};

const initialMetrics: VoiceMetrics = { ttfa: 1120, vadMs: 650, sttMs: 180, llmMs: 320, ttsMs: 210 };

export function useVoiceAgent() {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [messages, setMessages] = useState<VoiceMessage[]>(openingMessages);
  const [metrics, setMetrics] = useState<VoiceMetrics>(initialMetrics);
  const [muted, setMuted] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [turnCount, setTurnCount] = useState(1);
  const timers = useRef<number[]>([]);
  const recognition = useRef<SpeechRecognition | null>(null);
  const currentState = useRef<AgentState>("idle");
  const connection = useRef<ConnectionStatus>("disconnected");

  useEffect(() => {
    const speechWindow = window as BrowserSpeechWindow;
    setSpeechSupported(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    currentState.current = agentState;
  }, [agentState]);

  useEffect(() => {
    connection.current = status;
  }, [status]);

  useEffect(
    () => () => {
      timers.current.forEach(window.clearTimeout);
      recognition.current?.stop();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    },
    [],
  );

  const later = useCallback((callback: () => void, ms: number) => {
    const timer = window.setTimeout(callback, ms);
    timers.current.push(timer);
    return timer;
  }, []);

  const startRecognition = useCallback(() => {
    const speechWindow = window as BrowserSpeechWindow;
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition || muted) return;
    try {
      const activeRecognition = new Recognition();
      activeRecognition.lang = "en-IN";
      activeRecognition.interimResults = true;
      activeRecognition.maxAlternatives = 1;
      activeRecognition.onresult = (event) => {
        const result = event.results[event.results.length - 1];
        if (!result) return;
        const text = result[0].transcript.trim();
        if (result.isFinal && text) {
          setPartialTranscript("");
          sendTextMessage(text);
        } else if (text) {
          setPartialTranscript(text);
        }
      };
      activeRecognition.onerror = () => setPartialTranscript("");
      activeRecognition.onend = () => {
        if (connection.current === "connected" && !muted && currentState.current === "listening") {
          later(startRecognition, 250);
        }
      };
      recognition.current = activeRecognition;
      activeRecognition.start();
    } catch {
      setSpeechSupported(false);
    }
  }, [later, muted]);

  const startCall = useCallback(() => {
    if (connection.current === "connected" || connection.current === "connecting") return;
    setStatus("connecting");
    later(() => {
      setStatus("connected");
      setAgentState("listening");
      if (speechSupported) startRecognition();
    }, 700);
  }, [later, speechSupported, startRecognition]);

  const endCall = useCallback(() => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    recognition.current?.stop();
    recognition.current = null;
    window.speechSynthesis?.cancel();
    setPartialTranscript("");
    setStatus("disconnected");
    setAgentState("idle");
    setMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((wasMuted) => {
      const nextMuted = !wasMuted;
      if (nextMuted) {
        recognition.current?.stop();
        setPartialTranscript("");
      } else if (connection.current === "connected") {
        later(startRecognition, 100);
      }
      return nextMuted;
    });
  }, [later, startRecognition]);

  const sendTextMessage = useCallback(
    (rawText: string) => {
      const text = rawText.trim();
      if (!text) return;
      if (currentState.current === "speaking") {
        window.speechSynthesis?.cancel();
        setMessages((current) => {
          const lastAgentIndex = current.findLastIndex((message) => message.role === "agent");
          return current.map((message, index) =>
            index === lastAgentIndex ? { ...message, isInterrupted: true } : message,
          );
        });
        setAgentState("interrupted");
      }

      const now = new Date();
      setMessages((current) => [
        ...current.filter((message) => !message.isPartial),
        { id: crypto.randomUUID(), role: "user", text, timestamp: now },
      ]);
      setPartialTranscript("");
      setTurnCount((count) => count + 1);
      setMetrics({
        ttfa: 870 + Math.round(Math.random() * 620),
        vadMs: 550 + Math.round(Math.random() * 220),
        sttMs: 140 + Math.round(Math.random() * 100),
        llmMs: 250 + Math.round(Math.random() * 180),
        ttsMs: 160 + Math.round(Math.random() * 110),
      });
      setAgentState("thinking");

      later(() => {
        const answer = createPolicyAnswer(text);
        setMessages((current) => [
          ...current,
          { id: crypto.randomUUID(), role: "agent", text: answer, timestamp: new Date() },
        ]);
        setAgentState("speaking");

        const finishSpeaking = () => {
          setAgentState(connection.current === "connected" ? "listening" : "idle");
        };
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          const utterance = new SpeechSynthesisUtterance(answer);
          utterance.lang = "en-IN";
          utterance.onend = finishSpeaking;
          utterance.onerror = finishSpeaking;
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
          later(finishSpeaking, Math.max(2500, answer.length * 65));
        } else {
          later(finishSpeaking, 2800);
        }
      }, 760);
    },
    [later],
  );

  return {
    status,
    agentState,
    messages,
    metrics,
    muted,
    speechSupported,
    partialTranscript,
    turnCount,
    startCall,
    endCall,
    toggleMute,
    sendTextMessage,
  };
}