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
      addresses: {
        Row: {
          city_name: string
          country_code: string
          created_at: string
          customer_id: string
          dane_code: string
          deleted_at: string | null
          department: string
          id: string
          is_default: boolean
          label: string
          latitude: number | null
          line1: string
          line2: string | null
          longitude: number | null
          neighborhood: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          city_name: string
          country_code?: string
          created_at?: string
          customer_id: string
          dane_code: string
          deleted_at?: string | null
          department: string
          id?: string
          is_default?: boolean
          label?: string
          latitude?: number | null
          line1: string
          line2?: string | null
          longitude?: number | null
          neighborhood?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          city_name?: string
          country_code?: string
          created_at?: string
          customer_id?: string
          dane_code?: string
          deleted_at?: string | null
          department?: string
          id?: string
          is_default?: boolean
          label?: string
          latitude?: number | null
          line1?: string
          line2?: string | null
          longitude?: number | null
          neighborhood?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_diagnostics: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          disclaimer: string
          id: string
          input: Json
          is_preliminary: boolean
          model: string
          model_version: string | null
          output: Json
          prompt_version: string
          service_request_id: string | null
          ticket_id: string | null
          urgency: string | null
          validated_at: string | null
          validated_by: string | null
          validation_status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          disclaimer: string
          id?: string
          input: Json
          is_preliminary?: boolean
          model: string
          model_version?: string | null
          output: Json
          prompt_version: string
          service_request_id?: string | null
          ticket_id?: string | null
          urgency?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validation_status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          disclaimer?: string
          id?: string
          input?: Json
          is_preliminary?: boolean
          model?: string
          model_version?: string | null
          output?: Json
          prompt_version?: string
          service_request_id?: string | null
          ticket_id?: string | null
          urgency?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_diagnostics_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_diagnostics_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_diagnostics_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          description: string | null
          is_public: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          is_public?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          is_public?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          at: string
          entity_id: string | null
          entity_type: string
          id: number
          ip: unknown
          metadata: Json
          prev_hash: string | null
          row_hash: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          ip?: unknown
          metadata?: Json
          prev_hash?: string | null
          row_hash: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          ip?: unknown
          metadata?: Json
          prev_hash?: string | null
          row_hash?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          crm_task_id: string | null
          customer_id: string | null
          duration_minutes: number
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          starts_at: string
          ticket_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          crm_task_id?: string | null
          customer_id?: string | null
          duration_minutes?: number
          event_type: Database["public"]["Enums"]["event_type"]
          id?: string
          starts_at: string
          ticket_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          crm_task_id?: string | null
          customer_id?: string | null
          duration_minutes?: number
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          starts_at?: string
          ticket_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_crm_task_id_fkey"
            columns: ["crm_task_id"]
            isOneToOne: false
            referencedRelation: "crm_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_pricing_rules: {
        Row: {
          id: string
          position: number
          recommendation: string
          rule: string
        }
        Insert: {
          id?: string
          position: number
          recommendation: string
          rule: string
        }
        Update: {
          id?: string
          position?: number
          recommendation?: string
          rule?: string
        }
        Relationships: []
      }
      catalog_sources: {
        Row: {
          id: string
          name: string
          url: string
          usage: string | null
        }
        Insert: {
          id?: string
          name: string
          url: string
          usage?: string | null
        }
        Update: {
          id?: string
          name?: string
          url?: string
          usage?: string | null
        }
        Relationships: []
      }
      checklist_items: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          id: string
          is_required: boolean
          label: string
          note: string | null
          run_id: string
          state: Database["public"]["Enums"]["check_state"]
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          id?: string
          is_required?: boolean
          label: string
          note?: string | null
          run_id: string
          state?: Database["public"]["Enums"]["check_state"]
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          id?: string
          is_required?: boolean
          label?: string
          note?: string | null
          run_id?: string
          state?: Database["public"]["Enums"]["check_state"]
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "checklist_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          started_by: string | null
          ticket_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          started_by?: string | null
          ticket_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          started_by?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_runs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_items: {
        Row: {
          id: string
          is_active: boolean
          is_required: boolean
          label: string
          sort_order: number
        }
        Insert: {
          id?: string
          is_active?: boolean
          is_required?: boolean
          label: string
          sort_order?: number
        }
        Update: {
          id?: string
          is_active?: boolean
          is_required?: boolean
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      coverage_areas: {
        Row: {
          allowed_modalities: Database["public"]["Enums"]["service_modality"][]
          city_name: string
          country_code: string
          created_at: string
          dane_code: string
          department: string
          home_fee: number
          id: string
          is_active: boolean
          notes: string | null
          pickup_fee: number
          updated_at: string
        }
        Insert: {
          allowed_modalities?: Database["public"]["Enums"]["service_modality"][]
          city_name: string
          country_code?: string
          created_at?: string
          dane_code: string
          department: string
          home_fee?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          pickup_fee?: number
          updated_at?: string
        }
        Update: {
          allowed_modalities?: Database["public"]["Enums"]["service_modality"][]
          city_name?: string
          country_code?: string
          created_at?: string
          dane_code?: string
          department?: string
          home_fee?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          pickup_fee?: number
          updated_at?: string
        }
        Relationships: []
      }
      crm_interactions: {
        Row: {
          actor_id: string | null
          channel: Database["public"]["Enums"]["contact_channel"]
          created_at: string
          id: number
          next_action: string | null
          next_action_at: string | null
          note: string | null
          result: Database["public"]["Enums"]["crm_status"]
          task_id: string
        }
        Insert: {
          actor_id?: string | null
          channel: Database["public"]["Enums"]["contact_channel"]
          created_at?: string
          id?: never
          next_action?: string | null
          next_action_at?: string | null
          note?: string | null
          result: Database["public"]["Enums"]["crm_status"]
          task_id: string
        }
        Update: {
          actor_id?: string | null
          channel?: Database["public"]["Enums"]["contact_channel"]
          created_at?: string
          id?: never
          next_action?: string | null
          next_action_at?: string | null
          note?: string | null
          result?: Database["public"]["Enums"]["crm_status"]
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_interactions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "crm_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          due_at: string
          equipment_id: string | null
          id: string
          note: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["crm_status"]
          task_type: Database["public"]["Enums"]["crm_task_type"]
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          due_at: string
          equipment_id?: string | null
          id?: string
          note?: string | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["crm_status"]
          task_type: Database["public"]["Enums"]["crm_task_type"]
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          due_at?: string
          equipment_id?: string | null
          id?: string
          note?: string | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["crm_status"]
          task_type?: Database["public"]["Enums"]["crm_task_type"]
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "digital_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          company_name: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          document_number: string | null
          document_type: string | null
          email: string | null
          full_name: string
          id: string
          phone: string | null
          profile_id: string | null
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          profile_id?: string | null
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          profile_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          created_at: string
          delivered_by: string | null
          id: string
          next_maintenance_at: string | null
          notes: string | null
          received_by_name: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          delivered_by?: string | null
          id?: string
          next_maintenance_at?: string | null
          notes?: string | null
          received_by_name: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          delivered_by?: string | null
          id?: string
          next_maintenance_at?: string | null
          notes?: string | null
          received_by_name?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnosis_credits: {
        Row: {
          amount: number
          applied_at: string | null
          applied_quote_id: string | null
          created_at: string
          customer_id: string
          id: string
          payment_id: string
          status: string
          ticket_id: string
        }
        Insert: {
          amount: number
          applied_at?: string | null
          applied_quote_id?: string | null
          created_at?: string
          customer_id: string
          id?: string
          payment_id: string
          status?: string
          ticket_id: string
        }
        Update: {
          amount?: number
          applied_at?: string | null
          applied_quote_id?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          payment_id?: string
          status?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnosis_credits_applied_quote_id_fkey"
            columns: ["applied_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnosis_credits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnosis_credits_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnosis_credits_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_items: {
        Row: {
          component: string
          diagnostic_id: string
          id: string
          note: string | null
          state: Database["public"]["Enums"]["component_state"]
        }
        Insert: {
          component: string
          diagnostic_id: string
          id?: string
          note?: string | null
          state: Database["public"]["Enums"]["component_state"]
        }
        Update: {
          component?: string
          diagnostic_id?: string
          id?: string
          note?: string | null
          state?: Database["public"]["Enums"]["component_state"]
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_items_diagnostic_id_fkey"
            columns: ["diagnostic_id"]
            isOneToOne: false
            referencedRelation: "diagnostics"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostics: {
        Row: {
          created_at: string
          id: string
          recommendations: string | null
          suggested_parts: string | null
          summary: string
          technician_id: string | null
          tests_performed: string | null
          ticket_id: string
          updated_at: string
          version: number
          visible_to_customer: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          recommendations?: string | null
          suggested_parts?: string | null
          summary: string
          technician_id?: string | null
          tests_performed?: string | null
          ticket_id: string
          updated_at?: string
          version?: number
          visible_to_customer?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          recommendations?: string | null
          suggested_parts?: string | null
          summary?: string
          technician_id?: string | null
          tests_performed?: string | null
          ticket_id?: string
          updated_at?: string
          version?: number
          visible_to_customer?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "diagnostics_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_projects: {
        Row: {
          client_notes: string | null
          code: string
          created_at: string
          customer_id: string
          deleted_at: string | null
          due_on: string | null
          id: string
          owner_id: string | null
          progress: number
          scope: string | null
          service_id: string | null
          starts_on: string | null
          status: Database["public"]["Enums"]["project_status"]
          title: string
          updated_at: string
        }
        Insert: {
          client_notes?: string | null
          code?: string
          created_at?: string
          customer_id: string
          deleted_at?: string | null
          due_on?: string | null
          id?: string
          owner_id?: string | null
          progress?: number
          scope?: string | null
          service_id?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          title: string
          updated_at?: string
        }
        Update: {
          client_notes?: string | null
          code?: string
          created_at?: string
          customer_id?: string
          deleted_at?: string | null
          due_on?: string | null
          id?: string
          owner_id?: string | null
          progress?: number
          scope?: string | null
          service_id?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "digital_projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_projects_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      document_signatures: {
        Row: {
          consent_text: string
          document_id: string
          document_sha256: string
          id: string
          ip: unknown
          signature_ref: string
          signed_at: string
          signer_name: string
          signer_profile_id: string
          user_agent: string | null
        }
        Insert: {
          consent_text: string
          document_id: string
          document_sha256: string
          id?: string
          ip?: unknown
          signature_ref: string
          signed_at?: string
          signer_name: string
          signer_profile_id: string
          user_agent?: string | null
        }
        Update: {
          consent_text?: string
          document_id?: string
          document_sha256?: string
          id?: string
          ip?: unknown
          signature_ref?: string
          signed_at?: string
          signer_name?: string
          signer_profile_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_signatures_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signatures_signer_profile_id_fkey"
            columns: ["signer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          code: string
          created_at: string
          customer_id: string
          doc_type: Database["public"]["Enums"]["document_type"]
          equipment_id: string | null
          generated_at: string
          generated_by: string | null
          id: string
          order_id: string | null
          project_id: string | null
          quote_id: string | null
          rejected_at: string | null
          sent_at: string | null
          sha256: string
          signed_at: string | null
          status: Database["public"]["Enums"]["document_status"]
          storage_path: string
          supersedes_id: string | null
          ticket_id: string | null
          title: string
          version: number
          viewed_at: string | null
          warranty_id: string | null
        }
        Insert: {
          code?: string
          created_at?: string
          customer_id: string
          doc_type: Database["public"]["Enums"]["document_type"]
          equipment_id?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          order_id?: string | null
          project_id?: string | null
          quote_id?: string | null
          rejected_at?: string | null
          sent_at?: string | null
          sha256: string
          signed_at?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          storage_path: string
          supersedes_id?: string | null
          ticket_id?: string | null
          title: string
          version?: number
          viewed_at?: string | null
          warranty_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          customer_id?: string
          doc_type?: Database["public"]["Enums"]["document_type"]
          equipment_id?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          order_id?: string | null
          project_id?: string | null
          quote_id?: string | null
          rejected_at?: string | null
          sent_at?: string | null
          sha256?: string
          signed_at?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          storage_path?: string
          supersedes_id?: string | null
          ticket_id?: string | null
          title?: string
          version?: number
          viewed_at?: string | null
          warranty_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "digital_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_warranty_id_fkey"
            columns: ["warranty_id"]
            isOneToOne: false
            referencedRelation: "warranties"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          brand: string
          created_at: string
          customer_id: string
          deleted_at: string | null
          id: string
          model: string
          next_maintenance_at: string | null
          notes: string | null
          ram: string | null
          serial: string | null
          storage: string | null
          type: string
          updated_at: string
          year: number | null
        }
        Insert: {
          brand: string
          created_at?: string
          customer_id: string
          deleted_at?: string | null
          id?: string
          model: string
          next_maintenance_at?: string | null
          notes?: string | null
          ram?: string | null
          serial?: string | null
          storage?: string | null
          type: string
          updated_at?: string
          year?: number | null
        }
        Update: {
          brand?: string
          created_at?: string
          customer_id?: string
          deleted_at?: string | null
          id?: string
          model?: string
          next_maintenance_at?: string | null
          notes?: string | null
          ram?: string | null
          serial?: string | null
          storage?: string | null
          type?: string
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_history: {
        Row: {
          actor_id: string | null
          created_at: string
          equipment_id: string
          event_type: string
          id: number
          note: string | null
          ticket_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          equipment_id: string
          event_type: string
          id?: never
          note?: string | null
          ticket_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          equipment_id?: string
          event_type?: string
          id?: never
          note?: string | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_history_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_history_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence: {
        Row: {
          bytes: number | null
          cloudinary_public_id: string
          created_at: string
          deleted_at: string | null
          format: string | null
          id: string
          media_kind: string
          sha256: string | null
          slot: string | null
          stage: Database["public"]["Enums"]["evidence_stage"]
          ticket_id: string
          uploaded_by: string | null
        }
        Insert: {
          bytes?: number | null
          cloudinary_public_id: string
          created_at?: string
          deleted_at?: string | null
          format?: string | null
          id?: string
          media_kind?: string
          sha256?: string | null
          slot?: string | null
          stage: Database["public"]["Enums"]["evidence_stage"]
          ticket_id: string
          uploaded_by?: string | null
        }
        Update: {
          bytes?: number | null
          cloudinary_public_id?: string
          created_at?: string
          deleted_at?: string | null
          format?: string | null
          id?: string
          media_kind?: string
          sha256?: string | null
          slot?: string | null
          stage?: Database["public"]["Enums"]["evidence_stage"]
          ticket_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          product_id: string
          reorder_level: number
          stock_on_hand: number
          updated_at: string
        }
        Insert: {
          product_id: string
          reorder_level?: number
          stock_on_hand?: number
          updated_at?: string
        }
        Update: {
          product_id?: string
          reorder_level?: number
          stock_on_hand?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          actor_id: string | null
          created_at: string
          delta: number
          id: number
          note: string | null
          product_id: string
          reason: string
          reference_id: string | null
          reference_type: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          delta: number
          id?: never
          note?: string | null
          product_id: string
          reason: string
          reference_id?: string | null
          reference_type?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          delta?: number
          id?: never
          note?: string | null
          product_id?: string
          reason?: string
          reference_id?: string | null
          reference_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_acceptances: {
        Row: {
          accepted_at: string
          id: number
          ip: unknown
          legal_document_id: string
          profile_id: string
          user_agent: string | null
        }
        Insert: {
          accepted_at?: string
          id?: never
          ip?: unknown
          legal_document_id: string
          profile_id: string
          user_agent?: string | null
        }
        Update: {
          accepted_at?: string
          id?: never
          ip?: unknown
          legal_document_id?: string
          profile_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_acceptances_legal_document_id_fkey"
            columns: ["legal_document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_acceptances_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_documents: {
        Row: {
          content: string
          content_sha256: string
          created_at: string
          created_by: string | null
          id: string
          published_at: string | null
          requires_acceptance: boolean
          slug: string
          status: Database["public"]["Enums"]["legal_status"]
          title: string
          version: number
        }
        Insert: {
          content: string
          content_sha256: string
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          requires_acceptance?: boolean
          slug: string
          status?: Database["public"]["Enums"]["legal_status"]
          title: string
          version: number
        }
        Update: {
          content?: string
          content_sha256?: string
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          requires_acceptance?: boolean
          slug?: string
          status?: Database["public"]["Enums"]["legal_status"]
          title?: string
          version?: number
        }
        Relationships: []
      }
      maintenance_plans: {
        Row: {
          created_at: string
          crm_task_id: string | null
          customer_id: string
          due_at: string
          equipment_id: string
          id: string
          interval_months: number
          status: string
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          crm_task_id?: string | null
          customer_id: string
          due_at: string
          equipment_id: string
          id?: string
          interval_months?: number
          status?: string
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          crm_task_id?: string | null
          customer_id?: string
          due_at?: string
          equipment_id?: string
          id?: string
          interval_months?: number
          status?: string
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_plans_crm_task_id_fkey"
            columns: ["crm_task_id"]
            isOneToOne: false
            referencedRelation: "crm_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_plans_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_plans_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_plans_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          email_enabled: boolean
          in_app_enabled: boolean
          profile_id: string
          push_enabled: boolean
          updated_at: string
          whatsapp_enabled: boolean
        }
        Insert: {
          email_enabled?: boolean
          in_app_enabled?: boolean
          profile_id: string
          push_enabled?: boolean
          updated_at?: string
          whatsapp_enabled?: boolean
        }
        Update: {
          email_enabled?: boolean
          in_app_enabled?: boolean
          profile_id?: string
          push_enabled?: boolean
          updated_at?: string
          whatsapp_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          emailed_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          read_at: string | null
          recipient_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          channel?: string
          created_at?: string
          emailed_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read_at?: string | null
          recipient_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          title: string
          type: string
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          emailed_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read_at?: string | null
          recipient_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          description: string
          id: string
          line_total: number | null
          order_id: string
          product_id: string | null
          qty: number
          service_id: string | null
          unit_price: number
          warranty_days: number
        }
        Insert: {
          description: string
          id?: string
          line_total?: number | null
          order_id: string
          product_id?: string | null
          qty: number
          service_id?: string | null
          unit_price: number
          warranty_days?: number
        }
        Update: {
          description?: string
          id?: string
          line_total?: number | null
          order_id?: string
          product_id?: string | null
          qty?: number
          service_id?: string | null
          unit_price?: number
          warranty_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address_id: string | null
          code: string
          created_at: string
          customer_id: string
          delivery_method: string
          expires_at: string | null
          id: string
          needs_installation: boolean
          notes: string | null
          paid_at: string | null
          pricing_snapshot: Json | null
          shipping_fee: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          ticket_id: string | null
          total: number
          updated_at: string
        }
        Insert: {
          address_id?: string | null
          code?: string
          created_at?: string
          customer_id: string
          delivery_method?: string
          expires_at?: string | null
          id?: string
          needs_installation?: boolean
          notes?: string | null
          paid_at?: string | null
          pricing_snapshot?: Json | null
          shipping_fee?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          ticket_id?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          address_id?: string | null
          code?: string
          created_at?: string
          customer_id?: string
          delivery_method?: string
          expires_at?: string | null
          id?: string
          needs_installation?: boolean
          notes?: string | null
          paid_at?: string | null
          pricing_snapshot?: Json | null
          shipping_fee?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          ticket_id?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          event_type: string | null
          id: number
          payload: Json
          payment_id: string | null
          processed_at: string | null
          processing_error: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_event_id: string
          received_at: string
          signature_valid: boolean
        }
        Insert: {
          event_type?: string | null
          id?: never
          payload: Json
          payment_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_event_id: string
          received_at?: string
          signature_valid: boolean
        }
        Update: {
          event_type?: string | null
          id?: never
          payload?: Json
          payment_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_event_id?: string
          received_at?: string
          signature_valid?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          approved_at: string | null
          code: string
          confirmed_by: string | null
          created_at: string
          currency: string
          customer_id: string
          external_id: string | null
          external_reference: string | null
          id: string
          idempotency_key: string | null
          method: string | null
          order_id: string | null
          pricing_snapshot: Json | null
          provider: Database["public"]["Enums"]["payment_provider"]
          purpose: string
          quote_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          code?: string
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          customer_id: string
          external_id?: string | null
          external_reference?: string | null
          id?: string
          idempotency_key?: string | null
          method?: string | null
          order_id?: string | null
          pricing_snapshot?: Json | null
          provider: Database["public"]["Enums"]["payment_provider"]
          purpose?: string
          quote_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          code?: string
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          external_id?: string | null
          external_reference?: string | null
          id?: string
          idempotency_key?: string | null
          method?: string | null
          order_id?: string | null
          pricing_snapshot?: Json | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          purpose?: string
          quote_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          description: string
        }
        Insert: {
          code: string
          description: string
        }
        Update: {
          code?: string
          description?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_service_links: {
        Row: {
          link_kind: string
          product_id: string
          service_id: string
        }
        Insert: {
          link_kind?: string
          product_id: string
          service_id: string
        }
        Update: {
          link_kind?: string
          product_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_service_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_service_links_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          category_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          image_public_ids: string[]
          is_active: boolean
          name: string
          price: number
          sku: string
          slug: string
          updated_at: string
          warranty_days: number
        }
        Insert: {
          brand?: string | null
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_public_ids?: string[]
          is_active?: boolean
          name: string
          price: number
          sku: string
          slug: string
          updated_at?: string
          warranty_days?: number
        }
        Update: {
          brand?: string | null
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_public_ids?: string[]
          is_active?: boolean
          name?: string
          price?: number
          sku?: string
          slug?: string
          updated_at?: string
          warranty_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          onboarding_completed_at: string | null
          onboarding_step: number
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          email: string
          full_name?: string
          id: string
          is_active?: boolean
          onboarding_completed_at?: string | null
          onboarding_step?: number
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          onboarding_completed_at?: string | null
          onboarding_step?: number
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      project_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: number
          project_id: string
          visibility: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: never
          project_id: string
          visibility?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: never
          project_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "digital_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_files: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          project_id: string
          storage_ref: string
          uploaded_by: string | null
          visibility: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          project_id: string
          storage_ref: string
          uploaded_by?: string | null
          visibility?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          project_id?: string
          storage_ref?: string
          uploaded_by?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "digital_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_status_history: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["project_status"] | null
          id: number
          note: string | null
          project_id: string
          to_status: Database["public"]["Enums"]["project_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["project_status"] | null
          id?: never
          note?: string | null
          project_id: string
          to_status: Database["public"]["Enums"]["project_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["project_status"] | null
          id?: never
          note?: string | null
          project_id?: string
          to_status?: Database["public"]["Enums"]["project_status"]
        }
        Relationships: [
          {
            foreignKeyName: "project_status_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "digital_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          profile_id: string
          user_agent: string | null
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          profile_id: string
          user_agent?: string | null
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          profile_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_events: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          created_at: string
          event_type: string
          id: number
          message: string | null
          quote_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          event_type: string
          id?: never
          message?: string | null
          quote_id: string
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          event_type?: string
          id?: never
          message?: string | null
          quote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_events_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          description: string
          discount: number
          id: string
          kind: Database["public"]["Enums"]["item_kind"]
          line_subtotal: number | null
          line_tax: number | null
          position: number
          product_id: string | null
          qty: number
          quote_id: string
          service_id: string | null
          service_snapshot: Json | null
          tax_rate: number
          unit_price: number
          warranty_days: number
          warranty_kind: Database["public"]["Enums"]["warranty_kind"]
        }
        Insert: {
          description: string
          discount?: number
          id?: string
          kind: Database["public"]["Enums"]["item_kind"]
          line_subtotal?: number | null
          line_tax?: number | null
          position?: number
          product_id?: string | null
          qty: number
          quote_id: string
          service_id?: string | null
          service_snapshot?: Json | null
          tax_rate?: number
          unit_price: number
          warranty_days?: number
          warranty_kind?: Database["public"]["Enums"]["warranty_kind"]
        }
        Update: {
          description?: string
          discount?: number
          id?: string
          kind?: Database["public"]["Enums"]["item_kind"]
          line_subtotal?: number | null
          line_tax?: number | null
          position?: number
          product_id?: string | null
          qty?: number
          quote_id?: string
          service_id?: string | null
          service_snapshot?: Json | null
          tax_rate?: number
          unit_price?: number
          warranty_days?: number
          warranty_kind?: Database["public"]["Enums"]["warranty_kind"]
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          customer_id: string
          decided_at: string | null
          decided_by: string | null
          delivery_fee: number
          delivery_snapshot: Json | null
          diagnosis_credit: number
          diagnosis_credit_id: string | null
          discount_total: number
          id: string
          needs_part: boolean
          notes: string | null
          paid_at: string | null
          project_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          supersedes_id: string | null
          tax_snapshot: Json | null
          tax_total: number
          terms: string | null
          ticket_id: string | null
          total: number
          updated_at: string
          urgency_amount: number
          urgency_level_id: string | null
          urgency_snapshot: Json | null
          valid_until: string | null
          vat_included: number
          version: number
        }
        Insert: {
          code?: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          decided_at?: string | null
          decided_by?: string | null
          delivery_fee?: number
          delivery_snapshot?: Json | null
          diagnosis_credit?: number
          diagnosis_credit_id?: string | null
          discount_total?: number
          id?: string
          needs_part?: boolean
          notes?: string | null
          paid_at?: string | null
          project_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          supersedes_id?: string | null
          tax_snapshot?: Json | null
          tax_total?: number
          terms?: string | null
          ticket_id?: string | null
          total?: number
          updated_at?: string
          urgency_amount?: number
          urgency_level_id?: string | null
          urgency_snapshot?: Json | null
          valid_until?: string | null
          vat_included?: number
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          decided_at?: string | null
          decided_by?: string | null
          delivery_fee?: number
          delivery_snapshot?: Json | null
          diagnosis_credit?: number
          diagnosis_credit_id?: string | null
          discount_total?: number
          id?: string
          needs_part?: boolean
          notes?: string | null
          paid_at?: string | null
          project_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          supersedes_id?: string | null
          tax_snapshot?: Json | null
          tax_total?: number
          terms?: string | null
          ticket_id?: string | null
          total?: number
          updated_at?: string
          urgency_amount?: number
          urgency_level_id?: string | null
          urgency_snapshot?: Json | null
          valid_until?: string | null
          vat_included?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_diagnosis_credit_id_fkey"
            columns: ["diagnosis_credit_id"]
            isOneToOne: false
            referencedRelation: "diagnosis_credits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "digital_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_urgency_level_id_fkey"
            columns: ["urgency_level_id"]
            isOneToOne: false
            referencedRelation: "urgency_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      receptions: {
        Row: {
          accessories: string[]
          created_at: string
          id: string
          observations: string | null
          physical_condition: string | null
          reason: string
          received_by: string | null
          ticket_id: string
          updated_at: string
          visible_damage: string[]
        }
        Insert: {
          accessories?: string[]
          created_at?: string
          id?: string
          observations?: string | null
          physical_condition?: string | null
          reason: string
          received_by?: string | null
          ticket_id: string
          updated_at?: string
          visible_damage?: string[]
        }
        Update: {
          accessories?: string[]
          created_at?: string
          id?: string
          observations?: string | null
          physical_condition?: string | null
          reason?: string
          received_by?: string | null
          ticket_id?: string
          updated_at?: string
          visible_damage?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "receptions_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_code: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          permission_code: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          permission_code?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_code_fkey"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
        ]
      }
      service_categories: {
        Row: {
          app_location: string | null
          commercial_priority: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["service_kind"]
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          app_location?: string | null
          commercial_priority?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["service_kind"]
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          app_location?: string | null
          commercial_priority?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["service_kind"]
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      service_import_meta: {
        Row: {
          import_key: string
          imported_at: string
          raw: Json
          service_id: string
          source_name: string | null
          source_url: string | null
        }
        Insert: {
          import_key: string
          imported_at?: string
          raw: Json
          service_id: string
          source_name?: string | null
          source_url?: string | null
        }
        Update: {
          import_key?: string
          imported_at?: string
          raw?: Json
          service_id?: string
          source_name?: string | null
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_import_meta_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: true
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          address_id: string | null
          code: string
          created_at: string
          created_by: string | null
          customer_id: string
          equipment_id: string | null
          id: string
          modality: Database["public"]["Enums"]["service_modality"]
          preferred_at: string | null
          problem_description: string
          service_id: string
          service_snapshot: Json | null
          status: Database["public"]["Enums"]["request_status"]
          symptoms: string[]
          updated_at: string
        }
        Insert: {
          address_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          equipment_id?: string | null
          id?: string
          modality: Database["public"]["Enums"]["service_modality"]
          preferred_at?: string | null
          problem_description: string
          service_id: string
          service_snapshot?: Json | null
          status?: Database["public"]["Enums"]["request_status"]
          symptoms?: string[]
          updated_at?: string
        }
        Update: {
          address_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          equipment_id?: string | null
          id?: string
          modality?: Database["public"]["Enums"]["service_modality"]
          preferred_at?: string | null
          problem_description?: string
          service_id?: string
          service_snapshot?: Json | null
          status?: Database["public"]["Enums"]["request_status"]
          symptoms?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_subcategories: {
        Row: {
          category_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          allow_online_payment: boolean
          allowed_modalities: Database["public"]["Enums"]["service_modality"][]
          base_price: number | null
          catalog_order: number | null
          category_id: string | null
          created_at: string
          default_warranty_days: number
          default_warranty_kind: Database["public"]["Enums"]["warranty_kind"]
          deleted_at: string | null
          description: string | null
          duration_minutes: number | null
          estimated_time: string | null
          excludes_text: string | null
          flow_override: string | null
          id: string
          image_public_id: string | null
          includes_text: string | null
          is_active: boolean
          is_diagnostic_fee: boolean
          kind: Database["public"]["Enums"]["service_kind"]
          modality_label: string | null
          name: string
          parts_extra: boolean
          price_mode: Database["public"]["Enums"]["price_mode"]
          price_treatment: string | null
          price_type_label: string | null
          price_unit: string | null
          requires_diagnosis: boolean
          requires_equipment: boolean
          requires_quote: boolean
          seo_description: string | null
          seo_title: string | null
          short_description: string | null
          slug: string
          sort_order: number
          subcategory_id: string | null
          updated_at: string
        }
        Insert: {
          allow_online_payment?: boolean
          allowed_modalities: Database["public"]["Enums"]["service_modality"][]
          base_price?: number | null
          catalog_order?: number | null
          category_id?: string | null
          created_at?: string
          default_warranty_days?: number
          default_warranty_kind?: Database["public"]["Enums"]["warranty_kind"]
          deleted_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          estimated_time?: string | null
          excludes_text?: string | null
          flow_override?: string | null
          id?: string
          image_public_id?: string | null
          includes_text?: string | null
          is_active?: boolean
          is_diagnostic_fee?: boolean
          kind: Database["public"]["Enums"]["service_kind"]
          modality_label?: string | null
          name: string
          parts_extra?: boolean
          price_mode?: Database["public"]["Enums"]["price_mode"]
          price_treatment?: string | null
          price_type_label?: string | null
          price_unit?: string | null
          requires_diagnosis?: boolean
          requires_equipment?: boolean
          requires_quote?: boolean
          seo_description?: string | null
          seo_title?: string | null
          short_description?: string | null
          slug: string
          sort_order?: number
          subcategory_id?: string | null
          updated_at?: string
        }
        Update: {
          allow_online_payment?: boolean
          allowed_modalities?: Database["public"]["Enums"]["service_modality"][]
          base_price?: number | null
          catalog_order?: number | null
          category_id?: string | null
          created_at?: string
          default_warranty_days?: number
          default_warranty_kind?: Database["public"]["Enums"]["warranty_kind"]
          deleted_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          estimated_time?: string | null
          excludes_text?: string | null
          flow_override?: string | null
          id?: string
          image_public_id?: string | null
          includes_text?: string | null
          is_active?: boolean
          is_diagnostic_fee?: boolean
          kind?: Database["public"]["Enums"]["service_kind"]
          modality_label?: string | null
          name?: string
          parts_extra?: boolean
          price_mode?: Database["public"]["Enums"]["price_mode"]
          price_treatment?: string | null
          price_type_label?: string | null
          price_unit?: string | null
          requires_diagnosis?: boolean
          requires_equipment?: boolean
          requires_quote?: boolean
          seo_description?: string | null
          seo_title?: string | null
          short_description?: string | null
          slug?: string
          sort_order?: number
          subcategory_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "service_subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_members: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_available: boolean
          job_title: string | null
          phone: string | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_available?: boolean
          job_title?: string | null
          phone?: string | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_available?: boolean
          job_title?: string | null
          phone?: string | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: number
          kind: string
          ticket_id: string
          visibility: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: never
          kind?: string
          ticket_id: string
          visibility?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: never
          kind?: string
          ticket_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_notes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_status_history: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["ticket_status"] | null
          id: number
          reason: string | null
          ticket_id: string
          to_status: Database["public"]["Enums"]["ticket_status"]
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["ticket_status"] | null
          id?: never
          reason?: string | null
          ticket_id: string
          to_status: Database["public"]["Enums"]["ticket_status"]
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["ticket_status"] | null
          id?: never
          reason?: string | null
          ticket_id?: string
          to_status?: Database["public"]["Enums"]["ticket_status"]
        }
        Relationships: [
          {
            foreignKeyName: "ticket_status_history_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_transitions: {
        Row: {
          allowed_roles: Database["public"]["Enums"]["app_role"][]
          from_status: Database["public"]["Enums"]["ticket_status"]
          requires_reason: boolean
          to_status: Database["public"]["Enums"]["ticket_status"]
        }
        Insert: {
          allowed_roles: Database["public"]["Enums"]["app_role"][]
          from_status: Database["public"]["Enums"]["ticket_status"]
          requires_reason?: boolean
          to_status: Database["public"]["Enums"]["ticket_status"]
        }
        Update: {
          allowed_roles?: Database["public"]["Enums"]["app_role"][]
          from_status?: Database["public"]["Enums"]["ticket_status"]
          requires_reason?: boolean
          to_status?: Database["public"]["Enums"]["ticket_status"]
        }
        Relationships: []
      }
      tickets: {
        Row: {
          address_id: string | null
          assigned_to: string | null
          cancelled_reason: string | null
          code: string
          created_at: string
          created_by: string | null
          customer_id: string
          deleted_at: string | null
          delivered_at: string | null
          equipment_id: string | null
          id: string
          modality: Database["public"]["Enums"]["service_modality"]
          needs_part: boolean
          order_id: string | null
          order_item_id: string | null
          prepaid_amount: number | null
          prepaid_at: string | null
          problem: string
          received_at: string
          service_id: string | null
          service_request_id: string | null
          service_snapshot: Json | null
          status: Database["public"]["Enums"]["ticket_status"]
          tracking_token: string
          updated_at: string
        }
        Insert: {
          address_id?: string | null
          assigned_to?: string | null
          cancelled_reason?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          deleted_at?: string | null
          delivered_at?: string | null
          equipment_id?: string | null
          id?: string
          modality: Database["public"]["Enums"]["service_modality"]
          needs_part?: boolean
          order_id?: string | null
          order_item_id?: string | null
          prepaid_amount?: number | null
          prepaid_at?: string | null
          problem: string
          received_at?: string
          service_id?: string | null
          service_request_id?: string | null
          service_snapshot?: Json | null
          status?: Database["public"]["Enums"]["ticket_status"]
          tracking_token?: string
          updated_at?: string
        }
        Update: {
          address_id?: string | null
          assigned_to?: string | null
          cancelled_reason?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deleted_at?: string | null
          delivered_at?: string | null
          equipment_id?: string | null
          id?: string
          modality?: Database["public"]["Enums"]["service_modality"]
          needs_part?: boolean
          order_id?: string | null
          order_item_id?: string | null
          prepaid_amount?: number | null
          prepaid_at?: string | null
          problem?: string
          received_at?: string
          service_id?: string | null
          service_request_id?: string | null
          service_snapshot?: Json | null
          status?: Database["public"]["Enums"]["ticket_status"]
          tracking_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: true
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      urgency_level_services: {
        Row: {
          level_id: string
          service_id: string
        }
        Insert: {
          level_id: string
          service_id: string
        }
        Update: {
          level_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "urgency_level_services_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "urgency_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "urgency_level_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      urgency_levels: {
        Row: {
          code: string
          created_at: string
          days: number[]
          end_time: string | null
          fixed_amount: number
          id: string
          is_active: boolean
          label: string
          min_amount: number
          modalities: Database["public"]["Enums"]["service_modality"][]
          percent: number
          sort_order: number
          start_time: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          days?: number[]
          end_time?: string | null
          fixed_amount?: number
          id?: string
          is_active?: boolean
          label: string
          min_amount?: number
          modalities?: Database["public"]["Enums"]["service_modality"][]
          percent?: number
          sort_order?: number
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          days?: number[]
          end_time?: string | null
          fixed_amount?: number
          id?: string
          is_active?: boolean
          label?: string
          min_amount?: number
          modalities?: Database["public"]["Enums"]["service_modality"][]
          percent?: number
          sort_order?: number
          start_time?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      warranties: {
        Row: {
          code: string
          coverage: string | null
          created_at: string
          customer_id: string
          description: string
          end_date: string
          equipment_id: string | null
          exclusions: string | null
          id: string
          kind: Database["public"]["Enums"]["warranty_kind"]
          order_item_id: string | null
          quote_item_id: string | null
          serial: string | null
          start_date: string
          status: Database["public"]["Enums"]["warranty_status"]
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          code?: string
          coverage?: string | null
          created_at?: string
          customer_id: string
          description: string
          end_date: string
          equipment_id?: string | null
          exclusions?: string | null
          id?: string
          kind: Database["public"]["Enums"]["warranty_kind"]
          order_item_id?: string | null
          quote_item_id?: string | null
          serial?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["warranty_status"]
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          coverage?: string | null
          created_at?: string
          customer_id?: string
          description?: string
          end_date?: string
          equipment_id?: string | null
          exclusions?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["warranty_kind"]
          order_item_id?: string | null
          quote_item_id?: string | null
          serial?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["warranty_status"]
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranties_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: true
            referencedRelation: "quote_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_legal_document: {
        Args: { p_document: string }
        Returns: undefined
      }
      admin_provision_staff: {
        Args: {
          p_actor: string
          p_full_name: string
          p_phone?: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_title?: string
          p_user_id: string
        }
        Returns: undefined
      }
      admin_report: { Args: { p_from: string; p_to: string }; Returns: Json }
      admin_set_user_active: {
        Args: { p_active: boolean; p_actor: string; p_user_id: string }
        Returns: undefined
      }
      anonymize_customer: { Args: { p_customer: string }; Returns: string }
      answer_quote_question: {
        Args: { p_message: string; p_quote: string }
        Returns: undefined
      }
      apply_payment_event: {
        Args: {
          p_amount: number
          p_currency: string
          p_event_id: string
          p_event_type: string
          p_external_id: string
          p_external_reference: string
          p_payload: Json
          p_provider: Database["public"]["Enums"]["payment_provider"]
          p_signature_valid: boolean
          p_status: Database["public"]["Enums"]["payment_status"]
        }
        Returns: string
      }
      assign_ticket: {
        Args: { p_staff: string; p_ticket: string }
        Returns: undefined
      }
      auto_create_ticket: { Args: { p_request: string }; Returns: string }
      begin_payment: {
        Args: { p_actor: string; p_order: string }
        Returns: {
          amount: number
          external_reference: string
          order_code: string
          payment_id: string
        }[]
      }
      begin_service_payment: {
        Args: { p_actor: string; p_kind: string; p_ref: string }
        Returns: {
          amount: number
          external_reference: string
          payment_id: string
          ticket_id: string
          title: string
        }[]
      }
      bootstrap_first_superadmin: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      cancel_order: { Args: { p_order: string }; Returns: undefined }
      cancel_service_request: { Args: { p_id: string }; Returns: undefined }
      check_coverage: {
        Args: {
          p_dane_code: string
          p_modality: Database["public"]["Enums"]["service_modality"]
        }
        Returns: boolean
      }
      check_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      claim_email_notifications: {
        Args: { p_limit?: number }
        Returns: {
          body: string
          entity_id: string
          entity_type: string
          full_name: string
          id: string
          title: string
          to_email: string
          type: string
        }[]
      }
      complete_checklist: { Args: { p_run: string }; Returns: undefined }
      complete_onboarding: { Args: never; Returns: undefined }
      create_order: {
        Args: {
          p_address_id?: string
          p_delivery_method: string
          p_items: Json
          p_notes?: string
        }
        Returns: string
      }
      decide_quote: {
        Args: { p_decision: string; p_message?: string; p_quote: string }
        Returns: undefined
      }
      delete_service: { Args: { p_id: string }; Returns: string }
      delete_service_category: { Args: { p_id: string }; Returns: undefined }
      delete_service_subcategory: { Args: { p_id: string }; Returns: undefined }
      expire_pending_orders: { Args: never; Returns: number }
      expire_pending_service_payments: { Args: never; Returns: number }
      log_admin_event: {
        Args: {
          p_actor: string
          p_event: string
          p_metadata?: Json
          p_target?: string
        }
        Returns: undefined
      }
      log_staff_event: {
        Args: { p_event: string; p_metadata?: Json }
        Returns: undefined
      }
      mark_document_viewed: { Args: { p_doc: string }; Returns: undefined }
      next_document_code: { Args: never; Returns: string }
      next_legal_version: { Args: { p_slug: string }; Returns: number }
      pending_legal_documents: {
        Args: never
        Returns: {
          id: string
          slug: string
          title: string
          version: number
        }[]
      }
      product_stock_flags: {
        Args: never
        Returns: {
          in_stock: boolean
          low_stock: boolean
          product_id: string
        }[]
      }
      publish_legal_document: { Args: { p_id: string }; Returns: undefined }
      purge_rate_limits: { Args: never; Returns: number }
      record_diagnosis_payment: {
        Args: { p_actor: string; p_method: string; p_ticket: string }
        Returns: string
      }
      record_in_person_approval: {
        Args: { p_quote: string }
        Returns: undefined
      }
      record_manual_payment: {
        Args: { p_actor: string; p_method: string; p_order: string }
        Returns: string
      }
      record_manual_service_payment: {
        Args: {
          p_actor: string
          p_kind: string
          p_method: string
          p_ref: string
        }
        Returns: string
      }
      reject_document: { Args: { p_doc: string }; Returns: undefined }
      review_ai_diagnostic: {
        Args: { p_id: string; p_status: string }
        Returns: undefined
      }
      revise_quote: { Args: { p_quote: string }; Returns: string }
      run_housekeeping: { Args: never; Returns: Json }
      send_quote: { Args: { p_quote: string }; Returns: undefined }
      service_flow: {
        Args: {
          p_modality: Database["public"]["Enums"]["service_modality"]
          p_service: string
        }
        Returns: string
      }
      set_quote_delivery: {
        Args: { p_apply: boolean; p_quote: string }
        Returns: undefined
      }
      set_quote_urgency: {
        Args: { p_level: string; p_quote: string }
        Returns: undefined
      }
      skip_non_email_notifications: { Args: never; Returns: number }
      start_checklist: { Args: { p_ticket: string }; Returns: string }
      track_ticket: { Args: { p_token: string }; Returns: Json }
      transition_ticket: {
        Args: {
          p_reason?: string
          p_ticket: string
          p_to: Database["public"]["Enums"]["ticket_status"]
        }
        Returns: Database["public"]["Enums"]["ticket_status"]
      }
    }
    Enums: {
      app_role: "client" | "technician" | "superadmin"
      check_state: "pending" | "pass" | "fail" | "na"
      component_state: "ok" | "review" | "fail"
      contact_channel: "whatsapp" | "call" | "email" | "visit" | "app"
      crm_status:
        | "pending"
        | "contacted"
        | "interested"
        | "scheduled"
        | "done"
        | "no_answer"
        | "not_interested"
      crm_task_type: "maintenance" | "warranty" | "project" | "followup"
      document_status:
        | "draft"
        | "generated"
        | "sent"
        | "viewed"
        | "signed"
        | "rejected"
        | "superseded"
      document_type:
        | "reception"
        | "diagnosis"
        | "quote"
        | "authorization"
        | "checklist"
        | "delivery"
        | "warranty_product"
        | "warranty_labor"
        | "recommendations"
        | "maintenance"
        | "receipt"
        | "other"
      event_type:
        | "reception"
        | "diagnosis"
        | "delivery"
        | "maintenance"
        | "warranty"
        | "crm"
        | "visit"
      evidence_stage:
        | "reception"
        | "diagnosis"
        | "service"
        | "testing"
        | "delivery"
      item_kind: "service" | "product" | "custom"
      legal_status: "draft" | "published" | "retired"
      notification_status: "pending" | "sent" | "failed" | "read"
      order_status: "new" | "preparing" | "shipped" | "delivered" | "cancelled"
      payment_provider: "mercadopago" | "manual"
      payment_status:
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
        | "refunded"
        | "expired"
      price_mode: "fixed" | "from" | "quote"
      project_status:
        | "lead"
        | "scoped"
        | "in_progress"
        | "review"
        | "delivered"
        | "paused"
        | "cancelled"
      quote_status:
        | "draft"
        | "sent"
        | "clarification"
        | "approved"
        | "rejected"
        | "expired"
        | "superseded"
      request_status:
        | "pending"
        | "scheduled"
        | "converted"
        | "cancelled"
        | "rejected"
      service_kind: "technical" | "digital"
      service_modality: "store" | "pickup" | "home" | "remote"
      ticket_status:
        | "received"
        | "diagnosing"
        | "awaiting_approval"
        | "awaiting_part"
        | "in_service"
        | "testing"
        | "ready"
        | "delivered"
        | "cancelled"
      warranty_kind: "product" | "labor"
      warranty_status: "active" | "expired" | "void"
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
      app_role: ["client", "technician", "superadmin"],
      check_state: ["pending", "pass", "fail", "na"],
      component_state: ["ok", "review", "fail"],
      contact_channel: ["whatsapp", "call", "email", "visit", "app"],
      crm_status: [
        "pending",
        "contacted",
        "interested",
        "scheduled",
        "done",
        "no_answer",
        "not_interested",
      ],
      crm_task_type: ["maintenance", "warranty", "project", "followup"],
      document_status: [
        "draft",
        "generated",
        "sent",
        "viewed",
        "signed",
        "rejected",
        "superseded",
      ],
      document_type: [
        "reception",
        "diagnosis",
        "quote",
        "authorization",
        "checklist",
        "delivery",
        "warranty_product",
        "warranty_labor",
        "recommendations",
        "maintenance",
        "receipt",
        "other",
      ],
      event_type: [
        "reception",
        "diagnosis",
        "delivery",
        "maintenance",
        "warranty",
        "crm",
        "visit",
      ],
      evidence_stage: [
        "reception",
        "diagnosis",
        "service",
        "testing",
        "delivery",
      ],
      item_kind: ["service", "product", "custom"],
      legal_status: ["draft", "published", "retired"],
      notification_status: ["pending", "sent", "failed", "read"],
      order_status: ["new", "preparing", "shipped", "delivered", "cancelled"],
      payment_provider: ["mercadopago", "manual"],
      payment_status: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
        "refunded",
        "expired",
      ],
      price_mode: ["fixed", "from", "quote"],
      project_status: [
        "lead",
        "scoped",
        "in_progress",
        "review",
        "delivered",
        "paused",
        "cancelled",
      ],
      quote_status: [
        "draft",
        "sent",
        "clarification",
        "approved",
        "rejected",
        "expired",
        "superseded",
      ],
      request_status: [
        "pending",
        "scheduled",
        "converted",
        "cancelled",
        "rejected",
      ],
      service_kind: ["technical", "digital"],
      service_modality: ["store", "pickup", "home", "remote"],
      ticket_status: [
        "received",
        "diagnosing",
        "awaiting_approval",
        "awaiting_part",
        "in_service",
        "testing",
        "ready",
        "delivered",
        "cancelled",
      ],
      warranty_kind: ["product", "labor"],
      warranty_status: ["active", "expired", "void"],
    },
  },
} as const

