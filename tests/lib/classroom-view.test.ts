import { describe, expect, it } from 'vitest';
import { buildClassroomPath, normalizeClassroomView } from '@/lib/classroom/view';

describe('normalizeClassroomView', () => {
  it('defaults missing and invalid values to teacher', () => {
    expect(normalizeClassroomView()).toBe('teacher');
    expect(normalizeClassroomView(null)).toBe('teacher');
    expect(normalizeClassroomView('teacher')).toBe('teacher');
    expect(normalizeClassroomView('invalid')).toBe('teacher');
  });

  it('preserves the student view value', () => {
    expect(normalizeClassroomView('student')).toBe('student');
  });

  it('builds stable teacher and student classroom paths', () => {
    expect(buildClassroomPath('course_1')).toBe('/classroom/course_1?view=teacher');
    expect(buildClassroomPath('course_1', 'teacher')).toBe('/classroom/course_1?view=teacher');
    expect(buildClassroomPath('course_1', 'student')).toBe('/classroom/course_1?view=student');
  });
});
