
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "cv_education": {
                  Row: {
                    "cv_id": string,"degree": string | null,"id": string,"institution": string,"period": string | null,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cv_id": string,"degree"?: string | null,"id"?: string,"institution": string,"period"?: string | null,"sort_order"?: number
                  }
                  Update: {
                    "cv_id"?: string,"degree"?: string | null,"id"?: string,"institution"?: string,"period"?: string | null,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "cv_education_cv_id_fkey"
      columns: ["cv_id"]
isOneToOne: false
      referencedRelation: "teacher_cv"
      referencedColumns: ["id"]
    }
                  ]
                },"cv_experience": {
                  Row: {
                    "cv_id": string,"description": string | null,"employer": string,"id": string,"period": string | null,"position": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cv_id": string,"description"?: string | null,"employer": string,"id"?: string,"period"?: string | null,"position": string,"sort_order"?: number
                  }
                  Update: {
                    "cv_id"?: string,"description"?: string | null,"employer"?: string,"id"?: string,"period"?: string | null,"position"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "cv_experience_cv_id_fkey"
      columns: ["cv_id"]
isOneToOne: false
      referencedRelation: "teacher_cv"
      referencedColumns: ["id"]
    }
                  ]
                },"cv_skills": {
                  Row: {
                    "cv_id": string,"id": string,"skill": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cv_id": string,"id"?: string,"skill": string,"sort_order"?: number
                  }
                  Update: {
                    "cv_id"?: string,"id"?: string,"skill"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "cv_skills_cv_id_fkey"
      columns: ["cv_id"]
isOneToOne: false
      referencedRelation: "teacher_cv"
      referencedColumns: ["id"]
    }
                  ]
                },"lesson_students": {
                  Row: {
                    "created_at": string,"lesson_id": string,"note": string | null,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"lesson_id": string,"note"?: string | null,"student_id": string
                  }
                  Update: {
                    "created_at"?: string,"lesson_id"?: string,"note"?: string | null,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_students_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lesson_students_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"lessons": {
                  Row: {
                    "confirmed_at": string | null,"created_at": string,"end_at": string,"id": string,"location_id": string,"origin": Database["public"]['Enums']["lesson_origin"],"outcome": Database["public"]['Enums']["lesson_outcome"] | null,"room_id": string | null,"start_at": string,"status": Database["public"]['Enums']["lesson_status"],"subject_id": string,"teacher_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confirmed_at"?: string | null,"created_at"?: string,"end_at": string,"id"?: string,"location_id": string,"origin": Database["public"]['Enums']["lesson_origin"],"outcome"?: Database["public"]['Enums']["lesson_outcome"] | null,"room_id"?: string | null,"start_at": string,"status": Database["public"]['Enums']["lesson_status"],"subject_id": string,"teacher_id": string
                  }
                  Update: {
                    "confirmed_at"?: string | null,"created_at"?: string,"end_at"?: string,"id"?: string,"location_id"?: string,"origin"?: Database["public"]['Enums']["lesson_origin"],"outcome"?: Database["public"]['Enums']["lesson_outcome"] | null,"room_id"?: string | null,"start_at"?: string,"status"?: Database["public"]['Enums']["lesson_status"],"subject_id"?: string,"teacher_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lessons_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lessons_room_in_location"
      columns: ["room_id","location_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id","location_id"]
    },{
      foreignKeyName: "lessons_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lessons_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["profile_id"]
    }
                  ]
                },"location_photos": {
                  Row: {
                    "id": string,"location_id": string,"position": number,"storage_path": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"location_id": string,"position": number,"storage_path": string
                  }
                  Update: {
                    "id"?: string,"location_id"?: string,"position"?: number,"storage_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "location_photos_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    }
                  ]
                },"locations": {
                  Row: {
                    "address": string,"created_at": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address": string,"created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "address"?: string,"created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "attempts": number,"created_at": string,"id": number,"kind": string,"last_error": string | null,"payload": NonNullable<Json>,"recipient_id": string,"sent_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"id"?: never,"kind": string,"last_error"?: string | null,"payload"?: NonNullable<Json>,"recipient_id": string,"sent_at"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"id"?: never,"kind"?: string,"last_error"?: string | null,"payload"?: NonNullable<Json>,"recipient_id"?: string,"sent_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"parent_students": {
                  Row: {
                    "parent_id": string,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "parent_id": string,"student_id": string
                  }
                  Update: {
                    "parent_id"?: string,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "parent_students_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "parents"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "parent_students_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"parents": {
                  Row: {
                    "profile_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "profile_id": string
                  }
                  Update: {
                    "profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "parents_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"email": string,"first_name": string,"id": string,"is_admin": boolean,"last_name": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"email": string,"first_name": string,"id"?: string,"is_admin"?: boolean,"last_name": string,"user_id"?: string | null
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"email"?: string,"first_name"?: string,"id"?: string,"is_admin"?: boolean,"last_name"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"id": string,"p256dh": string,"profile_id": string,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"id"?: string,"p256dh": string,"profile_id": string,"user_agent"?: string | null
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"p256dh"?: string,"profile_id"?: string,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"rooms": {
                  Row: {
                    "id": string,"location_id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"location_id": string,"name": string
                  }
                  Update: {
                    "id"?: string,"location_id"?: string,"name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rooms_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    }
                  ]
                },"students": {
                  Row: {
                    "class_section": string | null,"created_at": string,"grade": string | null,"id": string,"profile_id": string,"school": string | null,"teacher_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "class_section"?: string | null,"created_at"?: string,"grade"?: string | null,"id"?: string,"profile_id": string,"school"?: string | null,"teacher_id"?: string | null
                  }
                  Update: {
                    "class_section"?: string | null,"created_at"?: string,"grade"?: string | null,"id"?: string,"profile_id"?: string,"school"?: string | null,"teacher_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "students_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "students_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["profile_id"]
    }
                  ]
                },"subjects": {
                  Row: {
                    "created_at": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"takeover_requests": {
                  Row: {
                    "created_at": string,"id": string,"resolved_at": string | null,"resolved_by": string | null,"status": Database["public"]['Enums']["takeover_status"],"student_id": string,"teacher_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: Database["public"]['Enums']["takeover_status"],"student_id": string,"teacher_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: Database["public"]['Enums']["takeover_status"],"student_id"?: string,"teacher_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "takeover_requests_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "takeover_requests_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "takeover_requests_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["profile_id"]
    }
                  ]
                },"teacher_cv": {
                  Row: {
                    "about": string | null,"created_at": string,"id": string,"photo_path": string | null,"show_members": boolean,"show_public": boolean,"slug": string,"teacher_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "about"?: string | null,"created_at"?: string,"id"?: string,"photo_path"?: string | null,"show_members"?: boolean,"show_public"?: boolean,"slug": string,"teacher_id": string,"updated_at"?: string
                  }
                  Update: {
                    "about"?: string | null,"created_at"?: string,"id"?: string,"photo_path"?: string | null,"show_members"?: boolean,"show_public"?: boolean,"slug"?: string,"teacher_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teacher_cv_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: true
      referencedRelation: "teachers"
      referencedColumns: ["profile_id"]
    }
                  ]
                },"teacher_subjects": {
                  Row: {
                    "subject_id": string,"teacher_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "subject_id": string,"teacher_id": string
                  }
                  Update: {
                    "subject_id"?: string,"teacher_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teacher_subjects_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "teacher_subjects_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["profile_id"]
    }
                  ]
                },"teachers": {
                  Row: {
                    "bio": string | null,"created_at": string,"is_active": boolean,"photo_path": string | null,"profile_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bio"?: string | null,"created_at"?: string,"is_active"?: boolean,"photo_path"?: string | null,"profile_id": string
                  }
                  Update: {
                    "bio"?: string | null,"created_at"?: string,"is_active"?: boolean,"photo_path"?: string | null,"profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teachers_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_parent_to_student":
{ Args: { "p_email": string,"p_first_name": string,"p_last_name": string,"p_student_id": string }; Returns: string
                           },
"add_student":
{ Args: { "p_class_section"?: string,"p_email": string,"p_first_name": string,"p_grade"?: string,"p_last_name": string,"p_school"?: string,"p_teacher_id"?: string }; Returns: string
                           },
"approve_takeover":
{ Args: { "p_request_id": string }; Returns: undefined
                           },
"busy_times":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "end_at": string,"location_id": string,"room_id": string,"start_at": string,"teacher_id": string
            }[]
                           },
"cancel_lesson":
{ Args: { "p_lesson_id": string }; Returns: undefined
                           },
"change_profile_email":
{ Args: { "p_new_email": string,"p_profile_id": string }; Returns: undefined
                           },
"claim_slot":
{ Args: { "p_lesson_id": string,"p_student_ids": (string)[] }; Returns: Database["public"]['Enums']["lesson_status"]
                           },
"confirm_booking":
{ Args: { "p_lesson_id": string }; Returns: undefined
                           },
"create_teacher":
{ Args: { "p_email": string,"p_first_name": string,"p_last_name": string,"p_subject_ids": (string)[] }; Returns: string
                           },
"deactivate_teacher":
{ Args: { "p_teacher_id": string }; Returns: undefined
                           },
"decline_booking":
{ Args: { "p_lesson_id": string }; Returns: undefined
                           },
"find_conflicts":
{ Args: { "p_end_at": string,"p_exclude_lesson_id"?: string,"p_room_id": string,"p_start_at": string,"p_teacher_id": string }; Returns: {
              "end_at": string,"location_id": string,"room_id": string,"same_room": boolean,"same_teacher": boolean,"start_at": string,"teacher_id": string
            }[]
                           },
"get_member_cv":
{ Args: { "p_slug": string }; Returns: Json
                           },
"get_public_cv":
{ Args: { "p_slug": string }; Returns: Json
                           },
"list_member_cvs":
{ Args: Record<PropertyKey, never>; Returns: {
              "about": string,"first_name": string,"last_name": string,"photo_path": string,"slug": string,"subjects": (string)[],"updated_at": string
            }[]
                           },
"list_public_cvs":
{ Args: Record<PropertyKey, never>; Returns: {
              "about": string,"first_name": string,"last_name": string,"photo_path": string,"slug": string,"subjects": (string)[],"updated_at": string
            }[]
                           },
"max_lesson_students":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"my_roles":
{ Args: Record<PropertyKey, never>; Returns: {
              "avatar_url": string,"email": string,"first_name": string,"is_admin": boolean,"is_parent": boolean,"is_student": boolean,"is_teacher": boolean,"last_name": string,"profile_id": string
            }[]
                           },
"reactivate_teacher":
{ Args: { "p_teacher_id": string }; Returns: undefined
                           },
"reject_takeover":
{ Args: { "p_request_id": string }; Returns: undefined
                           },
"request_takeover":
{ Args: { "p_student_id": string }; Returns: string
                           },
"schedule_lesson":
{ Args: { "p_end_at": string,"p_location_id": string,"p_room_id": string,"p_start_at": string,"p_student_ids": (string)[],"p_subject_id": string }; Returns: string
                           }
          }
          Enums: {
            "lesson_origin": "teacher"|"slot","lesson_outcome": "held"|"not_held","lesson_status": "open"|"pending"|"confirmed","takeover_status": "pending"|"approved"|"rejected"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "lesson_origin": ["teacher", "slot"],"lesson_outcome": ["held", "not_held"],"lesson_status": ["open", "pending", "confirmed"],"takeover_status": ["pending", "approved", "rejected"]
          }
        }
} as const
