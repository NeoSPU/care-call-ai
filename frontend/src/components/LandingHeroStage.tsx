"use client";

import { PointerEvent, ReactNode, useEffect, useRef, useState } from "react";

import { calculateMagneticOffset, type MagneticMotionOptions } from "../lib/magnetic-motion";

const INTRO_STORAGE_KEY = "carecall:landing-intro-seen";
const SLOGAN_MAGNET: MagneticMotionOptions = { maxX: 22, maxY: 12, radius: 230 };
const LOGO_MAGNET: MagneticMotionOptions = { maxX: 11, maxY: 8, radius: 310 };

type LandingHeroStageProps = {
  animateOnFirstVisit: boolean;
  children: ReactNode;
};

export function LandingHeroStage({ animateOnFirstVisit, children }: LandingHeroStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [shouldAnimate, setShouldAnimate] = useState(false);

  useEffect(() => {
    if (!animateOnFirstVisit) {
      return;
    }

    try {
      if (window.sessionStorage.getItem(INTRO_STORAGE_KEY) === "true") {
        return;
      }

      window.sessionStorage.setItem(INTRO_STORAGE_KEY, "true");
      setShouldAnimate(true);
    } catch {
      setShouldAnimate(true);
    }
  }, [animateOnFirstVisit]);

  function setElementMagnetVars(element: HTMLElement, x: number, y: number) {
    element.style.setProperty("--magnet-x", `${x.toFixed(2)}px`);
    element.style.setProperty("--magnet-y", `${y.toFixed(2)}px`);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    stage.querySelectorAll<HTMLElement>(".sloganWord").forEach((word) => {
      const offset = calculateMagneticOffset(word.getBoundingClientRect(), { x: event.clientX, y: event.clientY }, SLOGAN_MAGNET);
      setElementMagnetVars(word, offset.x, offset.y);
    });

    const logoStage = stage.querySelector<HTMLElement>(".logoStage");
    if (logoStage) {
      const offset = calculateMagneticOffset(logoStage.getBoundingClientRect(), { x: event.clientX, y: event.clientY }, LOGO_MAGNET);
      setElementMagnetVars(logoStage, offset.x, offset.y);
    }
  }

  function resetMagnetVars() {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    stage.querySelectorAll<HTMLElement>(".sloganWord, .logoStage").forEach((element) => {
      setElementMagnetVars(element, 0, 0);
    });
  }

  return (
    <div
      className={shouldAnimate ? "heroStage heroStageMagnetic heroStageIntro" : "heroStage heroStageMagnetic"}
      onPointerLeave={resetMagnetVars}
      onPointerMove={handlePointerMove}
      ref={stageRef}
    >
      {children}
    </div>
  );
}
