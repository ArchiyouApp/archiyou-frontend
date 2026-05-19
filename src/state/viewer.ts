/**
 * state/viewer.ts — 3D viewer UI state.
 *
 * Stub: the viewer keeps most of this state as component properties today
 * (view style, camera projection, AR, active animation). Signals are declared
 * here so the structure is in place; wiring is a follow-up.
 */

import { signal } from '@lit-labs/signals';

export const viewStyleId      = signal<string | null>(null);
export const cameraOrtho      = signal<boolean>(false);
export const arActive         = signal<boolean>(false);
export const activeAnimation  = signal<string | null>(null);

export function setViewStyleId(id: string | null): void { viewStyleId.set(id); }
export function setCameraOrtho(ortho: boolean): void { cameraOrtho.set(ortho); }
export function setArActive(active: boolean): void { arActive.set(active); }
export function setActiveAnimation(name: string | null): void { activeAnimation.set(name); }
