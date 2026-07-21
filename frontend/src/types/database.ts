export type DocumentStatus = 'uploading' | 'queued' | 'processing' | 'ready' | 'failed';
export type OcrStatus = 'not_needed' | 'processing' | 'completed' | 'partial' | 'failed';

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
  ocr_status: OcrStatus;
  ocr_page_count: number;
  ocr_confidence: number | null;
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
  job_type: 'parse' | 'embed' | 'summarize' | 'compare';
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

export type ShareLinkMeta = {
  id: string;
  resourceType: 'summary' | 'comparison';
  resourceId: string;
  expiresAt: string;
  createdAt: string;
  viewCount: number;
  lastViewedAt: string | null;
};

export type PublicSharePayload = {
  expiresAt: string;
  resource: ({
    type: 'summary';
    title: string;
    documentTitle: string;
    mode: string;
    detailLevel: string;
    audience: string;
    structuredContent: StructuredBrief;
    citations: Citation[];
    createdAt: string;
  } | {
    type: 'comparison';
    title: string;
    baseDocument: { id: string; title: string };
    targetDocument: { id: string; title: string };
    structuredContent: StructuredComparison;
    citations: ComparisonCitation[];
    createdAt: string;
  });
};

export type EvaluationResultRow = {
  id: string;
  user_id: string;
  artifact_type: 'summary' | 'comparison';
  summary_id: string | null;
  comparison_id: string | null;
  faithfulness_score: number;
  citation_correctness_score: number;
  coverage_score: number;
  passed: boolean;
  details: Record<string, unknown>;
  source_model: string;
  prompt_version: string;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  estimated_cost_usd: number | null;
  pricing_version: string;
  evaluator_version: string;
  created_at: string;
};

export type QualityOverview = {
  artifacts: number;
  evaluated: number;
  passed: number;
  failedJobs: number;
  faithfulnessScore: number | null;
  citationCorrectnessScore: number | null;
  coverageScore: number | null;
  averageLatencyMs: number | null;
  p95LatencyMs: number | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  evaluatorVersion: string;
  pricingVersion: string;
  recent: EvaluationResultRow[];
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
        Insert: Omit<DocumentRow, 'id' | 'status' | 'page_count' | 'character_count' | 'text_coverage' | 'requires_ocr' | 'ocr_status' | 'ocr_page_count' | 'ocr_confidence' | 'language' | 'tags' | 'error_message' | 'created_at' | 'updated_at'> & {
          id?: string;
          status?: DocumentStatus;
          page_count?: number | null;
          character_count?: number | null;
          text_coverage?: number | null;
          requires_ocr?: boolean;
          ocr_status?: OcrStatus;
          ocr_page_count?: number;
          ocr_confidence?: number | null;
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
      evaluation_results: Table<EvaluationResultRow>;
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
