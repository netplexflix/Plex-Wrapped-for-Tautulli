import { useState, type CSSProperties } from "react";
import { motion, type Variants } from "framer-motion";
import { EASE_OUT_EXPO, VIEWPORT } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface KineticTextProps {
  text: string;
  /** Animate each character (short, big text like a year) or each word (titles) */
  by?: "char" | "word";
  as?: "span" | "div" | "p" | "h1" | "h2" | "h3";
  className?: string;
  /** Classes for every animated piece */
  pieceClassName?: string;
  /**
   * Fill the text with the brand gradient (titles), or with "value", the one for numbers and results.
   * `background-clip: text` on the wrapper doesn't survive transformed children, so every piece gets
   * its own slice of one shared gradient.
   */
  gradient?: boolean | "value";
  /** Play when mounted, or each time it is scrolled into view (rewinding when scrolled out) */
  trigger?: "mount" | "inView";
  delay?: number;
  stagger?: number;
}

// No opacity: each piece's mask already hides it while it's down
const piece: Variants = {
  hidden: { y: "110%", rotate: 6, transition: { duration: 0.45, ease: [0.7, 0, 0.84, 0] } },
  show: { y: "0%", rotate: 0, transition: { duration: 0.9, ease: EASE_OUT_EXPO } },
};

/** Text that rises into place piece by piece, each piece from behind its own mask */
export const KineticText = ({
  text,
  by = "word",
  as: Tag = "span",
  className,
  pieceClassName,
  gradient = false,
  trigger = "inView",
  delay = 0,
  stagger,
}: KineticTextProps) => {
  // Masks are lifted once everything has landed, so glows and descenders aren't clipped
  const [done, setDone] = useState(false);
  const words = text.split(" ");
  const totalChars = Array.from(text).length;

  // Position of a piece's slice of the gradient, from its character offset
  const gradientStyle = (offset: number, length: number): CSSProperties | undefined => {
    if (!gradient) return undefined;
    const rest = totalChars - length;
    return {
      backgroundSize: `${(totalChars / length) * 100}% 100%`,
      backgroundPosition: `${rest > 0 ? (offset / rest) * 100 : 0}% 0`,
    };
  };

  // max-w-full + break-words: a single word longer than the line still wraps
  const mask = cn(
    "inline-block max-w-full align-bottom pt-[0.12em] pb-[0.14em] -mt-[0.12em] -mb-[0.14em] break-words",
    !done && "overflow-hidden",
  );
  // A layer per piece only while they move: kept for good, every word of every heading would hold one
  const pieceClass = cn(
    "inline-block",
    !done && "will-change-transform",
    gradient === "value" ? "gradient-value" : gradient && "gradient-text",
    pieceClassName,
  );

  let offset = 0;
  const content = words.map((word, wordIndex) => {
    const chars = Array.from(word);
    const wordOffset = offset;
    offset += chars.length + 1;
    const space = wordIndex < words.length - 1 ? " " : null;

    if (by === "word") {
      return (
        <span key={wordIndex}>
          <span className={mask}>
            <motion.span variants={piece} className={pieceClass} style={gradientStyle(wordOffset, chars.length)}>
              {word}
            </motion.span>
          </span>
          {space}
        </span>
      );
    }

    // Characters of one word stay together, so lines only break between words
    return (
      <span key={wordIndex}>
        <span className="inline-block whitespace-nowrap">
          {chars.map((char, charIndex) => (
            <span key={charIndex} className={mask}>
              <motion.span variants={piece} className={pieceClass} style={gradientStyle(wordOffset + charIndex, 1)}>
                {char}
              </motion.span>
            </span>
          ))}
        </span>
        {space}
      </span>
    );
  });

  const container: Variants = {
    // Rewinds last piece first when scrolled out of view
    hidden: { transition: { staggerChildren: 0.03, staggerDirection: -1 } },
    show: { transition: { staggerChildren: stagger ?? (by === "char" ? 0.05 : 0.08), delayChildren: delay } },
  };

  return (
    <Tag className={className} aria-label={text}>
      <motion.span
        aria-hidden
        className="inline"
        variants={container}
        initial="hidden"
        {...(trigger === "mount"
          ? { animate: "show" }
          : {
              whileInView: "show",
              viewport: { ...VIEWPORT, amount: 0.5 },
              // Masks back on before the pieces sink out of sight
              onViewportLeave: () => setDone(false),
            })}
        onAnimationComplete={(definition) => setDone(definition === "show")}
      >
        {content}
      </motion.span>
    </Tag>
  );
};
