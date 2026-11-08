import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { animate, motion, useAnimationFrame, useInView, useMotionValue, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";
import { EASE_OUT_EXPO } from "@/lib/motion";
import type { GiftBoxProps } from "./GiftBox";

/** A retro blank tape's box (VHS Rewind), or a video store's rental case (Rental Night) */
export type CaseDesign = "blank" | "rental";

// Geometry (px). The case stands upright, the tray's centre at the scene's origin. Like a real
// clamshell it's two moulded halves: the deep tray and a shallow lid, joined by a hinge along the
// spine (the left edge). Opened, the lid swings round to lie beside the tray like an open book.
const W = 120; // width
const H = 200; // height
const D = 21; // the tray's depth
const LD = 5; // the lid's depth
const RIM = 3; // the moulded edge round the tray, and inside the lid
const STAGE_W = 280;
const STAGE_H = 270;
const ORIGIN_Y = 126; // where the case's centre sits in the stage
const PERSPECTIVE = 1000;
const REST_X = -6; // looking down a little
const LID_OPEN = -172; // degrees: nearly flat, still a touch toward the viewer
// Opened, the case slides right by this much, so the open book (lid and tray) is centred
const OPEN_SHIFT = W / 2;
// How far it turns to face the viewer while opening (a little of its resting angle stays, so it reads as 3D)
const FACING = 0.88;
// What comes out (TopMediaReveal's poster) is centred on the case
const POSTER_H = 156;

const KANIT = "'Kanit', sans-serif";
const ARCHIVO = "'Archivo Black', sans-serif";
const RIBS = "repeating-linear-gradient(90deg, rgb(255 255 255 / 0.05) 0 2px, transparent 2px 5px)";
const BARCODE = "repeating-linear-gradient(90deg, #111 0 1px, #fff 1px 2px, #111 2px 4px, #fff 4px 5px, #111 5px 6px, #fff 6px 8px)";
const SHEEN = "linear-gradient(115deg, rgb(255 255 255 / 0.2) 0 14%, transparent 30%)";
const STRIPES = (angle: string, from: number, step: number) =>
  `linear-gradient(${angle}, transparent 0 ${from}%, ${["#e8322f", "#f5821f", "#ffc93c", "#3fae49", "#2f6fd8"]
    .map((color, i) => `${color} ${from + i * step}% ${from + (i + 1) * step}%`)
    .join(", ")}, transparent ${from + 5 * step}%)`;

// shell: outside; rim: the cover's frame; edge: the moulded rim round the tray and inside the lid
const PLASTIC = {
  blank: {
    shell: "linear-gradient(160deg, #262626, #121212)",
    rim: "#0a0a0a",
    edge: "#202020",
    hinge: "#333333",
    tray: "linear-gradient(160deg, #1f1f1f, #141414)",
    lidInside: "linear-gradient(160deg, #2a2a2a, #161616)",
    pin: "radial-gradient(circle at 35% 35%, #4a4a4a, #151515)",
    tapeLabel: "#f3ead3",
  },
  rental: {
    shell: "linear-gradient(160deg, #1146b8, #0a3290)",
    rim: "#082a7a",
    edge: "#0e3ea8",
    hinge: "#1a56d1",
    tray: `${RIBS}, #0a3088`,
    lidInside: `${RIBS}, linear-gradient(160deg, #0c3a9e, #082a7a)`,
    pin: "radial-gradient(circle at 35% 35%, #2f6be0, #072a78)",
    tapeLabel: "#ffffff",
  },
};

// The light inside: warm for the movie, the theme's main colour for the show
const ACCENT = {
  movie: { ray: "var(--yellow)", glow: "var(--orange)" },
  show: { ray: "var(--cyan)", glow: "var(--cyan)" },
};

/** A flat side of the case */
const Face = ({ w, h, transform, style, children }: {
  w: number;
  h: number;
  transform: string;
  style?: CSSProperties;
  children?: ReactNode;
}) => (
  <div className="gift-face" style={{ width: w, height: h, left: -w / 2, top: -h / 2, transform, ...style }}>
    {children}
  </div>
);

/** A blank tape's box: the black one with the rainbow sash (movies), the silver one (shows) */
const BlankCover = ({ variant }: { variant: "movie" | "show" }) => {
  const movie = variant === "movie";
  return (
    <div
      className="absolute inset-0"
      style={{
        background: movie
          ? `${STRIPES("160deg", 44, 7)}, #111111`
          : `${STRIPES("180deg", 56, 6)}, linear-gradient(180deg, #efeee9, #cfcdc6)`,
      }}
    >
      <div className="absolute left-3 top-3 italic leading-none" style={{ fontFamily: KANIT, color: movie ? "#f3ead3" : "#141414" }}>
        <div className="text-[30px] font-extrabold tracking-[-0.03em]">{movie ? "E-180" : "T-120"}</div>
        <div className="mt-1 text-[9px] font-bold tracking-[0.14em]" style={{ color: movie ? "#a39a8a" : "#5a5a5a" }}>
          {movie ? "HIGH GRADE" : "EXTRA QUALITY"}
        </div>
      </div>
      <div className="absolute bottom-3 left-3 font-mono text-[7px] tracking-[0.14em]" style={{ color: movie ? "#a39a8a" : "#5a5a5a" }}>
        VIDEO CASSETTE
      </div>
    </div>
  );
};

/** A video store's rental case: the ticket stub, a sticker, the barcode and the store's plea */
const RentalCover = ({ variant }: { variant: "movie" | "show" }) => (
  // A column, so nothing can overlap: the ticket sizes itself to its word
  <div
    className="absolute inset-0 flex flex-col items-center px-3 pb-3 pt-5"
    style={{ background: `${RIBS}, linear-gradient(160deg, #1450c8, #0d3fa9 55%, #0a3290)`, fontFamily: ARCHIVO }}
  >
    <div className="-rotate-6 drop-shadow-[0_3px_4px_rgb(0_0_0/0.35)]">
      <div
        className="ticket-notched relative bg-[#ffa903] pb-1 pl-5 pr-3 pt-1.5 text-[15px] leading-none tracking-[0.04em] text-[#0d3fa9]"
        style={{ "--notch": "4px" } as CSSProperties}
      >
        <span aria-hidden className="absolute bottom-1 left-2 top-1 border-l-[1.5px] border-dashed border-[#0d3fa9]/60" />
        RENTAL
      </div>
    </div>
    <div className="mt-4 w-full rounded-[2px] bg-white py-1 text-center text-[9px] leading-none tracking-[0.06em] text-[#0d3fa9]">
      {variant === "movie" ? "NEW RELEASE" : "TV SERIES"}
    </div>
    <div className="mt-auto w-[72%] bg-white p-[3px]">
      <div className="h-5" style={{ background: BARCODE }} />
    </div>
    <div className="mt-2 text-[7px] leading-none tracking-[0.12em] text-[#ffa903]">BE KIND · REWIND</div>
  </div>
);

/** The spine, seen while the case is turned */
const Spine = ({ design, variant }: { design: CaseDesign; variant: "movie" | "show" }) =>
  design === "rental" ? (
    <div className="absolute inset-0 bg-[#0d3fa9]">
      <div className="absolute inset-x-0 top-6 h-10 bg-[#ffa903]" />
    </div>
  ) : (
    <div className="absolute inset-0" style={{ background: variant === "movie" ? "#111111" : "#dcdad3" }}>
      <div className="absolute inset-x-0 top-8 h-9" style={{ background: STRIPES("180deg", 0, 20) }} />
    </div>
  );

/** The tape in the tray: a hand-written label along its edge and the two reels behind the window */
const Cassette = ({ design, variant }: { design: CaseDesign; variant: "movie" | "show" }) => (
  <div
    className="absolute rounded-[4px] bg-[#151515]"
    style={{ inset: "12px 14px", boxShadow: "inset 0 0 0 1px #2c2c2c, 0 3px 8px rgb(0 0 0 / 0.5)" }}
  >
    <div
      className="absolute flex items-center justify-center overflow-hidden rounded-[2px]"
      style={{ left: 7, top: 12, bottom: 12, width: 24, background: PLASTIC[design].tapeLabel }}
    >
      <span className="rotate-180 text-[13px] leading-none text-[#1b1b1b] [writing-mode:vertical-rl]" style={{ fontFamily: "'Permanent Marker', cursive" }}>
        {variant === "movie" ? "Movies" : "Shows"}
      </span>
    </div>
    <div className="absolute rounded-[4px] bg-[#0a0a0a]" style={{ left: 40, right: 9, top: 36, bottom: 36, boxShadow: "inset 0 0 0 1px #3a3a3a" }}>
      {/* The take-up reel is nearly empty: the tape hasn't been played yet */}
      <div
        className="absolute left-1/2 top-[16%] -ml-[15px] h-[30px] w-[30px] rounded-full"
        style={{ background: "radial-gradient(circle, #e8e8e8 0 5px, #3a2d22 5.5px 13px, #1d1712 13.5px)" }}
      />
      <div
        className="absolute bottom-[16%] left-1/2 -ml-[15px] h-[30px] w-[30px] rounded-full"
        style={{ background: "radial-gradient(circle, #e8e8e8 0 5px, #3a2d22 5.5px 8px, #1d1712 8.5px)" }}
      />
    </div>
  </div>
);

/**
 * A VHS case in real 3D (CSS) that takes the gift's place in the retro themes, with the same props
 * and phases: idle (sways, the lid gives a little under the pointer) → untie (turns to face the viewer,
 * the catch gives) → open (the lid swings wide on its hinge) → burst (light pours out of the tray).
 */
export const VhsCase = ({
  design,
  variant,
  phase = "idle",
  size = "md",
  tiltX,
  tiltY,
  hover,
  children,
  className,
}: GiftBoxProps & { design: CaseDesign }) => {
  const reduceMotion = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(stageRef);
  const zero = useMotionValue(0);
  const tx = tiltX ?? zero;
  const ty = tiltY ?? zero;
  const hv = hover ?? zero;
  // The show case is the mirror image of the movie case, showing its spine
  const restY = variant === "movie" ? -26 : 26;
  const plastic = PLASTIC[design];
  const accent = ACCENT[variant];

  // 0 at rest, FACING (nearly straight on) while it opens
  const facing = useMotionValue(0);
  // 0 shut, 1 swung open (the spring overshoots a little)
  const open = useMotionValue(0);

  // A slow figure-eight sway while on screen, and a turn as it scrolls through; both give way to the pointer
  const swayTime = useMotionValue(0);
  useAnimationFrame((_, delta) => {
    if (inView && !reduceMotion) swayTime.set(swayTime.get() + delta);
  });
  const { scrollYProgress } = useScroll({ target: stageRef, offset: ["start end", "end start"] });
  const rotateY = useTransform([ty, hv, swayTime, scrollYProgress, facing], ([t, h, s, p, f]: number[]) => {
    const drift = Math.sin(s / 1300) * 10 + (reduceMotion ? 0 : (p - 0.5) * 20);
    return (restY + (1 - h) * drift) * (1 - f) + t;
  });
  const rotateX = useTransform([tx, hv, swayTime, facing], ([t, h, s, f]: number[]) =>
    (REST_X + (1 - h) * Math.sin(s / 1900) * 4) * (1 - f) + t,
  );
  // Under the pointer the lid gives a little; opened, it swings wide
  const lidAngle = useTransform([open, hv], ([o, h]: number[]) => LID_OPEN * o - 14 * h * Math.max(0, 1 - o * 4));
  // ...and the case slides over to keep the open book centred
  const openShift = useTransform(open, (o) => Math.min(Math.max(o, 0), 1) * OPEN_SHIFT);

  // Keyed on the state rather than the phase, so moving on to "burst" doesn't cut the lid's swing short
  const turned = phase !== "idle";
  const lid = phase === "idle" ? "shut" : phase === "untie" ? "unlatched" : "open";

  useEffect(() => {
    const controls = animate(facing, turned ? FACING : 0, { duration: turned ? 0.9 : 0.5, ease: EASE_OUT_EXPO });
    return () => controls.stop();
  }, [turned, facing]);

  useEffect(() => {
    const controls =
      lid === "shut"
        ? animate(open, 0, { duration: 0.3 })
        : lid === "unlatched"
          ? animate(open, 0.06, { delay: 0.85, type: "spring", stiffness: 320, damping: 14 })
          : animate(open, 1, { type: "spring", stiffness: 70, damping: 11 });
    return () => controls.stop();
  }, [lid, open]);

  // The waiting loops (float, jiggle, shadow) only run while the case can be seen
  const idle = phase === "idle" && !reduceMotion && inView;
  const lit = phase === "burst" ? 1 : phase === "open" ? 0.55 : 0;

  const stage = (
    <div
      ref={stageRef}
      className={cn("relative select-none", className)}
      style={{ width: STAGE_W, height: STAGE_H, ["--ray" as string]: accent.ray, ["--glow" as string]: accent.glow }}
    >
      {/* Rays behind the case */}
      <motion.div
        className="absolute pointer-events-none"
        style={{ width: 480, height: 480, left: STAGE_W / 2 - 240, top: ORIGIN_Y - 240 }}
        initial={false}
        animate={phase === "burst" ? { opacity: 1, scale: 1.2 } : phase === "open" ? { opacity: 0.5, scale: 0.75 } : { opacity: 0, scale: 0.3 }}
        transition={{ duration: phase === "burst" ? 0.9 : 0.6, delay: phase === "open" ? 0.3 : 0, ease: EASE_OUT_EXPO }}
      >
        {/* Turning only once there's light to see */}
        <div className={cn("gift-rays absolute inset-0", lit > 0 && "animate-spin-slow")} />
      </motion.div>

      {/* Floor shadow */}
      <motion.div
        className="absolute rounded-[50%] pointer-events-none"
        style={{
          width: 170,
          height: 26,
          left: STAGE_W / 2 - 85,
          top: STAGE_H - 34,
          background: "radial-gradient(closest-side, hsl(0 0% 0% / 0.55), transparent)",
        }}
        animate={idle ? { scale: [1, 0.86, 1, 1, 1], opacity: [1, 0.7, 1, 1, 1] } : { scale: 1, opacity: phase === "burst" ? 0.6 : 1 }}
        transition={idle ? { duration: 3.6, times: [0, 0.3, 0.55, 0.76, 1], repeat: Infinity, ease: "easeInOut" } : { duration: 0.4 }}
      />

      {/* The case itself: floats while waiting, lifts and shakes as the catch gives, settles once open */}
      <motion.div
        className="absolute inset-0"
        style={{ perspective: PERSPECTIVE, transformOrigin: `50% ${ORIGIN_Y + H / 2}px`, x: openShift }}
        animate={
          idle
            ? { y: [0, -8, 0, -2, -3, -2, 0, 0], rotate: [0, 0, 0, -3, 3, -2, 0, 0], scaleX: 1, scaleY: 1 }
            : phase === "untie"
              ? { y: -12, rotate: [0, 0, -2.5, 2.5, -1.5, 0], scaleX: 1, scaleY: 1 }
              : phase === "open"
                ? { y: -4, rotate: 0, scaleX: [1, 1.04, 0.98, 1], scaleY: [1, 0.95, 1.03, 1] }
                : phase === "burst"
                  ? { y: 10, rotate: 0, scaleX: 1, scaleY: 1 }
                  : { y: 0, rotate: 0, scaleX: 1, scaleY: 1 }
        }
        transition={
          idle
            ? { duration: 3.6, times: [0, 0.3, 0.55, 0.6, 0.64, 0.68, 0.76, 1], repeat: Infinity, ease: "easeInOut" }
            : phase === "untie"
              ? { y: { duration: 0.6, ease: EASE_OUT_EXPO }, rotate: { duration: 0.5, delay: 0.45 } }
              : phase === "open"
                ? { duration: 0.5, times: [0, 0.3, 0.65, 1], ease: "easeOut" }
                : { duration: 0.6, ease: EASE_OUT_EXPO }
        }
      >
        <motion.div className="gift-3d absolute" style={{ left: STAGE_W / 2, top: ORIGIN_Y, width: 0, height: 0, rotateX, rotateY }}>
          {/* The shell: back, spine, side, top and bottom */}
          <Face w={W} h={H} transform={`rotateY(180deg) translateZ(${D / 2}px)`} style={{ background: plastic.shell, borderRadius: 4 }} />
          <Face w={D} h={H} transform={`rotateY(-90deg) translateZ(${W / 2}px)`}>
            <Spine design={design} variant={variant} />
          </Face>
          <Face w={D} h={H} transform={`rotateY(90deg) translateZ(${W / 2}px)`} style={{ background: plastic.shell }} />
          <Face w={W} h={D} transform={`rotateX(90deg) translateZ(${H / 2}px)`} style={{ background: plastic.shell }} />
          <Face w={W} h={D} transform={`rotateX(-90deg) translateZ(${H / 2}px)`} style={{ background: plastic.shell }} />

          {/* The tray with the tape in it, lit up once it's open, and the moulded rim round it (the lid
              closes onto this rim, and opened, lies against it at the hinge) */}
          <Face w={W - 2 * RIM} h={H - 2 * RIM} transform={`translateZ(${D / 2 - 1}px)`} style={{ background: plastic.tray, borderRadius: 3 }}>
            <Cassette design={design} variant={variant} />
            <motion.div
              className="absolute inset-0"
              style={{ background: "radial-gradient(closest-side, hsl(0 0% 100% / 0.85), hsl(var(--glow) / 0.5) 50%, transparent)" }}
              initial={false}
              animate={{ opacity: lit }}
              transition={{ duration: 0.5, delay: phase === "open" ? 0.25 : 0 }}
            />
          </Face>
          <Face
            w={W}
            h={H}
            transform={`translateZ(${D / 2}px)`}
            style={{ border: `${RIM}px solid ${plastic.edge}`, borderRadius: 4, boxShadow: "inset 0 0 6px rgb(0 0 0 / 0.6)" }}
          />

          {/* The hinge's knuckles along the spine edge */}
          {[0.16, 0.72].map((at) => (
            <div
              key={at}
              className="absolute rounded-full"
              style={{
                left: -W / 2 - 2,
                top: -H / 2 + H * at,
                width: 4,
                height: 24,
                transform: `translateZ(${D / 2 + 0.5}px)`,
                background: plastic.hinge,
                boxShadow: "inset -1px 0 1px rgb(0 0 0 / 0.5)",
              }}
            />
          ))}

          {/* The lid: its inside lies on the tray's rim when shut, the cover LD in front of it, walls round
              the edge; hinged on the spine edge */}
          <motion.div
            className="gift-3d absolute"
            style={{ left: -W / 2, top: -H / 2, width: W, height: H, z: D / 2, originX: 0, rotateY: lidAngle }}
          >
            <div className="gift-face inset-0 rounded-[4px]" style={{ transform: `translateZ(${LD}px)`, border: `2px solid ${plastic.rim}` }}>
              {design === "rental" ? <RentalCover variant={variant} /> : <BlankCover variant={variant} />}
              {/* The plastic sleeve's sheen */}
              <div className="absolute inset-0" style={{ background: SHEEN }} />
            </div>
            {/* Inside: the same moulded rim as the tray, and the two pins that hold the tape's reels */}
            <div
              className="gift-face inset-0 rounded-[4px]"
              style={{ transform: "rotateY(180deg)", background: plastic.lidInside, boxShadow: `inset 0 0 0 ${RIM}px ${plastic.edge}` }}
            >
              {["30%", "62%"].map((top) => (
                <div
                  key={top}
                  className="absolute left-1/2 -ml-[6px] h-3 w-3 rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.6)]"
                  style={{ top, background: plastic.pin }}
                />
              ))}
            </div>
            {/* The lid's walls */}
            {[
              { left: W - LD / 2, top: 0, width: LD, height: H, transform: `translateZ(${LD / 2}px) rotateY(90deg)` },
              { left: -LD / 2, top: 0, width: LD, height: H, transform: `translateZ(${LD / 2}px) rotateY(-90deg)` },
              { left: 0, top: -LD / 2, width: W, height: LD, transform: `translateZ(${LD / 2}px) rotateX(90deg)` },
              { left: 0, top: H - LD / 2, width: W, height: LD, transform: `translateZ(${LD / 2}px) rotateX(-90deg)` },
            ].map((wall, i) => (
              <div key={i} className="gift-face" style={{ ...wall, background: plastic.shell }} />
            ))}
          </motion.div>
        </motion.div>

        {/* Bloom over the open case (plain blending: a blend mode would have the whole 3D case drawn
            off screen first, every frame) */}
        <motion.div
          className="absolute pointer-events-none"
          style={{
            width: 260,
            height: 260,
            left: STAGE_W / 2 - 130,
            top: ORIGIN_Y - 130,
            background: "radial-gradient(closest-side, hsl(0 0% 100% / 0.8), hsl(var(--glow) / 0.4) 50%, transparent)",
          }}
          initial={false}
          animate={{ opacity: phase === "burst" ? 0.85 : phase === "open" ? 0.35 : 0, scale: phase === "burst" ? 1.1 : 0.8 }}
          transition={{ duration: 0.6, delay: phase === "open" ? 0.3 : 0 }}
        />

        {/* Whatever comes out of the case (the poster), centred on it */}
        {children && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute flex justify-center" style={{ left: 0, right: 0, bottom: STAGE_H - (ORIGIN_Y + POSTER_H / 2) }}>
              {children}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );

  if (size === "sm") {
    return (
      <div className="relative" style={{ width: STAGE_W / 2, height: STAGE_H / 2 }}>
        <div className="absolute left-0 top-0 origin-top-left scale-50">{stage}</div>
      </div>
    );
  }
  return stage;
};
