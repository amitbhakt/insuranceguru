import { useCallback, useEffect, useRef, useState } from "react";
import {
  openingMessages,
  type AgentState,
  type ConnectionStatus,
  type PolicyInfo,
  type VoiceMessage,
  type VoiceMetrics,
} from "./voiceAgentService";

export function useVoiceAgent() {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [metrics, setMetrics] = useState<VoiceMetrics | null>(null);
  const [muted, setMuted] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [turnCount, setTurnCount] = useState(0);

  // Policy & warm-up states
  const [isWarmingUp, setIsWarmingUp] = useState(false);
  const [warmupMessage, setWarmupMessage] = useState("");
  const [activePolicy, setActivePolicy] = useState<PolicyInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Client-supplied Sarvam AI BYOK (Bring Your Own Key)
  const [apiKey, setApiKeyState] = useState<string>("");
  const apiKeyRef = useRef<string>("");

  useEffect(() => {
    apiKeyRef.current = apiKey;
  }, [apiKey]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("sarvam_api_key");
      if (stored) {
        setApiKeyState(stored);
        apiKeyRef.current = stored;
      }
      const storedHangover = localStorage.getItem("vad_silence_hangover_ms");
      if (storedHangover) {
        const val = parseInt(storedHangover, 10);
        if (!isNaN(val) && val >= 400 && val <= 1200) {
          setSilenceHangoverState([val]);
          silenceHangoverRef.current = val;
        }
      }
      const storedBarge = localStorage.getItem("vad_barge_in_ms");
      if (storedBarge) {
        const val = parseInt(storedBarge, 10);
        if (!isNaN(val) && val >= 150 && val <= 600) {
          setBargeSensitivityState([val]);
          bargeSensitivityRef.current = val;
        }
      }
    }
  }, []);

  const setApiKey = useCallback((newKey: string) => {
    const trimmed = newKey.trim();
    setApiKeyState(trimmed);
    apiKeyRef.current = trimmed;
    if (typeof window !== "undefined") {
      if (trimmed) {
        localStorage.setItem("sarvam_api_key", trimmed);
      } else {
        localStorage.removeItem("sarvam_api_key");
      }
    }
  }, []);

  // VAD Threshold states & dynamic WebSocket push
  const [silenceHangover, setSilenceHangoverState] = useState<number[]>([650]);
  const [bargeSensitivity, setBargeSensitivityState] = useState<number[]>([300]);
  const silenceHangoverRef = useRef(650);
  const bargeSensitivityRef = useRef(300);

  const setSilenceHangover = useCallback((val: number[]) => {
    setSilenceHangoverState(val);
    const ms = val[0];
    silenceHangoverRef.current = ms;
    if (typeof window !== "undefined") {
      localStorage.setItem("vad_silence_hangover_ms", String(ms));
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "update_config",
          silence_hangover_ms: ms,
          barge_in_ms: bargeSensitivityRef.current,
        }),
      );
    }
  }, []);

  const setBargeSensitivity = useCallback((val: number[]) => {
    setBargeSensitivityState(val);
    const ms = val[0];
    bargeSensitivityRef.current = ms;
    if (typeof window !== "undefined") {
      localStorage.setItem("vad_barge_in_ms", String(ms));
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "update_config",
          silence_hangover_ms: silenceHangoverRef.current,
          barge_in_ms: ms,
        }),
      );
    }
  }, []);

  const pendingQueryRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const isMutedRef = useRef(false);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextStartTimeRef = useRef(0);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isProcessingQueueRef = useRef(false);

  useEffect(() => {
    isMutedRef.current = muted;
  }, [muted]);

  const fetchCurrentPolicy = useCallback(async (): Promise<PolicyInfo | null> => {
    try {
      const port = window.location.port !== "8000" ? "8000" : window.location.port;
      const res = await fetch(`http://${window.location.hostname}:${port}/api/policy/current`);
      if (res.ok) {
        const data = await res.json();
        setActivePolicy(data);
        return data;
      }
    } catch (e) {
      console.warn("Could not fetch policy:", e);
    }
    return null;
  }, []);

  const resetPolicy = useCallback(async () => {
    pendingQueryRef.current = null;
    setMessages([]);
    setTurnCount(0);
    setMetrics(null);
    setPartialTranscript("");
    try {
      const port = window.location.port !== "8000" ? "8000" : window.location.port;
      await fetch(`http://${window.location.hostname}:${port}/api/policy/reset`, {
        method: "POST",
      });
      await fetchCurrentPolicy();
    } catch (e) {
      console.warn("Could not reset policy:", e);
    }
  }, [fetchCurrentPolicy]);

  const loadSamplePolicy = useCallback(async (): Promise<{ success: boolean; filename?: string; error?: string }> => {
    pendingQueryRef.current = null;
    setMessages([]);
    setTurnCount(0);
    setMetrics(null);
    setPartialTranscript("");
    try {
      const port = window.location.port !== "8000" ? "8000" : window.location.port;
      const res = await fetch(`http://${window.location.hostname}:${port}/api/policy/sample`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.status === "success") {
        await fetchCurrentPolicy();
        return { success: true, filename: data.filename };
      }
      return { success: false, error: data.message || "Failed to load sample policy." };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : "Load sample policy error." };
    }
  }, [fetchCurrentPolicy]);

  const uploadPolicyPdf = useCallback(
    async (file: File): Promise<{ success: boolean; filename?: string; error?: string }> => {
      pendingQueryRef.current = null;
      setMessages([]);
      setTurnCount(0);
      setMetrics(null);
      setPartialTranscript("");
      try {
        const formData = new FormData();
        formData.append("file", file);
        const currentKey = apiKeyRef.current;
        const headers: Record<string, string> = {};
        if (currentKey) {
          headers["x-sarvam-api-key"] = currentKey;
        }
        const port = window.location.port !== "8000" ? "8000" : window.location.port;
        const res = await fetch(`http://${window.location.hostname}:${port}/api/policy/upload`, {
          method: "POST",
          headers: Object.keys(headers).length > 0 ? headers : undefined,
          body: formData,
        });
        const data = await res.json();
        if (data.status === "success") {
          await fetchCurrentPolicy();
          return { success: true, filename: data.filename };
        }
        return { success: false, error: data.message || "Upload failed." };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : "Upload error." };
      }
    },
    [fetchCurrentPolicy],
  );

  useEffect(() => {
    // When the user loads or refreshes the page, clear any previous uploaded file and reset to default
    resetPolicy();
  }, [resetPolicy]);

  // Clean stop and flush of playing audio
  const stopAllAudio = useCallback(() => {
    audioQueueRef.current = [];
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop(0);
      } catch (e) {
        // Source already ended or stopped
      }
    });
    activeSourcesRef.current = [];
    if (audioContextRef.current) {
      nextStartTimeRef.current = audioContextRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
  }, []);

  // Jitter-free sequential audio queue processor
  const processAudioQueue = useCallback(async () => {
    if (isProcessingQueueRef.current || !audioContextRef.current) return;
    isProcessingQueueRef.current = true;

    try {
      while (audioQueueRef.current.length > 0 && audioContextRef.current) {
        const audioData = audioQueueRef.current.shift();
        if (!audioData) continue;

        try {
          const audioBuffer = await audioContextRef.current.decodeAudioData(audioData.slice(0));
          const sourceNode = audioContextRef.current.createBufferSource();
          sourceNode.buffer = audioBuffer;
          sourceNode.connect(audioContextRef.current.destination);

          const currentTime = audioContextRef.current.currentTime;
          // Smooth jitter buffer cushion: if queue is caught up, schedule with a tiny 40ms lead
          const startTime = Math.max(currentTime + 0.04, nextStartTimeRef.current);
          sourceNode.start(startTime);
          nextStartTimeRef.current = startTime + audioBuffer.duration;

          activeSourcesRef.current.push(sourceNode);
          sourceNode.onended = () => {
            const index = activeSourcesRef.current.indexOf(sourceNode);
            if (index > -1) {
              activeSourcesRef.current.splice(index, 1);
            }
            if (activeSourcesRef.current.length === 0 && audioQueueRef.current.length === 0) {
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: "playback_ended" }));
              }
            }
          };
        } catch (decodeErr) {
          console.warn("Error decoding audio buffer:", decodeErr);
        }
      }
    } finally {
      isProcessingQueueRef.current = false;
    }
  }, []);

  const queueAudioChunk = useCallback(
    (audioData: ArrayBuffer) => {
      audioQueueRef.current.push(audioData);
      processAudioQueue();
    },
    [processAudioQueue],
  );

  const clearError = useCallback(() => setErrorMessage(null), []);

  const startCall = useCallback(async (initialTextMessage?: string) => {
    if (status === "connected" || status === "connecting") return;

    setErrorMessage(null);
    if (initialTextMessage) {
      pendingQueryRef.current = initialTextMessage;
    }

    // Reset previous conversation history and traces if starting fresh
    if (!initialTextMessage) {
      setMessages([]);
      setTurnCount(0);
      setMetrics(null);
    }
    setPartialTranscript("");
    stopAllAudio();

    setStatus("connecting");
    setIsWarmingUp(true);
    setWarmupMessage("Preparing microphone and audio processor...");

    try {
      // 1. Initialize AudioContext inside user gesture
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      audioContextRef.current = audioCtx;

      // 2. Load AudioWorklet for 16kHz downsampling
      await audioCtx.audioWorklet.addModule("/audio-processor.js");

      // 3. Capture mic audio
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const sourceNode = audioCtx.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioCtx, "audio-processor");
      workletNodeRef.current = workletNode;

      // 4. Connect WebSocket
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host =
        window.location.port !== "8000"
          ? `${window.location.hostname}:8000`
          : window.location.host;
      const currentKey = apiKeyRef.current;
      const queryParams = currentKey ? `?api_key=${encodeURIComponent(currentKey)}` : "";
      const wsUrl = `${protocol}//${host}/ws/audio${queryParams}`;

      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (ws.readyState === WebSocket.OPEN && !isMutedRef.current) {
          ws.send(event.data);
        }
      };

      sourceNode.connect(workletNode);
      // Route through a zero-gain muteSink to audioCtx.destination so browser audio engine never pauses the worklet
      const muteSink = audioCtx.createGain();
      muteSink.gain.setValueAtTime(0, audioCtx.currentTime);
      workletNode.connect(muteSink);
      muteSink.connect(audioCtx.destination);

      ws.onopen = () => {
        setStatus("connected");
        setWarmupMessage("Connecting to Sarvam AI & indexing policy...");
        const initialQuery = pendingQueryRef.current;
        pendingQueryRef.current = null;
        const payload: Record<string, unknown> = {
          type: "start_session",
          silence_hangover_ms: silenceHangoverRef.current,
          barge_in_ms: bargeSensitivityRef.current,
          ...(currentKey ? { api_key: currentKey } : {}),
        };
        if (initialQuery) {
          payload.initial_query = initialQuery;
          setMessages((prev) => [
            ...prev,
            {
              id: `user-${Date.now()}`,
              role: "user",
              text: initialQuery,
              timestamp: new Date(),
            },
          ]);
          setTurnCount((c) => c + 1);
        }
        ws.send(JSON.stringify(payload));
      };

      ws.onmessage = async (event: MessageEvent) => {
        if (event.data instanceof ArrayBuffer) {
          // Incoming synthesized audio chunk from TTS
          setIsWarmingUp(false);
          await queueAudioChunk(event.data);
          return;
        }

        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case "status_update":
              if (data.status === "warming_up") {
                setIsWarmingUp(true);
                setWarmupMessage(data.message || "Analyzing policy document...");
              } else if (data.status === "ready") {
                setIsWarmingUp(false);
                setWarmupMessage("");
              }
              break;

            case "state_change":
              setAgentState(data.state as AgentState);
              if (data.state === "speaking" || data.state === "thinking") {
                setIsWarmingUp(false);
                setPartialTranscript("");
              }
              break;

            case "partial_transcript":
              setPartialTranscript(data.text);
              break;

            case "final_transcript":
              setPartialTranscript("");
              if (data.text?.trim()) {
                const cleanText = data.text.trim();
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (
                    last &&
                    last.role === "user" &&
                    last.text.trim().toLowerCase() === cleanText.toLowerCase()
                  ) {
                    return prev;
                  }
                  return [
                    ...prev,
                    {
                      id: `user-${Date.now()}`,
                      role: "user",
                      text: cleanText,
                      timestamp: new Date(),
                    },
                  ];
                });
                setTurnCount((c) => c + 1);
              }
              break;

            case "agent_chunk":
              setIsWarmingUp(false);
              setPartialTranscript("");
              if (data.text?.trim()) {
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last && last.role === "agent" && !last.isInterrupted) {
                    return [
                      ...prev.slice(0, -1),
                      { ...last, text: `${last.text} ${data.text.trim()}` },
                    ];
                  }
                  return [
                    ...prev,
                    {
                      id: `agent-${Date.now()}`,
                      role: "agent",
                      text: data.text.trim(),
                      timestamp: new Date(),
                    },
                  ];
                });
              }
              break;

            case "interrupt":
              stopAllAudio();
              setPartialTranscript("");
              setAgentState("interrupted");
              setMessages((prev) => {
                const lastAgentIndex = prev.findLastIndex((m) => m.role === "agent");
                if (lastAgentIndex !== -1) {
                  return prev.map((m, i) =>
                    i === lastAgentIndex ? { ...m, isInterrupted: true } : m,
                  );
                }
                return prev;
              });
              break;

            case "latency_metrics":
              setMetrics({
                ttfa: data.ttfa,
                vadMs: data.vadMs,
                sttMs: data.sttMs,
                llmMs: data.llmMs,
                ttsMs: data.ttsMs,
              });
              setTurnCount((prev) => prev + 1);
              break;

            case "call_ended":
              stopAllAudio();
              setIsWarmingUp(false);
              setWarmupMessage("");
              setPartialTranscript("");
              setStatus("disconnected");
              setAgentState("idle");
              if (workletNodeRef.current) {
                workletNodeRef.current.disconnect();
                workletNodeRef.current = null;
              }
              if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach((track) => track.stop());
                mediaStreamRef.current = null;
              }
              if (audioContextRef.current && audioContextRef.current.state !== "closed") {
                audioContextRef.current.close().catch(() => {});
                audioContextRef.current = null;
              }
              break;

            case "error":
              console.error("Backend voice error:", data.message);
              setIsWarmingUp(false);
              setPartialTranscript("");
              setErrorMessage(data.message || "An error occurred while processing the turn.");
              break;
          }
        } catch (e) {
          console.error("Error parsing WebSocket JSON:", e);
        }
      };

      ws.onerror = (e) => {
        console.error("WebSocket connection error:", e);
        setStatus("error");
        setIsWarmingUp(false);
        setPartialTranscript("");
        setErrorMessage("Could not connect to the voice assistant server. Please check your network connection.");
      };

      ws.onclose = () => {
        setStatus("disconnected");
        setAgentState("idle");
        setIsWarmingUp(false);
        setPartialTranscript("");
      };
    } catch (err: unknown) {
      console.error("Failed to start voice call:", err);
      setStatus("error");
      setIsWarmingUp(false);
      let userFriendlyMsg = "Failed to start voice session.";
      if (err instanceof Error) {
        if (err.name === "NotAllowedError" || err.message.includes("Permission denied")) {
          userFriendlyMsg = "Microphone access was denied. Please allow microphone permissions in your browser to speak with the agent.";
        } else if (err.name === "NotFoundError" || err.message.includes("device not found")) {
          userFriendlyMsg = "No microphone was found on your device. Please connect an audio input device.";
        } else {
          userFriendlyMsg = err.message;
        }
      }
      setErrorMessage(userFriendlyMsg);
    }
  }, [queueAudioChunk, status, stopAllAudio]);

  const endCall = useCallback(() => {
    stopAllAudio();
    setIsWarmingUp(false);
    setWarmupMessage("");

    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setPartialTranscript("");
    setStatus("disconnected");
    setAgentState("idle");
    setMuted(false);
  }, [stopAllAudio]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => !prev);
  }, []);

  const sendTextMessage = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text) return;
      if (!activePolicy?.is_custom) {
        return;
      }
      setErrorMessage(null);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        setMessages((prev) => [
          ...prev,
          {
            id: `user-${Date.now()}`,
            role: "user",
            text,
            timestamp: new Date(),
          },
        ]);
        setTurnCount((c) => c + 1);
        wsRef.current.send(JSON.stringify({ type: "text_input", text }));
      } else {
        // Automatically start the voice session with this initial query!
        await startCall(text);
      }
    },
    [activePolicy?.is_custom, startCall],
  );

  const clearPendingQuery = useCallback(() => {
    pendingQueryRef.current = null;
  }, []);

  const updateConfig = useCallback((silenceHangoverMs: number, bargeInMs: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "update_config",
          silence_hangover_ms: silenceHangoverMs,
          barge_in_ms: bargeInMs,
        }),
      );
    }
  }, []);

  return {
    status,
    agentState,
    messages,
    metrics,
    muted,
    speechSupported,
    partialTranscript,
    turnCount,
    isWarmingUp,
    warmupMessage,
    activePolicy,
    errorMessage,
    apiKey,
    setApiKey,
    silenceHangover,
    setSilenceHangover,
    bargeSensitivity,
    setBargeSensitivity,
    clearError,
    fetchCurrentPolicy,
    uploadPolicyPdf,
    resetPolicy,
    loadSamplePolicy,
    startCall,
    endCall,
    toggleMute,
    sendTextMessage,
    clearPendingQuery,
    updateConfig,
  };
}