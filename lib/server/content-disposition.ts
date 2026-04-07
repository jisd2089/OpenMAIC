import path from 'path';

function buildAsciiFallbackFileName(fileName: string): string {
  const ext = path.extname(fileName);
  const baseName = fileName.slice(0, fileName.length - ext.length);
  const asciiBaseName = baseName
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]+/g, '-')
    .replace(/["\\]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .trim()
    .replace(/^-+|-+$/g, '')
    .replace(/[. ]+$/g, '');

  const safeBaseName = asciiBaseName.length >= 3 ? asciiBaseName : 'course-export';
  const safeExt = ext.replace(/[^\x20-\x7E]+/g, '');
  return `${safeBaseName}${safeExt || ''}`;
}

export function buildAttachmentContentDisposition(fileName: string): string {
  const fallback = buildAsciiFallbackFileName(fileName);
  const encoded = encodeURIComponent(fileName)
    .replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
