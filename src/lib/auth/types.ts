export type AppRole = "client" | "technician" | "superadmin";

export type Profile = {
  id: string;
  role: AppRole;
  email: string;
  full_name: string;
  avatar_url: string | null;
  is_active: boolean;
  onboarding_completed_at: string | null;
  onboarding_step: number;
};
