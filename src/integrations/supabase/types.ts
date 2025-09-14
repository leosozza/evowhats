export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      bitrix_channels: {
        Row: {
          channel_id: string
          channel_name: string
          channel_type: string
          created_at: string
          id: string
          is_active: boolean | null
          updated_at: string
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          channel_id: string
          channel_name: string
          channel_type?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          updated_at?: string
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          channel_id?: string
          channel_name?: string
          channel_type?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          updated_at?: string
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      bitrix_conversation_mapping: {
        Row: {
          bitrix_channel_id: string
          bitrix_chat_id: string
          conversation_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bitrix_channel_id: string
          bitrix_chat_id: string
          conversation_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bitrix_channel_id?: string
          bitrix_chat_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bitrix_conversation_mapping_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      bitrix_credentials: {
        Row: {
          access_token: string | null
          client_id: string
          client_secret: string
          created_at: string
          expires_at: string | null
          id: string
          installation_id: string | null
          is_active: boolean | null
          portal_url: string
          refresh_token: string | null
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          client_id: string
          client_secret: string
          created_at?: string
          expires_at?: string | null
          id?: string
          installation_id?: string | null
          is_active?: boolean | null
          portal_url: string
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          client_id?: string
          client_secret?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          installation_id?: string | null
          is_active?: boolean | null
          portal_url?: string
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bitrix_event_logs: {
        Row: {
          created_at: string
          error_message: string | null
          event_data: Json
          event_type: string
          id: string
          processed_at: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_data: Json
          event_type: string
          id?: string
          processed_at?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_data?: Json
          event_type?: string
          id?: string
          processed_at?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      bitrix_leads: {
        Row: {
          assigned_by_id: string | null
          bitrix_lead_id: string
          created_at: string
          created_by_id: string | null
          date_create: string | null
          date_modify: string | null
          email: string | null
          id: string
          last_name: string | null
          lead_data: Json | null
          name: string | null
          phone: string | null
          source_id: string | null
          status_id: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_by_id?: string | null
          bitrix_lead_id: string
          created_at?: string
          created_by_id?: string | null
          date_create?: string | null
          date_modify?: string | null
          email?: string | null
          id?: string
          last_name?: string | null
          lead_data?: Json | null
          name?: string | null
          phone?: string | null
          source_id?: string | null
          status_id?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_by_id?: string | null
          bitrix_lead_id?: string
          created_at?: string
          created_by_id?: string | null
          date_create?: string | null
          date_modify?: string | null
          email?: string | null
          id?: string
          last_name?: string | null
          lead_data?: Json | null
          name?: string | null
          phone?: string | null
          source_id?: string | null
          status_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          created_at: string | null
          display_name: string | null
          id: string
          phone_e164: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          phone_e164: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          phone_e164?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          bitrix_chat_id: string | null
          contact_id: string | null
          contact_name: string | null
          contact_phone: string
          created_at: string
          evolution_instance: string | null
          id: string
          instance_id: string | null
          last_message_at: string | null
          openlines_chat_id: string | null
          status: string | null
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bitrix_chat_id?: string | null
          contact_id?: string | null
          contact_name?: string | null
          contact_phone: string
          created_at?: string
          evolution_instance?: string | null
          id?: string
          instance_id?: string | null
          last_message_at?: string | null
          openlines_chat_id?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bitrix_chat_id?: string | null
          contact_id?: string | null
          contact_name?: string | null
          contact_phone?: string
          created_at?: string
          evolution_instance?: string | null
          id?: string
          instance_id?: string | null
          last_message_at?: string | null
          openlines_chat_id?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      evolution_instances: {
        Row: {
          created_at: string
          id: string
          instance_name: string
          instance_status: string | null
          last_seen_at: string | null
          qr_code: string | null
          updated_at: string
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          instance_name: string
          instance_status?: string | null
          last_seen_at?: string | null
          qr_code?: string | null
          updated_at?: string
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          instance_name?: string
          instance_status?: string | null
          last_seen_at?: string | null
          qr_code?: string | null
          updated_at?: string
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          bitrix_message_id: string | null
          content: string
          conversation_id: string
          created_at: string
          delivery_status: string | null
          direction: string
          evolution_message_id: string | null
          id: string
          media_url: string | null
          message_id: string | null
          message_type: string | null
          sender_name: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          bitrix_message_id?: string | null
          content: string
          conversation_id: string
          created_at?: string
          delivery_status?: string | null
          direction: string
          evolution_message_id?: string | null
          id?: string
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          sender_name?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          bitrix_message_id?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          delivery_status?: string | null
          direction?: string
          evolution_message_id?: string | null
          id?: string
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          sender_name?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          portal_url: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          portal_url: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          portal_url?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      open_channel_bindings: {
        Row: {
          created_at: string | null
          id: string
          instance_id: string | null
          line_id: string
          tenant_id: string
          updated_at: string | null
          wa_instance_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          instance_id?: string | null
          line_id: string
          tenant_id: string
          updated_at?: string | null
          wa_instance_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          instance_id?: string | null
          line_id?: string
          tenant_id?: string
          updated_at?: string | null
          wa_instance_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_configurations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          updated_at: string
          user_id: string
          webhook_secret: string | null
          webhook_url: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          updated_at?: string
          user_id: string
          webhook_secret?: string | null
          webhook_url: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          updated_at?: string
          user_id?: string
          webhook_secret?: string | null
          webhook_url?: string
        }
        Relationships: []
      }
      user_configurations: {
        Row: {
          bitrix_portal_url: string | null
          bitrix_user_id: string | null
          bitrix_webhook_url: string | null
          created_at: string
          evolution_api_key: string | null
          evolution_base_url: string | null
          evolution_instance_name: string | null
          id: string
          is_active: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bitrix_portal_url?: string | null
          bitrix_user_id?: string | null
          bitrix_webhook_url?: string | null
          created_at?: string
          evolution_api_key?: string | null
          evolution_base_url?: string | null
          evolution_instance_name?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bitrix_portal_url?: string | null
          bitrix_user_id?: string | null
          bitrix_webhook_url?: string | null
          created_at?: string
          evolution_api_key?: string | null
          evolution_base_url?: string | null
          evolution_instance_name?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wa_instances: {
        Row: {
          created_at: string | null
          id: string
          label: string
          secret: string | null
          tenant_id: string
          updated_at: string | null
          webhook_secret: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          label: string
          secret?: string | null
          tenant_id: string
          updated_at?: string | null
          webhook_secret?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          label?: string
          secret?: string | null
          tenant_id?: string
          updated_at?: string | null
          webhook_secret?: string | null
        }
        Relationships: []
      }
      wa_sessions: {
        Row: {
          bitrix_line_id: string
          bitrix_line_name: string | null
          created_at: string
          evo_instance_id: string
          id: string
          instance_id: string | null
          last_sync_at: string | null
          qr_code: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bitrix_line_id: string
          bitrix_line_name?: string | null
          created_at?: string
          evo_instance_id: string
          id?: string
          instance_id?: string | null
          last_sync_at?: string | null
          qr_code?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bitrix_line_id?: string
          bitrix_line_name?: string | null
          created_at?: string
          evo_instance_id?: string
          id?: string
          instance_id?: string | null
          last_sync_at?: string | null
          qr_code?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          id: string
          payload_json: Json
          provider: string | null
          received_at: string | null
          valid_signature: boolean | null
        }
        Insert: {
          id?: string
          payload_json: Json
          provider?: string | null
          received_at?: string | null
          valid_signature?: boolean | null
        }
        Update: {
          id?: string
          payload_json?: Json
          provider?: string | null
          received_at?: string | null
          valid_signature?: boolean | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_expired_oauth_states: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
