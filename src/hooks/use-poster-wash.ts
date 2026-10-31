import { useEffect, useState } from "react";

// The poster averaged down to a few pixels, then smoothed back up a little: stretched over a card,
// it's a soft wash of the poster's colours, like a heavy blur but with nothing to compute per frame
const SAMPLE = [8, 12];
const WASH = [32, 48];

const canvasOf = ([width, height]: number[]) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas");
  context.imageSmoothingQuality = "high";
  return { canvas, context };
};

/**
 * A tiny, soft copy of the poster as a data URL, to stretch behind a card: undefined while it's
 * being made, null if it can't be (the poster didn't load, or its pixels can't be read).
 */
export const usePosterWash = (src?: string) => {
  const [wash, setWash] = useState<{ src: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const image = new Image();
    image.src = src;
    image
      .decode()
      .then(() => {
        const sample = canvasOf(SAMPLE);
        sample.context.drawImage(image, 0, 0, SAMPLE[0], SAMPLE[1]);
        const soft = canvasOf(WASH);
        soft.context.drawImage(sample.canvas, 0, 0, WASH[0], WASH[1]);
        return soft.canvas.toDataURL();
      })
      .then(
        (url) => !cancelled && setWash({ src, url }),
        () => !cancelled && setWash({ src, url: null }),
      );
    return () => {
      cancelled = true;
    };
  }, [src]);

  return wash && wash.src === src ? wash.url : undefined;
};
