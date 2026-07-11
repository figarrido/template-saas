export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_user_id: string
          admin_audit_log_id: string
          created_at: string
          metadata: Json
          target_id: string | null
          target_kind: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          admin_audit_log_id?: string
          created_at?: string
          metadata?: Json
          target_id?: string | null
          target_kind?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          admin_audit_log_id?: string
          created_at?: string
          metadata?: Json
          target_id?: string | null
          target_kind?: string | null
        }
        Relationships: []
      }
      admin_recovery_codes: {
        Row: {
          admin_recovery_code_id: string
          code_hash: string
          created_at: string
          updated_at: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          admin_recovery_code_id?: string
          code_hash: string
          created_at?: string
          updated_at?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          admin_recovery_code_id?: string
          code_hash?: string
          created_at?: string
          updated_at?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          granted_at: string
          granted_by: string | null
          notes: string | null
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          notes?: string | null
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          notes?: string | null
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      billing_accounts: {
        Row: {
          billing_account_id: string
          created_at: string
          external_customer_id: string
          external_subscription_id: string | null
          organization_id: string
          provider: string
          provider_metadata: Json
          status: string
          updated_at: string
        }
        Insert: {
          billing_account_id?: string
          created_at?: string
          external_customer_id: string
          external_subscription_id?: string | null
          organization_id: string
          provider: string
          provider_metadata?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          billing_account_id?: string
          created_at?: string
          external_customer_id?: string
          external_subscription_id?: string | null
          organization_id?: string
          provider?: string
          provider_metadata?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_accounts_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      entitlements: {
        Row: {
          created_at: string
          entitlement_id: string
          expires_at: string | null
          granted_at: string
          key: string
          organization_id: string
          plan_id: string | null
          source: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          entitlement_id?: string
          expires_at?: string | null
          granted_at?: string
          key: string
          organization_id: string
          plan_id?: string | null
          source?: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          entitlement_id?: string
          expires_at?: string | null
          granted_at?: string
          key?: string
          organization_id?: string
          plan_id?: string | null
          source?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "entitlements_plan_id_fkey"
            columns: ["plan_id"]
            referencedRelation: "plans"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      flag_overrides: {
        Row: {
          created_at: string
          expires_at: string | null
          flag_key: string
          flag_override_id: string
          organization_id: string | null
          reason: string | null
          set_by: string | null
          updated_at: string
          user_id: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          flag_key: string
          flag_override_id?: string
          organization_id?: string | null
          reason?: string | null
          set_by?: string | null
          updated_at?: string
          user_id?: string | null
          value: Json
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          flag_key?: string
          flag_override_id?: string
          organization_id?: string | null
          reason?: string | null
          set_by?: string | null
          updated_at?: string
          user_id?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "flag_overrides_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "flag_overrides_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          invitation_id: string
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["membership_role"]
          status: Database["public"]["Enums"]["invitation_status"]
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          invitation_id?: string
          invited_by?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["membership_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          invitation_id?: string
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          amount_total: number
          billing_account_id: string | null
          created_at: string
          currency: string
          external_invoice_id: string
          invoice_id: string
          invoiced_at: string | null
          organization_id: string
          paid_at: string | null
          provider: string
          provider_metadata: Json
          status: Database["public"]["Enums"]["invoice_status"]
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          amount_total: number
          billing_account_id?: string | null
          created_at?: string
          currency: string
          external_invoice_id: string
          invoice_id?: string
          invoiced_at?: string | null
          organization_id: string
          paid_at?: string | null
          provider: string
          provider_metadata?: Json
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          amount_total?: number
          billing_account_id?: string | null
          created_at?: string
          currency?: string
          external_invoice_id?: string
          invoice_id?: string
          invoiced_at?: string | null
          organization_id?: string
          paid_at?: string | null
          provider?: string
          provider_metadata?: Json
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_billing_account_id_fkey"
            columns: ["billing_account_id"]
            referencedRelation: "billing_accounts"
            referencedColumns: ["billing_account_id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          membership_id: string
          organization_id: string
          role: Database["public"]["Enums"]["membership_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          membership_id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["membership_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          membership_id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          name: string
          organization_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          name: string
          organization_id?: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          name?: string
          organization_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          created_at: string
          description: string | null
          is_active: boolean
          name: string
          plan_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          name: string
          plan_id?: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          name?: string
          plan_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tax_documents: {
        Row: {
          created_at: string
          document_kind: string
          emitted_at: string | null
          emitter: string
          external_document_id: string | null
          failure_reason: string | null
          invoice_id: string
          metadata: Json
          organization_id: string
          status: Database["public"]["Enums"]["tax_document_status"]
          tax_document_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_kind: string
          emitted_at?: string | null
          emitter: string
          external_document_id?: string | null
          failure_reason?: string | null
          invoice_id: string
          metadata?: Json
          organization_id: string
          status?: Database["public"]["Enums"]["tax_document_status"]
          tax_document_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_kind?: string
          emitted_at?: string | null
          emitter?: string
          external_document_id?: string | null
          failure_reason?: string | null
          invoice_id?: string
          metadata?: Json
          organization_id?: string
          status?: Database["public"]["Enums"]["tax_document_status"]
          tax_document_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_documents_invoice_id_fkey"
            columns: ["invoice_id"]
            referencedRelation: "invoices"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "tax_documents_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["organization_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_organization: {
        Args: { org_name: string }
        Returns: {
          created_at: string
          name: string
          organization_id: string
          slug: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_member_of: { Args: { target_org: string }; Returns: boolean }
      is_org_admin: { Args: { target_org: string }; Returns: boolean }
      uuid_generate_v7: { Args: never; Returns: string }
    }
    Enums: {
      invitation_status: "pending" | "accepted" | "revoked" | "expired"
      invoice_status: "draft" | "open" | "paid" | "void" | "uncollectible"
      membership_role: "owner" | "manager" | "member"
      tax_document_status: "pending" | "emitted" | "voided" | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      invitation_status: ["pending", "accepted", "revoked", "expired"],
      invoice_status: ["draft", "open", "paid", "void", "uncollectible"],
      membership_role: ["owner", "manager", "member"],
      tax_document_status: ["pending", "emitted", "voided", "failed"],
    },
  },
} as const
