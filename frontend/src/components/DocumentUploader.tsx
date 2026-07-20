import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { API_URL } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { DocumentRow } from '../types/database';

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
};
const ALLOWED_MIME_TYPES = new Set(Object.values(MIME_BY_EXTENSION));

type UploadStage = 'idle' | 'uploading' | 'saving' | 'queueing' | 'complete';

function normalizeFile(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const mimeType = file.type || MIME_BY_EXTENSION[extension];
  return { extension, mimeType };
}

function safeFileName(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 180) || 'document';
}

function documentTitle(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, 180) || 'Untitled document';
}

export function DocumentUploader({
  session,
  onUploaded,
  variant = 'primary',
}: {
  session: Session;
  onUploaded: (document: DocumentRow) => void;
  variant?: 'primary' | 'empty';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<UploadStage>('idle');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  const upload = async (file: File) => {
    if (!supabase || stage !== 'idle') return;
    const { mimeType } = normalizeFile(file);
    setError('');

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      setError('Choose a PDF, DOCX, Markdown, or plain-text file.');
      return;
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      setError('Choose a file between 1 byte and 15 MB.');
      return;
    }

    const storagePath = `${session.user.id}/${crypto.randomUUID()}/${safeFileName(file.name)}`;
    setStage('uploading');

    try {
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file, { contentType: mimeType, upsert: false });
      if (uploadError) throw new Error(uploadError.message);

      setStage('saving');
      const { data: document, error: documentError } = await supabase
        .from('documents')
        .insert({
          user_id: session.user.id,
          title: documentTitle(file.name),
          original_name: file.name,
          mime_type: mimeType,
          size_bytes: file.size,
          storage_path: storagePath,
        })
        .select('*')
        .single();
      if (documentError || !document) {
        await supabase.storage.from('documents').remove([storagePath]);
        throw new Error(documentError?.message || 'The document record could not be created.');
      }

      setStage('queueing');
      const response = await fetch(`${API_URL}/api/documents/${document.id}/ingest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const body = response.headers.get('content-type')?.includes('application/json')
        ? await response.json() as { error?: string }
        : {};
      if (!response.ok) {
        await supabase.from('documents').update({
          status: 'failed',
          error_message: body.error || 'The processing job could not be started.',
        }).eq('id', document.id);
        throw new Error(body.error || 'The processing job could not be started.');
      }

      setStage('complete');
      onUploaded({ ...document, status: 'queued' });
      window.setTimeout(() => setStage('idle'), 1_200);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The upload could not be completed.');
      setStage('idle');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) upload(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) upload(file);
  };

  const labels: Record<UploadStage, string> = {
    idle: variant === 'empty' ? 'Choose your first document' : 'Upload a document',
    uploading: 'Uploading private file',
    saving: 'Creating document record',
    queueing: 'Starting document analysis',
    complete: 'Document queued',
  };

  if (variant === 'empty') {
    return (
      <div
        className={`drop-zone ${dragging ? 'dragging' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input ref={inputRef} type="file" accept=".pdf,.docx,.txt,.md" onChange={onChange} hidden />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={stage !== 'idle'}>{labels[stage]}</button>
        <small>or drop one file here</small>
        {error && <p className="upload-error" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <div className="uploader-inline">
      <input ref={inputRef} type="file" accept=".pdf,.docx,.txt,.md" onChange={onChange} hidden />
      <button className="upload-trigger" type="button" onClick={() => inputRef.current?.click()} disabled={stage !== 'idle'}>{labels[stage]}</button>
      {error && <p className="upload-error" role="alert">{error}</p>}
    </div>
  );
}
