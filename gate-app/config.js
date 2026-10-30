function requiredEnv(name, value) {
  if (!value) {
    throw new Error(`Missing ${name}. Add it to gate-app/.env before starting the app.`);
  }
  return value;
}

export const SUPABASE_URL = requiredEnv(
  'EXPO_PUBLIC_SUPABASE_URL',
  process.env.EXPO_PUBLIC_SUPABASE_URL
);
export const SUPABASE_KEY = requiredEnv(
  'EXPO_PUBLIC_SUPABASE_KEY',
  process.env.EXPO_PUBLIC_SUPABASE_KEY
);
export const APP_KEY = requiredEnv(
  'EXPO_PUBLIC_APP_KEY',
  process.env.EXPO_PUBLIC_APP_KEY
);
