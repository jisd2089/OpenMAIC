import { describe, expect, it } from 'vitest';
import { buildCoursePackageFileName } from '@/lib/server/course-package';

describe('buildCoursePackageFileName', () => {
  it('preserves readable course names and the export suffix', () => {
    expect(buildCoursePackageFileName('Course Package Test')).toBe(
      'Course Package Test.omaic-course.zip',
    );
  });

  it('truncates overly long multibyte course names to a safe file-system length', () => {
    const fileName = buildCoursePackageFileName(
      'C语言编程，本阶段内容： c数据类型 输入输出 运算符 分支结构-选择结构-条件结构 循环结构 函数 数组 指针 结构体和共用体 文件操作 编译预处理+存储管理+代码规范 单链表 项目分析与实现（大学生信息管理系统） 项目考核：学员另外单独写一个类似的项目',
    );

    expect(fileName.endsWith('.omaic-course.zip')).toBe(true);
    expect(Buffer.byteLength(fileName, 'utf8')).toBeLessThanOrEqual(120);
    expect(fileName).toContain('...');
  });
});
