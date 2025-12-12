/**
 * Transform: import { X, Y } from "lucide-react";
 *    -> import X from "lucide-react/icons/x"; import Y from "lucide-react/icons/y";
 * Keeps `import type { LucideIcon } from "lucide-react";` as-is.
 */
const camelToKebab = (name) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);

  root.find(j.ImportDeclaration, { source: { value: "lucide-react" } }).forEach((path) => {
    const decl = path.value;
    // type-only imports are kept
    const hasTypeOnly =
      decl.importKind === "type" || decl.specifiers?.every((s) => s.importKind === "type");
    if (hasTypeOnly) return;

    const specifiers = decl.specifiers || [];
    const valueSpecifiers = specifiers.filter((s) => s.type === "ImportSpecifier");
    const otherSpecifiers = specifiers.filter((s) => s.type !== "ImportSpecifier");

    if (otherSpecifiers.length > 0) {
      // Leave namespace/default imports untouched (rare for lucide-react)
      return;
    }

    if (valueSpecifiers.length === 0) return;

    const statements = valueSpecifiers.map((s) => {
      const localName = s.local ? s.local.name : s.imported.name;
      const importedName = s.imported.name;
      const kebab = camelToKebab(importedName)
        .replace(/-icon$/, "-icon") // keep suffix if present
        .replace(/icon$/, "-icon");
      return j.importDeclaration(
        [j.importDefaultSpecifier(j.identifier(localName))],
        j.literal(`lucide-react/icons/${kebab}`)
      );
    });

    j(path).replaceWith(statements);
  });

  return root.toSource({ quote: '"' });
};
