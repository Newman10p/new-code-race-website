import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { EMPTY_PROFILE } from "../lib/profile";
import type { Profile } from "../lib/profile";

const KEY = "lumen-profile";

interface Ctx {
  profile: Profile;
  onboarded: boolean;
  setField: <K extends keyof Profile>(key: K, value: Profile[K]) => void;
  patch: (p: Partial<Profile>) => void;
  completeOnboarding: (p: Profile) => void;
  resetOnboarding: () => void;
}

const ProfileContext = createContext<Ctx | null>(null);

function read(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...EMPTY_PROFILE, ...JSON.parse(raw) };
  } catch {
    /* noop */
  }
  return EMPTY_PROFILE;
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile>(read);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(profile));
    } catch {
      /* noop */
    }
  }, [profile]);

  const setField = useCallback(<K extends keyof Profile>(key: K, value: Profile[K]) => {
    setProfile((p) => ({ ...p, [key]: value }));
  }, []);

  const patch = useCallback((p: Partial<Profile>) => {
    setProfile((prev) => ({ ...prev, ...p }));
  }, []);

  const completeOnboarding = useCallback((p: Profile) => {
    setProfile({ ...p, completedAt: Date.now() });
  }, []);

  const resetOnboarding = useCallback(() => {
    setProfile((p) => ({ ...p, completedAt: null }));
  }, []);

  const value = useMemo(
    () => ({
      profile,
      onboarded: profile.completedAt !== null,
      setField,
      patch,
      completeOnboarding,
      resetOnboarding,
    }),
    [profile, setField, patch, completeOnboarding, resetOnboarding]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}

export function toggleIn(list: string[], id: string) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}
