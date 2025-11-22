"use client";

import React from "react";

import { LazyMotion, domAnimation } from "motion/react";

/**
 * MotionProvider
 *
 * Framer Motionの遅延読み込みを有効にするプロバイダー。
 * LazyMotionとdomAnimationを使用することで、初期バンドルサイズを大幅に削減します。
 *
 * 使用方法:
 * - layout.tsxで全体をラップ
 * - 各コンポーネントでは `motion` の代わりに `m` を使用
 */
export const MotionProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
};
