// sharp 0.35 ships its declarations but omits them from package exports.
// Expose the shipped types until upstream restores its `types` export.
declare module "sharp" {
  const sharp: typeof import("../node_modules/sharp/lib/index");
  export = sharp;
}
