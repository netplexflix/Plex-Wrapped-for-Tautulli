import { motion } from "framer-motion";
import { RotateCcw, Heart } from "lucide-react";
import { StatCard } from "./StatCard";
import { AnimatedNumber } from "./AnimatedNumber";

interface MostRewatchedProps {
  mostRewatched: { title: string; rewatchCount: number } | null;
  isGroup?: boolean;
}

export const MostRewatched = ({ mostRewatched, isGroup = false }: MostRewatchedProps) => {
  if (!mostRewatched) return null;

  return (
    <StatCard className="overflow-hidden">
      <div className="relative">
        <div className="absolute inset-0 gradient-bg opacity-30" />
        <div className="relative text-center py-8">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            whileInView={{ scale: 1, rotate: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 150 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-pink/20 mb-4"
          >
            <Heart className="w-10 h-10 text-pink" />
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-muted-foreground mb-2"
          >
            {isGroup ? "The server's comfort watch" : "Your comfort watch"}
          </motion.p>
          <motion.h3
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="text-3xl md:text-4xl font-extrabold gradient-text mb-4 px-4"
          >
            {mostRewatched.title}
          </motion.h3>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
            className="flex items-center justify-center gap-2 text-muted-foreground"
          >
            <RotateCcw className="w-4 h-4" />
            <span>
              Watched{" "}
              <span className="text-foreground font-bold">
                <AnimatedNumber value={mostRewatched.rewatchCount} />
              </span>{" "}
              times{isGroup ? " by one viewer" : ""}
            </span>
          </motion.div>
        </div>
      </div>
    </StatCard>
  );
};