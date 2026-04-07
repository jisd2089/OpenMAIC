import { describe, expect, it } from 'vitest';
import { buildAttachmentContentDisposition } from '@/lib/server/content-disposition';

describe('buildAttachmentContentDisposition', () => {
  it('builds an ASCII-safe fallback and preserves the UTF-8 filename', () => {
    const header = buildAttachmentContentDisposition(
      'C语言编程，本阶段内容：指针与结构体.omaic-course.zip',
    );

    expect(header).toContain('attachment;');
    expect(header).toMatch(/filename="[\x20-\x7E]+"/);
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain('%E8%AF%AD%E8%A8%80');
  });

  it('keeps readable ASCII file names unchanged', () => {
    const header = buildAttachmentContentDisposition('Course Package Test.omaic-course.zip');

    expect(header).toContain('filename="Course Package Test.omaic-course.zip"');
    expect(header).toContain("filename*=UTF-8''Course%20Package%20Test.omaic-course.zip");
  });
});
