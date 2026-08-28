"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { Variants } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Primitif gerak TERPUSAT — semua animasi framer-motion di aplikasi
 * memakai komponen ini, bukan motion.div telanjang. Gerak hemat dan
 * bertujuan; semua hormat pada prefers-reduced-motion (tanpa gerak).
 */

/** Kurva easing standar seluruh aplikasi. */
export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

type MotionBlockProps = {
  children?: ReactNode;
  className?: string;
};

/** Masuk lembut: opacity 0 -> 1, y 12 -> 0, 240ms. */
export function FadeUp({
  children,
  className,
  delay = 0,
}: MotionBlockProps & { delay?: number }) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

const STAGGER_CONTAINER: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06 },
  },
};

const STAGGER_ITEM: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.24, ease: EASE },
  },
};

/**
 * Pembungkus daftar/grid: anak-anak <StaggerItem> masuk berurutan
 * dengan jeda 60ms. `inView` (opsional) menunda sampai terlihat di layar.
 */
export function Stagger({
  children,
  className,
  inView = false,
}: MotionBlockProps & { inView?: boolean }) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      variants={STAGGER_CONTAINER}
      initial="hidden"
      {...(inView
        ? { whileInView: "show", viewport: { once: true, margin: "-40px" } }
        : { animate: "show" })}
    >
      {children}
    </motion.div>
  );
}

/** Satu anak di dalam <Stagger>. */
export function StaggerItem({ children, className }: MotionBlockProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div className={className} variants={STAGGER_ITEM}>
      {children}
    </motion.div>
  );
}

/** Umpan balik sentuh: mengecil halus saat ditekan. */
export function Pressable({ children, className }: MotionBlockProps) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      whileTap={reduce ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.15, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Panel/sheet meluncur masuk dengan pegas (stiffness 300, damping 32).
 * `from="x"` dari samping, `from="y"` (default) dari bawah.
 */
export function SheetIn({
  children,
  className,
  from = "y",
  distance = 24,
}: MotionBlockProps & { from?: "x" | "y"; distance?: number }) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={from === "x" ? { opacity: 0, x: distance } : { opacity: 0, y: distance }}
      animate={from === "x" ? { opacity: 1, x: 0 } : { opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 32 }}
    >
      {children}
    </motion.div>
  );
}
