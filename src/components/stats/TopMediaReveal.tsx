import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion, useMotionTemplate, useReducedMotion } from "framer-motion";
import { Film, Tv, Clock, Users, Play, Gift, Clapperboard, type LucideIcon } from "lucide-react";
import { formatDuration } from "@/lib/tautulli";
import { playSound } from "@/lib/sounds";
import { fireConfetti } from "@/lib/confetti";
import { EASE_IN_OUT, EASE_OUT_EXPO, SPRING_POP, CARD_VIEWPORT, CARD_HIDDEN, CARD_SHOWN, getPalette, type PaletteColor } from "@/lib/motion";
import { spotlightHandlers } from "@/lib/spotlight";
import { usePointerTilt } from "@/hooks/use-pointer-tilt";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import { usePosterWash } from "@/hooks/use-poster-wash";
import { KineticText } from "@/components/motion/KineticText";
import { useTheme } from "@/hooks/use-theme";
import type { ThemeDecor } from "@/lib/themes";
import type { GiftPhase } from "./GiftBox";
import { UnwrapBox } from "./UnwrapBox";
import { RunnersUp, type RunnerUp } from "./RunnersUp";

interface TopMediaRevealProps {
  type: "movie" | "show";
  title: string;
  subtitle?: string;
  watchTime: number;
  playCount?: number;
  userCount?: number;
  thumb?: string;
  imageUrl?: string;
  skipAnimations?: boolean;
  /** Places 2–5, in a drawer that slides out under the tile once #1 is revealed */
  runnersUp?: RunnerUp[];
  /** Longest watch time in the top 5 (for the runners-up bars) */
  maxTime?: number;
}

type Stage = GiftPhase | "revealed";

// When each step starts (ms after the tap): the bow unravels and the ribbon falls off first, then the
// lid pops. The default unwrap sound (public/audio/unwrap.mp3) is composed to this timeline,
// including the drawer of runners-up sliding out (DRAWER_DELAY after the reveal).
const TIMELINE = { open: 1150, burst: 1750, confetti: 1900, reveal: 2600 };
const DRAWER_DELAY = 1000;

const ACCENTS = {
  movie: {
    icon: Film,
    label: "Movie",
    iconBg: "bg-orange/20",
    iconText: "text-orange",
    fallback: "from-orange/30 to-pink/30",
    confetti: ["orange", "pink", "gold", "yellow", "white"] as PaletteColor[],
  },
  show: {
    icon: Tv,
    label: "TV Show",
    iconBg: "bg-cyan/20",
    iconText: "text-cyan",
    fallback: "from-cyan/30 to-purple/30",
    confetti: ["cyan", "purple", "pink", "gold", "white"] as PaletteColor[],
  },
};

const STAR_PATH = "M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z";

/** Animates its height to fit its content, so swapping the gift for the result doesn't jump */
const AutoHeight = ({ children }: { children: ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [height, setHeight] = useState<number | "auto">("auto");
  // Clipped only while resizing: the lid and sparkles fly past the edges otherwise
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      className={resizing ? "relative overflow-hidden" : "relative"}
      initial={false}
      animate={{ height }}
      transition={{ duration: reduceMotion ? 0 : 0.7, ease: EASE_OUT_EXPO }}
      onAnimationStart={() => setResizing(true)}
      onAnimationComplete={() => setResizing(false)}
    >
      <div ref={ref} className="relative" aria-live="polite">
        {children}
      </div>
    </motion.div>
  );
};

/** The poster, or the media type's icon when there is none */
const PosterImage = ({ imageUrl, title, icon: Icon, iconClassName, onError }: {
  imageUrl?: string;
  title: string;
  icon: LucideIcon;
  iconClassName: string;
  onError: () => void;
}) =>
  imageUrl ? (
    <img src={imageUrl} alt={title} draggable={false} onError={onError} className="w-full h-full object-cover" />
  ) : (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-card to-background">
      <Icon className={`w-12 h-12 ${iconClassName}`} />
    </div>
  );

/** The retro themes' touches on the revealed poster */
const PosterDecor = ({ decor, type, title }: { decor: ThemeDecor; type: "movie" | "show"; title: string }) => {
  if (decor === "vhs") {
    return (
      <>
        {/* The title hand-written on a tape label, and the rental-era sticker */}
        <div
          className="absolute inset-x-2 bottom-2.5 h-6 -rotate-2 truncate rounded-[2px] px-1.5 text-[13px] leading-6 text-[#1b1b1b] shadow-md"
          style={{
            fontFamily: "'Permanent Marker', cursive",
            backgroundColor: "#f3ead3",
            backgroundImage: "repeating-linear-gradient(180deg, transparent 0 11px, rgb(47 111 216 / 0.35) 11px 12px)",
          }}
        >
          {title}
        </div>
        <div
          className="absolute left-1.5 top-1.5 flex h-12 w-12 -rotate-12 flex-col items-center justify-center rounded-full bg-[#ffc93c] text-[9px] font-extrabold italic leading-tight text-[#e8322f] shadow-md"
          style={{ fontFamily: "'Kanit', sans-serif" }}
        >
          <span>BE KIND</span>
          <span>REWIND</span>
        </div>
      </>
    );
  }
  if (decor === "rental") {
    return (
      <>
        {/* A gold frame and the store's corner ribbon */}
        <div className="absolute inset-0 rounded-xl ring-2 ring-inset ring-primary" />
        {/* Centred far enough from the corner for its whole word to show */}
        <div
          className="absolute -left-6 top-6 w-32 -rotate-45 bg-primary py-0.5 text-center text-[9px] tracking-[0.08em] text-primary-foreground shadow-md"
          style={{ fontFamily: "'Archivo Black', sans-serif" }}
        >
          {type === "movie" ? "NEW RELEASE" : "TV SERIES"}
        </div>
      </>
    );
  }
  return null;
};

/** The revealed poster: tilts toward the mouse with a moving glare, wears a #1 badge */
const RevealedPoster = ({ layoutId, decor, children }: { layoutId: string; decor?: ReactNode; children: ReactNode }) => {
  const tilt = usePointerTilt(12);
  const glare = useMotionTemplate`radial-gradient(circle at ${tilt.glareX} ${tilt.glareY}, rgb(255 255 255 / 0.5), transparent 55%)`;
  const [sparkling, setSparkling] = useState(true);

  return (
    <motion.div
      layoutId={layoutId}
      className="relative shrink-0 w-28 h-[168px] md:w-36 md:h-[216px]"
      transition={{ type: "spring", stiffness: 130, damping: 20 }}
    >
      <motion.div
        className="relative w-full h-full rounded-xl overflow-hidden ring-1 ring-white/15 shadow-[0_24px_50px_-12px_rgb(0_0_0/0.85)]"
        style={{ rotateX: tilt.rotateX, rotateY: tilt.rotateY, transformPerspective: 700 }}
        {...tilt.handlers}
      >
        {children}
        {decor}
        <motion.div className="absolute inset-0 pointer-events-none mix-blend-overlay" style={{ background: glare, opacity: tilt.hover }} />
        <div className="absolute inset-0 shine shine-once pointer-events-none" style={{ "--shine-delay": "0.7s" } as CSSProperties} />
      </motion.div>

      <motion.div
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ ...SPRING_POP, delay: 0.65 }}
        className="absolute -top-2.5 -right-2.5 z-10 rounded-full px-2.5 py-1 font-display text-sm font-extrabold leading-none bg-gradient-to-br from-yellow to-orange text-background shadow-[0_6px_20px_-4px_hsl(var(--orange)/0.8)]"
      >
        #1
      </motion.div>

      {/* A few sparkles linger around the poster after the reveal (then they're gone for good, so
          their twinkling stops too) */}
      {sparkling && (
        <motion.div
          aria-hidden
          className="absolute -inset-6 pointer-events-none"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ delay: 3, duration: 1.2 }}
          onAnimationComplete={() => setSparkling(false)}
        >
          {[
            ["-2%", "12%", 14, 0],
            ["96%", "38%", 10, 0.5],
            ["8%", "92%", 12, 0.9],
            ["88%", "4%", 9, 1.3],
          ].map(([left, top, size, delay], i) => (
            <svg
              key={i}
              viewBox="0 0 24 24"
              width={size as number}
              height={size as number}
              className="absolute animate-twinkle text-yellow"
              style={{ left: left as string, top: top as string, animationDelay: `${delay}s` }}
            >
              <path d={STAR_PATH} fill="currentColor" />
            </svg>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
};

const Chip = ({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) => (
  <motion.div
    variants={{ hidden: { opacity: 0, y: 12, scale: 0.9 }, show: { opacity: 1, y: 0, scale: 1, transition: SPRING_POP } }}
    className="flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-sm"
  >
    <Icon className="w-4 h-4 text-primary shrink-0" />
    {children}
  </motion.div>
);

export const TopMediaReveal = ({
  type,
  title,
  subtitle,
  watchTime,
  playCount,
  userCount,
  imageUrl,
  skipAnimations = false,
  runnersUp = [],
  maxTime = watchTime,
}: TopMediaRevealProps) => {
  const reduceMotion = useReducedMotion();
  const [stage, setStage] = useState<Stage>(skipAnimations ? "revealed" : "idle");
  // Remembered per image, so another report's poster isn't hidden by an earlier failure
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const confettiFired = useRef(false);
  const mouthRef = useRef<HTMLSpanElement>(null);
  const giftTilt = usePointerTilt(10);
  const tile = useScrollReveal(CARD_VIEWPORT);
  // The retro themes put the pick in a VHS case instead of a gift
  const { reveal: box, decor } = useTheme();
  const inCase = box !== "gift";

  const accent = ACCENTS[type];
  const Icon = accent.icon;
  const posterId = `top-${type}-poster`;
  const poster = imageUrl && imageUrl !== failedImage ? imageUrl : undefined;
  const wash = usePosterWash(stage === "revealed" ? poster : undefined);
  const posterImage = (
    <PosterImage imageUrl={poster} title={title} icon={Icon} iconClassName={accent.iconText} onError={() => setFailedImage(imageUrl ?? null)} />
  );

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  const celebrate = () => {
    if (confettiFired.current || !mouthRef.current) return;
    confettiFired.current = true;
    const palette = getPalette();
    fireConfetti(mouthRef.current, { colors: accent.confetti.map((color) => palette[color]), count: 150, spread: 85, velocity: 15 });
  };

  const reveal = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    setStage("revealed");
  };

  const unwrap = () => {
    if (stage === "revealed") return;
    // A second tap skips ahead
    if (stage !== "idle") {
      celebrate();
      reveal();
      return;
    }
    playSound("unwrap", 0.4);
    if (reduceMotion) {
      reveal();
      return;
    }
    setStage("untie");
    const at = (ms: number, step: () => void) => timers.current.push(window.setTimeout(step, ms));
    at(TIMELINE.open, () => setStage("open"));
    at(TIMELINE.burst, () => setStage("burst"));
    at(TIMELINE.confetti, celebrate);
    at(TIMELINE.reveal, reveal);
  };

  const revealed = stage === "revealed";

  // Once the poster has landed, the runners-up slide out from under the tile
  const [drawerOpen, setDrawerOpen] = useState(skipAnimations);
  useEffect(() => {
    if (!revealed || drawerOpen) return;
    const timer = window.setTimeout(() => setDrawerOpen(true), reduceMotion ? 0 : DRAWER_DELAY);
    return () => window.clearTimeout(timer);
  }, [revealed, drawerOpen, reduceMotion]);

  return (
    // The tile and its drawer enter (and rewind) together
    <motion.div
      ref={tile.ref}
      initial={CARD_HIDDEN}
      animate={tile.shown ? CARD_SHOWN : CARD_HIDDEN}
      transition={{ duration: 0.9, ease: EASE_OUT_EXPO }}
      className="relative"
    >
      <div {...spotlightHandlers} className="stat-card relative z-10">
        {/* Once revealed, the card takes on the poster's colours: a tiny copy of it stretched over the
            card (a CSS blur this size is too heavy for phones, two cards at once especially) */}
        {revealed && (
          <div aria-hidden className="absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none">
            {poster && wash !== null ? (
              wash && (
                <motion.div
                  initial={{ opacity: 0, scale: 1.8 }}
                  animate={{ opacity: 0.45, scale: 1.5 }}
                  transition={{ duration: 1.4, ease: EASE_OUT_EXPO }}
                  className="absolute inset-0 bg-cover bg-center saturate-150"
                  style={{ backgroundImage: `url("${wash}")` }}
                />
              )
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`absolute inset-0 bg-gradient-to-br ${accent.fallback}`}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-br from-background/30 via-background/65 to-background/90" />
          </div>
        )}

        <AutoHeight>
          {/* No initial={false} here: it would also skip the entrance of anything mounted later inside the gift (the rising poster) */}
          <AnimatePresence mode="popLayout">
            {!revealed ? (
              <motion.button
                key="wrapped"
                type="button"
                onClick={unwrap}
                aria-label={`${inCase ? "Open" : "Unwrap"} your top ${type === "movie" ? "movie" : "TV show"}`}
                className="w-full flex flex-col items-center text-center rounded-xl cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-card"
                exit={{ opacity: 0, y: 24, scale: 0.96, transition: { duration: 0.4, ease: EASE_IN_OUT } }}
                {...giftTilt.handlers}
              >
                <UnwrapBox
                  variant={type}
                  phase={stage}
                  tiltX={giftTilt.rotateX}
                  tiltY={giftTilt.rotateY}
                  hover={giftTilt.hover}
                  className="max-w-full"
                >
                  <span ref={mouthRef} className="absolute bottom-0 left-1/2 w-px h-px" />
                  {stage === "burst" && (
                    <motion.div
                      layoutId={posterId}
                      className="gift-3d relative w-[104px] h-[156px]"
                      style={{ transformPerspective: 800 }}
                      // Gift: starts deep in the box (hidden below its rim), launches up on a spring that
                      // overshoots a little and settles, turning from its back to face the viewer.
                      // Case: flips out of the tray toward the viewer.
                      initial={inCase ? { y: 34, scale: 0.4, rotateY: 150, rotateZ: -8 } : { y: 215, scale: 0.82, rotateY: 140, rotateZ: -7 }}
                      animate={{ y: 0, scale: 1, rotateY: 0, rotateZ: 0 }}
                      transition={{
                        y: { type: "spring", stiffness: 95, damping: 13, mass: 0.9, delay: 0.08 },
                        scale: { duration: 0.8, ease: EASE_OUT_EXPO, delay: 0.08 },
                        rotateY: { duration: 1, ease: EASE_OUT_EXPO, delay: 0.08 },
                        rotateZ: { type: "spring", stiffness: 120, damping: 9, delay: 0.08 },
                      }}
                    >
                      <div className="absolute inset-0 rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/20 [backface-visibility:hidden]">
                        {posterImage}
                      </div>
                      <div
                        className="poster-back absolute inset-0 rounded-xl flex items-center justify-center ring-1 ring-white/20 [backface-visibility:hidden] [transform:rotateY(180deg)]"
                        style={{ "--ray": type === "movie" ? "var(--orange)" : "var(--cyan)" } as CSSProperties}
                      >
                        {inCase ? <Clapperboard className="w-10 h-10 text-foreground/80" /> : <Gift className="w-10 h-10 text-foreground/80" />}
                      </div>
                    </motion.div>
                  )}
                </UnwrapBox>

                <motion.div
                  initial={false}
                  animate={{ opacity: stage === "idle" ? 1 : 0, y: stage === "idle" ? 0 : 12 }}
                  transition={{ duration: 0.3 }}
                  className="mt-1"
                >
                  <p className="font-display text-2xl font-bold tracking-tight text-foreground">Your #1 {accent.label}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {box === "rentalCase" ? "Tap to open your rental!" : box === "blankTape" ? "Tap to open the tape!" : "Tap to unwrap your top pick!"}
                  </p>
                </motion.div>
              </motion.button>
            ) : (
              <motion.div
                key="revealed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
              >
                <motion.div
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, duration: 0.6, ease: EASE_OUT_EXPO }}
                  className="flex items-center gap-2 mb-6"
                >
                  <div className={`p-2 rounded-lg ${accent.iconBg}`}>
                    <Icon className={`w-5 h-5 ${accent.iconText}`} />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Your Top {accent.label}
                  </span>
                </motion.div>

                <div className="flex items-center gap-5 md:gap-7">
                  <RevealedPoster layoutId={posterId} decor={<PosterDecor decor={decor} type={type} title={title} />}>
                    {posterImage}
                  </RevealedPoster>

                  <div className="flex-1 min-w-0">
                    <KineticText
                      as="h3"
                      text={title}
                      trigger="mount"
                      delay={0.35}
                      className="font-display text-2xl md:text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground mb-2"
                    />

                    {subtitle && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="text-muted-foreground"
                      >
                        {subtitle}
                      </motion.p>
                    )}

                    <motion.div
                      initial="hidden"
                      animate="show"
                      variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.7 } } }}
                      className="flex flex-wrap items-center gap-2 mt-4"
                    >
                      <Chip icon={Clock}>
                        <span className="font-bold text-foreground">{formatDuration(watchTime)}</span>
                        <span className="text-muted-foreground">watched</span>
                      </Chip>
                      {playCount !== undefined && playCount > 1 && (
                        <Chip icon={Play}>
                          <span className="font-bold text-foreground">{playCount}x</span>
                          <span className="text-muted-foreground">plays</span>
                        </Chip>
                      )}
                      {userCount !== undefined && userCount >= 1 && (
                        <Chip icon={Users}>
                          <span className="font-bold text-foreground">{userCount}</span>
                          <span className="text-muted-foreground">{userCount === 1 ? "viewer" : "viewers"}</span>
                        </Chip>
                      )}
                    </motion.div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </AutoHeight>
      </div>

      {/* The drawer: tucked under the tile's bottom edge, it grows open while its contents slide down */}
      {drawerOpen && runnersUp.length > 0 && (
        <motion.div
          initial={skipAnimations ? false : { height: 0 }}
          animate={{ height: "auto" }}
          transition={{ duration: 0.9, ease: EASE_OUT_EXPO }}
          className="relative z-0 -mt-6 mx-3 overflow-hidden"
        >
          <motion.div
            initial={skipAnimations ? false : { y: "-100%" }}
            animate={{ y: 0 }}
            transition={{ duration: 0.9, ease: EASE_OUT_EXPO }}
            className="runner-drawer rounded-b-2xl border border-t-0 border-white/10 px-5 pb-5 pt-10 md:px-6"
          >
            <RunnersUp type={type} items={runnersUp} maxTime={maxTime} />
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
};
