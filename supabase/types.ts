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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      rb_colors: {
        Row: {
          external_ids: Json | null
          id: number
          is_trans: boolean
          last_updated_at: string
          name: string
          rgb: string | null
        }
        Insert: {
          external_ids?: Json | null
          id: number
          is_trans?: boolean
          last_updated_at?: string
          name: string
          rgb?: string | null
        }
        Update: {
          external_ids?: Json | null
          id?: number
          is_trans?: boolean
          last_updated_at?: string
          name?: string
          rgb?: string | null
        }
        Relationships: []
      }
      rb_download_versions: {
        Row: {
          last_ingested_at: string
          source: string
          version: string
        }
        Insert: {
          last_ingested_at?: string
          source: string
          version: string
        }
        Update: {
          last_ingested_at?: string
          source?: string
          version?: string
        }
        Relationships: []
      }
      rb_inventories: {
        Row: {
          id: number
          set_num: string | null
          version: number | null
        }
        Insert: {
          id: number
          set_num?: string | null
          version?: number | null
        }
        Update: {
          id?: number
          set_num?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rb_inventories_set_num_fkey"
            columns: ["set_num"]
            isOneToOne: false
            referencedRelation: "rb_sets"
            referencedColumns: ["set_num"]
          },
        ]
      }
      rb_inventory_minifigs: {
        Row: {
          fig_num: string
          inventory_id: number
          quantity: number
        }
        Insert: {
          fig_num: string
          inventory_id: number
          quantity: number
        }
        Update: {
          fig_num?: string
          inventory_id?: number
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "rb_inventory_minifigs_fig_num_fkey"
            columns: ["fig_num"]
            isOneToOne: false
            referencedRelation: "rb_minifigs"
            referencedColumns: ["fig_num"]
          },
          {
            foreignKeyName: "rb_inventory_minifigs_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "rb_inventories"
            referencedColumns: ["id"]
          },
        ]
      }
      rb_inventory_parts: {
        Row: {
          color_id: number
          element_id: string
          inventory_id: number
          is_spare: boolean
          part_num: string
          quantity: number
        }
        Insert: {
          color_id: number
          element_id: string
          inventory_id: number
          is_spare?: boolean
          part_num: string
          quantity: number
        }
        Update: {
          color_id?: number
          element_id?: string
          inventory_id?: number
          is_spare?: boolean
          part_num?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "rb_inventory_parts_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "rb_colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rb_inventory_parts_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "rb_inventories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rb_inventory_parts_part_num_fkey"
            columns: ["part_num"]
            isOneToOne: false
            referencedRelation: "rb_parts"
            referencedColumns: ["part_num"]
          },
        ]
      }
      rb_minifigs: {
        Row: {
          fig_num: string
          name: string
          num_parts: number | null
        }
        Insert: {
          fig_num: string
          name: string
          num_parts?: number | null
        }
        Update: {
          fig_num?: string
          name?: string
          num_parts?: number | null
        }
        Relationships: []
      }
      rb_part_categories: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
      rb_parts: {
        Row: {
          external_ids: Json | null
          image_url: string | null
          last_updated_at: string
          name: string
          part_cat_id: number | null
          part_num: string
        }
        Insert: {
          external_ids?: Json | null
          image_url?: string | null
          last_updated_at?: string
          name: string
          part_cat_id?: number | null
          part_num: string
        }
        Update: {
          external_ids?: Json | null
          image_url?: string | null
          last_updated_at?: string
          name?: string
          part_cat_id?: number | null
          part_num?: string
        }
        Relationships: []
      }
      rb_set_parts: {
        Row: {
          color_id: number
          is_spare: boolean
          last_updated_at: string
          part_num: string
          quantity: number
          set_num: string
        }
        Insert: {
          color_id: number
          is_spare?: boolean
          last_updated_at?: string
          part_num: string
          quantity: number
          set_num: string
        }
        Update: {
          color_id?: number
          is_spare?: boolean
          last_updated_at?: string
          part_num?: string
          quantity?: number
          set_num?: string
        }
        Relationships: [
          {
            foreignKeyName: "rb_set_parts_color_fk"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "rb_colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rb_set_parts_part_fk"
            columns: ["part_num"]
            isOneToOne: false
            referencedRelation: "rb_parts"
            referencedColumns: ["part_num"]
          },
          {
            foreignKeyName: "rb_set_parts_set_fk"
            columns: ["set_num"]
            isOneToOne: false
            referencedRelation: "rb_sets"
            referencedColumns: ["set_num"]
          },
        ]
      }
      rb_sets: {
        Row: {
          image_url: string | null
          last_updated_at: string
          name: string
          num_parts: number | null
          set_num: string
          theme_id: number | null
          year: number | null
        }
        Insert: {
          image_url?: string | null
          last_updated_at?: string
          name: string
          num_parts?: number | null
          set_num: string
          theme_id?: number | null
          year?: number | null
        }
        Update: {
          image_url?: string | null
          last_updated_at?: string
          name?: string
          num_parts?: number | null
          set_num?: string
          theme_id?: number | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rb_sets_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "rb_themes"
            referencedColumns: ["id"]
          },
        ]
      }
      rb_themes: {
        Row: {
          id: number
          name: string
          parent_id: number | null
        }
        Insert: {
          id: number
          name: string
          parent_id?: number | null
        }
        Update: {
          id?: number
          name?: string
          parent_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rb_themes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "rb_themes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_parts_inventory: {
        Row: {
          color_id: number
          part_num: string
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color_id: number
          part_num: string
          quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color_id?: number
          part_num?: string
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_parts_inventory_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "rb_colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_parts_inventory_part_num_fkey"
            columns: ["part_num"]
            isOneToOne: false
            referencedRelation: "rb_parts"
            referencedColumns: ["part_num"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          default_filter: Json | null
          settings: Json | null
          theme: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_filter?: Json | null
          settings?: Json | null
          theme?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_filter?: Json | null
          settings?: Json | null
          theme?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string
          display_name: string | null
          subscription_expires_at: string | null
          subscription_tier: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          subscription_expires_at?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          subscription_expires_at?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_set_parts: {
        Row: {
          color_id: number
          is_spare: boolean
          owned_quantity: number
          part_num: string
          set_num: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color_id: number
          is_spare?: boolean
          owned_quantity?: number
          part_num: string
          set_num: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color_id?: number
          is_spare?: boolean
          owned_quantity?: number
          part_num?: string
          set_num?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_set_parts_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "rb_colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_set_parts_inventory_fk"
            columns: ["set_num", "part_num", "color_id", "is_spare"]
            isOneToOne: false
            referencedRelation: "rb_set_parts"
            referencedColumns: ["set_num", "part_num", "color_id", "is_spare"]
          },
          {
            foreignKeyName: "user_set_parts_part_num_fkey"
            columns: ["part_num"]
            isOneToOne: false
            referencedRelation: "rb_parts"
            referencedColumns: ["part_num"]
          },
          {
            foreignKeyName: "user_set_parts_set_num_fkey"
            columns: ["set_num"]
            isOneToOne: false
            referencedRelation: "rb_sets"
            referencedColumns: ["set_num"]
          },
        ]
      }
      user_sets: {
        Row: {
          created_at: string
          has_box: boolean
          has_instructions: boolean
          set_num: string
          status: Database["public"]["Enums"]["set_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          has_box?: boolean
          has_instructions?: boolean
          set_num: string
          status: Database["public"]["Enums"]["set_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          has_box?: boolean
          has_instructions?: boolean
          set_num?: string
          status?: Database["public"]["Enums"]["set_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sets_set_num_fkey"
            columns: ["set_num"]
            isOneToOne: false
            referencedRelation: "rb_sets"
            referencedColumns: ["set_num"]
          },
        ]
      }
      user_collections: {
        Row: {
          created_at: string
          id: string
          is_system: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_collections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_collection_sets: {
        Row: {
          collection_id: string
          created_at: string
          set_num: string
          user_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          set_num: string
          user_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          set_num?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_collection_sets_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "user_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_collection_sets_set_num_fkey"
            columns: ["set_num"]
            isOneToOne: false
            referencedRelation: "rb_sets"
            referencedColumns: ["set_num"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      set_status: "owned" | "want" | "can_build" | "partial"
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
      set_status: ["owned", "want", "can_build", "partial"],
    },
  },
} as const
