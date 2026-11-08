import { useEffect, useMemo, useRef } from "react";
import { animate, motion, useInView, useMotionValue, useTransform } from "framer-motion";
import { VIEWPORT } from "@/lib/motion";

interface AnimatedNumberProps {
  value: number;
  /** Seconds until the final number shows */
  duration?: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
  /** Thousands separators in the visitor's locale (1,234 instead of 1234) */
  grouping?: boolean;
}

export const AnimatedNumber = ({
  value,
  duration = 2,
  decimals = 0,
  suffix = "",
  prefix = "",
  className = "",
  grouping = false,
}: AnimatedNumberProps) => {
  const ref = useRef<HTMLSpanElement>(null);
  // Counts up whenever it comes into view, and back down when it leaves, so scrolling back replays it
  const isInView = useInView(ref, VIEWPORT);
  const count = useMotionValue(0);
  // Made once: toLocaleString with options builds a new formatter on every frame of the count
  const formatter = useMemo(
    () => new Intl.NumberFormat(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    [decimals],
  );

  const display = useTransform(count, (current) => {
    const number = grouping ? formatter.format(current) : current.toFixed(decimals);
    return `${prefix}${number}${suffix}`;
  });

  // A fixed-length ease-out: fast at first, settling exactly at `duration`
  // (a spring keeps creeping through the last digits for seconds)
  useEffect(() => {
    const controls = isInView
      ? animate(count, value, { duration, ease: "easeOut" })
      : animate(count, 0, { duration: 0.6, ease: "easeIn" });
    return () => controls.stop();
  }, [isInView, value, duration, count]);

  return (
    <motion.span ref={ref} className={className}>
      {display}
    </motion.span>
  );
};
