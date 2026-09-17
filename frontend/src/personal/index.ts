/**
 * The active personal profile. `personal.local.ts` is gitignored and holds the
 * real candidate's details; when it is absent (a fresh clone), the committed
 * placeholder profile is used so the app still builds and runs.
 *
 * To set up: copy personal.example.ts to personal.local.ts and fill it in.
 */
import type { PersonalProfile } from './types';
import { examplePersonalProfile } from './personal.example';

const localModules = import.meta.glob<{ default: PersonalProfile }>('./personal.local.ts', {
  eager: true,
});

export const PERSONAL: PersonalProfile =
  Object.values(localModules)[0]?.default ?? examplePersonalProfile;

export type { PersonalProfile } from './types';
