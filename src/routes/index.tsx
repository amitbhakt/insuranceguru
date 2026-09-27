import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AudioLines,
  BadgeCheck,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  Headphones,
  HeartPulse,
  Info,
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
import { formatMessageTime, type AgentState, type VoiceMetrics, type VoiceMessage } from "@/services/voiceAgentService";
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
    startCall,
    endCall,
    toggleMute,
    sendTextMessage,
  } = useVoiceAgent();
  const [showSettings, setShowSettings] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [showMetrics, setShowMetrics] = useState(true);
  const [query, setQuery] = useState("");
  const [silenceHangover, setSilenceHangover] = useState([650]);
  const [bargeSensitivity, setBargeSensitivity] = useState([300]);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
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
      sendTextMessage(text);
      setQuery("");
    },
    [query, sendTextMessage],
  );

  const handleCall = () => {
    if (status === "connected" || status === "connecting") {
      endCall();
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
                ? "Connecting to voice preview"
                : status === "connected"
                  ? `Call in progress · ${formatDuration(elapsedSeconds)}`
                  : "Ready for a conversation"}
            </div>
            <h1 className="mt-5 max-w-xl font-display text-5xl font-bold leading-[0.99] text-balance sm:text-6xl">
              Health cover,<br className="hidden sm:block" /> made <span className="text-brand">easier to understand.</span>
            </h1>
            <p className="mt-4 max-w-md text-base font-medium leading-relaxed text-muted-foreground sm:text-lg">
              Have a question about benefits, premiums or claims? Let’s talk it through.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                onClick={handleCall}
                disabled={status === "connecting"}
                className={`h-12 rounded-full px-6 text-base font-bold shadow-[0_5px_0_var(--color-brand-shadow)] transition-transform hover:-translate-y-0.5 ${status === "connected" ? "bg-destructive text-destructive-foreground shadow-none hover:bg-destructive/90" : "bg-brand text-primary-foreground hover:bg-brand/90"}`}
              >
                {status === "connected" ? <PhoneOff /> : <Mic />}
                {status === "connecting" ? "Connecting…" : status === "connected" ? "End conversation" : "Start conversation"}
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setShowPolicy(true)}
                className="h-12 rounded-full border-2 bg-card px-5 text-sm font-bold shadow-none"
              >
                <FileText />
                View policy
              </Button>
            </div>

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
              <p className="mt-1 text-xs font-medium text-muted-foreground">{status === "connected" ? "Preview session · messages update as you speak" : "Example exchange · start a conversation to speak"}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[11px] font-bold text-foreground">
                {status === "connected" ? <span className="size-1.5 rounded-full bg-success connection-pulse" /> : <Check className="size-3" />}
                {status === "connected" ? "AI preview active" : "Preview"}
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
            {messages.map((message) => <TranscriptMessage key={message.id} message={message} />)}
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
            <div ref={transcriptEnd} />
          </div>

          {showMetrics && <MetricsPanel metrics={metrics} turnCount={turnCount} duration={elapsedSeconds} />}

          <form onSubmit={onSubmit} className="mt-5 flex items-center gap-2 rounded-full border-2 border-input bg-background p-1.5 pl-4 focus-within:border-ring">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ask about cover, claims, or your policy…"
              aria-label="Type your policy question"
              className="h-10 min-w-0 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
            />
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
              disabled={!query.trim()}
              className="size-10 shrink-0 rounded-full bg-brand text-primary-foreground hover:bg-brand/90"
              aria-label="Send question"
              title="Send question"
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
            <span className="min-w-0"><span className="block font-display text-2xl font-semibold leading-none">{metrics.ttfa.toLocaleString()}<span className="ml-1 text-xs font-semibold">ms</span></span><span className="mt-1 block text-[11px] font-semibold text-primary-foreground/80">First audio · this turn</span></span>
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
        silenceHangover={silenceHangover}
        setSilenceHangover={setSilenceHangover}
        bargeSensitivity={bargeSensitivity}
        setBargeSensitivity={setBargeSensitivity}
        autoSpeak={autoSpeak}
        setAutoSpeak={setAutoSpeak}
      />
      <PolicyDialog open={showPolicy} onOpenChange={setShowPolicy} />
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
          <time className="text-[10px] font-medium tabular-nums text-muted-foreground" dateTime={message.timestamp.toISOString()}>{formatMessageTime(message.timestamp)}</time>
          {message.isInterrupted && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[9px] font-bold text-destructive">Interrupted</span>}
        </div>
        <p className={`inline-block break-words rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed ${isAgent ? "rounded-tl-sm bg-muted text-foreground" : "rounded-tr-sm bg-brand text-primary-foreground"} ${message.isPartial ? "italic opacity-65" : "font-medium"}`}>
          {message.text}{message.isPartial && <span className="ml-1 animate-pulse">…</span>}
        </p>
      </div>
    </article>
  );
}

function MetricsPanel({ metrics, turnCount, duration }: { metrics: VoiceMetrics; turnCount: number; duration: number }) {
  const ttfaColor = metrics.ttfa < 1500 ? "text-success" : metrics.ttfa <= 2500 ? "text-warning" : "text-destructive";
  const stages = [
    { label: "Silence hangover", value: metrics.vadMs, color: "bg-mint" },
    { label: "Speech finalisation", value: metrics.sttMs, color: "bg-grape" },
    { label: "Answer generation", value: metrics.llmMs, color: "bg-sunshine" },
    { label: "First audio chunk", value: metrics.ttsMs, color: "bg-brand" },
  ];
  const maxValue = Math.max(...stages.map((stage) => stage.value), 1);
  return (
    <section className="mt-5 border-t border-border pt-4" aria-label="Voice timing">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Time to first audio</span>
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

function SettingsDrawer({
  open,
  onOpenChange,
  silenceHangover,
  setSilenceHangover,
  bargeSensitivity,
  setBargeSensitivity,
  autoSpeak,
  setAutoSpeak,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
          <SheetDescription>Adjust how the local voice preview behaves.</SheetDescription>
        </SheetHeader>
        <div className="mt-8 space-y-8">
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
          <div className="flex items-center justify-between gap-4 border-t border-border pt-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-8 place-items-center rounded-lg bg-accent text-ink"><Volume2 className="size-4" /></span>
              <span><Label htmlFor="auto-speak" className="font-semibold">Speak responses aloud</Label><span className="mt-1 block text-xs text-muted-foreground">Use your browser’s speech voice</span></span>
            </div>
            <Switch id="auto-speak" checked={autoSpeak} onCheckedChange={setAutoSpeak} aria-label="Speak responses aloud" />
          </div>
          <div className="rounded-xl border border-border bg-muted/70 p-4">
            <p className="flex items-center gap-2 text-sm font-bold"><Info className="size-4 text-brand" />Preview settings only</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">These controls show the intended voice experience. Changing them does not configure an external voice service.</p>
          </div>
        </div>
        <div className="mt-auto flex gap-2 pt-8">
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

function PolicyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const sections = [
    { title: "Hospitalisation", body: "Eligible inpatient treatment and related expenses may be covered within your selected plan limits." },
    { title: "Waiting periods", body: "Waiting periods can apply before specific benefits begin. Check your policy schedule for the exact terms." },
    { title: "Exclusions & limits", body: "Exclusions, co-payments, room limits and sub-limits depend on your issued policy and chosen cover." },
    { title: "How to make a claim", body: "Contact the insurer or hospital insurance desk as early as possible. Keep your policy details and treatment documents ready." },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(82vh,740px)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-3xl border-2 border-border bg-background p-6 sm:p-8">
        <DialogHeader className="pr-8 text-left">
          <span className="mb-1 grid size-11 place-items-center rounded-2xl bg-sunshine text-ink"><FileText className="size-5" /></span>
          <DialogTitle className="font-display text-2xl font-semibold sm:text-3xl">Arogya Shield · Policy overview</DialogTitle>
          <DialogDescription>General guide to health cover benefits and claims.</DialogDescription>
        </DialogHeader>
        <div className="mt-2 space-y-3">
          {sections.map((section, index) => (
            <section key={section.title} className="rounded-2xl bg-card px-4 py-4 ring-1 ring-border">
              <div className="flex items-center gap-2.5">
                <span className={`grid size-7 place-items-center rounded-lg ${index % 2 === 0 ? "bg-accent text-ink" : "bg-sunshine text-ink"}`}><BadgeCheck className="size-4" /></span>
                <h3 className="font-display text-base font-semibold">{section.title}</h3>
              </div>
              <p className="mt-2 pl-9 text-sm leading-relaxed text-muted-foreground">{section.body}</p>
            </section>
          ))}
          <p className="flex gap-2 rounded-xl bg-destructive/5 p-3 text-xs leading-relaxed text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0 text-destructive" />This is a general overview, not the official policy wording. Your issued policy documents and schedule govern your actual cover.</p>
        </div>
        <div className="mt-3 flex justify-end">
          <Button className="rounded-full bg-brand px-5 text-primary-foreground hover:bg-brand/90" onClick={() => onOpenChange(false)}><X className="size-4" />Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}