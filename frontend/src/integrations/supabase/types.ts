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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      job_attempts: {
        Row: {
          attempt_number: number
          error: string | null
          finished_at: string | null
          id: string
          job_id: string
          next_retry_at: string | null
          started_at: string
          state: Database["public"]["Enums"]["job_state"]
        }
        Insert: {
          attempt_number: number
          error?: string | null
          finished_at?: string | null
          id?: string
          job_id: string
          next_retry_at?: string | null
          started_at?: string
          state: Database["public"]["Enums"]["job_state"]
        }
        Update: {
          attempt_number?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          job_id?: string
          next_retry_at?: string | null
          started_at?: string
          state?: Database["public"]["Enums"]["job_state"]
        }
        Relationships: [
          {
            foreignKeyName: "job_attempts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          logs: string | null
          max_attempts: number
          name: string
          payload: Json
          priority: Database["public"]["Enums"]["priority_level"]
          project_id: string
          queue_id: string
          scheduled_for: string | null
          started_at: string | null
          state: Database["public"]["Enums"]["job_state"]
          type: Database["public"]["Enums"]["job_type"]
          worker_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          logs?: string | null
          max_attempts?: number
          name: string
          payload?: Json
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id: string
          queue_id: string
          scheduled_for?: string | null
          started_at?: string | null
          state?: Database["public"]["Enums"]["job_state"]
          type?: Database["public"]["Enums"]["job_type"]
          worker_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          logs?: string | null
          max_attempts?: number
          name?: string
          payload?: Json
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id?: string
          queue_id?: string
          scheduled_for?: string | null
          started_at?: string | null
          state?: Database["public"]["Enums"]["job_state"]
          type?: Database["public"]["Enums"]["job_type"]
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      queues: {
        Row: {
          concurrency: number
          created_at: string
          id: string
          name: string
          paused: boolean
          priority: Database["public"]["Enums"]["priority_level"]
          project_id: string
          retry_policy: Database["public"]["Enums"]["retry_policy"]
        }
        Insert: {
          concurrency?: number
          created_at?: string
          id?: string
          name: string
          paused?: boolean
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id: string
          retry_policy?: Database["public"]["Enums"]["retry_policy"]
        }
        Update: {
          concurrency?: number
          created_at?: string
          id?: string
          name?: string
          paused?: boolean
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id?: string
          retry_policy?: Database["public"]["Enums"]["retry_policy"]
        }
        Relationships: [
          {
            foreignKeyName: "queues_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          created_at: string
          current_jobs: number
          id: string
          last_heartbeat_at: string
          max_concurrency: number
          name: string
          project_id: string
          status: Database["public"]["Enums"]["worker_status"]
        }
        Insert: {
          created_at?: string
          current_jobs?: number
          id?: string
          last_heartbeat_at?: string
          max_concurrency?: number
          name: string
          project_id: string
          status?: Database["public"]["Enums"]["worker_status"]
        }
        Update: {
          created_at?: string
          current_jobs?: number
          id?: string
          last_heartbeat_at?: string
          max_concurrency?: number
          name?: string
          project_id?: string
          status?: Database["public"]["Enums"]["worker_status"]
        }
        Relationships: [
          {
            foreignKeyName: "workers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      seed_demo_project: { Args: { p_name?: string }; Returns: string }
    }
    Enums: {
      job_state:
        | "queued"
        | "scheduled"
        | "claimed"
        | "running"
        | "completed"
        | "failed"
        | "cancelled"
        | "dead"
      job_type: "immediate" | "scheduled" | "cron" | "batch"
      priority_level: "low" | "medium" | "high"
      retry_policy: "fixed" | "linear" | "exponential"
      worker_status: "active" | "idle" | "dead"
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
      job_state: [
        "queued",
        "scheduled",
        "claimed",
        "running",
        "completed",
        "failed",
        "cancelled",
        "dead",
      ],
      job_type: ["immediate", "scheduled", "cron", "batch"],
      priority_level: ["low", "medium", "high"],
      retry_policy: ["fixed", "linear", "exponential"],
      worker_status: ["active", "idle", "dead"],
    },
  },
} as const
