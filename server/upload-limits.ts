// Multer 2.4 leaves these unbounded by default. The app's multipart forms use
// flat fields; allow modest nesting/indexes without permitting sparse-array DoS.
export const multipartFieldLimits = {
  fieldArrayIndexLimit: 100,
  fieldNestingDepth: 10,
};
