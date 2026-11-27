/** Pages that draw the top bar inside their own gradient header (AppLayout skips its bar for these). */
export const GRADIENT_PAGES: Record<string, string[]> = {
  professor: ['/courses', '/students', '/analytics'],
  student: ['/courses', '/assignments', '/tutor'],
};

/** Path prefixes whose pages all sit inside a gradient layout (CourseLayout for professors). */
export const GRADIENT_PREFIXES: Record<string, RegExp> = {
  // Course pages, except the full-screen map and study views which draw their own chrome
  professor: /^\/courses\/[^/]+(\/(tests|review|insights|lectures|plan|ask)(\/.*)?)?\/?$/,
  // Students: every class page except the full-screen map and Learn views
  student: /^\/courses\/[^/]+(\/(plan|tests|ask|lectures\/[^/]+))?\/?$/,
};

export const embedsTopbar = (role: string | null | undefined, pathname: string) =>
  !!role && (!!GRADIENT_PAGES[role]?.includes(pathname) || !!GRADIENT_PREFIXES[role]?.test(pathname));
