import plugin from "tailwindcss/plugin";
import defaultTheme from "tailwindcss/defaultTheme";

const stringValues = (values: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => typeof entry[1] === "string"));

/**
 * Legacy utility definitions paired with tailwind-compat.css's overrides.
 * Preserve sibling spacing (including hidden fields) and transform composition
 * used by Radix / tailwindcss-animate without retaining the vulnerable v3 scanner.
 */
export default plugin(({ addUtilities, addBase, matchUtilities }) => {
  const utilities: Record<string, any> = {};
  // v3 responsive text sizes reset line-height even when the element also has
  // a base leading-* class. v4 otherwise keeps --tw-leading at every breakpoint.
  for (const key of Object.keys(defaultTheme.fontSize)) {
    utilities[`.text-${key}`] = { "--tw-leading": "initial" };
  }
  const siblings = "& > :not([hidden]) ~ :not([hidden])";
  for (const [key, size] of Object.entries(defaultTheme.spacing)) {
    if (key.includes(".")) continue; // Fractional names are registered in CSS.
    for (const [axis, start, end] of [["x", "margin-left", "margin-right"], ["y", "margin-top", "margin-bottom"]]) {
        utilities[`.space-${axis}-${key}`] = {
          [siblings]: {
            [`--tw-space-${axis}-reverse`]: "0",
            [start]: `calc(${size} * calc(1 - var(--tw-space-${axis}-reverse)))`,
            [end]: `calc(${size} * var(--tw-space-${axis}-reverse))`,
          },
        };
    }
  }
  for (const [key, size] of Object.entries({ DEFAULT: "1px", 0: "0px", 2: "2px", 4: "4px", 8: "8px" })) {
    for (const [axis, start, end] of [["x", "border-left-width", "border-right-width"], ["y", "border-top-width", "border-bottom-width"]]) {
      utilities[`.divide-${axis}${key === "DEFAULT" ? "" : `-${key}`}`] = {
        [siblings]: {
          [`--tw-divide-${axis}-reverse`]: "0",
          [start]: `calc(${size} * calc(1 - var(--tw-divide-${axis}-reverse)))`,
          [end]: `calc(${size} * var(--tw-divide-${axis}-reverse))`,
        },
      };
    }
  }
  const transform = "translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))";
  addBase({
    "*, ::before, ::after, ::backdrop": {
      "--tw-translate-x": "0", "--tw-translate-y": "0",
      "--tw-rotate": "0", "--tw-skew-x": "0", "--tw-skew-y": "0",
      "--tw-scale-x": "1", "--tw-scale-y": "1",
    },
  });
  const translations = { ...defaultTheme.spacing, "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "3/4": "75%", full: "100%" };
  for (const axis of ["x", "y"]) {
    matchUtilities({
      [`translate-${axis}`]: value => ({ translate: "none !important", [`--tw-translate-${axis}`]: value, transform }),
    }, { values: translations, supportsNegativeValues: true });
  }
  matchUtilities({
    scale: value => ({ scale: "none !important", "--tw-scale-x": value, "--tw-scale-y": value, transform }),
  }, { values: stringValues(defaultTheme.scale), supportsNegativeValues: true });
  matchUtilities({
    rotate: value => ({ rotate: "none !important", "--tw-rotate": value, transform }),
  }, { values: stringValues(defaultTheme.rotate), supportsNegativeValues: true });
  utilities[".transform"] = { transform };
  utilities[".outline"] = { "outline-style": "solid" };
  utilities[".outline-2"] = { "outline-width": "2px" };
  // v3's CSS-variable shorthand is still used by the shared Radix wrappers.
  matchUtilities({
    origin: value => ({ "transform-origin": value.startsWith("--") ? `var(${value})` : value }),
    "max-h": value => ({ "max-height": value.startsWith("--") ? `var(${value})` : value }),
  }, { values: {} });
  addUtilities(utilities);
});
