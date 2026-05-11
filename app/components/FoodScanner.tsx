"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Camera,
  Upload,
  X,
  Loader2,
  ChevronLeft,
  Trash2,
  Clock,
} from "lucide-react";

// --- Types ---

interface Nutrition {
  calories: number;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
}

interface ScanResult {
  name: string;
  category: string;
  description: string;
  portion: string;
  confidence: "high" | "medium" | "low";
  nutrition: Nutrition;
  verdict: "great" | "okay" | "bad";
  verdict_reason: string;
  tip: string;
  notes: string;
}

interface HistoryEntry extends ScanResult {
  id: string;
  timestamp: number;
  imagePreview: string;
}

// --- Colors ---

const colors = {
  parchment: "#f5f0e8",
  oat: "#ebe3d5",
  cream: "#f0e6d4",
  ink: "#2a1f14",
  espresso: "#3d2f1f",
  bark: "#5c4a32",
  bronze: "#8b6f47",
  sand: "#c9b896",
  toast: "#d4c4a8",
  ember: "#c9442a",
  ochre: "#c9942a",
  rust: "#a04632",
  moss: "#7a8c5a",
  successBg: "#d4e0c4",
  successFg: "#3d5024",
  warningBg: "#f0dcc4",
  errorBg: "#f4dcc7",
  errorFg: "#7a3a14",
};

// --- Helpers ---

const HISTORY_KEY = "forkoff_history";
const MAX_HISTORY = 50;

function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
}

function downscaleImage(dataUrl: string, maxDim = 1024, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Failed to load image. Try JPEG or PNG."));
    img.src = dataUrl;
  });
}

const LOADING_MESSAGES = [
  "JUDGING YOUR PLATE...",
  "CONSULTING THE NUTRITION GODS...",
  "COUNTING EVERY LAST CALORIE...",
  "SCANNING FOR PROTEIN...",
  "YOUR TRAINER IS TYPING...",
  "CALCULATING THE DAMAGE...",
  "ANALYZING YOUR LIFE CHOICES...",
  "CHECKING IF THIS IS WORTH THE CARDIO...",
  "LOOKING UP HOW MANY BURPEES THIS COSTS...",
  "RATING YOUR MEAL OUT OF 10...",
  "ASKING YOUR MOM IF THIS COUNTS AS HEALTHY...",
  "GOOGLING 'IS THIS A VEGETABLE'...",
  "PRETENDING NOT TO JUDGE...",
  "RUNNING THE NUMBERS (THEY'RE NOT GREAT)...",
  "CROSS-REFERENCING WITH YOUR GYM GOALS...",
  "MEASURING REGRET IN CALORIES...",
  "SUMMONING THE MACRO FAIRY...",
  "WEIGHING YOUR CHOICES (LITERALLY)...",
  "DOING MATH YOUR TRAINER CHARGES $200/HR FOR...",
  "CHECKING THE AUDACITY OF THIS MEAL...",
  "SENDING THIS TO YOUR NUTRITIONIST...",
  "SILENTLY SCREAMING AT YOUR FIBER INTAKE...",
  "ESTIMATING HOW LONG YOU'LL BE ON THE TREADMILL...",
  "LOADING PASSIVE AGGRESSIVE FEEDBACK...",
  "CALCULATING YOUR CHEAT DAY BUDGET...",
  "LOOKING FOR THE VEGETABLES...",
  "CONVERTING THIS TO PUSH-UPS...",
  "PREPARING YOUR EMOTIONAL DAMAGE REPORT...",
  "CHECKING IF 'VIBES' IS A MACRONUTRIENT...",
];

const HOME_TAGLINES = [
  "Snap your food. Get roasted (lovingly).",
  "Your meals, judged by AI.",
  "Because your gym bro isn't always around.",
  "Accountability, one photo at a time.",
  "We see that fried rice.",
  "The site your dietitian wishes you had.",
  "Eat first. Regret later. We do the math.",
  "No barcode? No problem. Just vibes and vision.",
  "Your plate has entered the chat.",
  "Turning your lunch into a therapy session.",
  "Finally, an honest opinion about your food.",
  "Like MyFitnessPal but with personality.",
  "Point. Shoot. Get humbled.",
  "The truth about your jollof, in 3 seconds.",
  "You ate WHAT? Let's find out.",
  "AI-powered guilt, served fresh.",
  "Your food diary, but it talks back.",
  "Calories don't count if nobody sees... oh wait.",
  "Snap it before you regret it.",
  "One scan closer to abs. Maybe.",
  "Your stomach is full but your data is empty.",
  "Because 'I ate healthy today' needs proof.",
  "Photo evidence for your fitness journey.",
  "Less guessing, more knowing, same eating.",
  "The only site that judges you harder than your mom.",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// --- Confidence badge ---

const CONFIDENCE_HINTS: Record<string, string> = {
  high: "Pretty sure about this one.",
  medium: "Decent guess, but portions are tricky.",
  low: "Rough estimate — take these numbers lightly.",
};

function ConfidenceBadge({ level }: { level: string }) {
  const config: Record<string, { bg: string; fg: string; dot: string }> = {
    high: { bg: colors.successBg, fg: colors.successFg, dot: colors.moss },
    medium: { bg: colors.warningBg, fg: colors.bronze, dot: colors.ochre },
    low: { bg: colors.errorBg, fg: colors.errorFg, dot: colors.rust },
  };
  const c = config[level] ?? config.low;
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full self-start"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          background: c.bg,
          color: c.fg,
        }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: c.dot }}
        />
        {level} confidence
      </span>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "13px",
          fontWeight: 300,
          fontStyle: "italic",
          color: colors.bronze,
        }}
      >
        {CONFIDENCE_HINTS[level] ?? CONFIDENCE_HINTS.low}
      </span>
    </div>
  );
}

// --- Verdict card ---

function VerdictCard({
  verdict,
  reason,
  tip,
}: {
  verdict: string;
  reason: string;
  tip: string;
}) {
  const config: Record<string, { bg: string; border: string; fg: string; icon: string; label: string }> = {
    great: { bg: "#d4e0c4", border: "#b3c99a", fg: colors.successFg, icon: "checkmark", label: "YOUR BODY THANKS YOU" },
    okay: { bg: colors.warningBg, border: colors.toast, fg: colors.bark, icon: "neutral", label: "NOT BAD, NOT GREAT" },
    bad: { bg: "#f4dcc7", border: "#e0c0a0", fg: colors.errorFg, icon: "warning", label: "YOUR ABS ARE CRYING" },
  };
  const c = config[verdict] ?? config.okay;
  const icons: Record<string, string> = { checkmark: "\u2714", neutral: "\u2022", warning: "\u26A0" };

  return (
    <div
      className="rounded-2xl p-5 mb-6"
      style={{ background: c.bg, border: `1.5px solid ${c.border}` }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span style={{ fontSize: "16px" }}>{icons[c.icon]}</span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            letterSpacing: "0.2em",
            textTransform: "uppercase" as const,
            color: c.fg,
            fontWeight: 600,
          }}
        >
          {c.label}
        </span>
      </div>
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "15px",
          fontWeight: 400,
          color: c.fg,
          lineHeight: 1.5,
        }}
      >
        {reason}
      </p>
      {tip && (
        <p
          className="mt-3 pt-3"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "14px",
            fontWeight: 300,
            fontStyle: "italic",
            color: colors.bark,
            borderTop: `1px solid ${c.border}`,
          }}
        >
          Tip: {tip}
        </p>
      )}
    </div>
  );
}

// --- Macro card ---

function MacroCard({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: number;
  unit: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col items-center justify-center"
      style={{ background: colors.cream, border: `1px solid ${colors.toast}` }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: accent,
        }}
      >
        {label}
      </span>
      <span
        className="text-3xl font-medium mt-1"
        style={{ fontFamily: "var(--font-display)", color: colors.ink }}
      >
        {value}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          color: colors.bronze,
        }}
      >
        {unit}
      </span>
    </div>
  );
}

// --- Main component ---

type Screen = "home" | "camera" | "analyzing" | "result" | "history" | "detail";

export default function FoodScanner() {
  const [screen, setScreen] = useState<Screen>("home");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0]);
  const [homeTagline, setHomeTagline] = useState(HOME_TAGLINES[0]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scanCount, setScanCount] = useState(0);

  useEffect(() => {
    const h = loadHistory();
    setHistory(h);
    setScanCount(h.length);
    setHomeTagline(pickRandom(HOME_TAGLINES));
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setCameraError("Camera access denied. You can upload an image instead.");
    }
  }, []);

  const openCamera = useCallback(() => {
    setScreen("camera");
    setError(null);
    setTimeout(() => startCamera(), 100);
  }, [startCamera]);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    stopCamera();
    setCapturedImage(dataUrl);
    analyzeImage(dataUrl);
  }, [stopCamera]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const validTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!validTypes.includes(file.type)) {
        setError("Please upload JPEG, PNG, or WebP");
        return;
      }

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = await downscaleImage(reader.result as string);
          setCapturedImage(dataUrl);
          analyzeImage(dataUrl);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to process image");
        }
      };
      reader.readAsDataURL(file);
    },
    []
  );

  const analyzeImage = useCallback(
    async (imageDataUrl: string) => {
      setScreen("analyzing");
      setLoadingMessage(pickRandom(LOADING_MESSAGES));
      setError(null);
      setResult(null);

      try {
        const downscaled = await downscaleImage(imageDataUrl);

        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: downscaled }),
        });

        const data = await res.json();

        if (data.error === "no food detected") {
          setError("No food in that image. Try another angle.");
          setScreen("home");
          return;
        }

        if (!res.ok) {
          setError(data.error || `HTTP ${res.status}`);
          setScreen("home");
          return;
        }

        setResult(data as ScanResult);
        setScreen("result");

        const entry: HistoryEntry = {
          ...(data as ScanResult),
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          imagePreview: downscaled,
        };
        const updated = [entry, ...loadHistory()].slice(0, MAX_HISTORY);
        saveHistory(updated);
        setHistory(updated);
        setScanCount(updated.length);
      } catch {
        setError("Network error — check your connection and try again.");
        setScreen("home");
      }
    },
    []
  );

  const clearHistory = useCallback(() => {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
    setScanCount(0);
  }, []);

  const goHome = useCallback(() => {
    stopCamera();
    setScreen("home");
    setCapturedImage(null);
    setResult(null);
    setError(null);
  }, [stopCamera]);

  // --- Mono label style ---
  const mono = (size = 10): React.CSSProperties => ({
    fontFamily: "var(--font-mono)",
    fontSize: `${size}px`,
    letterSpacing: "0.2em",
    textTransform: "uppercase",
  });

  // --- Render screens ---

  // HOME
  if (screen === "home") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-6 py-8">
        <div className="w-full max-w-md animate-fade-up">
          {/* Header */}
          <div className="text-center mb-12">
            <p style={{ ...mono(), color: colors.bronze }} className="mb-4">
              NO. {String(scanCount + 1).padStart(3, "0")} — FOOD JOURNAL
            </p>
            <h1
              className="text-4xl font-medium italic mb-3"
              style={{ fontFamily: "var(--font-display)", color: colors.ink }}
            >
              ForkOff
            </h1>
            <p
              className="text-base"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 300,
                color: colors.bark,
                fontSize: "15px",
              }}
            >
              {homeTagline}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div
              className="rounded-2xl p-4 mb-6 text-center text-sm"
              style={{ background: colors.errorBg, color: colors.errorFg }}
            >
              {error}
            </div>
          )}

          {/* Capture button */}
          <button
            onClick={openCamera}
            className="w-full py-4 rounded-2xl flex items-center justify-center gap-3 active:scale-[0.98] transition-transform mb-4"
            style={{
              background: `linear-gradient(135deg, ${colors.ink}, #4a3826)`,
              color: "#f5efe6",
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              fontSize: "17px",
            }}
          >
            <Camera size={20} />
            Capture a meal
          </button>

          {/* Upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-3 active:scale-[0.98] transition-transform"
            style={{
              background: "transparent",
              border: `1.5px solid ${colors.sand}`,
              color: colors.bark,
              ...mono(11),
            }}
          >
            <Upload size={16} />
            OR UPLOAD IMAGE
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileUpload}
          />

          {/* History link */}
          {history.length > 0 && (
            <button
              onClick={() => setScreen("history")}
              className="w-full mt-8 flex items-center justify-center gap-2 py-3 active:scale-[0.98] transition-transform"
              style={{ color: colors.bronze, ...mono(11) }}
            >
              <Clock size={14} />
              VIEW HISTORY ({history.length})
            </button>
          )}
        </div>
      </div>
    );
  }

  // CAMERA
  if (screen === "camera") {
    return (
      <div className="fixed inset-0 bg-black flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between p-4 z-10">
          <button onClick={goHome} className="text-white/80 p-2">
            <X size={24} />
          </button>
          <span style={{ ...mono(10), color: "rgba(255,255,255,0.6)" }}>
            SHOW ME WHAT YOU&apos;RE EATING
          </span>
          <div className="w-10" />
        </div>

        {/* Video */}
        <div className="flex-1 relative">
          {cameraError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-8">
              <p className="text-white/70 text-center text-sm mb-6">{cameraError}</p>
              <button
                onClick={() => {
                  stopCamera();
                  setScreen("home");
                  fileInputRef.current?.click();
                }}
                className="px-6 py-3 rounded-2xl"
                style={{
                  background: "rgba(255,255,255,0.15)",
                  color: "white",
                  ...mono(11),
                }}
              >
                UPLOAD INSTEAD
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
              />
              {/* Frame guide */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className="w-64 h-64 rounded-3xl"
                  style={{ border: "2px dashed rgba(255,255,255,0.3)" }}
                />
              </div>
            </>
          )}
        </div>

        {/* Shutter */}
        {!cameraError && (
          <div className="flex items-center justify-center py-8">
            <button
              onClick={capturePhoto}
              className="w-18 h-18 rounded-full flex items-center justify-center active:scale-[0.95] transition-transform"
              style={{
                width: 72,
                height: 72,
                background: colors.ember,
                border: "4px solid rgba(255,255,255,0.3)",
              }}
            >
              <div
                className="w-14 h-14 rounded-full"
                style={{
                  width: 56,
                  height: 56,
                  background: colors.ember,
                  border: "2px solid rgba(255,255,255,0.5)",
                }}
              />
            </button>
          </div>
        )}
      </div>
    );
  }

  // ANALYZING
  if (screen === "analyzing") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-md animate-fade-up">
          {/* Image preview */}
          {capturedImage && (
            <div className="relative rounded-2xl overflow-hidden mb-8" style={{ border: `1px solid ${colors.toast}` }}>
              <img
                src={capturedImage}
                alt="Captured food"
                className="w-full aspect-[4/3] object-cover opacity-60"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Loader2
                  size={32}
                  className="animate-spin-slow mb-4"
                  style={{ color: colors.ink }}
                />
                <span style={{ ...mono(11), color: colors.ink }}>
                  {loadingMessage}
                </span>
              </div>
            </div>
          )}
          <button
            onClick={goHome}
            className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            style={{
              background: "transparent",
              border: `1.5px solid ${colors.sand}`,
              color: colors.bark,
              ...mono(11),
            }}
          >
            <X size={14} />
            NEVERMIND
          </button>
        </div>
      </div>
    );
  }

  // RESULT
  if (screen === "result" && result) {
    return (
      <div className="min-h-dvh px-6 py-8">
        <div className="w-full max-w-md mx-auto animate-fade-up">
          {/* Back */}
          <button
            onClick={goHome}
            className="flex items-center gap-1 mb-6 active:scale-[0.98] transition-transform"
            style={{ color: colors.bronze, ...mono(11) }}
          >
            <ChevronLeft size={14} />
            BACK
          </button>

          {/* Food name + confidence */}
          <div className="mb-6">
            <ConfidenceBadge level={result.confidence} />
            <h2
              className="text-3xl font-medium italic mt-3"
              style={{ fontFamily: "var(--font-display)", color: colors.ink }}
            >
              {result.name}
            </h2>
            <p
              className="mt-1"
              style={{ ...mono(10), color: colors.bronze }}
            >
              {result.category}
            </p>
          </div>

          {/* Description */}
          <p
            className="mb-6"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "15px",
              fontWeight: 300,
              color: colors.bark,
            }}
          >
            {result.description}
          </p>

          {/* Verdict */}
          <VerdictCard
            verdict={result.verdict}
            reason={result.verdict_reason}
            tip={result.tip}
          />

          {/* Portion */}
          <div
            className="rounded-2xl p-4 mb-6 text-center"
            style={{ background: colors.oat, border: `1px solid ${colors.toast}` }}
          >
            <span style={{ ...mono(10), color: colors.bronze }}>PORTION</span>
            <p
              className="text-base mt-1"
              style={{ fontFamily: "var(--font-display)", color: colors.ink }}
            >
              {result.portion}
            </p>
          </div>

          {/* Calories hero */}
          <div
            className="rounded-2xl p-6 mb-6 text-center"
            style={{
              background: `linear-gradient(135deg, ${colors.ink}, #4a3826)`,
            }}
          >
            <span style={{ ...mono(10), color: colors.sand }}>CALORIES</span>
            <p
              className="text-6xl font-medium italic mt-1"
              style={{ fontFamily: "var(--font-display)", color: "#f5efe6" }}
            >
              {result.nutrition.calories}
            </p>
            <span style={{ ...mono(10), color: colors.bronze }}>KCAL</span>
          </div>

          {/* Macro grid */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <MacroCard label="Carbs" value={result.nutrition.carbs_g} unit="g" accent={colors.ochre} />
            <MacroCard label="Protein" value={result.nutrition.protein_g} unit="g" accent={colors.rust} />
            <MacroCard label="Fat" value={result.nutrition.fat_g} unit="g" accent={colors.moss} />
            <MacroCard label="Fiber" value={result.nutrition.fiber_g} unit="g" accent={colors.bronze} />
          </div>

          {/* Sugar */}
          {result.nutrition.sugar_g > 0 && (
            <div
              className="rounded-2xl p-4 mb-6 flex items-center justify-between"
              style={{ background: colors.cream, border: `1px solid ${colors.toast}` }}
            >
              <span style={{ ...mono(10), color: colors.ochre }}>SUGAR</span>
              <span
                className="text-xl font-medium"
                style={{ fontFamily: "var(--font-display)", color: colors.ink }}
              >
                {result.nutrition.sugar_g}
                <span style={{ ...mono(10), color: colors.bronze, marginLeft: 4 }}>G</span>
              </span>
            </div>
          )}

          {/* Notes */}
          {result.notes && (
            <div
              className="rounded-2xl p-4 mb-8"
              style={{ background: colors.oat, border: `1px solid ${colors.toast}` }}
            >
              <span style={{ ...mono(10), color: colors.bronze }}>NOTE</span>
              <p
                className="mt-1"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "14px",
                  fontWeight: 300,
                  color: colors.bark,
                  fontStyle: "italic",
                }}
              >
                {result.notes}
              </p>
            </div>
          )}

          {/* Scan another */}
          <button
            onClick={goHome}
            className="w-full py-4 rounded-2xl flex items-center justify-center gap-3 active:scale-[0.98] transition-transform"
            style={{
              background: `linear-gradient(135deg, ${colors.ink}, #4a3826)`,
              color: "#f5efe6",
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              fontSize: "17px",
            }}
          >
            <Camera size={20} />
            Scan another
          </button>
        </div>
      </div>
    );
  }

  // HISTORY
  if (screen === "history") {
    return (
      <div className="min-h-dvh px-6 py-8">
        <div className="w-full max-w-md mx-auto animate-fade-up">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={goHome}
              className="flex items-center gap-1 active:scale-[0.98] transition-transform"
              style={{ color: colors.bronze, ...mono(11) }}
            >
              <ChevronLeft size={14} />
              BACK
            </button>
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="flex items-center gap-1 active:scale-[0.98] transition-transform"
                style={{ color: colors.rust, ...mono(10) }}
              >
                <Trash2 size={12} />
                CLEAR
              </button>
            )}
          </div>

          <h2
            className="text-2xl font-medium italic mb-6"
            style={{ fontFamily: "var(--font-display)", color: colors.ink }}
          >
            Scan History
          </h2>

          {history.length === 0 ? (
            <p
              className="text-center py-12"
              style={{ fontFamily: "var(--font-display)", color: colors.bronze, fontSize: "15px" }}
            >
              No scans yet. Go eat something (preferably protein).
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {history.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => {
                    setSelectedEntry(entry);
                    setScreen("detail");
                  }}
                  className="w-full rounded-2xl p-4 flex items-center gap-4 text-left active:scale-[0.98] transition-transform"
                  style={{
                    background: colors.cream,
                    border: `1px solid ${colors.toast}`,
                  }}
                >
                  <img
                    src={entry.imagePreview}
                    alt={entry.name}
                    className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className="font-medium italic truncate"
                      style={{ fontFamily: "var(--font-display)", color: colors.ink }}
                    >
                      {entry.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span style={{ ...mono(10), color: colors.bronze }}>
                        {entry.nutrition.calories} KCAL
                      </span>
                      <span style={{ color: colors.sand }}>·</span>
                      <span style={{ ...mono(10), color: colors.bronze }}>
                        {formatTime(entry.timestamp)}
                      </span>
                    </div>
                  </div>
                  <ChevronLeft
                    size={16}
                    style={{ color: colors.sand, transform: "rotate(180deg)" }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // DETAIL (history item)
  if (screen === "detail" && selectedEntry) {
    const r = selectedEntry;
    return (
      <div className="min-h-dvh px-6 py-8">
        <div className="w-full max-w-md mx-auto animate-fade-up">
          <button
            onClick={() => setScreen("history")}
            className="flex items-center gap-1 mb-6 active:scale-[0.98] transition-transform"
            style={{ color: colors.bronze, ...mono(11) }}
          >
            <ChevronLeft size={14} />
            HISTORY
          </button>

          {/* Image */}
          <img
            src={r.imagePreview}
            alt={r.name}
            className="w-full aspect-[4/3] object-cover rounded-2xl mb-6"
            style={{ border: `1px solid ${colors.toast}` }}
          />

          <div className="mb-4">
            <ConfidenceBadge level={r.confidence} />
            <h2
              className="text-3xl font-medium italic mt-3"
              style={{ fontFamily: "var(--font-display)", color: colors.ink }}
            >
              {r.name}
            </h2>
            <p className="mt-1" style={{ ...mono(10), color: colors.bronze }}>
              {r.category} · {formatTime(r.timestamp)}
            </p>
          </div>

          <p
            className="mb-6"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "15px",
              fontWeight: 300,
              color: colors.bark,
            }}
          >
            {r.description}
          </p>

          {/* Verdict */}
          <VerdictCard
            verdict={r.verdict}
            reason={r.verdict_reason}
            tip={r.tip}
          />

          {/* Calories hero */}
          <div
            className="rounded-2xl p-6 mb-6 text-center"
            style={{ background: `linear-gradient(135deg, ${colors.ink}, #4a3826)` }}
          >
            <span style={{ ...mono(10), color: colors.sand }}>CALORIES</span>
            <p
              className="text-6xl font-medium italic mt-1"
              style={{ fontFamily: "var(--font-display)", color: "#f5efe6" }}
            >
              {r.nutrition.calories}
            </p>
            <span style={{ ...mono(10), color: colors.bronze }}>KCAL</span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <MacroCard label="Carbs" value={r.nutrition.carbs_g} unit="g" accent={colors.ochre} />
            <MacroCard label="Protein" value={r.nutrition.protein_g} unit="g" accent={colors.rust} />
            <MacroCard label="Fat" value={r.nutrition.fat_g} unit="g" accent={colors.moss} />
            <MacroCard label="Fiber" value={r.nutrition.fiber_g} unit="g" accent={colors.bronze} />
          </div>

          {r.notes && (
            <div
              className="rounded-2xl p-4 mb-6"
              style={{ background: colors.oat, border: `1px solid ${colors.toast}` }}
            >
              <span style={{ ...mono(10), color: colors.bronze }}>NOTE</span>
              <p
                className="mt-1"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "14px",
                  fontWeight: 300,
                  color: colors.bark,
                  fontStyle: "italic",
                }}
              >
                {r.notes}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
