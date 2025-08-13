export interface Channel {
  id?: number;
  name?: string;
  description?: string;
  login_description?: string;
  created_at?: string;
  logoUrl?: string;
  showCredit?: boolean;
  views?: number;
  require_auth_for_view_files?: boolean;
  contact_us?: string;
  threads_enabled?: boolean;
}