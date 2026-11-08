import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { KineticText } from "@/components/motion/KineticText";
import { EASE_OUT_EXPO, SPRING_POP, VIEWPORT } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** Tint of the icon badge (e.g. "bg-purple/20") */
  badgeClassName?: string;
  iconClassName?: string;
  className?: string;
}

/** A section's opening: a glowing icon badge, the title rising word by word, an underline drawing in */
export const SectionHeader = ({
  icon: Icon,
  title,
  subtitle,
  badgeClassName = "gradient-bg",
  iconClassName = "text-primary",
  className,
}: SectionHeaderProps) => (
  <div className={cn("text-center mb-10", className)}>
    <motion.div
      initial={{ rotate: -20, scale: 0 }}
      whileInView={{ rotate: 0, scale: 1 }}
      viewport={VIEWPORT}
      transition={SPRING_POP}
      className="relative inline-flex mb-5"
    >
      {/* Colours sweeping around behind the badge, fading out softly around it */}
      <div
        aria-hidden
        className="absolute -inset-8 rounded-full opacity-60 soft-edge [--soft-from:20%] animate-spin-slow"
        style={{ background: "conic-gradient(from 0deg, hsl(var(--cyan)), hsl(var(--purple)), hsl(var(--pink)), hsl(var(--cyan)))" }}
      />
      <div className="relative inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-card ring-1 ring-white/10">
        <div className={cn("absolute inset-0 rounded-2xl", badgeClassName)} />
        <Icon className={cn("relative w-7 h-7", iconClassName)} />
      </div>
    </motion.div>

    <KineticText
      as="h2"
      text={title}
      gradient
      className="font-display text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.05]"
    />

    <motion.div
      aria-hidden
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={VIEWPORT}
      transition={{ delay: 0.3, duration: 0.8, ease: EASE_OUT_EXPO }}
      className="mx-auto mt-4 h-[3px] w-12 rounded-full bg-gradient-to-r from-cyan via-purple to-pink"
    />

    {subtitle && (
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={VIEWPORT}
        transition={{ delay: 0.35, duration: 0.6, ease: EASE_OUT_EXPO }}
        className="text-muted-foreground mt-3"
      >
        {subtitle}
      </motion.p>
    )}
  </div>
);
