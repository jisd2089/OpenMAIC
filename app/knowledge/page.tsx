import type { Metadata } from 'next';
import { KnowledgeWorkbench } from '@/components/kb/knowledge-workbench';

export const metadata: Metadata = {
  title: 'Knowledge Workspace | iotek',
  description: 'Manage knowledge bases, uploaded assets, and memory notes for classroom generation.',
};

export default function KnowledgePage() {
  return <KnowledgeWorkbench />;
}
