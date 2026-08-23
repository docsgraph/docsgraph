export interface Document {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  lastSeq?: number;
}

export interface Party {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  lastSeq?: number;
}

export interface Clause {
  id: string;
  documentId: string;
  title: string | null;
  text: string;
  createdAt: string;
  updatedAt: string;
  lastSeq?: number;
}

export interface Relationship {
  id: string;
  sourceId: string;
  sourceType: 'document' | 'party' | 'clause';
  targetId: string;
  targetType: 'document' | 'party' | 'clause';
  type: string;
  createdAt: string;
  updatedAt: string;
  lastSeq?: number;
}
