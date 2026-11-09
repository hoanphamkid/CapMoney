export type User = { id: string; email: string; name: string; phone: string; role: string; emailVerified: boolean };
export type Profile = { locale: string; currency: string; timezone: string; avatarUrl?: string };
export type MeResponse = { user: User; profile: Profile | null };
