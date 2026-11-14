"use client";

import { LazyMotion, domMax } from "motion/react";

export function MotionRoot({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domMax} strict={false}>
      {children}
    </LazyMotion>
  );
}
