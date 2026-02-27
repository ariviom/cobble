export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '13.0.5';
  };
  public: {
    Tables: {
      billing_customers: {
        Row: {
          created_at: string | null;
          email: string | null;
          stripe_customer_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          email?: string | null;
          stripe_customer_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          email?: string | null;
          stripe_customer_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      billing_subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null;
          created_at: string | null;
          current_period_end: string | null;
          id: string;
          metadata: Json | null;
          quantity: number | null;
          status: string | null;
          stripe_price_id: string;
          stripe_product_id: string;
          stripe_subscription_id: string;
          tier: string | null;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          cancel_at_period_end?: boolean | null;
          created_at?: string | null;
          current_period_end?: string | null;
          id?: string;
          metadata?: Json | null;
          quantity?: number | null;
          status?: string | null;
          stripe_price_id: string;
          stripe_product_id: string;
          stripe_subscription_id: string;
          tier?: string | null;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          cancel_at_period_end?: boolean | null;
          created_at?: string | null;
          current_period_end?: string | null;
          id?: string;
          metadata?: Json | null;
          quantity?: number | null;
          status?: string | null;
          stripe_price_id?: string;
          stripe_product_id?: string;
          stripe_subscription_id?: string;
          tier?: string | null;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      billing_webhook_events: {
        Row: {
          error: string | null;
          event_id: string;
          payload: Json | null;
          processed_at: string | null;
          status: string | null;
          type: string | null;
        };
        Insert: {
          error?: string | null;
          event_id: string;
          payload?: Json | null;
          processed_at?: string | null;
          status?: string | null;
          type?: string | null;
        };
        Update: {
          error?: string | null;
          event_id?: string;
          payload?: Json | null;
          processed_at?: string | null;
          status?: string | null;
          type?: string | null;
        };
        Relationships: [];
      };
      bl_minifig_parts: {
        Row: {
          bl_color_id: number;
          bl_minifig_no: string;
          bl_part_id: string;
          color_name: string | null;
          last_refreshed_at: string | null;
          name: string | null;
          quantity: number;
          rb_color_id: number | null;
        };
        Insert: {
          bl_color_id: number;
          bl_minifig_no: string;
          bl_part_id: string;
          color_name?: string | null;
          last_refreshed_at?: string | null;
          name?: string | null;
          quantity?: number;
          rb_color_id?: number | null;
        };
        Update: {
          bl_color_id?: number;
          bl_minifig_no?: string;
          bl_part_id?: string;
          color_name?: string | null;
          last_refreshed_at?: string | null;
          name?: string | null;
          quantity?: number;
          rb_color_id?: number | null;
        };
        Relationships: [];
      };
      bl_part_sets: {
        Row: {
          bl_part_id: string;
          last_fetched_at: string;
          quantity: number | null;
          set_num: string;
          source: string;
        };
        Insert: {
          bl_part_id: string;
          last_fetched_at?: string;
          quantity?: number | null;
          set_num: string;
          source: string;
        };
        Update: {
          bl_part_id?: string;
          last_fetched_at?: string;
          quantity?: number | null;
          set_num?: string;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bl_part_sets_bl_part_id_fkey';
            columns: ['bl_part_id'];
            isOneToOne: false;
            referencedRelation: 'bl_parts';
            referencedColumns: ['bl_part_id'];
          },
        ];
      };
      bl_parts: {
        Row: {
          bl_part_id: string;
          image_url: string | null;
          last_fetched_at: string;
          name: string | null;
        };
        Insert: {
          bl_part_id: string;
          image_url?: string | null;
          last_fetched_at?: string;
          name?: string | null;
        };
        Update: {
          bl_part_id?: string;
          image_url?: string | null;
          last_fetched_at?: string;
          name?: string | null;
        };
        Relationships: [];
      };
      bl_price_cache: {
        Row: {
          avg_price: number | null;
          color_id: number;
          condition: string;
          country_code: string;
          currency_code: string;
          fetched_at: string;
          hit_count: number;
          item_id: string;
          item_type: string;
          max_price: number | null;
          min_price: number | null;
          qty_avg_price: number | null;
          total_quantity: number | null;
          unit_quantity: number | null;
        };
        Insert: {
          avg_price?: number | null;
          color_id?: number;
          condition: string;
          country_code?: string;
          currency_code: string;
          fetched_at?: string;
          hit_count?: number;
          item_id: string;
          item_type: string;
          max_price?: number | null;
          min_price?: number | null;
          qty_avg_price?: number | null;
          total_quantity?: number | null;
          unit_quantity?: number | null;
        };
        Update: {
          avg_price?: number | null;
          color_id?: number;
          condition?: string;
          country_code?: string;
          currency_code?: string;
          fetched_at?: string;
          hit_count?: number;
          item_id?: string;
          item_type?: string;
          max_price?: number | null;
          min_price?: number | null;
          qty_avg_price?: number | null;
          total_quantity?: number | null;
          unit_quantity?: number | null;
        };
        Relationships: [];
      };
      bl_price_observations: {
        Row: {
          avg_price: number | null;
          color_id: number;
          condition: string;
          country_code: string;
          currency_code: string;
          id: number;
          item_id: string;
          item_type: string;
          max_price: number | null;
          min_price: number | null;
          observed_at: string;
          qty_avg_price: number | null;
          source: string;
          total_quantity: number | null;
          unit_quantity: number | null;
        };
        Insert: {
          avg_price?: number | null;
          color_id?: number;
          condition: string;
          country_code?: string;
          currency_code: string;
          id?: never;
          item_id: string;
          item_type: string;
          max_price?: number | null;
          min_price?: number | null;
          observed_at?: string;
          qty_avg_price?: number | null;
          source?: string;
          total_quantity?: number | null;
          unit_quantity?: number | null;
        };
        Update: {
          avg_price?: number | null;
          color_id?: number;
          condition?: string;
          country_code?: string;
          currency_code?: string;
          id?: never;
          item_id?: string;
          item_type?: string;
          max_price?: number | null;
          min_price?: number | null;
          observed_at?: string;
          qty_avg_price?: number | null;
          source?: string;
          total_quantity?: number | null;
          unit_quantity?: number | null;
        };
        Relationships: [];
      };
      bl_set_minifigs: {
        Row: {
          bl_name: string | null;
          minifig_no: string;
          quantity: number;
          set_num: string;
        };
        Insert: {
          bl_name?: string | null;
          minifig_no: string;
          quantity?: number;
          set_num: string;
        };
        Update: {
          bl_name?: string | null;
          minifig_no?: string;
          quantity?: number;
          set_num?: string;
        };
        Relationships: [];
      };
      bp_derived_prices: {
        Row: {
          color_id: number;
          computed_at: string;
          condition: string;
          country_code: string;
          currency_code: string;
          derived_avg: number;
          derived_max: number | null;
          derived_min: number | null;
          first_observed_at: string;
          item_id: string;
          item_type: string;
          last_observed_at: string;
          observation_count: number;
        };
        Insert: {
          color_id?: number;
          computed_at?: string;
          condition: string;
          country_code?: string;
          currency_code: string;
          derived_avg: number;
          derived_max?: number | null;
          derived_min?: number | null;
          first_observed_at: string;
          item_id: string;
          item_type: string;
          last_observed_at: string;
          observation_count: number;
        };
        Update: {
          color_id?: number;
          computed_at?: string;
          condition?: string;
          country_code?: string;
          currency_code?: string;
          derived_avg?: number;
          derived_max?: number | null;
          derived_min?: number | null;
          first_observed_at?: string;
          item_id?: string;
          item_type?: string;
          last_observed_at?: string;
          observation_count?: number;
        };
        Relationships: [];
      };
      feature_flags: {
        Row: {
          description: string | null;
          is_enabled: boolean | null;
          key: string;
          min_tier: string | null;
          rollout_pct: number | null;
        };
        Insert: {
          description?: string | null;
          is_enabled?: boolean | null;
          key: string;
          min_tier?: string | null;
          rollout_pct?: number | null;
        };
        Update: {
          description?: string | null;
          is_enabled?: boolean | null;
          key?: string;
          min_tier?: string | null;
          rollout_pct?: number | null;
        };
        Relationships: [];
      };
      feature_overrides: {
        Row: {
          created_at: string | null;
          feature_key: string | null;
          force: boolean;
          id: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          feature_key?: string | null;
          force: boolean;
          id?: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          feature_key?: string | null;
          force?: boolean;
          id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'feature_overrides_feature_key_fkey';
            columns: ['feature_key'];
            isOneToOne: false;
            referencedRelation: 'feature_flags';
            referencedColumns: ['key'];
          },
        ];
      };
      group_session_participants: {
        Row: {
          client_token: string;
          color_slot: number | null;
          display_name: string;
          id: string;
          joined_at: string;
          last_seen_at: string;
          left_at: string | null;
          pieces_found: number;
          session_id: string;
          user_id: string | null;
        };
        Insert: {
          client_token: string;
          color_slot?: number | null;
          display_name: string;
          id?: string;
          joined_at?: string;
          last_seen_at?: string;
          left_at?: string | null;
          pieces_found?: number;
          session_id: string;
          user_id?: string | null;
        };
        Update: {
          client_token?: string;
          color_slot?: number | null;
          display_name?: string;
          id?: string;
          joined_at?: string;
          last_seen_at?: string;
          left_at?: string | null;
          pieces_found?: number;
          session_id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'group_session_participants_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'group_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      group_sessions: {
        Row: {
          created_at: string;
          ended_at: string | null;
          host_user_id: string;
          id: string;
          is_active: boolean;
          set_num: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          ended_at?: string | null;
          host_user_id: string;
          id?: string;
          is_active?: boolean;
          set_num: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          ended_at?: string | null;
          host_user_id?: string;
          id?: string;
          is_active?: boolean;
          set_num?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_sessions_set_num_fkey';
            columns: ['set_num'];
            isOneToOne: false;
            referencedRelation: 'rb_sets';
            referencedColumns: ['set_num'];
          },
        ];
      };
      rate_limits: {
        Row: {
          count: number;
          key: string;
          updated_at: string;
          window_ms: number;
          window_start: string;
        };
        Insert: {
          count?: number;
          key: string;
          updated_at?: string;
          window_ms?: number;
          window_start?: string;
        };
        Update: {
          count?: number;
          key?: string;
          updated_at?: string;
          window_ms?: number;
          window_start?: string;
        };
        Relationships: [];
      };
      rb_colors: {
        Row: {
          external_ids: Json | null;
          id: number;
          is_trans: boolean;
          last_updated_at: string;
          name: string;
          rgb: string | null;
        };
        Insert: {
          external_ids?: Json | null;
          id: number;
          is_trans?: boolean;
          last_updated_at?: string;
          name: string;
          rgb?: string | null;
        };
        Update: {
          external_ids?: Json | null;
          id?: number;
          is_trans?: boolean;
          last_updated_at?: string;
          name?: string;
          rgb?: string | null;
        };
        Relationships: [];
      };
      rb_download_versions: {
        Row: {
          last_ingested_at: string;
          source: string;
          version: string;
        };
        Insert: {
          last_ingested_at?: string;
          source: string;
          version: string;
        };
        Update: {
          last_ingested_at?: string;
          source?: string;
          version?: string;
        };
        Relationships: [];
      };
      rb_inventories: {
        Row: {
          id: number;
          set_num: string | null;
          version: number | null;
        };
        Insert: {
          id: number;
          set_num?: string | null;
          version?: number | null;
        };
        Update: {
          id?: number;
          set_num?: string | null;
          version?: number | null;
        };
        Relationships: [];
      };
      rb_inventory_minifigs: {
        Row: {
          fig_num: string;
          inventory_id: number;
          quantity: number;
        };
        Insert: {
          fig_num: string;
          inventory_id: number;
          quantity: number;
        };
        Update: {
          fig_num?: string;
          inventory_id?: number;
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'rb_inventory_minifigs_fig_num_fkey';
            columns: ['fig_num'];
            isOneToOne: false;
            referencedRelation: 'rb_minifigs';
            referencedColumns: ['fig_num'];
          },
          {
            foreignKeyName: 'rb_inventory_minifigs_inventory_id_fkey';
            columns: ['inventory_id'];
            isOneToOne: false;
            referencedRelation: 'rb_inventories';
            referencedColumns: ['id'];
          },
        ];
      };
      rb_inventory_parts: {
        Row: {
          color_id: number;
          element_id: string;
          img_url: string | null;
          inventory_id: number;
          is_spare: boolean;
          part_num: string;
          quantity: number;
        };
        Insert: {
          color_id: number;
          element_id: string;
          img_url?: string | null;
          inventory_id: number;
          is_spare?: boolean;
          part_num: string;
          quantity: number;
        };
        Update: {
          color_id?: number;
          element_id?: string;
          img_url?: string | null;
          inventory_id?: number;
          is_spare?: boolean;
          part_num?: string;
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'rb_inventory_parts_color_id_fkey';
            columns: ['color_id'];
            isOneToOne: false;
            referencedRelation: 'rb_colors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rb_inventory_parts_inventory_id_fkey';
            columns: ['inventory_id'];
            isOneToOne: false;
            referencedRelation: 'rb_inventories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rb_inventory_parts_part_num_fkey';
            columns: ['part_num'];
            isOneToOne: false;
            referencedRelation: 'rb_parts';
            referencedColumns: ['part_num'];
          },
        ];
      };
      rb_minifig_images: {
        Row: {
          fig_num: string;
          image_url: string;
          last_fetched_at: string;
        };
        Insert: {
          fig_num: string;
          image_url: string;
          last_fetched_at?: string;
        };
        Update: {
          fig_num?: string;
          image_url?: string;
          last_fetched_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rb_minifig_images_fig_num_fkey';
            columns: ['fig_num'];
            isOneToOne: true;
            referencedRelation: 'rb_minifigs';
            referencedColumns: ['fig_num'];
          },
        ];
      };
      rb_minifig_parts: {
        Row: {
          color_id: number;
          fig_num: string;
          img_url: string | null;
          part_num: string;
          quantity: number;
        };
        Insert: {
          color_id: number;
          fig_num: string;
          img_url?: string | null;
          part_num: string;
          quantity: number;
        };
        Update: {
          color_id?: number;
          fig_num?: string;
          img_url?: string | null;
          part_num?: string;
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'rb_minifig_parts_color_id_fkey';
            columns: ['color_id'];
            isOneToOne: false;
            referencedRelation: 'rb_colors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rb_minifig_parts_fig_num_fkey';
            columns: ['fig_num'];
            isOneToOne: false;
            referencedRelation: 'rb_minifigs';
            referencedColumns: ['fig_num'];
          },
          {
            foreignKeyName: 'rb_minifig_parts_part_num_fkey';
            columns: ['part_num'];
            isOneToOne: false;
            referencedRelation: 'rb_parts';
            referencedColumns: ['part_num'];
          },
        ];
      };
      rb_minifig_rarity: {
        Row: {
          fig_num: string;
          min_subpart_set_count: number;
          set_count: number;
        };
        Insert: {
          fig_num: string;
          min_subpart_set_count?: number;
          set_count?: number;
        };
        Update: {
          fig_num?: string;
          min_subpart_set_count?: number;
          set_count?: number;
        };
        Relationships: [];
      };
      rb_minifigs: {
        Row: {
          bl_mapping_confidence: number | null;
          bl_mapping_source: string | null;
          bl_minifig_id: string | null;
          fig_num: string;
          matched_at: string | null;
          name: string;
          num_parts: number | null;
        };
        Insert: {
          bl_mapping_confidence?: number | null;
          bl_mapping_source?: string | null;
          bl_minifig_id?: string | null;
          fig_num: string;
          matched_at?: string | null;
          name: string;
          num_parts?: number | null;
        };
        Update: {
          bl_mapping_confidence?: number | null;
          bl_mapping_source?: string | null;
          bl_minifig_id?: string | null;
          fig_num?: string;
          matched_at?: string | null;
          name?: string;
          num_parts?: number | null;
        };
        Relationships: [];
      };
      rb_part_categories: {
        Row: {
          id: number;
          name: string;
        };
        Insert: {
          id: number;
          name: string;
        };
        Update: {
          id?: number;
          name?: string;
        };
        Relationships: [];
      };
      rb_part_rarity: {
        Row: {
          color_id: number;
          part_num: string;
          set_count: number;
        };
        Insert: {
          color_id: number;
          part_num: string;
          set_count?: number;
        };
        Update: {
          color_id?: number;
          part_num?: string;
          set_count?: number;
        };
        Relationships: [];
      };
      rb_parts: {
        Row: {
          bl_part_id: string | null;
          external_ids: Json | null;
          image_url: string | null;
          last_updated_at: string;
          name: string;
          part_cat_id: number | null;
          part_num: string;
        };
        Insert: {
          bl_part_id?: string | null;
          external_ids?: Json | null;
          image_url?: string | null;
          last_updated_at?: string;
          name: string;
          part_cat_id?: number | null;
          part_num: string;
        };
        Update: {
          bl_part_id?: string | null;
          external_ids?: Json | null;
          image_url?: string | null;
          last_updated_at?: string;
          name?: string;
          part_cat_id?: number | null;
          part_num?: string;
        };
        Relationships: [];
      };
      rb_set_parts: {
        Row: {
          color_id: number;
          is_spare: boolean;
          last_updated_at: string;
          part_num: string;
          quantity: number;
          set_num: string;
        };
        Insert: {
          color_id: number;
          is_spare?: boolean;
          last_updated_at?: string;
          part_num: string;
          quantity: number;
          set_num: string;
        };
        Update: {
          color_id?: number;
          is_spare?: boolean;
          last_updated_at?: string;
          part_num?: string;
          quantity?: number;
          set_num?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rb_set_parts_color_fk';
            columns: ['color_id'];
            isOneToOne: false;
            referencedRelation: 'rb_colors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rb_set_parts_part_fk';
            columns: ['part_num'];
            isOneToOne: false;
            referencedRelation: 'rb_parts';
            referencedColumns: ['part_num'];
          },
          {
            foreignKeyName: 'rb_set_parts_set_fk';
            columns: ['set_num'];
            isOneToOne: false;
            referencedRelation: 'rb_sets';
            referencedColumns: ['set_num'];
          },
        ];
      };
      rb_sets: {
        Row: {
          image_url: string | null;
          last_updated_at: string;
          name: string;
          num_parts: number | null;
          set_num: string;
          theme_id: number | null;
          year: number | null;
        };
        Insert: {
          image_url?: string | null;
          last_updated_at?: string;
          name: string;
          num_parts?: number | null;
          set_num: string;
          theme_id?: number | null;
          year?: number | null;
        };
        Update: {
          image_url?: string | null;
          last_updated_at?: string;
          name?: string;
          num_parts?: number | null;
          set_num?: string;
          theme_id?: number | null;
          year?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rb_sets_theme_id_fkey';
            columns: ['theme_id'];
            isOneToOne: false;
            referencedRelation: 'rb_themes';
            referencedColumns: ['id'];
          },
        ];
      };
      rb_themes: {
        Row: {
          id: number;
          name: string;
          parent_id: number | null;
        };
        Insert: {
          id: number;
          name: string;
          parent_id?: number | null;
        };
        Update: {
          id?: number;
          name?: string;
          parent_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rb_themes_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'rb_themes';
            referencedColumns: ['id'];
          },
        ];
      };
      system_counters: {
        Row: {
          count: number;
          counter_key: string;
          updated_at: string | null;
          window_start: string;
        };
        Insert: {
          count?: number;
          counter_key: string;
          updated_at?: string | null;
          window_start: string;
        };
        Update: {
          count?: number;
          counter_key?: string;
          updated_at?: string | null;
          window_start?: string;
        };
        Relationships: [];
      };
      usage_counters: {
        Row: {
          count: number;
          created_at: string | null;
          feature_key: string;
          updated_at: string | null;
          user_id: string;
          window_kind: string;
          window_start: string;
        };
        Insert: {
          count?: number;
          created_at?: string | null;
          feature_key: string;
          updated_at?: string | null;
          user_id: string;
          window_kind: string;
          window_start: string;
        };
        Update: {
          count?: number;
          created_at?: string | null;
          feature_key?: string;
          updated_at?: string | null;
          user_id?: string;
          window_kind?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      user_feedback: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          message: string;
          name: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          message: string;
          name: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          message?: string;
          name?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_list_items: {
        Row: {
          created_at: string;
          id: string;
          item_type: Database['public']['Enums']['collection_item_type'];
          list_id: string;
          minifig_id: string | null;
          set_num: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          item_type: Database['public']['Enums']['collection_item_type'];
          list_id: string;
          minifig_id?: string | null;
          set_num?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          item_type?: Database['public']['Enums']['collection_item_type'];
          list_id?: string;
          minifig_id?: string | null;
          set_num?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_list_items_list_id_fkey';
            columns: ['list_id'];
            isOneToOne: false;
            referencedRelation: 'public_user_lists_view';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_list_items_list_id_fkey';
            columns: ['list_id'];
            isOneToOne: false;
            referencedRelation: 'user_lists';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_list_items_set_num_fkey';
            columns: ['set_num'];
            isOneToOne: false;
            referencedRelation: 'rb_sets';
            referencedColumns: ['set_num'];
          },
        ];
      };
      user_lists: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_system: boolean;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_system?: boolean;
          name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_system?: boolean;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_minifigs: {
        Row: {
          created_at: string;
          fig_num: string;
          quantity: number;
          status: Database['public']['Enums']['set_status'];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          fig_num: string;
          quantity?: number;
          status?: Database['public']['Enums']['set_status'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          fig_num?: string;
          quantity?: number;
          status?: Database['public']['Enums']['set_status'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_preferences: {
        Row: {
          created_at: string;
          default_filter: Json | null;
          settings: Json | null;
          theme: string | null;
          theme_color: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          default_filter?: Json | null;
          settings?: Json | null;
          theme?: string | null;
          theme_color?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          default_filter?: Json | null;
          settings?: Json | null;
          theme?: string | null;
          theme_color?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          lists_public: boolean;
          subscription_expires_at: string | null;
          subscription_tier: string | null;
          updated_at: string;
          user_id: string;
          username: string | null;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          lists_public?: boolean;
          subscription_expires_at?: string | null;
          subscription_tier?: string | null;
          updated_at?: string;
          user_id: string;
          username?: string | null;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          lists_public?: boolean;
          subscription_expires_at?: string | null;
          subscription_tier?: string | null;
          updated_at?: string;
          user_id?: string;
          username?: string | null;
        };
        Relationships: [];
      };
      user_recent_sets: {
        Row: {
          last_viewed_at: string;
          set_num: string;
          user_id: string;
        };
        Insert: {
          last_viewed_at?: string;
          set_num: string;
          user_id: string;
        };
        Update: {
          last_viewed_at?: string;
          set_num?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_set_parts: {
        Row: {
          color_id: number;
          is_spare: boolean;
          owned_quantity: number;
          part_num: string;
          set_num: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          color_id: number;
          is_spare?: boolean;
          owned_quantity?: number;
          part_num: string;
          set_num: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          color_id?: number;
          is_spare?: boolean;
          owned_quantity?: number;
          part_num?: string;
          set_num?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_set_parts_set_num_fkey';
            columns: ['set_num'];
            isOneToOne: false;
            referencedRelation: 'rb_sets';
            referencedColumns: ['set_num'];
          },
        ];
      };
      user_sets: {
        Row: {
          created_at: string;
          found_count: number;
          has_box: boolean;
          has_instructions: boolean;
          owned: boolean;
          quantity: number;
          set_num: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          found_count?: number;
          has_box?: boolean;
          has_instructions?: boolean;
          owned?: boolean;
          quantity?: number;
          set_num: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          found_count?: number;
          has_box?: boolean;
          has_instructions?: boolean;
          owned?: boolean;
          quantity?: number;
          set_num?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_sets_set_num_fkey';
            columns: ['set_num'];
            isOneToOne: false;
            referencedRelation: 'rb_sets';
            referencedColumns: ['set_num'];
          },
        ];
      };
    };
    Views: {
      public_user_list_items_view: {
        Row: {
          item_type: Database['public']['Enums']['collection_item_type'] | null;
          list_id: string | null;
          minifig_id: string | null;
          set_num: string | null;
          user_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'user_list_items_list_id_fkey';
            columns: ['list_id'];
            isOneToOne: false;
            referencedRelation: 'public_user_lists_view';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_list_items_list_id_fkey';
            columns: ['list_id'];
            isOneToOne: false;
            referencedRelation: 'user_lists';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_list_items_set_num_fkey';
            columns: ['set_num'];
            isOneToOne: false;
            referencedRelation: 'rb_sets';
            referencedColumns: ['set_num'];
          },
        ];
      };
      public_user_lists_view: {
        Row: {
          id: string | null;
          is_system: boolean | null;
          name: string | null;
          user_id: string | null;
        };
        Relationships: [];
      };
      public_user_minifigs_view: {
        Row: {
          fig_num: string | null;
          status: Database['public']['Enums']['set_status'] | null;
          user_id: string | null;
        };
        Relationships: [];
      };
      public_user_profiles_view: {
        Row: {
          display_name: string | null;
          lists_public: boolean | null;
          user_id: string | null;
          username: string | null;
        };
        Insert: {
          display_name?: string | null;
          lists_public?: boolean | null;
          user_id?: string | null;
          username?: string | null;
        };
        Update: {
          display_name?: string | null;
          lists_public?: boolean | null;
          user_id?: string | null;
          username?: string | null;
        };
        Relationships: [];
      };
      public_user_sets_view: {
        Row: {
          owned: boolean | null;
          set_num: string | null;
          user_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'user_sets_set_num_fkey';
            columns: ['set_num'];
            isOneToOne: false;
            referencedRelation: 'rb_sets';
            referencedColumns: ['set_num'];
          },
        ];
      };
      rb_inventory_parts_public: {
        Row: {
          color_id: number | null;
          element_id: string | null;
          img_url: string | null;
          inventory_id: number | null;
          is_spare: boolean | null;
          part_num: string | null;
          quantity: number | null;
        };
        Insert: {
          color_id?: number | null;
          element_id?: string | null;
          img_url?: string | null;
          inventory_id?: number | null;
          is_spare?: boolean | null;
          part_num?: string | null;
          quantity?: number | null;
        };
        Update: {
          color_id?: number | null;
          element_id?: string | null;
          img_url?: string | null;
          inventory_id?: number | null;
          is_spare?: boolean | null;
          part_num?: string | null;
          quantity?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rb_inventory_parts_color_id_fkey';
            columns: ['color_id'];
            isOneToOne: false;
            referencedRelation: 'rb_colors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rb_inventory_parts_inventory_id_fkey';
            columns: ['inventory_id'];
            isOneToOne: false;
            referencedRelation: 'rb_inventories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rb_inventory_parts_part_num_fkey';
            columns: ['part_num'];
            isOneToOne: false;
            referencedRelation: 'rb_parts';
            referencedColumns: ['part_num'];
          },
        ];
      };
    };
    Functions: {
      check_participant_limit: {
        Args: { session_uuid: string };
        Returns: boolean;
      };
      cleanup_stale_participants: {
        Args: { session_uuid: string };
        Returns: number;
      };
      consume_rate_limit: {
        Args: { p_key: string; p_max_hits?: number; p_window_ms?: number };
        Returns: {
          allowed: boolean;
          retry_after_seconds: number;
        }[];
      };
      get_sets_with_minifigs: {
        Args: never;
        Returns: {
          set_num: string;
        }[];
      };
      get_system_counter: {
        Args: { p_key: string; p_window_start: string };
        Returns: number;
      };
      increment_system_counter: {
        Args: { p_key: string; p_limit: number; p_window_start: string };
        Returns: {
          allowed: boolean;
          new_count: number;
        }[];
      };
      increment_usage_counter: {
        Args: {
          p_feature_key: string;
          p_limit: number;
          p_user_id: string;
          p_window_kind: string;
          p_window_start: string;
        };
        Returns: {
          allowed: boolean;
          new_count: number;
        }[];
      };
      update_found_count: {
        Args: { p_set_num: string; p_user_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      collection_item_type: 'set' | 'minifig';
      set_status: 'owned' | 'want';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      collection_item_type: ['set', 'minifig'],
      set_status: ['owned', 'want'],
    },
  },
} as const;
