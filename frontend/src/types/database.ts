export type DocumentStatus = 'uploading' | 'queued' | 'processing' | 'ready' | 'failed';

export type DocumentRow = {
  id: string;
  user_id: string;
  title: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  status: DocumentStatus;
  page_count: number | null;
  character_count: number | null;
  text_coverage: number | null;
  requires_ocr: boolean;
  language: string | null;
  tags: string[];
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type Citation = { page_number: number; quote: string };
export type ComparisonCitation = Citation & { document_id: string };

export type StructuredComparison = {
  title: string;
  overview: string;
  changes: Array<{
    change_type: 'added' | 'removed' | 'changed' | 'unchanged';
    heading: string;
    explanation: string;
    significance: string;
    citations: ComparisonCitation[];
  }>;
  uncertainties: string[];
};

export type StructuredBrief = {
  brief_title: string;
  overview: string;
  sections: Array<{
    heading: string;
    points: Array<{ text: string; page_numbers: number[] }>;
  }>;
  uncertainties: string[];
  citations: Citation[];
};

export type DocumentPageRow = {
  id: number;
  document_id: string;
  page_number: number;
  content: string;
  created_at: string;
};

export type SummaryRow = {
  id: string;
  document_id: string;
  user_id: string;
  mode: string;
  detail_level: string;
  audience: string;
  content: string;
  structured_content: StructuredBrief;
  citations: Citation[];
  model: string;
  prompt_version: string;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  created_at: string;
};

export type ConversationRow = {
  id: string;
  document_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  model: string | null;
  created_at: string;
};

export type ProcessingJobRow = {
  id: string;
  document_id: string;
  user_id: string;
  job_type: 'parse' | 'embed' | 'summarize';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  attempts: number;
  progress: number;
  payload: Record<string, unknown>;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ComparisonRow = {
  id: string;
  user_id: string;
  base_document_id: string;
  target_document_id: string;
  title: string;
  structured_content: StructuredComparison;
  citations: ComparisonCitation[];
  model: string;
  prompt_version: string;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  created_at: string;
};

type Table<Row, Insert = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      documents: {
        Row: DocumentRow;
        Insert: Omit<DocumentRow, 'id' | 'status' | 'page_count' | 'character_count' | 'text_coverage' | 'requires_ocr' | 'language' | 'tags' | 'error_message' | 'created_at' | 'updated_at'> & {
          id?: string;
          status?: DocumentStatus;
          page_count?: number | null;
          character_count?: number | null;
          text_coverage?: number | null;
          requires_ocr?: boolean;
          language?: string | null;
          tags?: string[];
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<DocumentRow>;
        Relationships: [];
      };
      document_pages: Table<DocumentPageRow>;
      summaries: Table<SummaryRow>;
      conversations: Table<ConversationRow>;
      messages: Table<MessageRow>;
      processing_jobs: Table<ProcessingJobRow>;
      comparisons: Table<ComparisonRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      document_status: DocumentStatus;
      job_status: 'queued' | 'processing' | 'completed' | 'failed';
      message_role: 'user' | 'assistant';
    };
    CompositeTypes: Record<string, never>;
  };
};
