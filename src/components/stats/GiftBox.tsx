import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  animate,
  motion,
  useAnimationFrame,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
  type Easing,
  type MotionValue,
} from "framer-motion";
import { cn } from "@/lib/utils";
import { EASE_OUT_EXPO } from "@/lib/motion";

export type GiftPhase = "idle" | "untie" | "open" | "burst";

export interface GiftBoxProps {
  variant: "movie" | "show";
  phase?: GiftPhase;
  /** "sm" is a half-size gift (loading screen) */
  size?: "md" | "sm";
  /** Extra tilt in degrees on top of the resting angle (from the mouse pointer) */
  tiltX?: MotionValue<number>;
  tiltY?: MotionValue<number>;
  /** 0..1 while the pointer is over the gift: the lid lifts a little, teasing */
  hover?: MotionValue<number>;
  /** Shown at the mouth of the box, in front of everything: what comes out of the present */
  children?: ReactNode;
  className?: string;
}

// Geometry (px). The scene's origin is the centre of the box body; y points down.
const W = 140; // body width and depth
const H = 110; // body height
const LW = 152; // lid width and depth
const LH = 30; // lid height
const LID_Y = -H / 2 - LH / 2 + 10; // lid centre: the lid overlaps the body by 10px
const LID_TOP = LID_Y - LH / 2; // the top surface of the lid
const LID_BOTTOM = LID_Y + LH / 2; // the lid's bottom edge
const LIP = (LW - W) / 2; // how far the lid's rim stands out from the box
const RIBBON = 22;
const RIBBON_T = 2; // how far the ribbon stands proud of the paper
const STAGE_W = 280;
const STAGE_H = 270;
const ORIGIN_Y = 165; // where the body's centre sits in the stage
const PERSPECTIVE = 1000;
const REST_X = -20; // looking down onto the lid
const KNOT_Y = 56; // the knot in the bow's SVG

/** Where a point on the box's vertical axis lands on screen, so 2D effects line up with the 3D box */
const projectY = (y: number, angleX: number) => {
  const a = (angleX * Math.PI) / 180;
  const k = PERSPECTIVE / (PERSPECTIVE - y * Math.sin(a));
  return STAGE_H / 2 + (ORIGIN_Y - STAGE_H / 2 + y * Math.cos(a)) * k;
};

// The body's mouth on screen, for the light effects and whatever rises out
const MOUTH_Y = projectY(-H / 2, REST_X);

const ACCENT = {
  movie: { paper: "gift-paper-movie", ray: "var(--yellow)", glow: "var(--orange)" },
  show: { paper: "gift-paper-show", ray: "var(--cyan)", glow: "var(--cyan)" },
};

const STAR_PATH = "M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z";

// Idle sparkles around the box: [left %, top %, size, delay]
const SPARKLES: [number, number, number, number][] = [
  [12, 30, 16, 0],
  [86, 22, 12, 0.6],
  [6, 70, 10, 1.2],
  [92, 62, 18, 0.3],
  [24, 8, 10, 1.6],
  [74, 86, 12, 0.9],
];

// The sparkle puff when the lid pops: evenly around, with a little variation baked in
const PUFF = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2 + (i % 2) * 0.3;
  const distance = 70 + (i % 3) * 30;
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance * 0.55 - 40, size: 8 + (i % 3) * 4 };
});

// The ribbon is a cross under the box with four arms, one up each side: from the box's bottom
// edge, up its side, out under the lid's rim, up the lid and over its edge to the knot. Each arm is
// lit like the face it lies on (`dim` is about how dark that is overall, for once it's off the box);
// they spring loose front first, the back last, each falling a little askew.
const PIECES = [
  { angle: 0, delay: 0.3, askew: -5, shade: "gift-shade-front", dim: 0.1 },
  { angle: 90, delay: 0.34, askew: 7, shade: "gift-shade-side", dim: 0.4 },
  { angle: -90, delay: 0.37, askew: -6, shade: "gift-shade-side", dim: 0.4 },
  { angle: 180, delay: 0.4, askew: 4, shade: "gift-shade-back", dim: 0.35 },
];
type Piece = (typeof PIECES)[number];
const BODY_RUN = H / 2 - LID_BOTTOM; // up the box, from its bottom edge to the lid's rim
const TUCK = H - BODY_RUN; // and on up under the lid
const TOP_RUN = LW / 2; // across the lid, from its edge to the knot
const CORNER = BODY_RUN + LH; // how far along the arm it turns over the lid's edge
const ARM_LEN = CORNER + TOP_RUN;

/**
 * A falling arm is a chain of short links, each hanging from the end of the one before, so it can
 * bend anywhere along its length. `s` is how far along the arm (from the box's bottom edge) the
 * link's middle is; `slice` is where it sits in the shading of the run it's part of, so the links of
 * a run, lying straight, look just like the one strip of a tied arm.
 */
interface ArmLink {
  len: number;
  s: number;
  run: "body" | "side" | "top";
  slice: [number, number]; // [the run's length, the link's distance from the run's top]
  extra?: number; // runs on past its end, closing the corner over the lid's edge
  under?: number; // runs back past its start, closing the corner with the cross under the box
  rim?: boolean; // starts out under the lid's rim
  tuck?: boolean; // the last on the box, which runs on up under the lid
}
// Up the box the ribbon's shading runs from the top of the tuck to round the box's bottom edge
const BODY_SHADING = H + RIBBON_T;
const ARM_LINKS: ArmLink[] = (() => {
  const links: ArmLink[] = [];
  // [run, links, length, length of the run's shading, what the last link adds]
  const runs = [
    ["body", 8, BODY_RUN, BODY_SHADING, 0],
    ["side", 2, LH, LH + RIBBON_T, RIBBON_T],
    ["top", 6, TOP_RUN, TOP_RUN, 0],
  ] as const;
  let start = 0;
  for (const [run, count, length, shading, extra] of runs) {
    const len = length / count;
    for (let i = 0; i < count; i++) {
      const last = i === count - 1;
      links.push({
        len,
        s: start + (i + 0.5) * len,
        run,
        slice: [shading, (run === "body" ? H : shading) - (i + 1) * len - (last ? extra : 0)],
        extra: last ? extra : 0,
        under: run === "body" && i === 0 ? RIBBON_T : 0,
        rim: run === "side" && i === 0,
        tuck: run === "body" && last,
      });
    }
    start += length;
  }
  return links;
})();

// Once the bow's off, each arm comes away as a ribbon would: its end springs up off the lid and
// curls outward, the arm peels away from the box into an arc that folds over at the end (keeping
// a crease from the lid's edge), and a ripple runs along it. Once every end is clear of the lid the
// whole ribbon drops away below the (floating) box, the cross underneath leading and bowing a
// little, the arms trailing above it.
const ARM_TIME = 1.1;
// Out from under the lid's rim (and no longer lifting with the lid) as it comes away from the box
const OFF_THE_RIM = [0.12, 0.35]; // (of ARM_TIME)
const DROP_AT = PIECES[PIECES.length - 1].delay + ARM_TIME * 0.22;
const DROP_TIME = 0.8;
const DROP = 230; // how far it falls before it's gone
const CROSS_BOW = 14; // how far the cross's ends bend up as it falls
const EASE_IN_QUAD: Easing = [0.11, 0, 0.5, 0];
const smoothstep = (from: number, to: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/**
 * Which way the arm runs `s` along its length, `p` of the way through coming undone: in degrees
 * from straight up the box, + in over the lid, - out from the box
 */
const armShape = (s: number, p: number) => {
  const u = s / ARM_LEN;
  const onTop = s > CORNER;
  const tied = onTop ? 90 : 0;
  const sprung = onTop ? 25 - 60 * ((s - CORNER) / TOP_RUN) ** 1.2 : (-6 * s) / CORNER;
  const crease = onTop ? 20 : 0;
  const peeled = -15 - 95 * u ** 1.6 + crease;
  const falling = -25 - 125 * u ** 1.6 + crease;
  const ripple = 16 * Math.sqrt(u) * Math.sin(2 * Math.PI * (2.1 * p * ARM_TIME - 1.3 * u));
  return (
    tied +
    smoothstep(0, 0.22, p) * (sprung - tied) +
    smoothstep(0.12, 0.6, p) * (peeled - sprung) +
    smoothstep(0.4, 1, p) * (falling - peeled) +
    smoothstep(0.2, 0.55, p) * ripple
  );
};

/** How much the ribbon twists about its length at a joint as it flutters */
const armTwist = (s: number, p: number, phase: number) =>
  smoothstep(0.2, 0.55, p) * 3 * Math.sin(2 * Math.PI * (1.5 * p * ARM_TIME - (0.9 * s) / ARM_LEN) + phase);

/** How far the arm's shading has gone from the faces it lay on to one even tone along it */
const offTheBox = (p: number) => smoothstep(0.05, 0.35, p);

// The bow pops off the knot first: a squash as it's plucked, then it flies up and away on its own,
// tumbling, its tails swinging down to hang, and fades. Times are in seconds.
const BOW_TIME = 0.7;
const BOW_PLUCK = 0.06; // the squash before it goes
const BOW_RISE = 280;
const BOW_GONE = [0.3, 0.65];

// The satin catches the light (from the upper left) on whichever side of the box is turned toward
// it, so the glint comes and goes as the box sways and tilts; the matte paper doesn't
const LIGHT_Y = -25;
const satinGlint = (faceY: number) => Math.max(0, Math.cos(((faceY - LIGHT_Y) * Math.PI) / 180)) ** 8;

/** A flat face of the box; `fade` (when given) fades it without flattening the 3D around it */
const Face = ({ w, h, transform, className, shade, fade }: {
  w: number;
  h: number;
  transform: string;
  className?: string;
  shade?: string;
  fade?: MotionValue<number>;
}) => (
  <motion.div
    className={cn("gift-face", className)}
    style={{ width: w, height: h, left: -w / 2, top: -h / 2, transform, opacity: fade }}
  >
    {shade && <div className={cn("absolute inset-0", shade)} />}
  </motion.div>
);

/** The soft shadow a length of ribbon casts on the paper; spreads further to the right, away from the light */
const RibbonShadow = ({ length, transform, fade }: { length: number; transform: string; fade: MotionValue<number> }) => (
  <motion.div
    className="gift-ribbon-shadow absolute"
    style={{ width: RIBBON + 8, height: length, left: -RIBBON / 2 - 3, top: -length / 2, transform: `${transform} translateZ(0.5px)`, opacity: fade }}
  />
);

/**
 * A length of ribbon, as a solid: the satin, standing RIBBON_T proud of the paper, and its two
 * edges. `transform` places it on the paper; the strip runs along y and faces +z. `slice` shows just
 * that part of a longer run's shading. Fades leaf by leaf, like a Face.
 */
const Strip = ({ length, transform, shade, shadeAmount, dim, glint, slice, vanish, fade }: {
  length: number;
  transform: string;
  shade?: string;
  /** How much of the shade shows (all of it when not given) */
  shadeAmount?: MotionValue<number>;
  /** An even darkening over it all */
  dim?: MotionValue<number>;
  glint?: MotionValue<number>;
  slice?: [number, number];
  /** How far it has sunk into the background's colour, while still solid */
  vanish?: MotionValue<number>;
  fade?: MotionValue<number>;
}) => {
  const sliced = slice && { backgroundSize: `100% ${slice[0]}px`, backgroundPosition: `0 ${-slice[1]}px` };
  return (
    <div className="gift-3d absolute" style={{ transform }}>
      {([-1, 1] as const).map((side) => (
        <motion.div
          key={side}
          className="gift-ribbon-edge absolute"
          style={{
            width: RIBBON_T,
            height: length,
            left: -RIBBON_T / 2,
            top: -length / 2,
            transform: `translateX(${(side * RIBBON) / 2}px) translateZ(${RIBBON_T / 2}px) rotateY(${side * 90}deg)`,
            opacity: fade,
          }}
        >
          {vanish && <motion.div className="absolute inset-0 bg-background" style={{ opacity: vanish }} />}
        </motion.div>
      ))}
      <motion.div
        className="gift-ribbon absolute"
        style={{ width: RIBBON, height: length, left: -RIBBON / 2, top: -length / 2, transform: `translateZ(${RIBBON_T}px)`, opacity: fade }}
      >
        {shade && <motion.div className={cn("absolute inset-0", shade)} style={{ ...sliced, opacity: shadeAmount }} />}
        {dim && <motion.div className="absolute inset-0 bg-black" style={{ opacity: dim }} />}
        {glint && <motion.div className="gift-ribbon-glint absolute inset-0" style={{ ...sliced, opacity: glint }} />}
        {vanish && <motion.div className="absolute inset-0 bg-background" style={{ opacity: vanish }} />}
      </motion.div>
    </div>
  );
};

// The two ribbons cross on top of the lid and under the box: the side-to-side one lies a hair further out
const crossLayer = (angle: number) => (angle % 180 === 0 ? 0 : 1);

interface ArmProps extends Piece {
  lidLift: MotionValue<number>;
  /** The box's current turn (rotateY), for the glint */
  turn: MotionValue<number>;
}

/** A tied arm: three straight strips, up the box, up the lid's side (out under its rim) and across the lid */
const TiedArm = ({ angle, shade, lidLift, turn }: ArmProps) => {
  const glint = useTransform(turn, (ry) => satinGlint(angle + ry));
  // Rides the lid when it lifts
  const rimY = useTransform(lidLift, (lift) => -BODY_RUN + lift);
  const layer = crossLayer(angle);
  return (
    // Standing on the box's bottom edge, where the ribbon passes under the box
    <div className="gift-3d absolute" style={{ transform: `rotateY(${angle}deg) translateY(${H / 2}px) translateZ(${W / 2}px)` }}>
      {/* Up the box from just round its bottom edge, to under the lid */}
      <Strip length={BODY_SHADING} transform={`translateY(${(RIBBON_T - H) / 2}px)`} shade={shade} glint={glint} />
      <motion.div className="gift-3d absolute" style={{ y: rimY, z: LIP }}>
        {/* On past the lid's top, closing the corner with the strip across it */}
        <Strip length={LH + RIBBON_T} transform={`translateY(${-(LH + RIBBON_T) / 2}px)`} shade={shade} glint={glint} />
        <div className="gift-3d absolute" style={{ transform: `translateY(${-LH}px) rotateX(90deg)` }}>
          <Strip length={TOP_RUN} transform={`translateY(${-TOP_RUN / 2}px) translateZ(${layer * 0.5}px)`} />
        </div>
      </motion.div>
    </div>
  );
};

/** What every link of a falling arm shares */
interface Chain {
  progress: MotionValue<number>;
  /** Where the arm's flutter starts, so the arms don't flutter in step */
  phase: number;
  /** How far it's still in under the lid's rim (1 tied, 0 come away) */
  onRim: MotionValue<number>;
  vanish: MotionValue<number>;
  fade: MotionValue<number>;
  tuckFade: MotionValue<number>;
  shade: string;
  dim: number;
  glint: MotionValue<number>;
  layer: number;
  lidLift: MotionValue<number>;
}

/** One link of a falling arm and, hanging from its end, the rest of the arm */
const FallingLink = ({ i, chain }: { i: number; chain: Chain }) => {
  const { progress, onRim, vanish, fade } = chain;
  const link = ARM_LINKS[i];
  const prev = ARM_LINKS[i - 1];
  const bend = useTransform(progress, (p) => armShape(link.s, p) - (prev ? armShape(prev.s, p) : 0));
  const twist = useTransform(progress, (p) => armTwist(link.s, p, chain.phase));
  // Out under the lid's rim and lifting with the lid, until it comes away
  const y = useTransform([chain.lidLift, onRim], ([lift, rim]: number[]) => (prev ? -prev.len : 0) + (link.rim ? lift * rim : 0));
  const z = useTransform(onRim, (rim) => (link.rim ? LIP * rim : 0));
  // Off the box, the faces' shading and glint give way to one even tone along the whole ribbon
  const faceShade = useTransform(progress, (p) => 1 - offTheBox(p));
  const dim = useTransform(progress, (p) => chain.dim * offTheBox(p));
  const glint = useTransform([chain.glint, progress], ([g, p]: number[]) => g * (1 - offTheBox(p)));
  const onTop = link.run === "top";
  // Runs a pixel into the next link, or the joint between them shows as a hairline
  const seam = i + 1 < ARM_LINKS.length && !link.extra ? 1 : 0;
  const ahead = link.len + (link.extra ?? 0) + seam;
  const behind = link.under ?? 0;
  const length = ahead + behind;

  return (
    <motion.div className="gift-3d absolute" style={{ y, z, rotateX: bend, rotateY: twist }}>
      <Strip
        length={length}
        transform={`translateY(${(behind - ahead) / 2}px)${onTop ? ` translateZ(${chain.layer * 0.5}px)` : ""}`}
        // Across the lid it's lit like the top: unshaded, no glint
        shade={onTop ? undefined : chain.shade}
        shadeAmount={faceShade}
        dim={dim}
        glint={onTop ? undefined : glint}
        slice={[link.slice[0], link.slice[1] - seam]}
        vanish={vanish}
        fade={fade}
      />
      {/* On up under the lid: bridges the join while the lid's lifted, until the arm comes away */}
      {link.tuck && (
        <Strip
          length={TUCK}
          transform={`translateY(${-link.len - TUCK / 2}px)`}
          shade={chain.shade}
          glint={chain.glint}
          slice={[BODY_SHADING, 0]}
          fade={chain.tuckFade}
        />
      )}
      {i + 1 < ARM_LINKS.length && <FallingLink i={i + 1} chain={chain} />}
    </motion.div>
  );
};

/**
 * An arm coming undone, standing on its half of the cross under the box. In the tied arm's pose
 * until its `delay`, then it springs loose and peels away while the ribbon falls.
 */
const FallingArm = ({ angle, delay, askew, shade, dim, lidLift, turn, bow, vanish, fade }: ArmProps & {
  bow: MotionValue<number>;
  vanish: MotionValue<number>;
  fade: MotionValue<number>;
}) => {
  const glint = useTransform(turn, (ry) => satinGlint(angle + ry));
  const progress = useMotionValue(0);
  // Leans to one side as it falls
  const lean = useMotionValue(0);
  const onRim = useMotionValue(1);
  const tuckFade = useMotionValue(1);

  useEffect(() => {
    const [rimFrom, rimTo] = OFF_THE_RIM;
    const controls = [
      animate(progress, 1, { delay, duration: ARM_TIME, ease: "linear" }),
      animate(lean, askew, { delay: DROP_AT, duration: DROP_TIME }),
      animate(onRim, 0, { delay: delay + ARM_TIME * rimFrom, duration: ARM_TIME * (rimTo - rimFrom) }),
      animate(tuckFade, 0, { delay: delay + ARM_TIME * rimTo, duration: 0.05 }),
    ];
    return () => controls.forEach((c) => c.stop());
  }, [delay, askew, progress, lean, onRim, tuckFade]);

  const layer = crossLayer(angle);
  const chain: Chain = { progress, phase: angle / 70, onRim, vanish, fade, tuckFade, shade, dim, glint, layer, lidLift };
  // From the middle of the box's bottom to its edge (and round the corner), a pixel past the middle
  // to meet the other half without a hairline
  const half = W / 2 + RIBBON_T + 1;

  return (
    <div className="gift-3d absolute" style={{ transform: `rotateY(${angle}deg) translateY(${H / 2}px)` }}>
      <motion.div className="gift-3d absolute" style={{ rotateX: bow }}>
        {/* Its half of the cross, satin side down */}
        <div className="gift-3d absolute" style={{ transform: "rotateX(-90deg)" }}>
          <Strip
            length={half}
            transform={`translateY(${-half / 2 + 1}px) translateZ(${layer * 0.5}px)`}
            shade="gift-shade-back"
            vanish={vanish}
            fade={fade}
          />
        </div>
        <motion.div className="gift-3d absolute" style={{ z: W / 2, rotateZ: lean }}>
          <FallingLink i={0} chain={chain} />
        </motion.div>
      </motion.div>
    </div>
  );
};

/** The ribbon coming undone: its arms spring loose and peel away, then it drops away as one */
const FallingRibbon = ({ lidLift, turn, onFallen }: {
  lidLift: MotionValue<number>;
  turn: MotionValue<number>;
  /** Once it's out of sight, so its hundreds of pieces can be taken off the page */
  onFallen: () => void;
}) => {
  const drop = useMotionValue(0);
  const bow = useMotionValue(0);
  // It sinks into the shadow under the box: into the background's colour while still solid (each
  // link fading on its own would show where they overlap), then it's gone
  const vanish = useMotionValue(0);
  const fade = useMotionValue(1);
  const fallen = useRef(onFallen);
  fallen.current = onFallen;

  useEffect(() => {
    const falling = { delay: DROP_AT, duration: DROP_TIME };
    const controls = [
      animate(drop, DROP, { ...falling, ease: EASE_IN_QUAD }),
      animate(bow, CROSS_BOW, { ...falling, ease: "easeOut" }),
      animate(vanish, 1, { delay: DROP_AT + DROP_TIME * 0.45, duration: DROP_TIME * 0.47, ease: "easeIn" }),
      animate(fade, 0, { delay: DROP_AT + DROP_TIME * 0.92, duration: DROP_TIME * 0.08, onComplete: () => fallen.current() }),
    ];
    return () => controls.forEach((c) => c.stop());
  }, [drop, bow, vanish, fade]);

  return (
    <motion.div className="gift-3d absolute" style={{ y: drop }}>
      {PIECES.map((piece) => (
        <FallingArm key={piece.angle} {...piece} lidLift={lidLift} turn={turn} bow={bow} vanish={vanish} fade={fade} />
      ))}
    </motion.div>
  );
};

/** The shadow an arm casts on the paper; gone as soon as the arm lifts off the box */
const ArmShadow = ({ angle, delay, untied, lidLift }: { angle: number; delay: number; untied: boolean; lidLift: MotionValue<number> }) => {
  const fade = useMotionValue(1);

  useEffect(() => {
    if (!untied) {
      fade.set(1);
      return;
    }
    const controls = animate(fade, 0, { delay, duration: 0.15 });
    return () => controls.stop();
  }, [untied, delay, fade]);

  return (
    <div className="gift-3d absolute" style={{ transform: `rotateY(${angle}deg)` }}>
      <RibbonShadow length={H} transform={`translateZ(${W / 2}px)`} fade={fade} />
      <motion.div className="gift-3d absolute" style={{ y: lidLift }}>
        <RibbonShadow length={LH} transform={`translateY(${LID_Y}px) translateZ(${LW / 2}px)`} fade={fade} />
        <RibbonShadow length={TOP_RUN} transform={`translateY(${LID_TOP}px) translateZ(${TOP_RUN / 2}px) rotateX(90deg)`} fade={fade} />
      </motion.div>
    </div>
  );
};

/**
 * The ribbon and its shadow on the paper. Tied, each arm is three light strips; once untied they're
 * swapped (in the same pose) for chains of links that can bend anywhere, joined by the cross under
 * the box. Once it has fallen out of sight it's gone altogether, so the lid and the reveal don't
 * share the frame with it.
 */
const Ribbon = ({ untied, lidLift, turn }: { untied: boolean; lidLift: MotionValue<number>; turn: MotionValue<number> }) => {
  const [fallen, setFallen] = useState(false);
  useEffect(() => {
    if (!untied) setFallen(false);
  }, [untied]);

  if (untied && fallen) return null;
  return (
    <>
      {PIECES.map((piece) => (
        <ArmShadow key={piece.angle} angle={piece.angle} delay={piece.delay} untied={untied} lidLift={lidLift} />
      ))}
      {untied ? (
        <FallingRibbon lidLift={lidLift} turn={turn} onFallen={() => setFallen(true)} />
      ) : (
        PIECES.map((piece) => <TiedArm key={piece.angle} {...piece} lidLift={lidLift} turn={turn} />)
      )}
    </>
  );
};

/** The bow's two loops and knot; squashed as the bow's plucked off, then stretched as it flies */
const BowLoops = ({ id, untied, idle, fade }: { id: string; untied: boolean; idle: boolean; fade: MotionValue<number> }) => {
  const loop = (side: 1 | -1) => ({
    animate: untied
      ? { scaleX: [1, 1.14, 0.9, 1], scaleY: [1, 0.82, 1.14, 1], rotate: [0, -5 * side, 8 * side, 0] }
      : { scaleX: 1, scaleY: 1, rotate: 0 },
    transition: untied ? { duration: 0.45, times: [0, 0.15, 0.5, 1], ease: "easeInOut" as const } : { duration: 0 },
    style: { originX: side === -1 ? 1 : 0, originY: 0.92 },
  });

  return (
    <motion.div
      className="absolute"
      style={{ width: 120, height: 64, left: -60, top: -KNOT_Y, transformOrigin: `60px ${KNOT_Y}px`, opacity: fade }}
      initial={false}
      animate={idle ? { scale: [1, 1.05, 1] } : { scale: 1 }}
      transition={idle ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
    >
      <svg viewBox="0 0 120 64" width={120} height={64} className="overflow-visible">
        <defs>
          {/* The theme's bow colours (set in style: SVG attributes don't reliably take CSS variables) */}
          <linearGradient id={`${id}-satin`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "hsl(var(--bow-1))" }} />
            <stop offset="0.35" style={{ stopColor: "hsl(var(--bow-2))" }} />
            <stop offset="0.7" style={{ stopColor: "hsl(var(--bow-3))" }} />
            <stop offset="1" style={{ stopColor: "hsl(var(--bow-4))" }} />
          </linearGradient>
        </defs>
        <motion.g {...loop(-1)}>
          <path d="M60 54C44 28 10 18 8 40C6 60 40 62 60 56Z" fill={`url(#${id}-satin)`} />
          <path d="M60 55C48 42 26 36 22 44C20 52 42 58 60 56Z" style={{ fill: "hsl(var(--bow-shade))" }} opacity="0.5" />
          <path d="M16 36C22 26 38 27 50 40" stroke="#fff" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" fill="none" />
        </motion.g>
        <motion.g {...loop(1)}>
          <path d="M60 54C76 28 110 18 112 40C114 60 80 62 60 56Z" fill={`url(#${id}-satin)`} />
          <path d="M60 55C72 42 94 36 98 44C100 52 78 58 60 56Z" style={{ fill: "hsl(var(--bow-shade))" }} opacity="0.5" />
          <path d="M104 36C98 26 82 27 70 40" stroke="#fff" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" fill="none" />
        </motion.g>
        <rect
          x="51"
          y="46"
          width="18"
          height="17"
          rx="6"
          fill={`url(#${id}-satin)`}
          strokeOpacity="0.5"
          style={{ stroke: "hsl(var(--bow-4))" }}
        />
      </svg>
    </motion.div>
  );
};

/** A tail of the bow, lying on the lid from the knot toward a front corner; `tilt` 90 lies flat, 0 hangs */
const BowTail = ({ turn, tilt, fade }: { turn: number; tilt: MotionValue<number>; fade: MotionValue<number> }) => (
  <div className="gift-3d absolute" style={{ transform: `rotateY(${turn}deg)` }}>
    <motion.div className="gift-3d absolute" style={{ rotateX: tilt }}>
      <motion.div className="gift-bow-tail absolute" style={{ width: 16, height: 62, left: -8, top: 0, opacity: fade }}>
        {/* Cut in a V at the end (inside the shadow, which the cut would clip) */}
        <div className="gift-ribbon absolute inset-0" style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 86%, 0 100%)" }} />
      </motion.div>
    </motion.div>
  </div>
);

/**
 * The bow, lying on the ribbon and turned to face the viewer, riding the lid. Untied, it's plucked
 * off the knot and flies away upward on its own, tumbling, its tails swinging down to hang.
 */
const Bow = ({ id, untied, idle, lidLift, restY, side }: {
  id: string;
  untied: boolean;
  idle: boolean;
  lidLift: MotionValue<number>;
  /** The box's resting turn, which the bow turns back from to face the viewer */
  restY: number;
  /** Which way the lid flies off (1 right, -1 left): the bow drifts the other way */
  side: number;
}) => {
  const time = useMotionValue(0);
  useEffect(() => {
    if (!untied) {
      time.set(0);
      return;
    }
    const controls = animate(time, BOW_TIME, { duration: BOW_TIME, ease: "linear" });
    return () => controls.stop();
  }, [untied, time]);

  // Flicked off: fast, then slowing as it goes
  const flown = (t: number) => 1 - (1 - Math.min(1, Math.max(0, (t - BOW_PLUCK) / (BOW_TIME - BOW_PLUCK)))) ** 2;
  const y = useTransform([lidLift, time], ([lift, t]: number[]) => LID_TOP - RIBBON_T - 1.5 + lift - BOW_RISE * flown(t));
  const x = useTransform(time, (t) => -side * 40 * flown(t));
  const tumble = useTransform(time, (t) => -side * 35 * flown(t));
  const spin = useTransform(time, (t) => -side * 70 * flown(t));
  const tilt = useTransform(time, (t) => 90 - 80 * smoothstep(BOW_PLUCK, 0.3, t));
  const fade = useTransform(time, (t) => 1 - smoothstep(BOW_GONE[0], BOW_GONE[1], t));

  return (
    <motion.div className="gift-3d absolute" style={{ x, y, rotate: tumble, rotateY: spin }}>
      <div className="gift-3d absolute" style={{ transform: `rotateY(${-restY}deg)` }}>
        <BowTail turn={-30} tilt={tilt} fade={fade} />
        <BowTail turn={30} tilt={tilt} fade={fade} />
        <BowLoops id={id} untied={untied} idle={idle} fade={fade} />
      </div>
    </motion.div>
  );
};

/**
 * A wrapped present in real 3D (CSS), purely visual. The parent drives `phase`:
 * idle (sways, jiggles) → untie (the bow flies off, the ribbon falls away) → open (lid pops) → burst (light).
 */
export const GiftBox = ({ variant, phase = "idle", size = "md", tiltX, tiltY, hover, children, className }: GiftBoxProps) => {
  const reduceMotion = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(stageRef);
  const gradientId = `gift${useId().replace(/:/g, "")}`;
  const zero = useMotionValue(0);
  const tx = tiltX ?? zero;
  const ty = tiltY ?? zero;
  const hv = hover ?? zero;
  // The show box is the mirror image of the movie box
  const restY = variant === "movie" ? -32 : 32;
  const side = variant === "movie" ? 1 : -1;
  const accent = ACCENT[variant];

  // Never quite still: a slow figure-eight sway (only while on screen and still wrapped: once it's
  // tapped it holds still to be opened), and a turn as the present scrolls through the screen. Both
  // give way to the mouse while it's tilting the box.
  const swayTime = useMotionValue(0);
  useAnimationFrame((_, delta) => {
    if (inView && !reduceMotion && phase === "idle") swayTime.set(swayTime.get() + delta);
  });
  const { scrollYProgress } = useScroll({ target: stageRef, offset: ["start end", "end start"] });
  const rotateY = useTransform([ty, hv, swayTime, scrollYProgress], ([t, h, s, p]: number[]) => {
    // ~8s side to side; ±12° from scrolling top to bottom of the screen
    const drift = Math.sin(s / 1300) * 12 + (reduceMotion ? 0 : (p - 0.5) * 24);
    return restY + t + (1 - h) * drift;
  });
  // ~12s nodding, out of step with the sway so the path never repeats exactly
  const rotateX = useTransform([tx, hv, swayTime], ([t, h, s]: number[]) => REST_X + t + (1 - h) * Math.sin(s / 1900) * 5);
  const lidLift = useTransform(hv, (h) => h * -8);

  // The box's front rim on screen, from its current angle: the outline of the opening's two front
  // edges, as a clip-path that keeps only what's above it
  const rimClip = useTransform([rotateX, rotateY], ([rx, ry]: number[]) => {
    const ax = (rx * Math.PI) / 180;
    const ay = (ry * Math.PI) / 180;
    const corners = [[W / 2, W / 2], [W / 2, -W / 2], [-W / 2, -W / 2], [-W / 2, W / 2]].map(([x, z]) => {
      const x1 = x * Math.cos(ay) + z * Math.sin(ay);
      const z1 = -x * Math.sin(ay) + z * Math.cos(ay);
      const y2 = (-H / 2) * Math.cos(ax) - z1 * Math.sin(ax);
      const z2 = (-H / 2) * Math.sin(ax) + z1 * Math.cos(ax);
      const k = PERSPECTIVE / (PERSPECTIVE - z2);
      return { x: STAGE_W / 2 + x1 * k, y: STAGE_H / 2 + (ORIGIN_Y - STAGE_H / 2 + y2) * k, z: z2 };
    });
    const front = corners.reduce((nearest, corner, i) => (corner.z > corners[nearest].z ? i : nearest), 0);
    const [left, right] = [corners[(front + 3) % 4], corners[(front + 1) % 4]].sort((a, b) => a.x - b.x);
    const tip = corners[front];
    const points = [
      [-300, -600], [STAGE_W + 300, -600], [STAGE_W + 300, right.y], [right.x, right.y], [tip.x, tip.y], [left.x, left.y], [-300, left.y],
    ];
    return `polygon(${points.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(", ")})`;
  });

  const tied = phase === "idle";
  const lidOff = phase === "open" || phase === "burst";
  // The waiting loops (float, jiggle, shadow, bow) only run while the gift can be seen
  const idle = phase === "idle" && !reduceMotion && inView;

  // The lid fades face by face (fading the whole 3D group would flatten it)
  const lidFade = useMotionValue(1);
  useEffect(() => {
    if (!lidOff) {
      lidFade.set(1);
      return;
    }
    const controls = animate(lidFade, 0, { delay: 0.55, duration: 0.35 });
    return () => controls.stop();
  }, [lidOff, lidFade]);

  const paper = cn("gift-paper", accent.paper);

  const stage = (
    <div
      ref={stageRef}
      className={cn("relative select-none", className)}
      style={{ width: STAGE_W, height: STAGE_H, ["--ray" as string]: accent.ray, ["--glow" as string]: accent.glow }}
    >
      {/* God rays behind the box */}
      <motion.div
        className="absolute pointer-events-none"
        style={{ width: 480, height: 480, left: STAGE_W / 2 - 240, top: MOUTH_Y - 240 }}
        initial={false}
        animate={
          phase === "burst" ? { opacity: 1, scale: 1.2 } : phase === "open" ? { opacity: 0.55, scale: 0.75 } : { opacity: 0, scale: 0.3 }
        }
        transition={{ duration: phase === "burst" ? 0.9 : 0.6, delay: phase === "open" ? 0.35 : 0, ease: EASE_OUT_EXPO }}
      >
        {/* Turning only once there's light to see */}
        <div className={cn("gift-rays absolute inset-0", lidOff && "animate-spin-slow")} />
      </motion.div>

      {/* Floor shadow */}
      <motion.div
        className="absolute rounded-[50%] pointer-events-none"
        style={{
          width: 190,
          height: 30,
          left: STAGE_W / 2 - 95,
          top: STAGE_H - 34,
          background: "radial-gradient(closest-side, hsl(0 0% 0% / 0.55), transparent)",
        }}
        animate={idle ? { scale: [1, 0.86, 1, 1, 1], opacity: [1, 0.7, 1, 1, 1] } : { scale: 1, opacity: phase === "burst" ? 0.6 : 1 }}
        transition={idle ? { duration: 3.6, times: [0, 0.3, 0.55, 0.76, 1], repeat: Infinity, ease: "easeInOut" } : { duration: 0.4 }}
      />

      {/* The box itself: floats and jiggles while waiting, squashes before the lid pops */}
      <motion.div
        className="absolute inset-0"
        style={{ perspective: PERSPECTIVE, transformOrigin: `50% ${ORIGIN_Y + H / 2}px` }}
        animate={
          idle
            ? { y: [0, -8, 0, -2, -3, -2, 0, 0], rotate: [0, 0, 0, -4, 4, -3, 0, 0], scaleX: 1, scaleY: 1 }
            : phase === "open"
              ? { y: 0, rotate: 0, scaleX: [1, 1.07, 0.97, 1], scaleY: [1, 0.9, 1.05, 1] }
              : phase === "burst"
                ? { y: 14, rotate: 0, scaleX: 1, scaleY: 1 }
                : { y: 0, rotate: 0, scaleX: 1, scaleY: 1 }
        }
        transition={
          idle
            ? { duration: 3.6, times: [0, 0.3, 0.55, 0.6, 0.64, 0.68, 0.76, 1], repeat: Infinity, ease: "easeInOut" }
            : phase === "open"
              ? { duration: 0.5, times: [0, 0.3, 0.65, 1], ease: "easeOut" }
              : { duration: 0.6, ease: EASE_OUT_EXPO }
        }
      >
        <motion.div className="gift-3d absolute" style={{ left: STAGE_W / 2, top: ORIGIN_Y, width: 0, height: 0, rotateX, rotateY }}>
          {/* Inside of the box, seen once the lid is off */}
          <div className="gift-inside" style={{ width: W, height: H, left: -W / 2, top: -H / 2, transform: `translateZ(${W / 2 - 1}px) rotateY(180deg)` }} />
          <div className="gift-inside" style={{ width: W, height: H, left: -W / 2, top: -H / 2, transform: `translateZ(${-(W / 2 - 1)}px)` }} />
          <div className="gift-inside" style={{ width: W, height: H, left: -W / 2, top: -H / 2, transform: `rotateY(90deg) translateZ(${W / 2 - 1}px) rotateY(180deg)` }} />
          <div className="gift-inside" style={{ width: W, height: H, left: -W / 2, top: -H / 2, transform: `rotateY(-90deg) translateZ(${W / 2 - 1}px) rotateY(180deg)` }} />
          <div className="gift-inside" style={{ width: W, height: W, left: -W / 2, top: -W / 2, transform: `rotateX(90deg) translateZ(${-(H / 2 - 1)}px)` }} />

          {/* Light welling up inside */}
          <motion.div
            className="absolute pointer-events-none"
            style={{
              width: W - 4,
              height: W - 4,
              left: -(W - 4) / 2,
              top: -(W - 4) / 2,
              transform: `rotateX(90deg) translateZ(${H / 2 - 6}px)`,
              background: "radial-gradient(closest-side, hsl(0 0% 100% / 0.95), hsl(var(--glow) / 0.8) 45%, transparent)",
            }}
            initial={false}
            animate={{ opacity: phase === "burst" ? 1 : phase === "open" ? 0.7 : 0 }}
            transition={{ duration: 0.5, delay: phase === "open" ? 0.3 : 0 }}
          />

          {/* Body */}
          <Face w={W} h={H} transform={`translateZ(${W / 2}px)`} className={paper} shade="gift-shade-front" />
          <Face w={W} h={H} transform={`rotateY(180deg) translateZ(${W / 2}px)`} className={paper} shade="gift-shade-back" />
          <Face w={W} h={H} transform={`rotateY(90deg) translateZ(${W / 2}px)`} className={paper} shade="gift-shade-side" />
          <Face w={W} h={H} transform={`rotateY(-90deg) translateZ(${W / 2}px)`} className={paper} shade="gift-shade-side" />
          <Face w={W} h={W} transform={`rotateX(-90deg) translateZ(${H / 2}px)`} className="bg-black/60" />

          {/* Lid: lifts a little on hover, pops off when opened */}
          <div className="gift-3d absolute" style={{ transform: `translateY(${LID_Y}px)` }}>
            <motion.div className="gift-3d absolute" style={{ y: lidLift }}>
              <motion.div
                className="gift-3d absolute"
                initial={false}
                animate={lidOff ? { y: -200, x: 95 * side, rotateX: -55, rotateZ: 38 * side } : { y: 0, x: 0, rotateX: 0, rotateZ: 0 }}
                transition={lidOff ? { duration: 0.8, delay: 0.16, ease: [0.2, 0.7, 0.3, 1] } : { duration: 0.3 }}
              >
                <Face w={LW} h={LW} transform={`rotateX(90deg) translateZ(${LH / 2}px)`} className={paper} shade="gift-shade-top" fade={lidFade} />
                <Face w={LW} h={LH} transform={`translateZ(${LW / 2}px)`} className={paper} shade="gift-shade-front" fade={lidFade} />
                <Face w={LW} h={LH} transform={`rotateY(180deg) translateZ(${LW / 2}px)`} className={paper} shade="gift-shade-back" fade={lidFade} />
                <Face w={LW} h={LH} transform={`rotateY(90deg) translateZ(${LW / 2}px)`} className={paper} shade="gift-shade-side" fade={lidFade} />
                <Face w={LW} h={LH} transform={`rotateY(-90deg) translateZ(${LW / 2}px)`} className={paper} shade="gift-shade-side" fade={lidFade} />
                <Face w={LW} h={LW} transform={`rotateX(-90deg) translateZ(${LH / 2}px)`} className="gift-inside" fade={lidFade} />
              </motion.div>
            </motion.div>
          </div>

          <Ribbon untied={!tied} lidLift={lidLift} turn={rotateY} />
          <Bow id={gradientId} untied={!tied} idle={idle} lidLift={lidLift} restY={restY} side={side} />
        </motion.div>

        {/* Bloom over the mouth of the box (plain blending: a blend mode would have the whole 3D box
            drawn off screen first, every frame) */}
        <motion.div
          className="absolute pointer-events-none"
          style={{
            width: 300,
            height: 200,
            left: STAGE_W / 2 - 150,
            top: MOUTH_Y - 110,
            background: "radial-gradient(closest-side, hsl(0 0% 100% / 0.85), hsl(var(--glow) / 0.45) 50%, transparent)",
          }}
          initial={false}
          animate={{ opacity: phase === "burst" ? 0.9 : phase === "open" ? 0.45 : 0, scale: phase === "burst" ? 1.1 : 0.8 }}
          transition={{ duration: 0.6, delay: phase === "open" ? 0.35 : 0 }}
        />

        {/* Whatever comes out of the box (the poster), anchored just above the mouth. Everything below the
            box's front rim is cut away, so it rises out of the box rather than appearing in front of it. */}
        {children && (
          <motion.div className="absolute inset-0 pointer-events-none" style={{ clipPath: rimClip }}>
            <div className="absolute flex justify-center" style={{ left: 0, right: 0, bottom: STAGE_H - MOUTH_Y - 6 }}>
              {children}
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Twinkles around the waiting present */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={false}
        animate={{ opacity: tied ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      >
        {SPARKLES.map(([left, top, sparkleSize, delay], i) => (
          <svg
            key={i}
            viewBox="0 0 24 24"
            width={sparkleSize}
            height={sparkleSize}
            className={cn("absolute animate-twinkle", i % 2 ? "text-yellow" : "text-white")}
            // Held where they are (not reset) once they can't be seen
            style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${delay}s`, animationPlayState: tied && inView ? "running" : "paused" }}
          >
            <path d={STAR_PATH} fill="currentColor" />
          </svg>
        ))}
      </motion.div>

      {/* Sparkle puff as the lid pops */}
      {lidOff && !reduceMotion && (
        <div className="absolute pointer-events-none" style={{ left: STAGE_W / 2, top: MOUTH_Y }}>
          {PUFF.map((p, i) => (
            <motion.svg
              key={i}
              viewBox="0 0 24 24"
              width={p.size}
              height={p.size}
              className={cn("absolute -translate-x-1/2 -translate-y-1/2", i % 3 === 0 ? "text-yellow" : "text-white")}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0.3 }}
              animate={{ x: p.x, y: p.y, opacity: [0, 1, 0], scale: [0.3, 1, 0.5], rotate: 90 }}
              transition={{ duration: 0.9, delay: 0.22, ease: EASE_OUT_EXPO }}
            >
              <path d={STAR_PATH} fill="currentColor" />
            </motion.svg>
          ))}
        </div>
      )}

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
