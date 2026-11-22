
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
                },"enrolment_offers": {
                  Row: {
                    "created_at": string,"request_id": string,"teacher_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"request_id": string,"teacher_id": string
                  }
                  Update: {
                    "created_at"?: string,"request_id"?: string,"teacher_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "enrolment_offers_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "enrolment_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "enrolment_offers_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["profile_id"]
    }
                  ]
                },"enrolment_requests": {
                  Row: {
                    "added_by": string | null,"applicant_id": string,"applicant_role": Database["public"]['Enums']["enrolment_role"],"approved_at": string | null,"assigned_at": string | null,"choice_opened_at": string | null,"chosen_at": string | null,"chosen_by": string | null,"chosen_teacher_id": string | null,"city_part": string | null,"consent_at": string | null,"contact_phone": string | null,"created_at": string,"grade": string | null,"id": string,"listed_at": string | null,"needs_approval": boolean,"profile_completed_at": string | null,"restarts": number,"school": string | null,"situation": string | null,"source": string,"status": Database["public"]['Enums']["enrolment_status"],"student_first_name": string | null,"student_id": string | null,"student_last_name": string | null,"subject_id": string | null,"window_started_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "added_by"?: string | null,"applicant_id": string,"applicant_role": Database["public"]['Enums']["enrolment_role"],"approved_at"?: string | null,"assigned_at"?: string | null,"choice_opened_at"?: string | null,"chosen_at"?: string | null,"chosen_by"?: string | null,"chosen_teacher_id"?: string | null,"city_part"?: string | null,"consent_at"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"grade"?: string | null,"id"?: string,"listed_at"?: string | null,"needs_approval"?: boolean,"profile_completed_at"?: string | null,"restarts"?: number,"school"?: string | null,"situation"?: string | null,"source": string,"status"?: Database["public"]['Enums']["enrolment_status"],"student_first_name"?: string | null,"student_id"?: string | null,"student_last_name"?: string | null,"subject_id"?: string | null,"window_started_at"?: string | null
                  }
                  Update: {
                    "added_by"?: string | null,"applicant_id"?: string,"applicant_role"?: Database["public"]['Enums']["enrolment_role"],"approved_at"?: string | null,"assigned_at"?: string | null,"choice_opened_at"?: string | null,"chosen_at"?: string | null,"chosen_by"?: string | null,"chosen_teacher_id"?: string | null,"city_part"?: string | null,"consent_at"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"grade"?: string | null,"id"?: string,"listed_at"?: string | null,"needs_approval"?: boolean,"profile_completed_at"?: string | null,"restarts"?: number,"school"?: string | null,"situation"?: string | null,"source"?: string,"status"?: Database["public"]['Enums']["enrolment_status"],"student_first_name"?: string | null,"student_id"?: string | null,"student_last_name"?: string | null,"subject_id"?: string | null,"window_started_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "enrolment_requests_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "enrolment_requests_applicant_id_fkey"
      columns: ["applicant_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "enrolment_requests_chosen_teacher_id_fkey"
      columns: ["chosen_teacher_id"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "enrolment_requests_student_id_fkey"
      columns: ["student_id"]
isOneToOne: true
      referencedRelation: "students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "enrolment_requests_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    }
                  ]
                },"enrolment_settings": {
                  Row: {
                    "choice_after_days": number,"choice_after_offers": number,"daily_cap": number,"form_enabled": boolean,"singleton": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "choice_after_days"?: number,"choice_after_offers"?: number,"daily_cap"?: number,"form_enabled"?: boolean,"singleton"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "choice_after_days"?: number,"choice_after_offers"?: number,"daily_cap"?: number,"form_enabled"?: boolean,"singleton"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"lesson_students": {
                  Row: {
                    "created_at": string,"lesson_id": string,"note": string | null,"paid_at": string | null,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"lesson_id": string,"note"?: string | null,"paid_at"?: string | null,"student_id": string
                  }
                  Update: {
                    "created_at"?: string,"lesson_id"?: string,"note"?: string | null,"paid_at"?: string | null,"student_id"?: string
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
                    "confirmed_at": string | null,"created_at": string,"end_at": string,"id": string,"location_id": string,"origin": Database["public"]['Enums']["lesson_origin"],"outcome": Database["public"]['Enums']["lesson_outcome"] | null,"room_id": string | null,"settled_at": string,"start_at": string,"status": Database["public"]['Enums']["lesson_status"],"subject_id": string,"teacher_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confirmed_at"?: string | null,"created_at"?: string,"end_at": string,"id"?: string,"location_id": string,"origin": Database["public"]['Enums']["lesson_origin"],"outcome"?: Database["public"]['Enums']["lesson_outcome"] | null,"room_id"?: string | null,"settled_at"?: string,"start_at": string,"status": Database["public"]['Enums']["lesson_status"],"subject_id": string,"teacher_id": string
                  }
                  Update: {
                    "confirmed_at"?: string | null,"created_at"?: string,"end_at"?: string,"id"?: string,"location_id"?: string,"origin"?: Database["public"]['Enums']["lesson_origin"],"outcome"?: Database["public"]['Enums']["lesson_outcome"] | null,"room_id"?: string | null,"settled_at"?: string,"start_at"?: string,"status"?: Database["public"]['Enums']["lesson_status"],"subject_id"?: string,"teacher_id"?: string
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
                },"notification_kinds": {
                  Row: {
                    "always_email": boolean,"email_fallback": boolean,"ignores_quiet_hours": boolean,"kind": string
                  }
                  ComputedFields: never
                  Insert: {
                    "always_email"?: boolean,"email_fallback": boolean,"ignores_quiet_hours"?: boolean,"kind": string
                  }
                  Update: {
                    "always_email"?: boolean,"email_fallback"?: boolean,"ignores_quiet_hours"?: boolean,"kind"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notification_settings": {
                  Row: {
                    "quiet_end": string,"quiet_hours_enabled": boolean,"quiet_start": string,"reminder_enabled": boolean,"reminder_minutes": number,"school_contact": string,"singleton": boolean,"updated_at": string,"welcome_text": string
                  }
                  ComputedFields: never
                  Insert: {
                    "quiet_end"?: string,"quiet_hours_enabled"?: boolean,"quiet_start"?: string,"reminder_enabled"?: boolean,"reminder_minutes"?: number,"school_contact"?: string,"singleton"?: boolean,"updated_at"?: string,"welcome_text"?: string
                  }
                  Update: {
                    "quiet_end"?: string,"quiet_hours_enabled"?: boolean,"quiet_start"?: string,"reminder_enabled"?: boolean,"reminder_minutes"?: number,"school_contact"?: string,"singleton"?: boolean,"updated_at"?: string,"welcome_text"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "attempts": number,"channel": string | null,"created_at": string,"deliver_after": string,"failed_at": string | null,"id": number,"kind": string,"last_error": string | null,"payload": NonNullable<Json>,"recipient_id": string,"sent_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"channel"?: string | null,"created_at"?: string,"deliver_after"?: string,"failed_at"?: string | null,"id"?: never,"kind": string,"last_error"?: string | null,"payload"?: NonNullable<Json>,"recipient_id": string,"sent_at"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"channel"?: string | null,"created_at"?: string,"deliver_after"?: string,"failed_at"?: string | null,"id"?: never,"kind"?: string,"last_error"?: string | null,"payload"?: NonNullable<Json>,"recipient_id"?: string,"sent_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_kind_fk"
      columns: ["kind"]
isOneToOne: false
      referencedRelation: "notification_kinds"
      referencedColumns: ["kind"]
    },{
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
                },"person_phones": {
                  Row: {
                    "phone": string,"profile_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "phone": string,"profile_id": string
                  }
                  Update: {
                    "phone"?: string,"profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "person_phones_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"email": string,"erased_at": string | null,"first_name": string,"id": string,"is_admin": boolean,"is_main_admin": boolean,"last_name": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"email": string,"erased_at"?: string | null,"first_name": string,"id"?: string,"is_admin"?: boolean,"is_main_admin"?: boolean,"last_name": string,"user_id"?: string | null
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"email"?: string,"erased_at"?: string | null,"first_name"?: string,"id"?: string,"is_admin"?: boolean,"is_main_admin"?: boolean,"last_name"?: string,"user_id"?: string | null
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
                },"teacher_locations": {
                  Row: {
                    "location_id": string,"teacher_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "location_id": string,"teacher_id": string
                  }
                  Update: {
                    "location_id"?: string,"teacher_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teacher_locations_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "teacher_locations_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
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
                    "bio": string | null,"color": string | null,"created_at": string,"is_active": boolean,"photo_path": string | null,"profile_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bio"?: string | null,"color"?: string | null,"created_at"?: string,"is_active"?: boolean,"photo_path"?: string | null,"profile_id": string
                  }
                  Update: {
                    "bio"?: string | null,"color"?: string | null,"created_at"?: string,"is_active"?: boolean,"photo_path"?: string | null,"profile_id"?: string
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
{ Args: { "p_email": string,"p_first_name": string,"p_last_name": string,"p_phone": string,"p_student_id": string }; Returns: string
                           },
"add_student":
{ Args: { "p_class_section"?: string,"p_email": string,"p_first_name": string,"p_grade"?: string,"p_last_name": string,"p_phone"?: string,"p_school"?: string,"p_teacher_id"?: string }; Returns: string
                           },
"add_unassigned_student":
{ Args: { "p_city_part"?: string,"p_email": string,"p_first_name": string,"p_grade": string,"p_last_name": string,"p_phone": string,"p_school": string,"p_situation"?: string,"p_subject_id": string }; Returns: string
                           },
"admin_assign_enrolment":
{ Args: { "p_child_email"?: string,"p_request_id": string,"p_teacher_id": string }; Returns: string
                           },
"admin_list_enrolments":
{ Args: { "p_state"?: string }; Returns: {
              "applicant_email": string,"applicant_role": Database["public"]['Enums']["enrolment_role"],"choice_opened_at": string,"chosen_teacher_id": string,"city_part": string,"created_at": string,"days_waiting": number,"grade": string,"listed_at": string,"offers": Json,"phone": string,"request_id": string,"restarts": number,"school": string,"situation": string,"source": string,"state": string,"status": Database["public"]['Enums']["enrolment_status"],"student_first_name": string,"student_last_name": string,"subject_name": string
            }[]
                           },
"admin_list_notifications":
{ Args: { "p_before"?: number,"p_limit"?: number,"p_state"?: string }; Returns: {
              "attempts": number,"channel": string,"created_at": string,"deliver_after": string,"id": number,"kind": string,"last_error": string,"recipient_email": string,"recipient_name": string,"sent_at": string,"state": string
            }[]
                           },
"admin_list_parents":
{ Args: Record<PropertyKey, never>; Returns: {
              "child_names": (string)[],"created_at": string,"email": string,"first_name": string,"last_name": string,"profile_id": string
            }[]
                           },
"admin_list_students":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"email": string,"first_name": string,"held_lessons": number,"last_name": string,"location_names": (string)[],"parent_names": (string)[],"profile_id": string,"student_id": string,"teacher_id": string,"teacher_name": string,"upcoming_lessons": number
            }[]
                           },
"admin_notification_health":
{ Args: Record<PropertyKey, never>; Returns: {
              "failed": number,"overdue": number
            }[]
                           },
"admin_resend_notification":
{ Args: { "p_id": number }; Returns: undefined
                           },
"admin_send_test_notification":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"approve_enrolment":
{ Args: { "p_request_id": string }; Returns: undefined
                           },
"busy_times":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "end_at": string,"location_id": string,"room_id": string,"start_at": string,"teacher_id": string
            }[]
                           },
"cancel_lesson":
{ Args: { "p_lesson_id": string,"p_note"?: string }; Returns: undefined
                           },
"change_profile_email":
{ Args: { "p_new_email": string,"p_profile_id": string }; Returns: undefined
                           },
"change_student_email":
{ Args: { "p_new_email": string,"p_student_id": string }; Returns: undefined
                           },
"choose_enrolment_teacher":
{ Args: { "p_request_id": string,"p_teacher_id": string }; Returns: string
                           },
"claim_notifications":
{ Args: { "p_limit"?: number }; Returns: Json
                           },
"claim_slot":
{ Args: { "p_lesson_id": string,"p_student_ids": (string)[] }; Returns: Database["public"]['Enums']["lesson_status"]
                           },
"complete_chosen_enrolment":
{ Args: { "p_child_email": string,"p_request_id": string }; Returns: undefined
                           },
"complete_enrolment_profile":
{ Args: { "p_city_part"?: string,"p_consent"?: boolean,"p_first_name": string,"p_grade": string,"p_last_name": string,"p_phone": string,"p_request_id": string,"p_school": string,"p_situation"?: string }; Returns: undefined
                           },
"complete_notification":
{ Args: { "p_channel": string,"p_id": number }; Returns: undefined
                           },
"confirm_booking":
{ Args: { "p_lesson_id": string }; Returns: undefined
                           },
"create_teacher":
{ Args: { "p_email": string,"p_first_name": string,"p_last_name": string,"p_location_ids": (string)[],"p_phone": string,"p_subject_ids": (string)[] }; Returns: string
                           },
"deactivate_teacher":
{ Args: { "p_teacher_id": string }; Returns: undefined
                           },
"decline_booking":
{ Args: { "p_lesson_id": string,"p_note"?: string }; Returns: undefined
                           },
"defer_notification":
{ Args: { "p_id": number,"p_reason": string,"p_until": string }; Returns: undefined
                           },
"delete_student":
{ Args: { "p_student_id": string }; Returns: undefined
                           },
"enrolment_form_info":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"erase_person":
{ Args: { "p_profile_id": string }; Returns: undefined
                           },
"erase_teacher":
{ Args: { "p_teacher_id": string }; Returns: string
                           },
"fail_notification":
{ Args: { "p_error": string,"p_give_up"?: boolean,"p_id": number }; Returns: undefined
                           },
"find_conflicts":
{ Args: { "p_end_at": string,"p_exclude_lesson_id"?: string,"p_room_id": string,"p_start_at": string,"p_teacher_id": string }; Returns: {
              "end_at": string,"location_id": string,"room_id": string,"same_room": boolean,"same_teacher": boolean,"start_at": string,"teacher_id": string
            }[]
                           },
"forget_push_subscriptions":
{ Args: { "p_ids": (string)[] }; Returns: undefined
                           },
"get_enrolment_settings":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_member_cv":
{ Args: { "p_slug": string }; Returns: Json
                           },
"get_notification_settings":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_offered_cv":
{ Args: { "p_request_id": string,"p_teacher_id": string }; Returns: Json
                           },
"get_public_cv":
{ Args: { "p_slug": string }; Returns: Json
                           },
"grant_admin":
{ Args: { "p_teacher_id": string }; Returns: undefined
                           },
"list_chosen_enrolments":
{ Args: Record<PropertyKey, never>; Returns: {
              "applicant_email": string,"chosen_at": string,"grade": string,"phone": string,"request_id": string,"school": string,"student_first_name": string,"student_last_name": string,"subject_name": string
            }[]
                           },
"list_enrolment_pool":
{ Args: Record<PropertyKey, never>; Returns: {
              "applicant_email": string,"applicant_role": Database["public"]['Enums']["enrolment_role"],"city_part": string,"days_waiting": number,"grade": string,"listed_at": string,"offered": boolean,"phone": string,"request_id": string,"school": string,"situation": string,"source": string,"student_first_name": string,"student_last_name": string,"subject_id": string,"subject_name": string
            }[]
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
"my_enrolment_offers":
{ Args: { "p_request_id": string }; Returns: {
              "cv_slug": string,"first_name": string,"is_chosen": boolean,"last_name": string,"offered_at": string,"phone": string,"photo_path": string,"subjects": (string)[],"teacher_id": string
            }[]
                           },
"my_enrolment_requests":
{ Args: Record<PropertyKey, never>; Returns: {
              "applicant_role": Database["public"]['Enums']["enrolment_role"],"choice_open": boolean,"chosen_teacher_id": string,"city_part": string,"contact_phone": string,"days_waiting": number,"grade": string,"id": string,"listed": boolean,"offers_count": number,"profile_completed": boolean,"school": string,"situation": string,"source": string,"status": Database["public"]['Enums']["enrolment_status"],"student_first_name": string,"student_id": string,"student_last_name": string,"subject_id": string,"subject_name": string,"waiting_for_approval": boolean
            }[]
                           },
"my_roles":
{ Args: Record<PropertyKey, never>; Returns: {
              "avatar_url": string,"email": string,"first_name": string,"is_admin": boolean,"is_main_admin": boolean,"is_parent": boolean,"is_student": boolean,"is_teacher": boolean,"last_name": string,"profile_id": string
            }[]
                           },
"offer_enrolment":
{ Args: { "p_request_id": string }; Returns: undefined
                           },
"reactivate_teacher":
{ Args: { "p_teacher_id": string }; Returns: undefined
                           },
"reject_enrolment":
{ Args: { "p_request_id": string }; Returns: undefined
                           },
"remove_parent_from_student":
{ Args: { "p_parent_id": string,"p_student_id": string }; Returns: undefined
                           },
"rename_person":
{ Args: { "p_first_name": string,"p_last_name": string,"p_profile_id": string }; Returns: undefined
                           },
"revoke_admin":
{ Args: { "p_profile_id": string }; Returns: undefined
                           },
"save_my_cv":
{ Args: { "p_about": string,"p_education": Json,"p_experience": Json,"p_show_members": boolean,"p_show_public": boolean,"p_skills": Json }; Returns: undefined
                           },
"schedule_lesson":
{ Args: { "p_end_at": string,"p_location_id": string,"p_room_id": string,"p_start_at": string,"p_student_ids": (string)[],"p_subject_id": string }; Returns: string
                           },
"set_email_fallback":
{ Args: { "p_enabled": boolean,"p_kind": string }; Returns: undefined
                           },
"set_enrolment_settings":
{ Args: { "p_choice_after_days": number,"p_choice_after_offers": number,"p_daily_cap": number,"p_form_enabled": boolean }; Returns: undefined
                           },
"set_enrolment_subject":
{ Args: { "p_request_id": string,"p_subject_id": string }; Returns: undefined
                           },
"set_lesson_paid":
{ Args: { "p_lesson_id": string,"p_paid": boolean,"p_student_id": string }; Returns: undefined
                           },
"set_lesson_students":
{ Args: { "p_lesson_id": string,"p_student_ids": (string)[] }; Returns: undefined
                           },
"set_notification_settings":
{ Args: { "p_quiet_end": string,"p_quiet_hours_enabled": boolean,"p_quiet_start": string,"p_reminder_enabled": boolean,"p_reminder_minutes": number,"p_school_contact": string,"p_welcome_text": string }; Returns: undefined
                           },
"set_person_phone":
{ Args: { "p_phone": string,"p_profile_id": string }; Returns: undefined
                           },
"set_teacher_locations":
{ Args: { "p_location_ids": (string)[],"p_teacher_id": string }; Returns: undefined
                           },
"start_enrolment":
{ Args: { "p_role": string,"p_subject_id": string }; Returns: string
                           },
"student_lesson_counts":
{ Args: Record<PropertyKey, never>; Returns: {
              "held_lessons": number,"student_id": string,"upcoming_lessons": number
            }[]
                           },
"withdraw_enrolment_offer":
{ Args: { "p_request_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "enrolment_role": "student"|"parent","enrolment_status": "open"|"chosen"|"assigned"|"rejected","lesson_origin": "teacher"|"slot","lesson_outcome": "held"|"not_held","lesson_status": "open"|"pending"|"confirmed","takeover_status": "pending"|"approved"|"rejected"
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
            "enrolment_role": ["student", "parent"],"enrolment_status": ["open", "chosen", "assigned", "rejected"],"lesson_origin": ["teacher", "slot"],"lesson_outcome": ["held", "not_held"],"lesson_status": ["open", "pending", "confirmed"],"takeover_status": ["pending", "approved", "rejected"]
          }
        }
} as const
