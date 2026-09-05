// Hand-written types mirroring supabase/migrations/*.sql.
// Regenerate/replace with `supabase gen types typescript` once the project
// is linked to a live Supabase instance — this file is kept in sync manually
// for now, structured so a generated file can drop in with the same shape.

export type DimensionKey =
  | "positioning"
  | "audience"
  | "messaging"
  | "content"
  | "social"
  | "visual"
  | "digital"
  | "competition";

export type ConfidenceLevel = "high" | "medium" | "low";
export type AuditType = "quick" | "deep";
export type AuditStatus = "draft" | "ready" | "processing" | "completed" | "failed" | "cancelled";
export type EvidenceSourceType = "user_input" | "website" | "social" | "uploaded_asset" | "competitor" | "system";
export type EvidenceStatus = "observed" | "provided" | "inferred" | "unavailable";
export type FindingType = "strength" | "weakness" | "opportunity";
export type ImpactLevel = "low" | "medium" | "high";
export type DifficultyLevel = "low" | "medium" | "high";
export type SeverityLevel = "low" | "medium" | "high" | "critical";
export type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "closed";
export type SocialPlatform = "instagram" | "facebook" | "tiktok" | "linkedin" | "x" | "youtube" | "other";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string; email: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      brands: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          industry: string | null;
          country: string | null;
          city: string | null;
          description: string | null;
          website_url: string | null;
          business_model: string | null;
          primary_product_service: string | null;
          years_operating: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["brands"]["Row"]> & { owner_id: string; name: string };
        Update: Partial<Database["public"]["Tables"]["brands"]["Row"]>;
        Relationships: [];
      };
      brand_audience: {
        Row: {
          id: string;
          brand_id: string;
          ideal_customer: string | null;
          customer_problem: string | null;
          customer_reason_to_choose: string | null;
          differentiator: string | null;
          market_segment: string | null;
          age_range: string | null;
          gender: string | null;
          location: string | null;
          income_segment: string | null;
          customer_type: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["brand_audience"]["Row"]> & { brand_id: string };
        Update: Partial<Database["public"]["Tables"]["brand_audience"]["Row"]>;
        Relationships: [];
      };
      brand_objectives: {
        Row: {
          id: string;
          brand_id: string;
          primary_objective: string | null;
          secondary_objectives: string[];
          biggest_marketing_challenge: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["brand_objectives"]["Row"]> & { brand_id: string };
        Update: Partial<Database["public"]["Tables"]["brand_objectives"]["Row"]>;
        Relationships: [];
      };
      marketing_profiles: {
        Row: {
          id: string;
          brand_id: string;
          channels: string[];
          posting_frequency: string | null;
          advertising_active: boolean | null;
          content_creation_process: string | null;
          marketing_team_size: string | null;
          marketing_budget_range: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["marketing_profiles"]["Row"]> & { brand_id: string };
        Update: Partial<Database["public"]["Tables"]["marketing_profiles"]["Row"]>;
        Relationships: [];
      };
      social_profiles: {
        Row: {
          id: string;
          brand_id: string;
          platform: SocialPlatform;
          profile_url: string | null;
          handle: string | null;
          status: "active" | "inactive";
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["social_profiles"]["Row"]> & { brand_id: string; platform: SocialPlatform };
        Update: Partial<Database["public"]["Tables"]["social_profiles"]["Row"]>;
        Relationships: [];
      };
      competitors: {
        Row: {
          id: string;
          brand_id: string;
          name: string;
          url: string | null;
          social_handle: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["competitors"]["Row"]> & { brand_id: string; name: string };
        Update: Partial<Database["public"]["Tables"]["competitors"]["Row"]>;
        Relationships: [];
      };
      audits: {
        Row: {
          id: string;
          brand_id: string;
          owner_id: string;
          audit_type: AuditType;
          status: AuditStatus;
          overall_score: number | null;
          overall_confidence: ConfidenceLevel | null;
          executive_summary: string | null;
          processing_error: string | null;
          processing_locked_at: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["audits"]["Row"]> & {
          brand_id: string;
          owner_id: string;
          audit_type: AuditType;
        };
        Update: Partial<Database["public"]["Tables"]["audits"]["Row"]>;
        Relationships: [];
      };
      audit_responses: {
        Row: {
          id: string;
          audit_id: string;
          section: string;
          question_key: string;
          answer: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_responses"]["Row"]> & {
          audit_id: string;
          section: string;
          question_key: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_responses"]["Row"]>;
        Relationships: [];
      };
      audit_evidence: {
        Row: {
          id: string;
          audit_id: string;
          dimension: DimensionKey;
          source_type: EvidenceSourceType;
          source_reference: string | null;
          content: string | null;
          evidence_status: EvidenceStatus;
          confidence: ConfidenceLevel;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_evidence"]["Row"]> & {
          audit_id: string;
          dimension: DimensionKey;
          source_type: EvidenceSourceType;
          evidence_status: EvidenceStatus;
        };
        Update: Partial<Database["public"]["Tables"]["audit_evidence"]["Row"]>;
        Relationships: [];
      };
      audit_dimensions: {
        Row: {
          id: string;
          audit_id: string;
          dimension_key: DimensionKey;
          score: number | null;
          confidence: ConfidenceLevel;
          summary: string | null;
          subcriteria: unknown[];
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_dimensions"]["Row"]> & {
          audit_id: string;
          dimension_key: DimensionKey;
        };
        Update: Partial<Database["public"]["Tables"]["audit_dimensions"]["Row"]>;
        Relationships: [];
      };
      audit_findings: {
        Row: {
          id: string;
          audit_id: string;
          dimension_key: DimensionKey;
          type: FindingType;
          title: string;
          description: string;
          severity: SeverityLevel | null;
          impact: ImpactLevel | null;
          difficulty: DifficultyLevel | null;
          priority_score: number | null;
          confidence: ConfidenceLevel;
          evidence_ids: string[];
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_findings"]["Row"]> & {
          audit_id: string;
          dimension_key: DimensionKey;
          type: FindingType;
          title: string;
          description: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_findings"]["Row"]>;
        Relationships: [];
      };
      audit_recommendations: {
        Row: {
          id: string;
          audit_id: string;
          dimension_key: DimensionKey;
          finding_id: string | null;
          title: string;
          description: string;
          why_it_matters: string | null;
          action_steps: string[];
          impact: ImpactLevel | null;
          difficulty: DifficultyLevel | null;
          timeframe: string | null;
          priority_score: number | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_recommendations"]["Row"]> & {
          audit_id: string;
          dimension_key: DimensionKey;
          title: string;
          description: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_recommendations"]["Row"]>;
        Relationships: [];
      };
      audit_action_plans: {
        Row: {
          id: string;
          audit_id: string;
          // Stage 8 produces one structured object (fixFirst + week1-4), not
          // a flat array — see ActionPlanSchema in lib/ai/pipeline/schemas.ts.
          // plan_60_day/plan_90_day are reserved for a future extension of
          // the plan beyond 30 days and are always written as `[]` for now.
          plan_30_day: unknown;
          plan_60_day: unknown[];
          plan_90_day: unknown[];
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_action_plans"]["Row"]> & { audit_id: string };
        Update: Partial<Database["public"]["Tables"]["audit_action_plans"]["Row"]>;
        Relationships: [];
      };
      audit_assets: {
        Row: {
          id: string;
          audit_id: string;
          owner_id: string;
          file_name: string;
          storage_path: string;
          mime_type: "image/png" | "image/jpeg" | "image/webp" | "application/pdf";
          file_size: number;
          asset_type: string;
          analysis_status: "pending" | "analyzed" | "failed" | "skipped";
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_assets"]["Row"]> & {
          audit_id: string;
          owner_id: string;
          file_name: string;
          storage_path: string;
          mime_type: "image/png" | "image/jpeg" | "image/webp" | "application/pdf";
          file_size: number;
        };
        Update: Partial<Database["public"]["Tables"]["audit_assets"]["Row"]>;
        Relationships: [];
      };
      website_sources: {
        Row: {
          id: string;
          audit_id: string;
          url: string;
          status: "pending" | "fetched" | "failed" | "skipped";
          title: string | null;
          description: string | null;
          headings: string[];
          body_text: string | null;
          cta_text: string[];
          contact_information: Record<string, unknown>;
          trust_signals: string[];
          fetched_at: string | null;
          error_message: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["website_sources"]["Row"]> & { audit_id: string; url: string };
        Update: Partial<Database["public"]["Tables"]["website_sources"]["Row"]>;
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          audit_id: string;
          owner_id: string;
          name: string;
          email: string;
          phone: string | null;
          business_name: string | null;
          consent_marketing: boolean;
          consent_timestamp: string | null;
          source: string;
          status: LeadStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["leads"]["Row"]> & {
          audit_id: string;
          owner_id: string;
          name: string;
          email: string;
        };
        Update: Partial<Database["public"]["Tables"]["leads"]["Row"]>;
        Relationships: [];
      };
      audit_shares: {
        Row: {
          id: string;
          audit_id: string;
          share_token: string;
          is_active: boolean;
          created_at: string;
          expires_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_shares"]["Row"]> & { audit_id: string; share_token: string };
        Update: Partial<Database["public"]["Tables"]["audit_shares"]["Row"]>;
        Relationships: [];
      };
      rate_limit_events: {
        Row: { id: number; bucket_key: string; created_at: string };
        Insert: { bucket_key: string };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      try_lock_audit_processing: {
        Args: { p_audit_id: string };
        Returns: boolean;
      };
      get_shared_audit_report: {
        Args: { p_token: string };
        Returns: unknown;
      };
      check_and_record_rate_limit: {
        Args: { p_bucket_key: string; p_limit: number; p_window_seconds: number };
        Returns: { allowed: boolean; current_count: number }[];
      };
    };
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
