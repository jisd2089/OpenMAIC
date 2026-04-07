export type ClassroomView = 'teacher' | 'student';

export function normalizeClassroomView(view?: string | null): ClassroomView {
  return view === 'student' ? 'student' : 'teacher';
}

export function buildClassroomPath(classroomId: string, view: ClassroomView = 'teacher'): string {
  const encodedId = encodeURIComponent(classroomId);
  return `/classroom/${encodedId}?view=${view}`;
}
