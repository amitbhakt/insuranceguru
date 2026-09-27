import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertCircle,
  AudioLines,
  BadgeCheck,
  Check,
  ChevronDown,
  Clock3,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  FileUp,
  Headphones,
  HeartPulse,
  Info,
  KeyRound,
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Send,
  Settings2,
  ShieldCheck,
  Sparkle,
  Volume2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { formatMessageTime, type AgentState, type VoiceMetrics, type VoiceMessage, type PolicyInfo } from "@/services/voiceAgentService";
import { useVoiceAgent } from "@/services/useVoiceAgent";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Arogya Shield Voice Assistant" },
      { name: "description", content: "Arogya Shield’s voice assistant for health cover questions." },
      { property: "og:title", content: "Arogya Shield Voice Assistant" },
      { property: "og:description", content: "An interactive voice console for health-cover questions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VoiceConsole,
});

function VoiceConsole() {
  const {
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
    uploadPolicyPdf,
    resetPolicy,
    loadSamplePolicy,
    startCall,
    endCall,
    toggleMute,
    sendTextMessage,
    clearPendingQuery,
  } = useVoiceAgent();
  const [showSettings, setShowSettings] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [showUploadPrompt, setShowUploadPrompt] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [showMetrics, setShowMetrics] = useState(true);
  const [query, setQuery] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const transcriptEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, partialTranscript]);

  useEffect(() => {
    if (status !== "connected") return;
    const timer = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const text = query.trim();
      if (!text) return;
      if (!activePolicy?.is_custom) {
        setQuery("");
        clearPendingQuery();
        setShowUploadPrompt(true);
        return;
      }
      sendTextMessage(text);
      setQuery("");
    },
    [activePolicy?.is_custom, clearPendingQuery, query, sendTextMessage],
  );

  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMessage(null);
    clearPendingQuery();
    const result = await uploadPolicyPdf(file);
    setUploading(false);
    setShowUploadPrompt(false);
    if (result.success) {
      setUploadMessage(`Policy loaded: ${result.filename}`);
      setTimeout(() => setUploadMessage(null), 5000);
    } else {
      setUploadMessage(`Upload error: ${result.error}`);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleLoadSample = async () => {
    setLoadingSample(true);
    setUploadMessage(null);
    clearPendingQuery();
    const result = await loadSamplePolicy();
    setLoadingSample(false);
    setShowUploadPrompt(false);
    if (result.success) {
      setUploadMessage(`Sample loaded: ${result.filename}`);
      setTimeout(() => setUploadMessage(null), 5000);
    } else {
      setUploadMessage(`Error loading sample: ${result.error}`);
    }
  };

  const handleCall = () => {
    if (status === "connected" || status === "connecting") {
      endCall();
      return;
    }
    if (!activePolicy?.is_custom) {
      setQuery("");
      clearPendingQuery();
      setShowUploadPrompt(true);
      return;
    }
    setElapsedSeconds(0);
    startCall();
  };

  return (
    <main className="min-h-screen bg-background font-body text-foreground antialiased">
      <div className="mx-auto max-w-6xl px-5 pb-14 pt-5 sm:px-8 sm:pt-7">
        <header className="flex items-center justify-between gap-3">
          <a href="#home" className="flex min-w-0 items-center gap-3" aria-label="Arogya Shield home">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand text-primary-foreground shadow-[0_4px_0_var(--color-brand-shadow)]">
              <HeartPulse className="size-6" strokeWidth={2.4} />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-[19px] font-semibold leading-none">Arogya Shield</span>
              <span className="mt-1 block text-xs font-medium text-muted-foreground">Voice AI · Sales &amp; Policy</span>
            </span>
          </a>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <ConnectionBadge status={status} />
            <Button
              variant="outline"
              size="icon"
              className="size-10 rounded-full border-2 bg-card shadow-none"
              aria-label="Open settings"
              title="Audio settings"
              onClick={() => setShowSettings(true)}
            >
              <Settings2 className="size-4" />
            </Button>
          </div>
        </header>

        <section id="home" className="grid items-center gap-8 pb-8 pt-10 md:grid-cols-[1.04fr_0.96fr] md:gap-3 md:pb-10 md:pt-12">
          <div className="order-2 min-w-0 md:order-1">
            <div className="inline-flex min-h-8 items-center gap-2 rounded-full bg-sunshine px-3.5 py-1 text-xs font-bold text-ink sm:text-sm">
              <span className={`size-2.5 rounded-full ${status === "connecting" ? "bg-warning connection-pulse" : status === "connected" ? "bg-success" : "bg-brand"}`} />
              {status === "connecting"
                ? isWarmingUp
                  ? "Warming up with policy…"
                  : "Connecting to voice preview"
                : status === "connected"
                  ? `Call in progress · ${formatDuration(elapsedSeconds)}`
                  : "Ready for a conversation"}
            </div>

            {isWarmingUp && (
              <div className="mt-3 flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 text-xs font-bold text-amber-700 animate-pulse sm:text-sm">
                <Loader2 className="size-4 animate-spin text-amber-600 shrink-0" />
                <span>{warmupMessage || "Analyzing policy document & warming up AI..."}</span>
              </div>
            )}

            {uploadMessage && (
              <div className="mt-3 flex items-center gap-2 rounded-full border border-mint/40 bg-mint/15 px-3.5 py-1.5 text-xs font-bold text-ink sm:text-sm">
                <Check className="size-4 text-mint shrink-0" />
                <span>{uploadMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-xs font-semibold text-destructive animate-in fade-in">
                <div className="flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0 text-destructive" />
                  <span>{errorMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={clearError}
                  className="rounded-full p-1 hover:bg-destructive/20 text-destructive"
                  title="Dismiss error"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}

            <h1 className="mt-5 max-w-xl font-display text-5xl font-bold leading-[0.99] text-balance sm:text-6xl">
              Health cover,<br className="hidden sm:block" /> made <span className="text-brand">easier to understand.</span>
            </h1>
            <p className="mt-4 max-w-md text-base font-medium leading-relaxed text-muted-foreground sm:text-lg">
              Have a question about benefits, premiums or claims? Let’s talk it through.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {status === "connected" ? (
                <Button
                  size="lg"
                  onClick={handleCall}
                  className="group relative h-12 rounded-full border-2 border-red-400 bg-red-600 px-6 font-display text-sm font-bold text-white shadow-[0_4px_16px_rgba(220,38,38,0.45)] ring-4 ring-red-500/25 transition-all hover:bg-red-700 hover:shadow-[0_6px_22px_rgba(220,38,38,0.6)] active:scale-[0.98]"
                  title="Hang up and disconnect call"
                >
                  <span className="relative flex size-2.5 shrink-0">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-white" />
                  </span>
                  <PhoneOff className="size-4 shrink-0 transition-transform group-hover:rotate-12" strokeWidth={2.5} />
                  <span>End Conversation</span>
                  <span className="ml-1 rounded-full bg-red-800/60 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-red-100">
                    Disconnect
                  </span>
                </Button>
              ) : status === "connecting" ? (
                <Button
                  size="lg"
                  disabled
                  className="h-12 rounded-full border-2 border-amber-400 bg-amber-500 px-6 font-display text-sm font-bold text-white shadow-[0_4px_14px_rgba(245,158,11,0.35)] ring-4 ring-amber-500/20 transition-all"
                >
                  <Loader2 className="size-4 shrink-0 animate-spin text-white" />
                  <span>{isWarmingUp ? "Warming up Pooja AI…" : "Connecting voice call…"}</span>
                </Button>
              ) : (
                <Button
                  size="lg"
                  onClick={handleCall}
                  disabled={uploading}
                  className="group h-12 rounded-full border-2 border-emerald-500/30 bg-emerald-600 px-6 font-display text-sm font-bold text-white shadow-[0_4px_16px_rgba(16,185,129,0.35)] transition-all hover:-translate-y-0.5 hover:bg-emerald-500 hover:shadow-[0_6px_22px_rgba(16,185,129,0.5)] active:scale-[0.98]"
                  title="Start a real-time voice call with Pooja AI"
                >
                  <span className="grid size-6 place-items-center rounded-full bg-white/20 transition-transform group-hover:scale-110">
                    <Mic className="size-3.5 text-white" strokeWidth={2.5} />
                  </span>
                  <span>Start Conversation</span>
                  <span className="ml-1 rounded-full bg-emerald-800/40 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-100">
                    AI Voice
                  </span>
                </Button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md"
                className="hidden"
                onChange={handlePdfUpload}
              />
              <Button
                variant="outline"
                size="lg"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || status === "connected"}
                className="h-12 rounded-full border-2 bg-card px-5 text-sm font-bold shadow-none"
                title="Upload an insurance policy document (PDF, TXT, MD)"
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
                {uploading ? "Parsing PDF…" : activePolicy?.is_custom ? "Change Policy PDF" : "Upload Policy (PDF)"}
              </Button>

              <Button
                variant="outline"
                size="lg"
                onClick={() => setShowPolicy(true)}
                className="h-12 rounded-full border-2 bg-card px-5 text-sm font-bold shadow-none"
              >
                <FileText className="size-4" />
                View policy
              </Button>
            </div>

            {activePolicy?.is_custom ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 font-bold text-foreground">
                  <FileText className="size-3 text-brand" />
                  Active Document: {activePolicy.filename} ({activePolicy.char_count.toLocaleString()} chars)
                </span>
                <button
                  type="button"
                  onClick={resetPolicy}
                  className="inline-flex items-center gap-1 rounded-full text-xs font-bold text-destructive hover:underline"
                  title="Reset policy document"
                >
                  <X className="size-3" /> Remove Document
                </button>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-2.5">
                  <Info className="size-4 shrink-0 text-amber-600" />
                  <span>
                    <strong>Policy document required:</strong> Upload your policy PDF or load our sample to start conversing.
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full border-amber-500/40 bg-card text-xs font-bold text-foreground shadow-none hover:bg-amber-500/20"
                  onClick={handleLoadSample}
                  disabled={loadingSample}
                >
                  {loadingSample ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <FileText className="mr-1.5 size-3.5 text-brand" />}
                  {loadingSample ? "Extracting Sample PDF…" : "Load Star Health PDF"}
                </Button>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                {status === "connected" && !muted ? <Mic className="size-3.5 text-mint" /> : <MicOff className="size-3.5" />}
                {status === "connected" && !muted ? "Microphone active" : "Microphone off"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Volume2 className="size-3.5 text-grape" />
                Browser audio controls
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-mint" />
                No personal details needed
              </span>
            </div>
          </div>

          <div className="voice-orb relative order-1 mx-auto grid aspect-square w-full max-w-[350px] place-items-center md:order-2 md:max-w-[385px]" data-state={agentState}>
            <div className="voice-orb-ring absolute aspect-square w-[65%] rounded-full" aria-hidden="true" />
            <div className="voice-orb-ring voice-orb-ring-delay absolute aspect-square w-[65%] rounded-full" aria-hidden="true" />
            <div className="voice-orb-core relative grid aspect-square w-[55%] place-items-center rounded-full" aria-label={`Voice assistant state: ${agentState}`}>
              <div className="grid aspect-square w-[67%] place-items-center rounded-full bg-primary-foreground/15">
                <div className="voice-orb-bars flex h-14 items-end gap-1.5" aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((bar) => (
                    <span key={bar} className="h-14 w-2.5 rounded-full bg-primary-foreground" />
                  ))}
                </div>
              </div>
            </div>
            <span className="absolute right-[2%] top-[11%] inline-flex max-w-[52%] items-center gap-1.5 rounded-2xl bg-grape px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-md sm:right-0 sm:px-4">
              <Sparkle className="size-3.5 shrink-0" />
              <span className="truncate">{stateLabel(agentState)}</span>
            </span>
            <span className="absolute bottom-[8%] left-[-1%] inline-flex max-w-[66%] items-center gap-1.5 rounded-2xl bg-mint px-3.5 py-2 text-[11px] font-bold text-ink shadow-md sm:left-[-2%] sm:text-xs">
              <Headphones className="size-3.5 shrink-0" />
              <span className="truncate">{speechSupported ? "Browser voice available" : "Text and voice controls"}</span>
            </span>
          </div>
        </section>

        <section className="rounded-[1.7rem] border-2 border-border bg-card p-5 shadow-sm sm:rounded-[2rem] sm:p-7" aria-labelledby="conversation-heading">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="conversation-heading" className="font-display text-2xl font-semibold">Live conversation</h2>
              <p className="mt-1 text-xs font-medium text-muted-foreground">
                {status === "connected"
                  ? "Live session · transcript updates in real-time"
                  : messages.length > 0
                    ? "Conversation finished · start a new conversation anytime"
                    : "Real-time AI voice console · start conversation to begin"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[11px] font-bold text-foreground">
                {status === "connected" ? (
                  <>
                    <span className="size-1.5 rounded-full bg-success connection-pulse" />
                    Live session
                  </>
                ) : status === "connecting" ? (
                  <>
                    <Loader2 className="size-3 animate-spin text-warning" />
                    Connecting
                  </>
                ) : messages.length > 0 ? (
                  <>
                    <PhoneOff className="size-3 text-muted-foreground" />
                    Call ended
                  </>
                ) : (
                  <>
                    <Check className="size-3" />
                    Ready
                  </>
                )}
              </span>
              <Button
                variant="outline"
                size="icon"
                className={`size-9 rounded-full bg-card shadow-none ${showMetrics ? "border-mint/50 text-ink" : ""}`}
                aria-label={showMetrics ? "Hide voice metrics" : "Show voice metrics"}
                title="Toggle voice metrics"
                aria-pressed={showMetrics}
                onClick={() => setShowMetrics((visible) => !visible)}
              >
                <Activity className="size-4" />
              </Button>
            </div>
          </div>

          <div className="max-h-[360px] min-h-28 space-y-4 overflow-y-auto pr-1 sm:max-h-[390px]" aria-live="polite" aria-relevant="additions text">
            {messages.length === 0 && !partialTranscript && agentState !== "thinking" ? (
              <div className="rounded-2xl border border-dashed border-border/80 bg-muted/40 p-5 text-center sm:p-6">
                <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand/10 text-brand">
                  <Sparkle className="size-6" />
                </div>
                <h3 className="mt-3 font-display text-base font-semibold text-foreground">
                  What to Expect from Arogya Shield AI
                </h3>
                <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
                  Real-time conversational insurance agent grounded strictly in your active policy document. Ask questions on coverage, limits, waiting periods, claims, or upload any policy PDF to pitch tailored products.
                </p>

                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {[
                    "What are the sum insured options?",
                    "What is the waiting period for pre-existing diseases?",
                    "Is cosmetic surgery covered under the policy?",
                    "How do I file a cashless claim?",
                  ].map((promptText) => (
                    <button
                      key={promptText}
                      type="button"
                      onClick={() => {
                        if (!activePolicy?.is_custom) {
                          setShowUploadPrompt(true);
                          return;
                        }
                        if (status === "connected") {
                          sendTextMessage(promptText);
                        } else {
                          setQuery(promptText);
                        }
                      }}
                      className="rounded-full border border-border bg-background px-3 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:border-brand/40 hover:bg-accent"
                    >
                      {promptText}
                    </button>
                  ))}
                </div>

                {status !== "connected" && (
                  <p className="mt-4 text-[11px] font-medium text-muted-foreground">
                    Click <strong className="text-foreground">Start Conversation</strong> above or type a question to begin.
                  </p>
                )}
              </div>
            ) : (
              messages.map((message) => <TranscriptMessage key={message.id} message={message} />)
            )}
            {partialTranscript && (
              <TranscriptMessage
                message={{ id: "voice-partial", role: "user", text: partialTranscript, isPartial: true, timestamp: new Date() }}
              />
            )}
            {agentState === "thinking" && (
              <div className="flex items-start gap-3" aria-label="Assistant is thinking">
                <AssistantAvatar />
                <div className="flex min-h-10 items-center gap-1 rounded-2xl rounded-tl-sm bg-muted px-4">
                  <span className="size-1.5 animate-pulse rounded-full bg-brand" />
                  <span className="size-1.5 animate-pulse rounded-full bg-brand [animation-delay:150ms]" />
                  <span className="size-1.5 animate-pulse rounded-full bg-brand [animation-delay:300ms]" />
                  <span className="ml-1 text-xs font-semibold text-muted-foreground">Thinking</span>
                </div>
              </div>
            )}
            {status === "disconnected" && messages.length > 0 && (
              <div className="my-5 flex items-center gap-3 animate-in fade-in duration-300" role="status" aria-label="Conversation finished">
                <div className="h-px flex-1 bg-border/80" />
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/70 px-4 py-1.5 text-xs font-semibold text-muted-foreground shadow-xs">
                  <PhoneOff className="size-3.5 text-destructive" />
                  <span>Conversation finished · Call disconnected</span>
                </div>
                <div className="h-px flex-1 bg-border/80" />
              </div>
            )}
            <div ref={transcriptEnd} />
          </div>

          {showMetrics && <MetricsPanel metrics={metrics} turnCount={turnCount} duration={elapsedSeconds} />}

          {errorMessage && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-xs font-semibold text-destructive animate-in fade-in">
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0 text-destructive" />
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={clearError}
                className="rounded-full p-1 hover:bg-destructive/20 text-destructive"
                title="Dismiss error"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          <form
            onSubmit={onSubmit}
            className={`mt-5 flex items-center gap-2 rounded-full border-2 p-1.5 pl-4 transition-all ${
              activePolicy?.is_custom
                ? "border-input bg-background focus-within:border-brand"
                : "border-amber-500/40 bg-amber-500/5 focus-within:border-amber-500"
            }`}
          >
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => {
                if (!activePolicy?.is_custom) {
                  setShowUploadPrompt(true);
                }
              }}
              placeholder={
                activePolicy?.is_custom
                  ? "Ask about cover, waiting periods, limits, or claims…"
                  : "Upload an insurance policy document first to ask questions…"
              }
              aria-label="Type your policy question"
              className="h-10 min-w-0 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
            />
            {!activePolicy?.is_custom && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowUploadPrompt(true)}
                className="h-8 shrink-0 rounded-full border-amber-500/40 bg-amber-500/10 text-xs font-bold text-amber-900 hover:bg-amber-500/20 dark:text-amber-200"
              >
                <FileUp className="mr-1 size-3.5" /> Upload Document
              </Button>
            )}
            {status === "connected" && (
              <Button
                type="button"
                variant={muted ? "destructive" : "outline"}
                size="icon"
                onClick={toggleMute}
                className="size-10 shrink-0 rounded-full border-0 shadow-none"
                aria-label={muted ? "Unmute microphone" : "Mute microphone"}
                title={muted ? "Unmute microphone" : "Mute microphone"}
              >
                {muted ? <MicOff /> : <Mic />}
              </Button>
            )}
            <Button
              type="submit"
              size="icon"
              disabled={!query.trim() || !activePolicy?.is_custom}
              className={`size-10 shrink-0 rounded-full transition-colors ${
                !activePolicy?.is_custom
                  ? "cursor-not-allowed bg-muted text-muted-foreground opacity-50"
                  : "bg-brand text-primary-foreground hover:bg-brand/90"
              }`}
              aria-label="Send question"
              title={activePolicy?.is_custom ? "Send question" : "Upload policy document first"}
            >
              <Send className="size-4" />
            </Button>
          </form>

          <p className="mt-3 inline-flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3 shrink-0" />
            Local demo answers are general examples—not a quote, personalised advice or confirmation of cover. Refer to your issued policy.
          </p>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Call controls">
          <div className="flex min-h-[76px] items-center gap-3 rounded-2xl bg-grape px-4 py-4 text-primary-foreground sm:px-5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-foreground/15"><ShieldCheck className="size-5" /></span>
            <span className="min-w-0">
              <span className="block font-display text-2xl font-semibold leading-none">
                {metrics ? `${metrics.ttfa.toLocaleString()}` : "—"}
                {metrics && <span className="ml-1 text-xs font-semibold">ms</span>}
              </span>
              <span className="mt-1 block text-[11px] font-semibold text-primary-foreground/80">
                {metrics ? "First audio · this turn" : "First audio latency"}
              </span>
            </span>
          </div>
          <div className="flex min-h-[76px] items-center gap-3 rounded-2xl bg-sunshine px-4 py-4 text-ink sm:px-5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-foreground/10"><AudioLines className="size-5" /></span>
            <span className="min-w-0"><span className="block font-display text-2xl font-semibold leading-none">{turnCount.toString().padStart(2, "0")}</span><span className="mt-1 block text-[11px] font-semibold text-foreground/70">Conversation turns</span></span>
          </div>
          <div className="col-span-2 flex min-h-[76px] items-center gap-3 rounded-2xl bg-mint px-4 py-4 text-ink sm:col-span-1 sm:px-5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-foreground/10"><Clock3 className="size-5" /></span>
            <span className="min-w-0"><span className="block font-display text-2xl font-semibold leading-none">{formatDuration(elapsedSeconds)}</span><span className="mt-1 block text-[11px] font-semibold text-foreground/70">Session duration</span></span>
          </div>
        </section>

        <footer className="mt-7 flex flex-col items-center justify-center gap-2 text-center text-[11px] leading-relaxed text-muted-foreground sm:flex-row sm:gap-3">
          <span>Voice interaction depends on browser support and microphone permission.</span>
          <span className="hidden size-1 rounded-full bg-border sm:block" />
          <button className="font-semibold text-brand underline-offset-4 hover:underline" onClick={() => setShowPolicy(true)}>Policy information</button>
        </footer>
      </div>

      <SettingsDrawer
        open={showSettings}
        onOpenChange={setShowSettings}
        status={status}
        apiKey={apiKey}
        setApiKey={setApiKey}
        silenceHangover={silenceHangover}
        setSilenceHangover={setSilenceHangover}
        bargeSensitivity={bargeSensitivity}
        setBargeSensitivity={setBargeSensitivity}
        autoSpeak={autoSpeak}
        setAutoSpeak={setAutoSpeak}
      />
      <PolicyDialog open={showPolicy} onOpenChange={setShowPolicy} policy={activePolicy} />
      <UploadRequiredDialog
        open={showUploadPrompt}
        onOpenChange={setShowUploadPrompt}
        onUploadClick={() => fileInputRef.current?.click()}
        onLoadSample={handleLoadSample}
        loadingSample={loadingSample}
      />
    </main>
  );
}

function ConnectionBadge({ status }: { status: "disconnected" | "connecting" | "connected" | "error" }) {
  const copy = {
    disconnected: "Disconnected",
    connecting: "Connecting…",
    connected: "Connected · demo",
    error: "Connection error",
  } as const;
  const color = {
    disconnected: "bg-muted-foreground",
    connecting: "bg-warning connection-pulse",
    connected: "bg-success",
    error: "bg-destructive",
  } as const;
  const foreground = {
    disconnected: "text-muted-foreground",
    connecting: "text-warning",
    connected: "text-success",
    error: "text-destructive",
  } as const;
  return (
    <span className={`inline-flex min-h-9 max-w-[152px] items-center gap-2 rounded-full border border-border bg-card px-3 text-[11px] font-bold sm:max-w-none sm:px-3.5 sm:text-xs ${foreground[status]}`} role="status" aria-live="polite">
      <span className={`size-2 shrink-0 rounded-full ${color[status]}`} />
      <span className="truncate">{copy[status]}</span>
    </span>
  );
}

function stateLabel(state: AgentState) {
  return {
    idle: "Ready when you are",
    listening: "Listening…",
    thinking: "Finding an answer…",
    speaking: "Speaking",
    interrupted: "Interrupted",
  }[state];
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function AssistantAvatar() {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-primary-foreground">
      <HeartPulse className="size-4" />
    </span>
  );
}

function TranscriptMessage({ message }: { message: VoiceMessage }) {
  const isAgent = message.role === "agent";
  return (
    <article className={`flex items-start gap-3 ${isAgent ? "" : "flex-row-reverse"}`}>
      {isAgent ? <AssistantAvatar /> : <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-[10px] font-bold text-cream">YOU</span>}
      <div className={`min-w-0 max-w-[min(86%,34rem)] ${isAgent ? "" : "text-right"}`}>
        <div className={`mb-1 flex items-center gap-2 ${isAgent ? "" : "justify-end"}`}>
          <span className="text-[11px] font-bold text-foreground">{isAgent ? "Arogya Assistant" : "You"}</span>
          <time suppressHydrationWarning className="text-[10px] font-medium tabular-nums text-muted-foreground" dateTime={message.timestamp.toISOString()}>{formatMessageTime(message.timestamp)}</time>
          {message.isInterrupted && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[9px] font-bold text-destructive">Interrupted</span>}
        </div>
        <p className={`inline-block break-words rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed ${isAgent ? "rounded-tl-sm bg-muted text-foreground" : "rounded-tr-sm bg-brand text-primary-foreground"} ${message.isPartial ? "italic opacity-65" : "font-medium"}`}>
          {message.text}{message.isPartial && <span className="ml-1 animate-pulse">…</span>}
        </p>
      </div>
    </article>
  );
}

function MetricsPanel({ metrics, turnCount, duration }: { metrics: VoiceMetrics | null; turnCount: number; duration: number }) {
  if (!metrics || turnCount === 0) {
    return (
      <section className="mt-5 border-t border-border pt-4" aria-label="Voice timing">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Turn 0 · Session {formatDuration(duration)}</span>
          <span className="inline-flex items-center gap-1.5 text-[11px]">
            <Activity className="size-3 text-muted-foreground" />
            Live latency telemetry (TTFA, VAD, STT, LLM, TTS) will display after the first turn.
          </span>
        </div>
      </section>
    );
  }

  const ttfaColor = metrics.ttfa < 1500 ? "text-success" : metrics.ttfa <= 2500 ? "text-warning" : "text-destructive";
  const stages = [
    ...(metrics.vadMs > 0 ? [{ label: "Silence hangover (VAD)", value: metrics.vadMs, color: "bg-mint" }] : []),
    ...(metrics.sttMs > 0 ? [{ label: "Speech transcription (STT)", value: metrics.sttMs, color: "bg-grape" }] : []),
    { label: "Answer generation (LLM)", value: metrics.llmMs, color: "bg-sunshine" },
    { label: "First audio chunk (TTS)", value: metrics.ttsMs, color: "bg-brand" },
  ];
  const maxValue = Math.max(...stages.map((stage) => stage.value), 1);
  return (
    <section className="mt-5 border-t border-border pt-4" aria-label="Voice timing">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Time to first audio (TTFA)</span>
          <p className={`mt-0.5 font-display text-3xl font-semibold leading-none ${ttfaColor}`}>{metrics.ttfa.toLocaleString()}<span className="ml-1 text-sm font-semibold">ms</span></p>
        </div>
        <span className="text-[11px] font-semibold text-muted-foreground">Turn {turnCount} <span className="mx-1.5 text-border">·</span> Session {formatDuration(duration)}</span>
      </div>
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {stages.map((stage) => (
          <div key={stage.label}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px]">
              <span className="truncate font-semibold text-muted-foreground">{stage.label}</span>
              <span className="shrink-0 font-bold tabular-nums text-foreground">{stage.value} ms</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label={`${stage.label}: ${stage.value} milliseconds`} aria-valuenow={stage.value} aria-valuemin={0} aria-valuemax={maxValue}>
              <div className={`h-full rounded-full ${stage.color} transition-[width] duration-500`} style={{ width: `${(stage.value / maxValue) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ApiKeySetting({
  apiKey,
  setApiKey,
}: {
  apiKey: string;
  setApiKey: (key: string) => void;
}) {
  const [inputValue, setInputValue] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    setInputValue(apiKey);
  }, [apiKey]);

  const handleSave = () => {
    setApiKey(inputValue);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleClear = () => {
    setInputValue("");
    setApiKey("");
    setSavedSuccess(false);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      {/* Pluggable Provider Selection */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Pipeline Provider
          </Label>
          <span className="text-[10px] font-medium text-brand">Pluggable Engine</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Active: Sarvam AI */}
          <div className="flex flex-col justify-between rounded-xl border-2 border-brand/60 bg-brand/5 p-2.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">Sarvam AI</span>
              <span className="flex items-center gap-1 rounded-full bg-brand/20 px-1.5 py-0.5 text-[9px] font-bold text-brand">
                <span className="size-1.5 rounded-full bg-brand animate-pulse" />
                Active
              </span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">Indic STT, LLM & TTS</p>
          </div>

          {/* Coming Soon: Deepgram */}
          <div className="flex flex-col justify-between rounded-xl border border-dashed border-border/80 bg-muted/30 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Deepgram</span>
              <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                Soon
              </span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground/80">Nova-3 Streaming STT</p>
          </div>

          {/* Coming Soon: ElevenLabs */}
          <div className="flex flex-col justify-between rounded-xl border border-dashed border-border/80 bg-muted/30 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">ElevenLabs</span>
              <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                Soon
              </span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground/80">Flash Voice TTS</p>
          </div>

          {/* Coming Soon: OpenRouter */}
          <div className="flex flex-col justify-between rounded-xl border border-dashed border-border/80 bg-muted/30 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">OpenRouter</span>
              <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                Soon
              </span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground/80">Claude / GPT-4o / Llama</p>
          </div>
        </div>
      </div>

      <div className="border-t border-border/60 pt-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-brand/10 text-brand">
              <KeyRound className="size-4" />
            </span>
            <div>
              <Label htmlFor="sarvam-api-key" className="font-semibold text-xs text-foreground">
                Sarvam AI API Key
              </Label>
              <p className="text-[10px] text-muted-foreground">Bring your own key (BYOK)</p>
            </div>
          </div>
          {apiKey ? (
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success flex items-center gap-1">
              <Check className="size-3" /> Active
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Server default
            </span>
          )}
        </div>

        <div className="relative">
          <Input
            id="sarvam-api-key"
            type={showKey ? "text" : "password"}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Paste your Sarvam API Key..."
            className="pr-10 text-xs font-mono h-9 rounded-xl border-border bg-background"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
            aria-label={showKey ? "Hide API key" : "Show API key"}
          >
            {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-8 rounded-lg bg-brand text-xs font-bold text-primary-foreground hover:bg-brand/90 flex-1"
            onClick={handleSave}
            disabled={inputValue === apiKey && !savedSuccess}
          >
            {savedSuccess ? (
              <span className="flex items-center gap-1.5 text-success-foreground">
                <Check className="size-3.5" /> Saved!
              </span>
            ) : (
              "Save Key"
            )}
          </Button>
          {apiKey && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10 hover:text-destructive border-border"
              onClick={handleClear}
            >
              Clear
            </Button>
          )}
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/40 p-2.5 text-[11px] leading-relaxed text-muted-foreground space-y-1.5">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <ShieldCheck className="size-3.5 text-brand shrink-0" />
            Client-Side Storage
          </p>
          <p>Stored securely in your browser&apos;s local storage. Never written to server disk or logs.</p>
          <a
            href="https://www.sarvam.ai/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-brand hover:underline pt-0.5"
          >
            Get a free API key at sarvam.ai
            <ExternalLink className="size-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

function SettingsDrawer({
  open,
  onOpenChange,
  status,
  apiKey,
  setApiKey,
  silenceHangover,
  setSilenceHangover,
  bargeSensitivity,
  setBargeSensitivity,
  autoSpeak,
  setAutoSpeak,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: string;
  apiKey: string;
  setApiKey: (key: string) => void;
  silenceHangover: number[];
  setSilenceHangover: (value: number[]) => void;
  bargeSensitivity: number[];
  setBargeSensitivity: (value: number[]) => void;
  autoSpeak: boolean;
  setAutoSpeak: (value: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-[min(100vw,420px)] flex-col overflow-y-auto border-l-2 border-border bg-background p-6 sm:max-w-[420px]">
        <SheetHeader className="pr-9 text-left">
          <span className="mb-1 grid size-10 place-items-center rounded-xl bg-sunshine text-ink"><Settings2 className="size-5" /></span>
          <SheetTitle className="font-display text-2xl">Voice settings</SheetTitle>
          <SheetDescription>Configure your Sarvam API key & pipeline thresholds.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          <ApiKeySetting apiKey={apiKey} setApiKey={setApiKey} />

          <div className="space-y-5 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                  VAD & Turn Thresholds
                </Label>
                <p className="text-[11px] text-muted-foreground">Adjust silence hangover & barge-in</p>
              </div>
              {status === "connected" ? (
                <span className="flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">
                  <span className="size-1.5 rounded-full bg-success animate-pulse" />
                  Live Sync
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Saved
                </span>
              )}
            </div>

            <SliderSetting
              id="silence-hangover"
              label="Silence hangover"
              note="Wait before sending your turn"
              value={silenceHangover}
              onValueChange={setSilenceHangover}
              min={400}
              max={1200}
              step={50}
              suffix="ms"
            />
            <SliderSetting
              id="barge-in-sensitivity"
              label="Barge-in sensitivity"
              note="How quickly speech interrupts the assistant"
              value={bargeSensitivity}
              onValueChange={setBargeSensitivity}
              min={150}
              max={600}
              step={25}
              suffix="ms"
            />
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-8 place-items-center rounded-lg bg-accent text-ink"><Volume2 className="size-4" /></span>
              <span><Label htmlFor="auto-speak" className="font-semibold">Speak responses aloud</Label><span className="mt-1 block text-xs text-muted-foreground">Use your browser’s speech voice</span></span>
            </div>
            <Switch id="auto-speak" checked={autoSpeak} onCheckedChange={setAutoSpeak} aria-label="Speak responses aloud" />
          </div>
          <div className="rounded-xl border border-border bg-muted/70 p-4">
            <p className="flex items-center gap-2 text-sm font-bold"><Info className="size-4 text-brand" />Live Pipeline Configuration</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">VAD sliders adjust endpointing silence and interruption sensitivity dynamically over the live WebSocket session.</p>
          </div>
        </div>
        <div className="mt-auto flex gap-2 pt-6">
          <Button variant="outline" className="flex-1 rounded-full" onClick={() => { setSilenceHangover([650]); setBargeSensitivity([300]); setAutoSpeak(true); }}>Reset</Button>
          <Button className="flex-1 rounded-full bg-brand text-primary-foreground hover:bg-brand/90" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SliderSetting({
  id,
  label,
  note,
  value,
  onValueChange,
  min,
  max,
  step,
  suffix,
}: {
  id: string;
  label: string;
  note: string;
  value: number[];
  onValueChange: (value: number[]) => void;
  min: number;
  max: number;
  step: number;
  suffix: string;
}) {
  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <span><Label htmlFor={id} className="font-semibold">{label}</Label><span className="mt-1 block text-xs text-muted-foreground">{note}</span></span>
        <output htmlFor={id} className="rounded-md bg-accent px-2 py-1 text-xs font-bold tabular-nums text-ink">{value[0]} {suffix}</output>
      </div>
      <Slider id={id} min={min} max={max} step={step} value={value} onValueChange={onValueChange} aria-label={label} />
      <div className="mt-2 flex justify-between text-[10px] font-medium text-muted-foreground"><span>{min} {suffix}</span><span>{max} {suffix}</span></div>
    </div>
  );
}

function PolicyDialog({
  open,
  onOpenChange,
  policy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy: PolicyInfo | null;
}) {
  const [activeTab, setActiveTab] = useState<"gist" | "raw">("gist");

  const defaultGistSections = [
    {
      title: "Sum Insured & Plan Tiers",
      badge: "3 Plans",
      items: [
        "Silver: Rs. 5,00,000 (1% room rent cap / Rs. 5,000 per day)",
        "Gold: Rs. 10,00,000 (Single private A/C room, no rent cap)",
        "Platinum: Rs. 25,00,000 (Single private A/C room, no rent cap)",
      ],
    },
    {
      title: "Inpatient & Day Care Coverage",
      badge: "60 & 90 Days",
      items: [
        "Pre-Hospitalisation: Up to 60 days prior to hospital admission",
        "Post-Hospitalisation: Up to 90 days immediately after discharge",
        "Day Care Surgeries: 100% covered requiring < 24 hrs stay",
        "Emergency Road Ambulance: Up to Rs. 3,000 per hospitalization",
        "AYUSH Inpatient: Covered up to 100% of sum insured in recognized hospitals",
      ],
    },
    {
      title: "Waiting Periods",
      badge: "Strict Rules",
      items: [
        "Initial Illness Waiting Period: 30 days (accidental injury covered Day 1)",
        "Specific Ailments: 24 months for cataract, hernia, joint replacement",
        "Pre-Existing Diseases (PED): 36 months of continuous cover (diabetes, HTN)",
      ],
    },
    {
      title: "Claims Procedure",
      badge: "Cashless & Reimbursement",
      items: [
        "Planned Cashless: Minimum 48 hours prior intimation to TPA desk",
        "Emergency Cashless: Within 24 hours of hospital admission",
        "Reimbursement Claims: Original bills must be submitted within 15 days of discharge",
        "Settlement TAT: 30 days from complete documentation submission",
      ],
    },
    {
      title: "Key Exclusions & Limits",
      badge: "Non-Covered",
      items: [
        "Cosmetic or plastic surgery excluded unless required for burns/cancer",
        "Extreme & hazardous sports (skydiving, mountaineering, paragliding)",
        "Veterinary or pet medical expenses strictly excluded",
      ],
    },
  ];

  const iconList = [ShieldCheck, Activity, Clock3, BadgeCheck, Info];
  const colorList = [
    "bg-grape text-primary-foreground",
    "bg-mint text-ink",
    "bg-sunshine text-ink",
    "bg-accent text-foreground",
    "bg-destructive/10 text-destructive",
  ];

  const sectionsToRender = policy?.gist && policy.gist.length > 0 ? policy.gist : defaultGistSections;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(88vh,820px)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-3xl border-2 border-border bg-background p-6 sm:p-8">
        <DialogHeader className="pr-8 text-left">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-sunshine text-ink">
              <FileText className="size-5" />
            </span>
            <div>
              <DialogTitle className="font-display text-2xl font-semibold sm:text-3xl">
                {policy?.filename || "Arogya Shield Policy"}
              </DialogTitle>
              <DialogDescription className="mt-0.5">
                {policy?.is_custom
                  ? `Custom uploaded policy document (${policy.char_count.toLocaleString()} characters). Strictly grounding AI answers.`
                  : "Standard Arogya Shield health insurance policy document grounding the voice assistant."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Tab Switcher */}
        <div className="mt-4 flex rounded-full bg-muted p-1">
          <button
            type="button"
            onClick={() => setActiveTab("gist")}
            className={`flex-1 rounded-full py-2 text-xs font-semibold transition-all ${
              activeTab === "gist"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Key Highlights & Gist {policy?.is_custom && "· AI Extracted"}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("raw")}
            className={`flex-1 rounded-full py-2 text-xs font-semibold transition-all ${
              activeTab === "raw"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Full Document Text ({policy?.char_count.toLocaleString()} chars)
          </button>
        </div>

        {activeTab === "gist" ? (
          <div className="mt-4 space-y-3.5">
            {sectionsToRender.map((sec, idx) => {
              const Icon = iconList[idx % iconList.length];
              const color = colorList[idx % colorList.length];
              return (
                <section
                  key={sec.title}
                  className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-brand/30"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className={`grid size-7 place-items-center rounded-lg ${color}`}>
                        <Icon className="size-4" />
                      </span>
                      <h3 className="font-display text-base font-semibold text-foreground">
                        {sec.title}
                      </h3>
                    </div>
                    <span className="rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold text-foreground">
                      {sec.badge}
                    </span>
                  </div>
                  <ul className="mt-3 space-y-1.5 pl-9 text-xs leading-relaxed text-muted-foreground">
                    {sec.items.map((item) => (
                      <li key={item} className="flex items-start gap-1.5">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-brand" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}

            <div className="rounded-xl border border-border bg-muted/60 p-3.5 text-xs leading-relaxed text-muted-foreground">
              <span className="font-bold text-foreground">Grounding Notice: </span>
              {policy?.is_custom
                ? `The AI voice assistant answers customer questions strictly using the terms extracted from ${policy.filename}.`
                : "The AI voice assistant answers customer questions strictly using the terms, waiting periods, limits, and exclusions specified above."}
            </div>
          </div>
        ) : (
          <div className="mt-4 max-h-[460px] overflow-y-auto rounded-2xl border border-border bg-card p-5 text-xs leading-relaxed whitespace-pre-wrap text-foreground font-mono">
            {policy?.content || "Loading policy content..."}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <span className="size-2 rounded-full bg-success" />
            Strict Cite-or-Refuse Guardrails Active
          </span>
          <Button
            className="rounded-full bg-brand px-5 text-primary-foreground hover:bg-brand/90"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UploadRequiredDialog({
  open,
  onOpenChange,
  onUploadClick,
  onLoadSample,
  loadingSample,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadClick: () => void;
  onLoadSample: () => void;
  loadingSample: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(88vh,600px)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border-2 border-border bg-background p-6 sm:p-8">
        <DialogHeader className="pr-8 text-left">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-amber-500/15 text-amber-600">
              <FileUp className="size-6" />
            </span>
            <div>
              <DialogTitle className="font-display text-xl font-bold">
                Upload Policy Document First
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs text-muted-foreground">
                Document grounding required to start conversation
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-xs font-medium leading-relaxed text-amber-950 dark:text-amber-200">
            Arogya Shield strictly refuses to hallucinate or guess from generic mock data. To discuss coverage, waiting periods, claims, or receive customized plan recommendations, please upload your insurance policy document.
          </div>

          <div className="space-y-3 pt-2">
            <Button
              className="h-12 w-full justify-between rounded-2xl bg-brand px-5 text-sm font-bold text-primary-foreground shadow-[0_4px_0_var(--color-brand-shadow)] hover:bg-brand/90"
              onClick={() => {
                onOpenChange(false);
                onUploadClick();
              }}
            >
              <span className="flex items-center gap-2.5">
                <FileUp className="size-4" />
                Upload Your Policy (PDF, TXT, MD)
              </span>
              <span className="text-xs opacity-80">Browse file</span>
            </Button>

            <div className="relative flex items-center justify-center py-1">
              <span className="h-px w-full bg-border" />
              <span className="bg-background px-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                or try with sample
              </span>
              <span className="h-px w-full bg-border" />
            </div>

            <Button
              variant="outline"
              className="h-12 w-full justify-between rounded-2xl border-2 border-border bg-card px-5 text-sm font-bold text-foreground shadow-none hover:bg-accent"
              onClick={onLoadSample}
              disabled={loadingSample}
            >
              <span className="flex items-center gap-2.5">
                {loadingSample ? (
                  <Loader2 className="size-4 animate-spin text-brand" />
                ) : (
                  <FileText className="size-4 text-brand" />
                )}
                {loadingSample ? "Extracting Sample PDF…" : "Load Star Comprehensive Health Plan PDF"}
              </span>
              <span className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-bold text-ink">Sample</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}