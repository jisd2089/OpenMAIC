import { describe, expect, it } from 'vitest';
import { buildCoursePackageFileName } from '@/lib/server/course-package';

describe('buildCoursePackageFileName', () => {
  it('uses the classroom id as the export file name base', () => {
    expect(buildCoursePackageFileName('course_package_source')).toBe(
      'course_package_source.omaic-course.zip',
    );
  });
});
