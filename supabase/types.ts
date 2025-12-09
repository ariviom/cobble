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
      bl_minifig_parts: {
        Row: {
          bl_color_id: number
          bl_minifig_no: string
          bl_part_id: string
          last_refreshed_at: string | null
          name: string | null
          quantity: number
        }
        Insert: {
          bl_color_id: number
          bl_minifig_no: string
          bl_part_id: string
          last_refreshed_at?: string | null
          name?: string | null
          quantity?: number
        }
        Update: {
          bl_color_id?: number
          bl_minifig_no?: string
          bl_part_id?: string
          last_refreshed_at?: string | null
          name?: string | null
          quantity?: number
        }
        Relationships: []
      }
      bl_part_sets: {
        Row: {
          bl_part_id: string
          set_num: string
          quantity: number | null
          source: string
          last_fetched_at: string
        }
        Insert: {
          bl_part_id: string
          set_num: string
          quantity?: number | null
          source: string
          last_fetched_at?: string
        }
        Update: {
          bl_part_id?: string
          set_num?: string
          quantity?: number | null
          source?: string
          last_fetched_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bl_part_sets_bl_part_id_fkey"
            columns: ["bl_part_id"]
            isOneToOne: false
            referencedRelation: "bl_parts"
            referencedColumns: ["bl_part_id"]
          },
        ]
      }
      bl_parts: {
        Row: {
          bl_part_id: string
          name: string | null
          image_url: string | null
          last_fetched_at: string
        }
        Insert: {
          bl_part_id: string
          name?: string | null
          image_url?: string | null
          last_fetched_at?: string
        }
        Update: {
          bl_part_id?: string
          name?: string | null
          image_url?: string | null
          last_fetched_at?: string
        }
        Relationships: []
      }
      bl_set_minifigs: {
        Row: {
          image_url: string | null
          last_refreshed_at: string | null
          minifig_no: string
          name: string | null
          quantity: number
          rb_fig_id: string | null
          set_num: string
        }
        Insert: {
          image_url?: string | null
          last_refreshed_at?: string | null
          minifig_no: string
          name?: string | null
          quantity?: number
          rb_fig_id?: string | null
          set_num: string
        }
        Update: {
          image_url?: string | null
          last_refreshed_at?: string | null
          minifig_no?: string
          name?: string | null
          quantity?: number
          rb_fig_id?: string | null
          set_num?: string
        }
        Relationships: [
          {
            foreignKeyName: "bl_set_minifigs_set_num_fkey"
            columns: ["set_num"]
            isOneToOne: false
            referencedRelation: "bl_sets"
            referencedColumns: ["set_num"]
          },
        ]
      }
      bl_sets: {
        Row: {
          last_error: string | null
          last_minifig_sync_at: string | null
          minifig_sync_status: string | null
          name: string | null
          set_num: string
          year: number | null
        }
        Insert: {
          last_error?: string | null
          last_minifig_sync_at?: string | null
          minifig_sync_status?: string | null
          name?: string | null
          set_num: string
          year?: number | null
        }
        Update: {
          last_error?: string | null
          last_minifig_sync_at?: string | null
          minifig_sync_status?: string | null
          name?: string | null
          set_num?: string
          year?: number | null
        }
        Relationships: []
      }
      bricklink_minifig_mappings: {
        Row: {
          bl_item_id: string
          confidence: number | null
          created_at: string
          rb_fig_id: string
          source: string | null
          updated_at: string
        }
        Insert: {
          bl_item_id: string
          confidence?: number | null
          created_at?: string
          rb_fig_id: string
          source?: string | null
          updated_at?: string
        }
        Update: {
          bl_item_id?: string
          confidence?: number | null
          created_at?: string
          rb_fig_id?: string
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bricklink_minifig_mappings_bl_item_id_fkey"
            columns: ["bl_item_id"]
            isOneToOne: false
            referencedRelation: "bricklink_minifigs"
            referencedColumns: ["item_id"]
          },
        ]
      }
      bricklink_minifigs: {
        Row: {
          category_id: number | null
          created_at: string
          item_id: string
          item_year: number | null
          last_parts_sync_at: string | null
          name: string
          parts_sync_status: string | null
          updated_at: string
        }
        Insert: {
          category_id?: number | null
          created_at?: string
          item_id: string
          item_year?: number | null
          last_parts_sync_at?: string | null
          name: string
          parts_sync_status?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: number | null
          created_at?: string
          item_id?: string
          item_year?: number | null
          last_parts_sync_at?: string | null
          name?: string
          parts_sync_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      group_session_participants: {
        Row: {
          client_token: string
          display_name: string
          id: string
          joined_at: string
          last_seen_at: string
          left_at: string | null
          pieces_found: number
          session_id: string
          user_id: string | null
        }
        Insert: {
          client_token: string
          display_name: string
          id?: string
          joined_at?: string
          last_seen_at?: string
          left_at?: string | null
          pieces_found?: number
          session_id: string
          user_id?: string | null
        }
        Update: {
          client_token?: string
          display_name?: string
          id?: string
          joined_at?: string
          last_seen_at?: string
          left_at?: string | null
          pieces_found?: number
          session_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_session_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "group_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      group_sessions: {
        Row: {
          created_at: string
          ended_at: string | null
          host_user_id: string
          id: string
          is_active: boolean
          set_num: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          host_user_id: string
          id?: string
          is_active?: boolean
          set_num: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          host_user_id?: string
          id?: string
          is_active?: boolean
          set_num?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_sessions_set_num_fkey"
            columns: ["set_num"]
            isOneToOne: false
            referencedRelation: "rb_sets"
            referencedColumns: ["set_num"]
          },
        ]
      }
      part_id_mappings: {
        Row: {
          bl_part_id: string
          confidence: number | null
          created_at: string | null
          rb_part_id: string
          source: string
          updated_at: string | null
        }
        Insert: {
          bl_part_id: string
          confidence?: number | null
          created_at?: string | null
          rb_part_id: string
          source: string
          updated_at?: string | null
        }
        Update: {
          bl_part_id?: string
          confidence?: number | null
          created_at?: string | null
          rb_part_id?: string
          source?: string
          updated_at?: string | null
        }
        Relationships: []
      }
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
        Relationships: []
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
          img_url: string | null
          inventory_id: number
          is_spare: boolean
          part_num: string
          quantity: number
        }
        Insert: {
          color_id: number
          element_id: string
          img_url?: string | null
          inventory_id: number
          is_spare?: boolean
          part_num: string
          quantity: number
        }
        Update: {
          color_id?: number
          element_id?: string
          img_url?: string | null
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
      rb_minifig_parts: {
        Row: {
          color_id: number
          fig_num: string
          part_num: string
          quantity: number
        }
        Insert: {
          color_id: number
          fig_num: string
          part_num: string
          quantity: number
        }
        Update: {
          color_id?: number
          fig_num?: string
          part_num?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "rb_minifig_parts_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "rb_colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rb_minifig_parts_fig_num_fkey"
            columns: ["fig_num"]
            isOneToOne: false
            referencedRelation: "rb_minifigs"
            referencedColumns: ["fig_num"]
          },
          {
            foreignKeyName: "rb_minifig_parts_part_num_fkey"
            columns: ["part_num"]
            isOneToOne: false
            referencedRelation: "rb_parts"
            referencedColumns: ["part_num"]
          },
        ]
      }
      rb_minifig_images: {
        Row: {
          fig_num: string
          image_url: string | null
          last_fetched_at: string | null
        }
        Insert: {
          fig_num: string
          image_url?: string | null
          last_fetched_at?: string | null
        }
        Update: {
          fig_num?: string
          image_url?: string | null
          last_fetched_at?: string | null
        }
        Relationships: []
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
      user_list_items: {
        Row: {
          created_at: string
          item_type: Database["public"]["Enums"]["collection_item_type"]
          list_id: string
          minifig_id: string | null
          set_num: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          item_type: Database["public"]["Enums"]["collection_item_type"]
          list_id: string
          minifig_id?: string | null
          set_num?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          item_type?: Database["public"]["Enums"]["collection_item_type"]
          list_id?: string
          minifig_id?: string | null
          set_num?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "user_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_list_items_minifig_id_fkey"
            columns: ["minifig_id"]
            isOneToOne: false
            referencedRelation: "rb_minifigs"
            referencedColumns: ["fig_num"]
          },
          {
            foreignKeyName: "user_list_items_set_num_fkey"
            columns: ["set_num"]
            isOneToOne: false
            referencedRelation: "rb_sets"
            referencedColumns: ["set_num"]
          },
          {
            foreignKeyName: "user_list_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_lists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_lists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
          theme_color: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_filter?: Json | null
          settings?: Json | null
          theme?: string | null
          theme_color?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_filter?: Json | null
          settings?: Json | null
          theme?: string | null
          theme_color?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_minifigs: {
        Row: {
          created_at: string
          fig_num: string
          status: Database["public"]["Enums"]["set_status"]
          updated_at: string
          user_id: string
          quantity: number | null
        }
        Insert: {
          created_at?: string
          fig_num: string
          status?: Database["public"]["Enums"]["set_status"]
          updated_at?: string
          user_id: string
          quantity?: number | null
        }
        Update: {
          created_at?: string
          fig_num?: string
          status?: Database["public"]["Enums"]["set_status"]
          updated_at?: string
          user_id?: string
          quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_minifigs_fig_num_fkey"
            columns: ["fig_num"]
            isOneToOne: false
            referencedRelation: "rb_minifigs"
            referencedColumns: ["fig_num"]
          },
          {
            foreignKeyName: "user_minifigs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          display_name: string | null
          lists_public: boolean
          subscription_expires_at: string | null
          subscription_tier: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          lists_public?: boolean
          subscription_expires_at?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          lists_public?: boolean
          subscription_expires_at?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
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
          quantity: number
        }
        Insert: {
          created_at?: string
          has_box?: boolean
          has_instructions?: boolean
          set_num: string
          status: Database["public"]["Enums"]["set_status"]
          updated_at?: string
          user_id: string
          quantity?: number
        }
        Update: {
          created_at?: string
          has_box?: boolean
          has_instructions?: boolean
          set_num?: string
          status?: Database["public"]["Enums"]["set_status"]
          updated_at?: string
          user_id?: string
          quantity?: number
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
    }
    Views: {
      rb_inventory_parts_public: {
        Row: {
          color_id: number
          element_id: string | null
          img_url: string | null
          inventory_id: number
          is_spare: boolean
          part_num: string
          quantity: number
        }
        Relationships: [
          {
            foreignKeyName: "rb_inventory_parts_public_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "rb_colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rb_inventory_parts_public_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "rb_inventories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rb_inventory_parts_public_part_num_fkey"
            columns: ["part_num"]
            isOneToOne: false
            referencedRelation: "rb_parts"
            referencedColumns: ["part_num"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      collection_item_type: "set" | "minifig"
      set_status: "owned" | "want"
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
      collection_item_type: ["set", "minifig"],
      set_status: ["owned", "want"],
    },
  },
} as const
